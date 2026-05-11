// Project/App: GSD-2
// File Purpose: GSD database facade, schema, migrations, and single-writer write API.
// GSD Database Abstraction Layer
// Provides a SQLite database with provider fallback chain:
//   node:sqlite (built-in) → better-sqlite3 (npm) → null (unavailable)
//
// Exposes a unified sync API for decisions and requirements storage.
// Schema is initialized on first open with WAL mode for file-backed DBs.
//
// ─── Single-writer invariant ─────────────────────────────────────────────
// This file is the ONLY place in the codebase that issues write SQL
// (INSERT / UPDATE / DELETE / REPLACE / BEGIN-COMMIT transactions) against
// the engine database at `.gsd/gsd.db`. All other modules must call the
// typed wrappers exported here. The structural test
// `tests/single-writer-invariant.test.ts` fails CI if a new bypass appears.
//
// `_getAdapter()` is retained for read-only SELECTs in query modules
// (context-store, memory-store queries, doctor checks, projections).
// Do NOT use it for writes — add a wrapper here instead.
//
// The separate `.gsd/unit-claims.db` managed by `unit-ownership.ts` is an
// intentionally independent store for cross-worktree claim races and is
// excluded from this invariant.

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, copyFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import type { Decision, Requirement, GateRow, GateId, GateScope, GateStatus, GateVerdict } from "./types.js";
import { GSDError, GSD_STALE_STATE } from "./errors.js";
import type { GsdWorkspace, MilestoneScope } from "./workspace.js";
import { getGateIdsForTurn, type OwnerTurn } from "./gate-registry.js";
import { logError, logWarning } from "./workflow-logger.js";
import { createDbAdapter, type DbAdapter } from "./db-adapter.js";
import { createBaseSchemaObjects } from "./db-base-schema.js";
import { createCoordinationTablesV24 } from "./db-coordination-schema.js";
import { createDbConnectionCache, type DbConnectionCacheEntry } from "./db-connection-cache.js";
import {
  emptyTaskStatusCounts,
  rowToActiveTaskSummary,
  rowToIdStatusSummary,
  rowToTaskStatusCounts,
  rowsToStringColumn,
  type ActiveTaskSummary,
  type IdStatusSummary,
  type TaskStatusCounts,
} from "./db-lightweight-query-rows.js";
import {
  rowToActiveDecision,
  rowToActiveRequirement,
  rowToDecision,
  rowToRequirement,
  rowsToRequirementCounts,
} from "./db-decision-requirement-rows.js";
import { rowToGate } from "./db-gate-rows.js";
import { rowToArtifact, rowToMilestone, type ArtifactRow, type MilestoneRow } from "./db-milestone-artifact-rows.js";
import { backupDatabaseBeforeMigration } from "./db-migration-backup.js";
import {
  applyMigrationV2Artifacts,
  applyMigrationV3Memories,
  applyMigrationV4DecisionMadeBy,
  applyMigrationV5HierarchyTables,
  applyMigrationV6SliceSummaries,
  applyMigrationV7Dependencies,
  applyMigrationV8PlanningFields,
  applyMigrationV9Ordering,
  applyMigrationV10ReplanTrigger,
  applyMigrationV11TaskPlanning,
  applyMigrationV12QualityGates,
  applyMigrationV13HotPathIndexes,
  applyMigrationV14SliceDependencies,
  applyMigrationV15AuditTables,
  applyMigrationV16EscalationSource,
  applyMigrationV17TaskEscalation,
  applyMigrationV18MemorySources,
  applyMigrationV19MemoryFts,
  applyMigrationV20MemoryRelations,
  applyMigrationV21StructuredMemories,
  applyMigrationV22QualityGateRepair,
  applyMigrationV23MilestoneQueue,
  applyMigrationV26MilestoneCommitAttributions,
  applyMigrationV27ArtifactHash,
  applyMigrationV28MemoryLastHitAt,
} from "./db-migration-steps.js";
import { isMemoriesFtsAvailableSchema, tryCreateMemoriesFtsSchema } from "./db-memory-fts-schema.js";
import { createDbOpenState, type DbOpenPhase } from "./db-open-state.js";
import { createRuntimeKvTableV25 } from "./db-runtime-kv-schema.js";
import { ensureColumn, getCurrentSchemaVersion, recordSchemaVersion } from "./db-schema-metadata.js";
import { rowToSlice, rowToTask, type SliceRow, type TaskRow } from "./db-task-slice-rows.js";
import { createDbTransactionRunner } from "./db-transaction.js";
import { ensureVerificationEvidenceDedupIndex } from "./db-verification-evidence-schema.js";
import { createSqliteProviderLoader, suppressSqliteWarning, type DbProviderName, type SqliteFallbackOpen } from "./db-provider.js";
// Type-only import to avoid a circular runtime dep. The runtime side of
// workflow-manifest.ts depends on this file, but the StateManifest type is
// pure structure with no runtime coupling.
import type { StateManifest } from "./workflow-manifest.js";

const _require = createRequire(import.meta.url);
type ProviderName = DbProviderName;

export type { ArtifactRow, MilestoneRow } from "./db-milestone-artifact-rows.js";
export type { ActiveTaskSummary, IdStatusSummary, TaskStatusCounts } from "./db-lightweight-query-rows.js";
export type { SliceRow, TaskRow } from "./db-task-slice-rows.js";

const providerLoader = createSqliteProviderLoader({
  requireModule: (id: string) => _require(id),
  suppressSqliteWarning,
  nodeVersion: process.versions.node,
  writeStderr: (message: string) => process.stderr.write(message),
});

export const SCHEMA_VERSION = 28;

function initSchema(db: DbAdapter, fileBacked: boolean): void {
  if (fileBacked) db.exec("PRAGMA journal_mode=WAL");
  if (fileBacked) db.exec("PRAGMA busy_timeout = 5000");
  if (fileBacked) db.exec("PRAGMA synchronous = NORMAL");
  if (fileBacked) db.exec("PRAGMA auto_vacuum = INCREMENTAL");
  if (fileBacked) db.exec("PRAGMA cache_size = -8000");   // 8 MB page cache
  if (fileBacked && process.platform !== "darwin") db.exec("PRAGMA mmap_size = 67108864");  // 64 MB mmap
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec("BEGIN");
  try {
    createBaseSchemaObjects(db, {
      tryCreateMemoriesFts,
      ensureVerificationEvidenceDedupIndex,
    });

    const existing = db.prepare("SELECT count(*) as cnt FROM schema_version").get();
    if (existing && (existing["cnt"] as number) === 0) {
      createCoordinationTablesV24(db);
      createRuntimeKvTableV25(db);

      // Fresh install — all tables are created above with the full current schema,
      // so it is safe to create all migration-specific indexes here.  For existing
      // databases these indexes are created inside the individual migration guards
      // in migrateSchema() after the corresponding columns have been added.
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_escalation_pending ON tasks(milestone_id, slice_id, escalation_pending)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_memory_sources_kind ON memory_sources(kind)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_memory_sources_scope ON memory_sources(scope)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_memory_relations_from ON memory_relations(from_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_memory_relations_to ON memory_relations(to_id)");

      recordSchemaVersion(db, SCHEMA_VERSION);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  migrateSchema(db);
}

/**
 * Create the FTS5 virtual table for memories plus the triggers that keep it
 * in sync with the base table. FTS5 may be unavailable on stripped-down
 * SQLite builds — callers should treat failure as non-fatal and fall back
 * to LIKE-based scans in `memory-store.queryMemoriesRanked`.
 */
export function tryCreateMemoriesFts(db: DbAdapter): boolean {
  return tryCreateMemoriesFtsSchema(db, {
    onUnavailable: (message) => logWarning("db", message),
  });
}

export function isMemoriesFtsAvailable(db: DbAdapter): boolean {
  return isMemoriesFtsAvailableSchema(db);
}

function backfillMemoriesFts(db: DbAdapter): void {
  db.exec(`INSERT INTO memories_fts(rowid, content) SELECT seq, content FROM memories`);
}

function copyQualityGateRowsToRepairedTable(db: DbAdapter): void {
  db.exec(`
    INSERT OR IGNORE INTO quality_gates_new
      (milestone_id, slice_id, gate_id, scope, task_id, status, verdict, rationale, findings, evaluated_at)
    SELECT milestone_id, slice_id, gate_id, scope, COALESCE(task_id, ''), status, verdict, rationale, findings, evaluated_at
    FROM quality_gates
  `);
}

function migrateSchema(db: DbAdapter): void {
  const currentVersion = getCurrentSchemaVersion(db);
  if (currentVersion >= SCHEMA_VERSION) return;

  backupDatabaseBeforeMigration(db, currentPath, currentVersion, {
    existsSync,
    copyFileSync,
    logWarning,
  });

  db.exec("BEGIN");
  try {
    if (currentVersion < 2) {
      applyMigrationV2Artifacts(db);
      recordSchemaVersion(db, 2);
    }

    if (currentVersion < 3) {
      applyMigrationV3Memories(db);
      recordSchemaVersion(db, 3);
    }

    if (currentVersion < 4) {
      applyMigrationV4DecisionMadeBy(db);
      recordSchemaVersion(db, 4);
    }

    if (currentVersion < 5) {
      applyMigrationV5HierarchyTables(db);
      recordSchemaVersion(db, 5);
    }

    if (currentVersion < 6) {
      applyMigrationV6SliceSummaries(db);
      recordSchemaVersion(db, 6);
    }

    if (currentVersion < 7) {
      applyMigrationV7Dependencies(db);
      recordSchemaVersion(db, 7);
    }

    if (currentVersion < 8) {
      applyMigrationV8PlanningFields(db);
      recordSchemaVersion(db, 8);
    }

    if (currentVersion < 9) {
      applyMigrationV9Ordering(db);
      recordSchemaVersion(db, 9);
    }

    if (currentVersion < 10) {
      applyMigrationV10ReplanTrigger(db);
      recordSchemaVersion(db, 10);
    }

    if (currentVersion < 11) {
      applyMigrationV11TaskPlanning(db);
      recordSchemaVersion(db, 11);
    }

    if (currentVersion < 12) {
      // NOTE: The original DDL used COALESCE(task_id, '') in the PRIMARY KEY
      // expression, which is invalid SQLite syntax and causes startup errors on
      // DBs that migrate through v12. The corrected DDL uses
      // task_id TEXT NOT NULL DEFAULT '' with a plain column list PK. DBs that
      // were created with the broken DDL are repaired by the v22 migration below.
      applyMigrationV12QualityGates(db);
      recordSchemaVersion(db, 12);
    }

    if (currentVersion < 13) {
      applyMigrationV13HotPathIndexes(db, ensureVerificationEvidenceDedupIndex);
      recordSchemaVersion(db, 13);
    }

    if (currentVersion < 14) {
      applyMigrationV14SliceDependencies(db);
      recordSchemaVersion(db, 14);
    }

    if (currentVersion < 15) {
      applyMigrationV15AuditTables(db);
      recordSchemaVersion(db, 15);
    }

    if (currentVersion < 16) {
      applyMigrationV16EscalationSource(db);
      recordSchemaVersion(db, 16);
    }

    if (currentVersion < 17) {
      applyMigrationV17TaskEscalation(db);
      recordSchemaVersion(db, 17);
    }

    if (currentVersion < 18) {
      applyMigrationV18MemorySources(db);
      recordSchemaVersion(db, 18);
    }

    if (currentVersion < 19) {
      applyMigrationV19MemoryFts(db, {
        tryCreateMemoriesFts,
        isMemoriesFtsAvailable,
        backfillMemoriesFts,
        logWarning,
      });
      recordSchemaVersion(db, 19);
    }

    if (currentVersion < 20) {
      applyMigrationV20MemoryRelations(db);
      recordSchemaVersion(db, 20);
    }

    if (currentVersion < 21) {
      applyMigrationV21StructuredMemories(db);
      recordSchemaVersion(db, 21);
    }

    if (currentVersion < 22) {
      applyMigrationV22QualityGateRepair(db, { copyQualityGateRowsToRepairedTable });
      recordSchemaVersion(db, 22);
    }

    if (currentVersion < 23) {
      applyMigrationV23MilestoneQueue(db);
      recordSchemaVersion(db, 23);
    }

    if (currentVersion < 24) {
      // v24: auto-mode coordination tables. See createCoordinationTablesV24
      // for full schema + invariants. No-op for fresh installs (the same
      // helper runs in the fresh-install path); for upgraded DBs this is
      // the only place these tables get created.
      createCoordinationTablesV24(db);
      recordSchemaVersion(db, 24);
    }

    if (currentVersion < 25) {
      // v25: runtime_kv non-correctness-critical key-value storage. See
      // createRuntimeKvTableV25 for the full schema + invariants.
      createRuntimeKvTableV25(db);
      recordSchemaVersion(db, 25);
    }

    if (currentVersion < 26) {
      applyMigrationV26MilestoneCommitAttributions(db);
      recordSchemaVersion(db, 26);
    }

    if (currentVersion < 27) {
      applyMigrationV27ArtifactHash(db);
      recordSchemaVersion(db, 27);
    }

    if (currentVersion < 28) {
      applyMigrationV28MemoryLastHitAt(db);
      recordSchemaVersion(db, 28);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

let currentDb: DbAdapter | null = null;
let currentPath: string | null = null;
let currentPid: number = 0;
let _exitHandlerRegistered = false;
const _dbOpenState = createDbOpenState();
/**
 * Identity key of the workspace whose connection is currently active
 * (currentDb). Set by openDatabaseByWorkspace(); null when the active
 * connection was opened via the legacy openDatabase(path) path.
 */
let _currentIdentityKey: string | null = null;

/**
 * Workspace-scoped connection cache.
 * Key: GsdWorkspace.identityKey (realpath-normalized project root).
 * Value: the DB path and open adapter for that workspace.
 *
 * Sibling worktrees of the same project share the same identityKey (set by
 * createWorkspace) and therefore reuse the same cached connection, preserving
 * shared-WAL semantics. Different projects get distinct cache entries.
 *
 * NOTE: Only one connection is "active" at a time (currentDb/currentPath).
 * The cache allows fast re-activation of a previously opened connection when
 * callers switch between known workspaces via openDatabaseByWorkspace().
 */
const _dbCache = createDbConnectionCache();

/** Test helper: expose the internal cache for inspection. Not for production use. */
export function _getDbCache(): ReadonlyMap<string, DbConnectionCacheEntry> {
  return _dbCache.asReadonlyMap();
}

function closeCachedConnection(entry: DbConnectionCacheEntry, source: "all" | "workspace"): void {
  try {
    entry.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (e) {
    if (source === "workspace") logWarning("db", `WAL checkpoint (byWorkspace) failed: ${(e as Error).message}`);
  }
  try {
    entry.db.exec("PRAGMA incremental_vacuum(64)");
  } catch (e) {
    if (source === "workspace") logWarning("db", `incremental vacuum (byWorkspace) failed: ${(e as Error).message}`);
  }
  try {
    entry.db.close();
  } catch (e) {
    if (source === "workspace") logWarning("db", `database close (byWorkspace) failed: ${(e as Error).message}`);
  }
}

/**
 * Close and evict every entry in the workspace connection cache, then call
 * closeDatabase() to close the active connection.
 *
 * Use this for test teardown or process-shutdown paths where every open
 * connection must be flushed. Normal callers should use closeDatabase() or
 * closeDatabaseByWorkspace() instead.
 */
export function closeAllDatabases(): void {
  // Close all non-active cached connections first.
  _dbCache.closeNonActive(currentDb, (entry) => closeCachedConnection(entry, "all"));
  closeDatabase();
}

/**
 * Open (or reuse) the database connection scoped to the given workspace.
 *
 * Uses workspace.identityKey as the cache key, so sibling worktrees of the
 * same project resolve to the same connection. On a cache hit the existing
 * adapter is reactivated as the current connection without re-opening the
 * file. On a cache miss, delegates to openDatabase() for the full
 * open + schema-init + migration flow, then caches the result.
 *
 * When switching to a different workspace, the previously active connection
 * is preserved in the cache (not closed), so callers can switch back to it
 * cheaply via a subsequent openDatabaseByWorkspace() call.
 *
 * @param workspace A GsdWorkspace created by createWorkspace().
 * @returns true if the connection is open and ready, false otherwise.
 */
export function openDatabaseByWorkspace(workspace: GsdWorkspace): boolean {
  const key = workspace.identityKey;
  const dbPath = workspace.contract.projectDb;

  const cached = _dbCache.get(key);
  if (cached) {
    // Reactivate the cached connection as the current singleton.
    currentDb = cached.db;
    currentPath = cached.dbPath;
    currentPid = process.pid;
    _dbOpenState.markAttempted();
    _currentIdentityKey = key;
    return true;
  }

  // Cache miss — need to open a new connection.
  //
  // If there is a currently active workspace connection, stash it in the
  // cache under its identity key before calling openDatabase(), because
  // openDatabase() will call closeDatabase() when the path changes (which
  // would destroy the existing adapter). By nulling out currentDb first,
  // we prevent openDatabase() from closing the live adapter.
  let oldDb: typeof currentDb = null;
  let oldPath: typeof currentPath = null;
  let oldPid: typeof currentPid = 0;
  let oldKey: typeof _currentIdentityKey = null;

  if (currentDb !== null && _currentIdentityKey !== null) {
    // Snapshot the old globals so we can restore them on failure.
    oldDb = currentDb;
    oldPath = currentPath;
    oldPid = currentPid;
    oldKey = _currentIdentityKey;
    // Save the current connection so it stays alive in the cache.
    _dbCache.set(_currentIdentityKey, {
      dbPath: currentPath!,
      db: currentDb,
    });
    // Detach from globals so openDatabase() opens fresh without closing it.
    currentDb = null;
    currentPath = null;
    currentPid = 0;
    _currentIdentityKey = null;
  }

  // Run the full open/schema/migration flow for the new workspace.
  // openDatabase() can throw on corrupt DB or permission error — catch so we
  // can restore the previous connection rather than leaving globals null.
  let opened: boolean;
  try {
    opened = openDatabase(dbPath);
  } catch (err) {
    // Failed to open the new DB. Restore the previous workspace connection so
    // the caller's workspace remains active (it is still safe in _dbCache).
    if (oldDb !== null) {
      currentDb = oldDb;
      currentPath = oldPath;
      currentPid = oldPid;
      _currentIdentityKey = oldKey;
    }
    throw err;
  }
  if (opened && currentDb) {
    _dbCache.set(key, { dbPath, db: currentDb });
    _currentIdentityKey = key;
  } else if (!opened && oldDb !== null) {
    // Restore the previous connection so the caller's workspace remains active.
    // The failed attempt left no live adapter, so the globals stayed null.
    currentDb = oldDb;
    currentPath = oldPath;
    currentPid = oldPid;
    _currentIdentityKey = oldKey;
  }
  return opened;
}

/**
 * Open (or reuse) the database connection scoped to the workspace in a
 * MilestoneScope. Thin delegation to openDatabaseByWorkspace().
 */
export function openDatabaseByScope(scope: MilestoneScope): boolean {
  return openDatabaseByWorkspace(scope.workspace);
}

/**
 * Close the database connection for the given workspace and remove it from
 * the cache. If the workspace's connection is currently active (currentDb),
 * performs a full closeDatabase() including WAL checkpoint. Otherwise only
 * removes the cache entry (the adapter was already replaced by a later open).
 */
export function closeDatabaseByWorkspace(workspace: GsdWorkspace): void {
  const key = workspace.identityKey;
  const cached = _dbCache.get(key);
  if (!cached) return;

  _dbCache.delete(key);

  if (currentDb === cached.db) {
    // This workspace's connection is the active one — full close.
    closeDatabase();
  } else {
    // Connection was displaced by a later open; close the adapter directly.
    closeCachedConnection(cached, "workspace");
  }
}

export function getDbProvider(): ProviderName | null {
  providerLoader.load();
  return providerLoader.getProviderName();
}

export function isDbAvailable(): boolean {
  return currentDb !== null;
}

/**
 * Returns true if openDatabase() has been called at least once this session.
 * Used to distinguish "DB not yet initialized" from "DB genuinely unavailable"
 * so that early callers (e.g. before_agent_start context injection) don't
 * trigger a false degraded-mode warning.
 */
export function wasDbOpenAttempted(): boolean {
  return _dbOpenState.snapshot().attempted;
}

export function getDbStatus(): {
  available: boolean;
  provider: ProviderName | null;
  attempted: boolean;
  lastError: Error | null;
  lastPhase: DbOpenPhase | null;
} {
  providerLoader.load();
  const openState = _dbOpenState.snapshot();
  return {
    available: currentDb !== null,
    provider: providerLoader.getProviderName(),
    attempted: openState.attempted,
    lastError: openState.lastError,
    lastPhase: openState.lastPhase,
  };
}

export function openDatabase(path: string): boolean {
  _dbOpenState.markAttempted();
  if (currentDb && currentPath !== path) closeDatabase();
  if (currentDb && currentPath === path) return true;

  // Reset error state only when a new open attempt is actually going to run.
  _dbOpenState.clearError();

  let rawDb: unknown;
  let fallbackOpen: SqliteFallbackOpen | null = null;
  try {
    rawDb = providerLoader.openRaw(path);
  } catch (primaryErr) {
    _dbOpenState.recordError("open", primaryErr);
    // node:sqlite loaded but failed to open this file — try better-sqlite3 as fallback.
    fallbackOpen = providerLoader.tryOpenBetterSqliteFallback(path);
    if (fallbackOpen) {
      rawDb = fallbackOpen.rawDb;
      _dbOpenState.clearError();
    }
    if (!rawDb) throw primaryErr;
  }
  if (!rawDb) return false;

  const adapter = createDbAdapter(rawDb);
  const fileBacked = path !== ":memory:";
  try {
    initSchema(adapter, fileBacked);
  } catch (err) {
    // Corrupt freelist: DDL fails with "malformed" but VACUUM can rebuild.
    // Attempt VACUUM recovery before giving up (see #2519).
    if (fileBacked && err instanceof Error && err.message?.includes("malformed")) {
      try {
        adapter.exec("VACUUM");
        initSchema(adapter, fileBacked);
        process.stderr.write("gsd-db: recovered corrupt database via VACUUM\n");
      } catch (retryErr) {
        _dbOpenState.recordError("vacuum-recovery", retryErr);
        try { adapter.close(); } catch (e) { logWarning("db", `close after VACUUM failed: ${(e as Error).message}`); }
        throw retryErr;
      }
    } else {
      _dbOpenState.recordError("initSchema", err);
      try { adapter.close(); } catch (e) { logWarning("db", `close after initSchema failed: ${(e as Error).message}`); }
      throw err;
    }
  }

  // Commit fallback provider switch only after open + schema both succeeded.
  if (fallbackOpen) providerLoader.commitFallback(fallbackOpen);

  currentDb = adapter;
  currentPath = path;
  currentPid = process.pid;

  if (!_exitHandlerRegistered) {
    _exitHandlerRegistered = true;
    process.on("exit", () => { try { closeDatabase(); } catch (e) { logWarning("db", `exit handler close failed: ${(e as Error).message}`); } });
  }

  return true;
}

export function closeDatabase(): void {
  if (currentDb) {
    try {
      currentDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (e) { logWarning("db", `WAL checkpoint failed: ${(e as Error).message}`); }
    try {
      // Incremental vacuum to reclaim space without blocking
      currentDb.exec('PRAGMA incremental_vacuum(64)');
    } catch (e) { logWarning("db", `incremental vacuum failed: ${(e as Error).message}`); }
    try {
      currentDb.close();
    } catch (e) { logWarning("db", `database close failed: ${(e as Error).message}`); }
    // If this connection was workspace-tracked, evict it from the cache so
    // subsequent openDatabaseByWorkspace() calls re-open rather than reactivate
    // a closed adapter.
    if (_currentIdentityKey !== null) {
      _dbCache.delete(_currentIdentityKey);
      _currentIdentityKey = null;
    }
    currentDb = null;
    currentPath = null;
    currentPid = 0;
  }
  // Reset session-scoped state unconditionally so stale error info from a
  // failed open doesn't persist into the next open attempt or status check.
  _dbOpenState.reset();
}

/**
 * Re-open the active database connection from disk.
 *
 * Auto-mode can observe artifacts written by a workflow server running in a
 * different process before its long-lived singleton has re-synchronized. The
 * recovery path uses this to force the next state derivation to read from the
 * current on-disk database instead of continuing with a possibly stale handle.
 */
export function refreshOpenDatabaseFromDisk(): boolean {
  if (!currentDb || !currentPath) return false;
  if (currentPath === ":memory:") return false;

  const dbPath = currentPath;
  const identityKey = _currentIdentityKey;

  try {
    closeDatabase();
    const opened = openDatabase(dbPath);
    if (opened && identityKey && currentDb) {
      _dbCache.set(identityKey, { dbPath, db: currentDb });
      _currentIdentityKey = identityKey;
    }
    return opened;
  } catch (e) {
    logWarning("db", `database refresh failed: ${(e as Error).message}`);
    return false;
  }
}

/** Run a full VACUUM — call sparingly (e.g. after milestone completion). */
export function vacuumDatabase(): void {
  if (!currentDb) return;
  try {
    currentDb.exec('VACUUM');
  } catch (e) { logWarning("db", `VACUUM failed: ${(e as Error).message}`); }
}

/** Flush WAL into gsd.db so `git add .gsd/gsd.db` stages current state — safe while DB is open. */
export function checkpointDatabase(): void {
  if (!currentDb) return;
  try {
    currentDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (e) { logWarning("db", `WAL checkpoint failed: ${(e as Error).message}`); }
}

const _transactionRunner = createDbTransactionRunner();

function createTransactionControls(db: DbAdapter) {
  return {
    begin: () => db.exec("BEGIN"),
    beginRead: () => db.exec("BEGIN DEFERRED"),
    commit: () => db.exec("COMMIT"),
    rollback: () => db.exec("ROLLBACK"),
  };
}

/**
 * Whether the current call is running inside an active SQLite transaction.
 * Statement-time recovery paths (e.g. VACUUM retry on a malformed memory
 * store) MUST gate on this — SQLite refuses VACUUM inside a transaction
 * and would mask the original error with a secondary "cannot VACUUM" throw.
 */
export function isInTransaction(): boolean {
  return _transactionRunner.isInTransaction();
}

export function transaction<T>(fn: () => T): T {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  return _transactionRunner.transaction(createTransactionControls(currentDb), fn);
}

/**
 * Wrap a block of reads in a DEFERRED transaction so that all SELECTs observe
 * a consistent snapshot of the DB even if a concurrent writer commits between
 * them. Use this for multi-query read flows (e.g. tool executors that query
 * milestone + slices + counts and want one snapshot). Re-entrant — if already
 * inside a transaction, runs fn() without starting a nested one.
 */
export function readTransaction<T>(fn: () => T): T {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");

  return _transactionRunner.readTransaction(createTransactionControls(currentDb), fn, (rollbackErr) => {
    // A failed ROLLBACK after a failed read is a split-brain signal —
    // the transaction is in an indeterminate state. Surface it via the
    // logger instead of swallowing it.
    logError("db", "snapshotState ROLLBACK failed", {
      error: rollbackErr.message,
    });
  });
}

export function insertDecision(d: Omit<Decision, "seq">): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT INTO decisions (id, when_context, scope, decision, choice, rationale, revisable, made_by, source, superseded_by)
     VALUES (:id, :when_context, :scope, :decision, :choice, :rationale, :revisable, :made_by, :source, :superseded_by)`,
  ).run({
    ":id": d.id,
    ":when_context": d.when_context,
    ":scope": d.scope,
    ":decision": d.decision,
    ":choice": d.choice,
    ":rationale": d.rationale,
    ":revisable": d.revisable,
    ":made_by": d.made_by ?? "agent",
    ":source": d.source ?? "discussion",
    ":superseded_by": d.superseded_by,
  });
}

export function getDecisionById(id: string): Decision | null {
  if (!currentDb) return null;
  const row = currentDb.prepare("SELECT * FROM decisions WHERE id = ?").get(id);
  if (!row) return null;
  return rowToDecision(row);
}

export function getActiveDecisions(): Decision[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare("SELECT * FROM active_decisions").all();
  return rows.map(rowToActiveDecision);
}

export function insertRequirement(r: Requirement): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT INTO requirements (id, class, status, description, why, source, primary_owner, supporting_slices, validation, notes, full_content, superseded_by)
     VALUES (:id, :class, :status, :description, :why, :source, :primary_owner, :supporting_slices, :validation, :notes, :full_content, :superseded_by)`,
  ).run({
    ":id": r.id,
    ":class": r.class,
    ":status": r.status,
    ":description": r.description,
    ":why": r.why,
    ":source": r.source,
    ":primary_owner": r.primary_owner,
    ":supporting_slices": r.supporting_slices,
    ":validation": r.validation,
    ":notes": r.notes,
    ":full_content": r.full_content,
    ":superseded_by": r.superseded_by,
  });
}

export function getRequirementById(id: string): Requirement | null {
  if (!currentDb) return null;
  const row = currentDb.prepare("SELECT * FROM requirements WHERE id = ?").get(id);
  if (!row) return null;
  return rowToRequirement(row);
}

export function getActiveRequirements(): Requirement[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare("SELECT * FROM active_requirements").all();
  return rows.map(rowToActiveRequirement);
}

export function getRequirementCounts(): {
  active: number;
  validated: number;
  deferred: number;
  outOfScope: number;
  blocked: number;
  total: number;
} {
  if (!currentDb) {
    return { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 };
  }
  const rows = currentDb
    .prepare("SELECT lower(status) as status, COUNT(*) as count FROM requirements GROUP BY lower(status)")
    .all();
  return rowsToRequirementCounts(rows);
}

export function getDbOwnerPid(): number {
  return currentPid;
}

export function getDbPath(): string | null {
  return currentPath;
}

export function _getAdapter(): DbAdapter | null {
  return currentDb;
}

export function _resetProvider(): void {
  providerLoader.reset();
}

export function upsertDecision(d: Omit<Decision, "seq">): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  // Use ON CONFLICT DO UPDATE instead of INSERT OR REPLACE to preserve the
  // seq column. INSERT OR REPLACE deletes then reinserts, resetting seq and
  // corrupting decision ordering in DECISIONS.md after reconcile replay.
  currentDb.prepare(
    `INSERT INTO decisions (id, when_context, scope, decision, choice, rationale, revisable, made_by, source, superseded_by)
     VALUES (:id, :when_context, :scope, :decision, :choice, :rationale, :revisable, :made_by, :source, :superseded_by)
     ON CONFLICT(id) DO UPDATE SET
       when_context = excluded.when_context,
       scope = excluded.scope,
       decision = excluded.decision,
       choice = excluded.choice,
       rationale = excluded.rationale,
       revisable = excluded.revisable,
       made_by = excluded.made_by,
       source = excluded.source,
       superseded_by = excluded.superseded_by`,
  ).run({
    ":id": d.id,
    ":when_context": d.when_context,
    ":scope": d.scope,
    ":decision": d.decision,
    ":choice": d.choice,
    ":rationale": d.rationale,
    ":revisable": d.revisable,
    ":made_by": d.made_by ?? "agent",
    ":source": d.source ?? "discussion",
    ":superseded_by": d.superseded_by ?? null,
  });
}

export function upsertRequirement(r: Requirement): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR REPLACE INTO requirements (id, class, status, description, why, source, primary_owner, supporting_slices, validation, notes, full_content, superseded_by)
     VALUES (:id, :class, :status, :description, :why, :source, :primary_owner, :supporting_slices, :validation, :notes, :full_content, :superseded_by)`,
  ).run({
    ":id": r.id,
    ":class": r.class,
    ":status": r.status,
    ":description": r.description,
    ":why": r.why,
    ":source": r.source,
    ":primary_owner": r.primary_owner,
    ":supporting_slices": r.supporting_slices,
    ":validation": r.validation,
    ":notes": r.notes,
    ":full_content": r.full_content,
    ":superseded_by": r.superseded_by ?? null,
  });
}

export function clearArtifacts(): void {
  if (!currentDb) return;
  try { currentDb.exec("DELETE FROM artifacts"); } catch (e) { logWarning("db", `clearArtifacts failed: ${(e as Error).message}`); }
}

export function insertArtifact(a: {
  path: string;
  artifact_type: string;
  milestone_id: string | null;
  slice_id: string | null;
  task_id: string | null;
  full_content: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  const contentHash = createHash("sha256").update(a.full_content).digest("hex");
  currentDb.prepare(
    `INSERT OR REPLACE INTO artifacts (path, artifact_type, milestone_id, slice_id, task_id, full_content, imported_at, content_hash)
     VALUES (:path, :artifact_type, :milestone_id, :slice_id, :task_id, :full_content, :imported_at, :content_hash)`,
  ).run({
    ":path": a.path,
    ":artifact_type": a.artifact_type,
    ":milestone_id": a.milestone_id,
    ":slice_id": a.slice_id,
    ":task_id": a.task_id,
    ":full_content": a.full_content,
    ":imported_at": new Date().toISOString(),
    ":content_hash": contentHash,
  });
}

export interface MilestonePlanningRecord {
  vision: string;
  successCriteria: string[];
  keyRisks: Array<{ risk: string; whyItMatters: string }>;
  proofStrategy: Array<{ riskOrUnknown: string; retireIn: string; whatWillBeProven: string }>;
  verificationContract: string;
  verificationIntegration: string;
  verificationOperational: string;
  verificationUat: string;
  definitionOfDone: string[];
  requirementCoverage: string;
  boundaryMapMarkdown: string;
}

export interface SlicePlanningRecord {
  goal: string;
  successCriteria: string;
  proofLevel: string;
  integrationClosure: string;
  observabilityImpact: string;
}

export interface TaskPlanningRecord {
  title?: string;
  description: string;
  estimate: string;
  files: string[];
  verify: string;
  inputs: string[];
  expectedOutput: string[];
  observabilityImpact: string;
  fullPlanMd?: string;
}

export function insertMilestone(m: {
  id: string;
  title?: string;
  status?: string;
  depends_on?: string[];
  planning?: Partial<MilestonePlanningRecord>;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO milestones (
      id, title, status, depends_on, created_at,
      vision, success_criteria, key_risks, proof_strategy,
      verification_contract, verification_integration, verification_operational, verification_uat,
      definition_of_done, requirement_coverage, boundary_map_markdown
    ) VALUES (
      :id, :title, :status, :depends_on, :created_at,
      :vision, :success_criteria, :key_risks, :proof_strategy,
      :verification_contract, :verification_integration, :verification_operational, :verification_uat,
      :definition_of_done, :requirement_coverage, :boundary_map_markdown
    )`,
  ).run({
    ":id": m.id,
    ":title": m.title ?? "",
    // Default to "queued" — never auto-create milestones as "active" (#3380).
    // Callers that need "active" must pass it explicitly.
    ":status": m.status ?? "queued",
    ":depends_on": JSON.stringify(m.depends_on ?? []),
    ":created_at": new Date().toISOString(),
    ":vision": m.planning?.vision ?? "",
    ":success_criteria": JSON.stringify(m.planning?.successCriteria ?? []),
    ":key_risks": JSON.stringify(m.planning?.keyRisks ?? []),
    ":proof_strategy": JSON.stringify(m.planning?.proofStrategy ?? []),
    ":verification_contract": m.planning?.verificationContract ?? "",
    ":verification_integration": m.planning?.verificationIntegration ?? "",
    ":verification_operational": m.planning?.verificationOperational ?? "",
    ":verification_uat": m.planning?.verificationUat ?? "",
    ":definition_of_done": JSON.stringify(m.planning?.definitionOfDone ?? []),
    ":requirement_coverage": m.planning?.requirementCoverage ?? "",
    ":boundary_map_markdown": m.planning?.boundaryMapMarkdown ?? "",
  });
}

export function upsertMilestonePlanning(milestoneId: string, planning: Partial<MilestonePlanningRecord> & { title?: string; status?: string }): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE milestones SET
      title = COALESCE(NULLIF(:title, ''), title),
      status = COALESCE(NULLIF(:status, ''), status),
      vision = COALESCE(:vision, vision),
      success_criteria = COALESCE(:success_criteria, success_criteria),
      key_risks = COALESCE(:key_risks, key_risks),
      proof_strategy = COALESCE(:proof_strategy, proof_strategy),
      verification_contract = COALESCE(:verification_contract, verification_contract),
      verification_integration = COALESCE(:verification_integration, verification_integration),
      verification_operational = COALESCE(:verification_operational, verification_operational),
      verification_uat = COALESCE(:verification_uat, verification_uat),
      definition_of_done = COALESCE(:definition_of_done, definition_of_done),
      requirement_coverage = COALESCE(:requirement_coverage, requirement_coverage),
      boundary_map_markdown = COALESCE(:boundary_map_markdown, boundary_map_markdown)
     WHERE id = :id`,
  ).run({
    ":id": milestoneId,
    ":title": planning.title ?? "",
    ":status": planning.status ?? "",
    ":vision": planning.vision ?? null,
    ":success_criteria": planning.successCriteria ? JSON.stringify(planning.successCriteria) : null,
    ":key_risks": planning.keyRisks ? JSON.stringify(planning.keyRisks) : null,
    ":proof_strategy": planning.proofStrategy ? JSON.stringify(planning.proofStrategy) : null,
    ":verification_contract": planning.verificationContract ?? null,
    ":verification_integration": planning.verificationIntegration ?? null,
    ":verification_operational": planning.verificationOperational ?? null,
    ":verification_uat": planning.verificationUat ?? null,
    ":definition_of_done": planning.definitionOfDone ? JSON.stringify(planning.definitionOfDone) : null,
    ":requirement_coverage": planning.requirementCoverage ?? null,
    ":boundary_map_markdown": planning.boundaryMapMarkdown ?? null,
  });
}

export function insertSlice(s: {
  id: string;
  milestoneId: string;
  title?: string;
  status?: string;
  risk?: string;
  depends?: string[];
  demo?: string;
  sequence?: number;
  isSketch?: boolean;
  sketchScope?: string;
  planning?: Partial<SlicePlanningRecord>;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT INTO slices (
      milestone_id, id, title, status, risk, depends, demo, created_at,
      goal, success_criteria, proof_level, integration_closure, observability_impact, sequence,
      is_sketch, sketch_scope
    ) VALUES (
      :milestone_id, :id, :title, :status, :risk, :depends, :demo, :created_at,
      :goal, :success_criteria, :proof_level, :integration_closure, :observability_impact, :sequence,
      :is_sketch, :sketch_scope
    )
    ON CONFLICT (milestone_id, id) DO UPDATE SET
      title = CASE WHEN :raw_title IS NOT NULL THEN excluded.title ELSE slices.title END,
      status = CASE WHEN slices.status IN ('complete', 'done') THEN slices.status ELSE excluded.status END,
      risk = CASE WHEN :raw_risk IS NOT NULL THEN excluded.risk ELSE slices.risk END,
      depends = excluded.depends,
      demo = CASE WHEN :raw_demo IS NOT NULL THEN excluded.demo ELSE slices.demo END,
      goal = CASE WHEN :raw_goal IS NOT NULL THEN excluded.goal ELSE slices.goal END,
      success_criteria = CASE WHEN :raw_success_criteria IS NOT NULL THEN excluded.success_criteria ELSE slices.success_criteria END,
      proof_level = CASE WHEN :raw_proof_level IS NOT NULL THEN excluded.proof_level ELSE slices.proof_level END,
      integration_closure = CASE WHEN :raw_integration_closure IS NOT NULL THEN excluded.integration_closure ELSE slices.integration_closure END,
      observability_impact = CASE WHEN :raw_observability_impact IS NOT NULL THEN excluded.observability_impact ELSE slices.observability_impact END,
      sequence = CASE WHEN :raw_sequence IS NOT NULL THEN excluded.sequence ELSE slices.sequence END,
      is_sketch = CASE WHEN :raw_is_sketch IS NOT NULL THEN excluded.is_sketch ELSE slices.is_sketch END,
      sketch_scope = CASE WHEN :raw_sketch_scope IS NOT NULL THEN excluded.sketch_scope ELSE slices.sketch_scope END`,
  ).run({
    ":milestone_id": s.milestoneId,
    ":id": s.id,
    ":title": s.title ?? "",
    ":status": s.status ?? "pending",
    ":risk": s.risk ?? "medium",
    ":depends": JSON.stringify(s.depends ?? []),
    ":demo": s.demo ?? "",
    ":created_at": new Date().toISOString(),
    ":goal": s.planning?.goal ?? "",
    ":success_criteria": s.planning?.successCriteria ?? "",
    ":proof_level": s.planning?.proofLevel ?? "",
    ":integration_closure": s.planning?.integrationClosure ?? "",
    ":observability_impact": s.planning?.observabilityImpact ?? "",
    ":sequence": s.sequence ?? 0,
    ":is_sketch": s.isSketch ? 1 : 0,
    ":sketch_scope": s.sketchScope ?? "",
    // Raw sentinel params: NULL when caller omitted the field, used in ON CONFLICT guards
    ":raw_title": s.title ?? null,
    ":raw_risk": s.risk ?? null,
    ":raw_demo": s.demo ?? null,
    ":raw_goal": s.planning?.goal ?? null,
    ":raw_success_criteria": s.planning?.successCriteria ?? null,
    ":raw_proof_level": s.planning?.proofLevel ?? null,
    ":raw_integration_closure": s.planning?.integrationClosure ?? null,
    ":raw_observability_impact": s.planning?.observabilityImpact ?? null,
    ":raw_sequence": s.sequence ?? null,
    ":raw_is_sketch": s.isSketch === undefined ? null : (s.isSketch ? 1 : 0),
    // NOTE: use !== undefined (not ??) so an explicit empty string "" is treated
    // as a present value and correctly clears the existing sketch_scope on
    // CONFLICT. ?? would incorrectly preserve the stale value.
    ":raw_sketch_scope": s.sketchScope !== undefined ? s.sketchScope : null,
  });
}

// ADR-011: sketch-then-refine helpers
export function setSliceSketchFlag(milestoneId: string, sliceId: string, isSketch: boolean): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE slices SET is_sketch = :is_sketch WHERE milestone_id = :mid AND id = :sid`,
  ).run({ ":is_sketch": isSketch ? 1 : 0, ":mid": milestoneId, ":sid": sliceId });
}

/**
 * ADR-017 raw primitive: returns slice IDs in a milestone whose is_sketch flag
 * is still 1. The stale-sketch-flag drift handler at
 * `state-reconciliation/drift/sketch-flag.ts` composes this with PLAN.md
 * existence checks to detect drift, then writes via `setSliceSketchFlag`.
 */
export function getSketchedSliceIds(milestoneId: string): string[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    `SELECT id FROM slices WHERE milestone_id = :mid AND is_sketch = 1`,
  ).all({ ":mid": milestoneId }) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

export function upsertSlicePlanning(milestoneId: string, sliceId: string, planning: Partial<SlicePlanningRecord>): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE slices SET
      goal = COALESCE(:goal, goal),
      success_criteria = COALESCE(:success_criteria, success_criteria),
      proof_level = COALESCE(:proof_level, proof_level),
      integration_closure = COALESCE(:integration_closure, integration_closure),
      observability_impact = COALESCE(:observability_impact, observability_impact)
     WHERE milestone_id = :milestone_id AND id = :id`,
  ).run({
    ":milestone_id": milestoneId,
    ":id": sliceId,
    ":goal": planning.goal ?? null,
    ":success_criteria": planning.successCriteria ?? null,
    ":proof_level": planning.proofLevel ?? null,
    ":integration_closure": planning.integrationClosure ?? null,
    ":observability_impact": planning.observabilityImpact ?? null,
  });
}

export function insertTask(t: {
  id: string;
  sliceId: string;
  milestoneId: string;
  title?: string;
  status?: string;
  oneLiner?: string;
  narrative?: string;
  verificationResult?: string;
  duration?: string;
  blockerDiscovered?: boolean;
  deviations?: string;
  knownIssues?: string;
  keyFiles?: string[];
  keyDecisions?: string[];
  fullSummaryMd?: string;
  sequence?: number;
  planning?: Partial<TaskPlanningRecord>;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT INTO tasks (
      milestone_id, slice_id, id, title, status, one_liner, narrative,
      verification_result, duration, completed_at, blocker_discovered,
      deviations, known_issues, key_files, key_decisions, full_summary_md,
      description, estimate, files, verify, inputs, expected_output, observability_impact, sequence
    ) VALUES (
      :milestone_id, :slice_id, :id, :title, :status, :one_liner, :narrative,
      :verification_result, :duration, :completed_at, :blocker_discovered,
      :deviations, :known_issues, :key_files, :key_decisions, :full_summary_md,
      :description, :estimate, :files, :verify, :inputs, :expected_output, :observability_impact, :sequence
    )
    ON CONFLICT(milestone_id, slice_id, id) DO UPDATE SET
      title = CASE WHEN NULLIF(:title, '') IS NOT NULL THEN :title ELSE tasks.title END,
      status = :status,
      one_liner = :one_liner,
      narrative = :narrative,
      verification_result = :verification_result,
      duration = :duration,
      completed_at = :completed_at,
      blocker_discovered = :blocker_discovered,
      deviations = :deviations,
      known_issues = :known_issues,
      key_files = :key_files,
      key_decisions = :key_decisions,
      full_summary_md = :full_summary_md,
      description = CASE WHEN NULLIF(:description, '') IS NOT NULL THEN :description ELSE tasks.description END,
      estimate = CASE WHEN NULLIF(:estimate, '') IS NOT NULL THEN :estimate ELSE tasks.estimate END,
      files = CASE WHEN NULLIF(:files, '[]') IS NOT NULL THEN :files ELSE tasks.files END,
      verify = CASE WHEN NULLIF(:verify, '') IS NOT NULL THEN :verify ELSE tasks.verify END,
      inputs = CASE WHEN NULLIF(:inputs, '[]') IS NOT NULL THEN :inputs ELSE tasks.inputs END,
      expected_output = CASE WHEN NULLIF(:expected_output, '[]') IS NOT NULL THEN :expected_output ELSE tasks.expected_output END,
      observability_impact = CASE WHEN NULLIF(:observability_impact, '') IS NOT NULL THEN :observability_impact ELSE tasks.observability_impact END,
      sequence = :sequence`,
  ).run({
    ":milestone_id": t.milestoneId,
    ":slice_id": t.sliceId,
    ":id": t.id,
    ":title": t.title ?? "",
    ":status": t.status ?? "pending",
    ":one_liner": t.oneLiner ?? "",
    ":narrative": t.narrative ?? "",
    ":verification_result": t.verificationResult ?? "",
    ":duration": t.duration ?? "",
    ":completed_at": t.status === "done" || t.status === "complete" ? new Date().toISOString() : null,
    ":blocker_discovered": t.blockerDiscovered ? 1 : 0,
    ":deviations": t.deviations ?? "",
    ":known_issues": t.knownIssues ?? "",
    ":key_files": JSON.stringify(t.keyFiles ?? []),
    ":key_decisions": JSON.stringify(t.keyDecisions ?? []),
    ":full_summary_md": t.fullSummaryMd ?? "",
    ":description": t.planning?.description ?? "",
    ":estimate": t.planning?.estimate ?? "",
    ":files": JSON.stringify(t.planning?.files ?? []),
    ":verify": t.planning?.verify ?? "",
    ":inputs": JSON.stringify(t.planning?.inputs ?? []),
    ":expected_output": JSON.stringify(t.planning?.expectedOutput ?? []),
    ":observability_impact": t.planning?.observabilityImpact ?? "",
    ":sequence": t.sequence ?? 0,
  });
}

export function updateTaskStatus(milestoneId: string, sliceId: string, taskId: string, status: string, completedAt?: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks SET status = :status, completed_at = :completed_at
     WHERE milestone_id = :milestone_id AND slice_id = :slice_id AND id = :id`,
  ).run({
    ":status": status,
    ":completed_at": completedAt ?? null,
    ":milestone_id": milestoneId,
    ":slice_id": sliceId,
    ":id": taskId,
  });
}

export function setTaskBlockerDiscovered(milestoneId: string, sliceId: string, taskId: string, discovered: boolean): void {
  if (!currentDb) return;
  currentDb.prepare(
    `UPDATE tasks SET blocker_discovered = :discovered WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
  ).run({ ":discovered": discovered ? 1 : 0, ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
}

export function upsertTaskPlanning(milestoneId: string, sliceId: string, taskId: string, planning: Partial<TaskPlanningRecord>): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks SET
      title = COALESCE(:title, title),
      description = COALESCE(:description, description),
      estimate = COALESCE(:estimate, estimate),
      files = COALESCE(:files, files),
      verify = COALESCE(:verify, verify),
      inputs = COALESCE(:inputs, inputs),
      expected_output = COALESCE(:expected_output, expected_output),
      observability_impact = COALESCE(:observability_impact, observability_impact),
      full_plan_md = COALESCE(:full_plan_md, full_plan_md)
     WHERE milestone_id = :milestone_id AND slice_id = :slice_id AND id = :id`,
  ).run({
    ":milestone_id": milestoneId,
    ":slice_id": sliceId,
    ":id": taskId,
    ":title": planning.title ?? null,
    ":description": planning.description ?? null,
    ":estimate": planning.estimate ?? null,
    ":files": planning.files ? JSON.stringify(planning.files) : null,
    ":verify": planning.verify ?? null,
    ":inputs": planning.inputs ? JSON.stringify(planning.inputs) : null,
    ":expected_output": planning.expectedOutput ? JSON.stringify(planning.expectedOutput) : null,
    ":observability_impact": planning.observabilityImpact ?? null,
    ":full_plan_md": planning.fullPlanMd ?? null,
  });
}

export function getSlice(milestoneId: string, sliceId: string): SliceRow | null {
  if (!currentDb) return null;
  const row = currentDb.prepare("SELECT * FROM slices WHERE milestone_id = :mid AND id = :sid").get({ ":mid": milestoneId, ":sid": sliceId });
  if (!row) return null;
  return rowToSlice(row);
}

export function updateSliceStatus(milestoneId: string, sliceId: string, status: string, completedAt?: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE slices SET status = :status, completed_at = :completed_at
     WHERE milestone_id = :milestone_id AND id = :id`,
  ).run({
    ":status": status,
    ":completed_at": completedAt ?? null,
    ":milestone_id": milestoneId,
    ":id": sliceId,
  });
}

export function setTaskSummaryMd(milestoneId: string, sliceId: string, taskId: string, md: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks SET full_summary_md = :md WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
  ).run({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId, ":md": md });
}

export function setSliceSummaryMd(milestoneId: string, sliceId: string, summaryMd: string, uatMd: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE slices SET full_summary_md = :summary_md, full_uat_md = :uat_md WHERE milestone_id = :mid AND id = :sid`,
  ).run({ ":mid": milestoneId, ":sid": sliceId, ":summary_md": summaryMd, ":uat_md": uatMd });
}

export function getTask(milestoneId: string, sliceId: string, taskId: string): TaskRow | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    "SELECT * FROM tasks WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid",
  ).get({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
  if (!row) return null;
  return rowToTask(row);
}

export function getSliceTasks(milestoneId: string, sliceId: string): TaskRow[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    "SELECT * FROM tasks WHERE milestone_id = :mid AND slice_id = :sid ORDER BY sequence, id",
  ).all({ ":mid": milestoneId, ":sid": sliceId });
  return rows.map(rowToTask);
}

export function getCompletedMilestoneTaskFileHints(milestoneId: string): string[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    `SELECT files, key_files
     FROM tasks
     WHERE milestone_id = :mid AND status IN ('complete', 'done')`,
  ).all({ ":mid": milestoneId }) as Array<Record<string, unknown>>;

  const hints = new Set<string>();
  for (const row of rows) {
    for (const raw of [row["files"], row["key_files"]]) {
      for (const file of parseStringArrayColumn(raw)) {
        const normalized = normalizeRepoPath(file);
        if (normalized) hints.add(normalized);
      }
    }
  }
  return [...hints];
}

function parseStringArrayColumn(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === "string");
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === "string");
    if (typeof parsed === "string") return [parsed];
  } catch {
    return trimmed.split(",");
  }
  return [];
}

function normalizeRepoPath(file: string): string {
  return file.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

// ─── ADR-011 Phase 2 escalation helpers ──────────────────────────────────

/** Set pause-on-escalation state on a completed task. Mutually exclusive with awaiting_review. */
export function setTaskEscalationPending(
  milestoneId: string, sliceId: string, taskId: string,
  artifactPath: string,
): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks
       SET escalation_pending = 1,
           escalation_awaiting_review = 0,
           escalation_artifact_path = :path
     WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
  ).run({ ":path": artifactPath, ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
}

/** Set awaiting-review state (artifact exists but continueWithDefault=true, no pause). Mutually exclusive with pending. */
export function setTaskEscalationAwaitingReview(
  milestoneId: string, sliceId: string, taskId: string,
  artifactPath: string,
): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks
       SET escalation_awaiting_review = 1,
           escalation_pending = 0,
           escalation_artifact_path = :path
     WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
  ).run({ ":path": artifactPath, ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
}

/** Clear escalation-pending and awaiting-review flags once the user has resolved it. */
export function clearTaskEscalationFlags(
  milestoneId: string, sliceId: string, taskId: string,
): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks
       SET escalation_pending = 0,
           escalation_awaiting_review = 0
     WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
  ).run({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
}

/**
 * Atomically claim a resolved escalation override for injection into a downstream
 * task's prompt. Returns true if this caller claimed it (must inject), false if
 * another caller already claimed it (must skip).
 */
export function claimEscalationOverride(
  milestoneId: string, sliceId: string, sourceTaskId: string,
): boolean {
  if (!currentDb) return false;
  const now = new Date().toISOString();
  const result = currentDb.prepare(
    `UPDATE tasks
       SET escalation_override_applied_at = :now
     WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid
       AND escalation_override_applied_at IS NULL
       AND escalation_artifact_path IS NOT NULL`,
  ).run({ ":now": now, ":mid": milestoneId, ":sid": sliceId, ":tid": sourceTaskId });
  // node:sqlite + better-sqlite3 both surface `changes` on the run result.
  const changes = (result as { changes?: number }).changes ?? 0;
  return changes > 0;
}

/** Find the most recent resolved-but-unapplied escalation override in a slice. */
export function findUnappliedEscalationOverride(
  milestoneId: string, sliceId: string,
): { taskId: string; artifactPath: string } | null {
  if (!currentDb) return null;
  // Filter BOTH flags: escalation_pending=0 AND escalation_awaiting_review=0
  // ensures we only claim overrides the user has explicitly resolved.
  // Without the awaiting_review filter, continueWithDefault=true artifacts
  // (not yet responded to) would be prematurely claimed, causing the override
  // to be lost when the user later resolves (#ADR-011 Phase 2 peer-review Bug 2).
  const row = currentDb.prepare(
    `SELECT id, escalation_artifact_path AS path
       FROM tasks
      WHERE milestone_id = :mid AND slice_id = :sid
        AND escalation_artifact_path IS NOT NULL
        AND escalation_override_applied_at IS NULL
        AND escalation_pending = 0
        AND escalation_awaiting_review = 0
      ORDER BY sequence DESC, id DESC
      LIMIT 1`,
  ).get({ ":mid": milestoneId, ":sid": sliceId }) as
    | { id: string; path: string | null }
    | undefined;
  if (!row || !row.path) return null;
  return { taskId: row.id, artifactPath: row.path };
}

/** Set the blocker_source provenance field (used when rejecting an escalation). */
export function setTaskBlockerSource(
  milestoneId: string, sliceId: string, taskId: string, source: string,
): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE tasks
       SET blocker_discovered = 1,
           blocker_source = :src
     WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
  ).run({ ":src": source, ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
}

/** List tasks with active escalation artifacts across a milestone (for /gsd escalate list). */
export function listEscalationArtifacts(milestoneId: string, includeResolved: boolean = false): TaskRow[] {
  if (!currentDb) return [];
  const filter = includeResolved
    ? "escalation_artifact_path IS NOT NULL"
    : "(escalation_pending = 1 OR escalation_awaiting_review = 1) AND escalation_artifact_path IS NOT NULL";
  const rows = currentDb.prepare(
    `SELECT * FROM tasks WHERE milestone_id = :mid AND ${filter} ORDER BY slice_id, sequence, id`,
  ).all({ ":mid": milestoneId });
  return rows.map(rowToTask);
}

export function insertVerificationEvidence(e: {
  taskId: string;
  sliceId: string;
  milestoneId: string;
  command: string;
  exitCode: number;
  verdict: string;
  durationMs: number;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO verification_evidence (task_id, slice_id, milestone_id, command, exit_code, verdict, duration_ms, created_at)
     VALUES (:task_id, :slice_id, :milestone_id, :command, :exit_code, :verdict, :duration_ms, :created_at)`,
  ).run({
    ":task_id": e.taskId,
    ":slice_id": e.sliceId,
    ":milestone_id": e.milestoneId,
    ":command": e.command,
    ":exit_code": e.exitCode,
    ":verdict": e.verdict,
    ":duration_ms": e.durationMs,
    ":created_at": new Date().toISOString(),
  });
}

export interface VerificationEvidenceRow {
  id: number;
  task_id: string;
  slice_id: string;
  milestone_id: string;
  command: string;
  exit_code: number;
  verdict: string;
  duration_ms: number;
  created_at: string;
}

export function getVerificationEvidence(milestoneId: string, sliceId: string, taskId: string): VerificationEvidenceRow[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    "SELECT * FROM verification_evidence WHERE milestone_id = :mid AND slice_id = :sid AND task_id = :tid ORDER BY id",
  ).all({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
  return rows as unknown as VerificationEvidenceRow[];
}

export function getAllMilestones(): MilestoneRow[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    "SELECT * FROM milestones ORDER BY CASE WHEN sequence > 0 THEN 0 ELSE 1 END, sequence, id",
  ).all();
  return rows.map(rowToMilestone);
}

export function getMilestone(id: string): MilestoneRow | null {
  if (!currentDb) return null;
  const row = currentDb.prepare("SELECT * FROM milestones WHERE id = :id").get({ ":id": id });
  if (!row) return null;
  return rowToMilestone(row);
}

export function setMilestoneQueueOrder(order: string[]): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.exec("BEGIN IMMEDIATE");
  try {
    currentDb.prepare("UPDATE milestones SET sequence = 0").run();
    const stmt = currentDb.prepare("UPDATE milestones SET sequence = :sequence WHERE id = :id");
    order.forEach((id, index) => {
      stmt.run({ ":id": id, ":sequence": index + 1 });
    });
    currentDb.exec("COMMIT");
  } catch (err) {
    currentDb.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Update a milestone's status in the database.
 * Used by park/unpark to keep the DB in sync with the filesystem marker.
 * See: https://github.com/gsd-build/gsd-2/issues/2694
 */
export function updateMilestoneStatus(milestoneId: string, status: string, completedAt?: string | null): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE milestones SET status = :status, completed_at = :completed_at WHERE id = :id`,
  ).run({ ":status": status, ":completed_at": completedAt ?? null, ":id": milestoneId });
}

export function getActiveMilestoneFromDb(): MilestoneRow | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    "SELECT * FROM milestones WHERE status NOT IN ('complete', 'parked') ORDER BY id LIMIT 1",
  ).get();
  if (!row) return null;
  return rowToMilestone(row);
}

export function getActiveSliceFromDb(milestoneId: string): SliceRow | null {
  if (!currentDb) return null;

  // Single query: find the first non-complete slice whose dependencies are all satisfied.
  // Uses json_each() to expand the JSON depends array and checks each dep is complete.
  const row = currentDb.prepare(
    `SELECT s.* FROM slices s
     WHERE s.milestone_id = :mid
       AND s.status NOT IN ('complete', 'done', 'skipped')
       AND NOT EXISTS (
         SELECT 1 FROM json_each(s.depends) AS dep
         WHERE dep.value NOT IN (
           SELECT id FROM slices WHERE milestone_id = :mid AND status IN ('complete', 'done', 'skipped')
         )
       )
     ORDER BY s.sequence, s.id
     LIMIT 1`,
  ).get({ ":mid": milestoneId });
  if (!row) return null;
  return rowToSlice(row);
}

export function getActiveTaskFromDb(milestoneId: string, sliceId: string): TaskRow | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    "SELECT * FROM tasks WHERE milestone_id = :mid AND slice_id = :sid AND status NOT IN ('complete', 'done') ORDER BY sequence, id LIMIT 1",
  ).get({ ":mid": milestoneId, ":sid": sliceId });
  if (!row) return null;
  return rowToTask(row);
}

export function getMilestoneSlices(milestoneId: string): SliceRow[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare("SELECT * FROM slices WHERE milestone_id = :mid ORDER BY sequence, id").all({ ":mid": milestoneId });
  return rows.map(rowToSlice);
}

export function getArtifact(path: string): ArtifactRow | null {
  if (!currentDb) return null;
  const row = currentDb.prepare("SELECT * FROM artifacts WHERE path = :path").get({ ":path": path });
  if (!row) return null;
  return rowToArtifact(row);
}

// ─── Lightweight Query Variants (hot-path optimized) ─────────────────────

/** Fast milestone status check — avoids deserializing JSON planning fields. */
export function getActiveMilestoneIdFromDb(): IdStatusSummary | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    "SELECT id, status FROM milestones WHERE status NOT IN ('complete', 'parked') ORDER BY id LIMIT 1",
  ).get();
  if (!row) return null;
  return rowToIdStatusSummary(row);
}

/** Fast slice status check — avoids deserializing JSON depends/planning fields. */
export function getSliceStatusSummary(milestoneId: string): IdStatusSummary[] {
  if (!currentDb) return [];
  return currentDb.prepare(
    "SELECT id, status FROM slices WHERE milestone_id = :mid ORDER BY sequence, id",
  ).all({ ":mid": milestoneId }).map(rowToIdStatusSummary);
}

/** Fast task status check — avoids deserializing JSON arrays and large text fields. */
export function getActiveTaskIdFromDb(milestoneId: string, sliceId: string): ActiveTaskSummary | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    "SELECT id, status, title FROM tasks WHERE milestone_id = :mid AND slice_id = :sid AND status NOT IN ('complete', 'done') ORDER BY sequence, id LIMIT 1",
  ).get({ ":mid": milestoneId, ":sid": sliceId });
  if (!row) return null;
  return rowToActiveTaskSummary(row);
}

/** Count tasks by status for a slice — useful for progress reporting without full row load. */
export function getSliceTaskCounts(milestoneId: string, sliceId: string): TaskStatusCounts {
  if (!currentDb) return emptyTaskStatusCounts();
  const row = currentDb.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status IN ('complete', 'done') THEN 1 ELSE 0 END) as done,
       SUM(CASE WHEN status NOT IN ('complete', 'done') THEN 1 ELSE 0 END) as pending
     FROM tasks WHERE milestone_id = :mid AND slice_id = :sid`,
  ).get({ ":mid": milestoneId, ":sid": sliceId });
  return rowToTaskStatusCounts(row);
}

// ─── Slice Dependencies (junction table) ─────────────────────────────────

/** Sync the slice_dependencies junction table from a slice's JSON depends array. */
export function syncSliceDependencies(milestoneId: string, sliceId: string, depends: string[]): void {
  if (!currentDb) return;
  currentDb.prepare(
    "DELETE FROM slice_dependencies WHERE milestone_id = :mid AND slice_id = :sid",
  ).run({ ":mid": milestoneId, ":sid": sliceId });
  for (const dep of depends) {
    currentDb.prepare(
      "INSERT OR IGNORE INTO slice_dependencies (milestone_id, slice_id, depends_on_slice_id) VALUES (:mid, :sid, :dep)",
    ).run({ ":mid": milestoneId, ":sid": sliceId, ":dep": dep });
  }
}

/** Get all slices that depend on a given slice. */
export function getDependentSlices(milestoneId: string, sliceId: string): string[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    "SELECT slice_id FROM slice_dependencies WHERE milestone_id = :mid AND depends_on_slice_id = :sid",
  ).all({ ":mid": milestoneId, ":sid": sliceId });
  return rowsToStringColumn(rows, "slice_id");
}

// ─── Worktree DB Helpers ──────────────────────────────────────────────────

export function copyWorktreeDb(srcDbPath: string, destDbPath: string): boolean {
  try {
    if (!existsSync(srcDbPath)) return false;
    const destDir = dirname(destDbPath);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(srcDbPath, destDbPath);
    return true;
  } catch (err) {
    logError("db", "failed to copy DB to worktree", { error: (err as Error).message });
    return false;
  }
}

export interface ReconcileResult {
  decisions: number;
  requirements: number;
  artifacts: number;
  milestones: number;
  slices: number;
  tasks: number;
  memories: number;
  verification_evidence: number;
  conflicts: string[];
}

export function reconcileWorktreeDb(
  mainDbPath: string,
  worktreeDbPath: string,
): ReconcileResult {
  const zero: ReconcileResult = { decisions: 0, requirements: 0, artifacts: 0, milestones: 0, slices: 0, tasks: 0, memories: 0, verification_evidence: 0, conflicts: [] };
  if (!existsSync(worktreeDbPath)) return zero;
  // Guard: bail when both paths resolve to the same physical file.
  // ATTACHing a WAL-mode DB to itself corrupts the WAL (#2823).
  try {
    if (realpathSync(mainDbPath) === realpathSync(worktreeDbPath)) return zero;
  } catch (e) { logWarning("db", `realpathSync failed: ${(e as Error).message}`); }
  // Sanitize path: reject any characters that could break ATTACH syntax.
  // ATTACH DATABASE doesn't support parameterized paths in all providers,
  // so we use strict allowlist validation instead.
  if (/['";\x00]/.test(worktreeDbPath)) {
    logError("db", "worktree DB reconciliation failed: path contains unsafe characters");
    return zero;
  }
  if (!currentDb) {
    const opened = openDatabase(mainDbPath);
    if (!opened) {
      logError("db", "worktree DB reconciliation failed: cannot open main DB");
      return zero;
    }
  }
  const adapter = currentDb!;
  const conflicts: string[] = [];
  try {
    adapter.exec(`ATTACH DATABASE '${worktreeDbPath}' AS wt`);
    try {
      const wtInfo = adapter.prepare("PRAGMA wt.table_info('decisions')").all();
      const hasMadeBy = wtInfo.some((col) => col["name"] === "made_by");
      // ADR-011: worktree may predate schema v16/v17. For missing columns we
      // fall through to the main DB's existing value (not a literal default)
      // so reconcile never silently clears state the main tree has recorded.
      const hasDecisionSource = wtInfo.some((col) => col["name"] === "source");
      const wtMilestoneInfo = adapter.prepare("PRAGMA wt.table_info('milestones')").all();
      const hasMilestoneSequence = wtMilestoneInfo.some((col) => col["name"] === "sequence");
      const wtSliceInfo = adapter.prepare("PRAGMA wt.table_info('slices')").all();
      const hasIsSketch = wtSliceInfo.some((col) => col["name"] === "is_sketch");
      const hasSketchScope = wtSliceInfo.some((col) => col["name"] === "sketch_scope");
      const wtTaskInfo = adapter.prepare("PRAGMA wt.table_info('tasks')").all();
      const hasBlockerSource = wtTaskInfo.some((col) => col["name"] === "blocker_source");
      const hasEscalationPending = wtTaskInfo.some((col) => col["name"] === "escalation_pending");
      const hasEscalationAwaiting = wtTaskInfo.some((col) => col["name"] === "escalation_awaiting_review");
      const hasEscalationArtifact = wtTaskInfo.some((col) => col["name"] === "escalation_artifact_path");
      const hasEscalationOverride = wtTaskInfo.some((col) => col["name"] === "escalation_override_applied_at");
      const wtArtifactInfo = adapter.prepare("PRAGMA wt.table_info('artifacts')").all();
      const hasArtifactContentHash = wtArtifactInfo.some((col) => col["name"] === "content_hash");
      const wtMemoryInfo = adapter.prepare("PRAGMA wt.table_info('memories')").all();
      const hasMemoryScope = wtMemoryInfo.some((col) => col["name"] === "scope");
      const hasMemoryTags = wtMemoryInfo.some((col) => col["name"] === "tags");
      const hasMemoryStructuredFields = wtMemoryInfo.some((col) => col["name"] === "structured_fields");
      const hasMemoryLastHitAt = wtMemoryInfo.some((col) => col["name"] === "last_hit_at");

      const decConf = adapter.prepare(
        `SELECT m.id FROM decisions m INNER JOIN wt.decisions w ON m.id = w.id WHERE m.decision != w.decision OR m.choice != w.choice OR m.rationale != w.rationale OR ${
          hasMadeBy ? "m.made_by != w.made_by" : "'agent' != 'agent'"
        } OR m.superseded_by IS NOT w.superseded_by`,
      ).all();
      for (const row of decConf) conflicts.push(`decision ${(row as Record<string, unknown>)["id"]}: modified in both`);

      const reqConf = adapter.prepare(
        `SELECT m.id FROM requirements m INNER JOIN wt.requirements w ON m.id = w.id WHERE m.description != w.description OR m.status != w.status OR m.notes != w.notes OR m.superseded_by IS NOT w.superseded_by`,
      ).all();
      for (const row of reqConf) conflicts.push(`requirement ${(row as Record<string, unknown>)["id"]}: modified in both`);

      const merged: Omit<ReconcileResult, "conflicts"> = { decisions: 0, requirements: 0, artifacts: 0, milestones: 0, slices: 0, tasks: 0, memories: 0, verification_evidence: 0 };

      function countChanges(result: unknown): number {
        return typeof result === "object" && result !== null ? ((result as { changes?: number }).changes ?? 0) : 0;
      }

      adapter.exec("BEGIN");
      try {
        // Join the target decisions so we can prefer an existing main.source
        // when the worktree predates v16 — otherwise a write-through reconcile
        // would clobber 'escalation'-sourced decisions with the literal default.
        merged.decisions = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO decisions (
            id, when_context, scope, decision, choice, rationale, revisable, made_by, source, superseded_by
          )
          SELECT w.id, w.when_context, w.scope, w.decision, w.choice, w.rationale, w.revisable, ${
            hasMadeBy ? "w.made_by" : "COALESCE(m.made_by, 'agent')"
          }, ${
            hasDecisionSource ? "w.source" : "COALESCE(m.source, 'discussion')"
          }, w.superseded_by
          FROM wt.decisions w
          LEFT JOIN decisions m ON m.id = w.id
        `).run());

        merged.requirements = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO requirements (
            id, class, status, description, why, source, primary_owner,
            supporting_slices, validation, notes, full_content, superseded_by
          )
          SELECT id, class, status, description, why, source, primary_owner,
                 supporting_slices, validation, notes, full_content, superseded_by
          FROM wt.requirements
        `).run());

        // V27: preserve content_hash. If the worktree predates V27 (no column),
        // fall back to the main DB's existing hash so reconcile doesn't null
        // out integrity fingerprints on artifacts that were unchanged in wt.
        merged.artifacts = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO artifacts (
            path, artifact_type, milestone_id, slice_id, task_id, full_content, imported_at, content_hash
          )
          SELECT w.path, w.artifact_type, w.milestone_id, w.slice_id, w.task_id, w.full_content, w.imported_at,
                 ${hasArtifactContentHash ? "w.content_hash" : "m.content_hash"}
          FROM wt.artifacts w
          LEFT JOIN artifacts m ON m.path = w.path
        `).run());

        // Merge milestones — worktree may have updated status/planning fields.
        // Never downgrade status: complete > active > pre-planning (#4372).
        // A stale worktree may carry an older 'active' status for a milestone
        // that the main DB has already marked 'complete'; preserve the higher status.
        merged.milestones = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO milestones (
            id, title, status, depends_on, created_at, completed_at,
            vision, success_criteria, key_risks, proof_strategy,
            verification_contract, verification_integration, verification_operational, verification_uat,
            definition_of_done, requirement_coverage, boundary_map_markdown, sequence
          )
          SELECT w.id, w.title,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.status ELSE w.status
                 END,
                 w.depends_on,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.created_at ELSE w.created_at
                 END,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.completed_at ELSE w.completed_at
                 END,
                 w.vision, w.success_criteria, w.key_risks, w.proof_strategy,
                 w.verification_contract, w.verification_integration, w.verification_operational, w.verification_uat,
                 w.definition_of_done, w.requirement_coverage, w.boundary_map_markdown,
                 ${hasMilestoneSequence ? "COALESCE(w.sequence, 0)" : "COALESCE(m.sequence, 0)"}
          FROM wt.milestones w
          LEFT JOIN milestones m ON m.id = w.id
        `).run());

        // Merge slices — preserve worktree progress but never downgrade completed status (#2558).
        // ADR-011 Phase 1: carry is_sketch + sketch_scope so reconcile doesn't
        // silently clear sketch metadata. When the worktree predates v16,
        // fall back to the main DB's existing value rather than a literal 0/''.
        merged.slices = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO slices (
            milestone_id, id, title, status, risk, depends, demo, created_at, completed_at,
            full_summary_md, full_uat_md, goal, success_criteria, proof_level,
            integration_closure, observability_impact, sequence, replan_triggered_at,
            is_sketch, sketch_scope
          )
          SELECT w.milestone_id, w.id, w.title,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.status ELSE w.status
                 END,
                 w.risk, w.depends, w.demo, w.created_at,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.completed_at ELSE w.completed_at
                 END,
                 w.full_summary_md, w.full_uat_md, w.goal, w.success_criteria, w.proof_level,
                 w.integration_closure, w.observability_impact, w.sequence, w.replan_triggered_at,
                 ${hasIsSketch ? "w.is_sketch" : "COALESCE(m.is_sketch, 0)"},
                 ${hasSketchScope ? "w.sketch_scope" : "COALESCE(m.sketch_scope, '')"}
          FROM wt.slices w
          LEFT JOIN slices m ON m.milestone_id = w.milestone_id AND m.id = w.id
        `).run());

        // Merge tasks — preserve execution results, never downgrade completed status (#2558).
        // ADR-011 P2: carry blocker_source + escalation_* columns so worktree reconcile
        // doesn't silently clear escalation state back to defaults.
        merged.tasks = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO tasks (
            milestone_id, slice_id, id, title, status, one_liner, narrative,
            verification_result, duration, completed_at, blocker_discovered,
            deviations, known_issues, key_files, key_decisions, full_summary_md,
            description, estimate, files, verify, inputs, expected_output,
            observability_impact, full_plan_md, sequence,
            blocker_source, escalation_pending, escalation_awaiting_review,
            escalation_artifact_path, escalation_override_applied_at
          )
          SELECT w.milestone_id, w.slice_id, w.id, w.title,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.status ELSE w.status
                 END,
                 w.one_liner, w.narrative,
                 w.verification_result, w.duration,
                 CASE
                   WHEN m.status IN ('complete', 'done') AND w.status NOT IN ('complete', 'done')
                   THEN m.completed_at ELSE w.completed_at
                 END,
                 w.blocker_discovered,
                 w.deviations, w.known_issues, w.key_files, w.key_decisions, w.full_summary_md,
                 w.description, w.estimate, w.files, w.verify, w.inputs, w.expected_output,
                 w.observability_impact, w.full_plan_md, w.sequence,
                 ${hasBlockerSource ? "w.blocker_source" : "COALESCE(m.blocker_source, '')"},
                 ${hasEscalationPending ? "w.escalation_pending" : "COALESCE(m.escalation_pending, 0)"},
                 ${hasEscalationAwaiting ? "w.escalation_awaiting_review" : "COALESCE(m.escalation_awaiting_review, 0)"},
                 ${hasEscalationArtifact ? "w.escalation_artifact_path" : "m.escalation_artifact_path"},
                 ${hasEscalationOverride ? "w.escalation_override_applied_at" : "m.escalation_override_applied_at"}
          FROM wt.tasks w
          LEFT JOIN tasks m ON m.milestone_id = w.milestone_id AND m.slice_id = w.slice_id AND m.id = w.id
        `).run());

        // Merge memories — keep worktree-learned insights.
        // V18 (scope, tags), V21 (structured_fields), V28 (last_hit_at): for each
        // column the wt may not yet have (older worktree DB), fall back to the
        // main DB's existing value via LEFT JOIN so reconcile never silently
        // resets these fields to defaults on rows that already had them.
        merged.memories = countChanges(adapter.prepare(`
          INSERT OR REPLACE INTO memories (
            seq, id, category, content, confidence, source_unit_type, source_unit_id,
            created_at, updated_at, superseded_by, hit_count,
            scope, tags, structured_fields, last_hit_at
          )
          SELECT w.seq, w.id, w.category, w.content, w.confidence, w.source_unit_type, w.source_unit_id,
                 w.created_at, w.updated_at, w.superseded_by, w.hit_count,
                 ${hasMemoryScope ? "w.scope" : "COALESCE(m.scope, 'project')"},
                 ${hasMemoryTags ? "w.tags" : "COALESCE(m.tags, '[]')"},
                 ${hasMemoryStructuredFields ? "w.structured_fields" : "m.structured_fields"},
                 ${hasMemoryLastHitAt ? "w.last_hit_at" : "m.last_hit_at"}
          FROM wt.memories w
          LEFT JOIN memories m ON m.id = w.id
        `).run());

        // Merge verification evidence — append-only, use INSERT OR IGNORE to avoid duplicates
        merged.verification_evidence = countChanges(adapter.prepare(`
          INSERT OR IGNORE INTO verification_evidence (
            task_id, slice_id, milestone_id, command, exit_code, verdict, duration_ms, created_at
          )
          SELECT task_id, slice_id, milestone_id, command, exit_code, verdict, duration_ms, created_at
          FROM wt.verification_evidence
        `).run());

        adapter.exec("COMMIT");
      } catch (txErr) {
        try { adapter.exec("ROLLBACK"); } catch (e) { logWarning("db", `rollback failed: ${(e as Error).message}`); }
        throw txErr;
      }
      return { ...merged, conflicts };
    } finally {
      try { adapter.exec("DETACH DATABASE wt"); } catch (e) { logWarning("db", `detach worktree DB failed: ${(e as Error).message}`); }
    }
  } catch (err) {
    logError("db", "worktree DB reconciliation failed", { error: (err as Error).message });
    return { ...zero, conflicts };
  }
}

// ─── Replan & Assessment Helpers ──────────────────────────────────────────

export function insertReplanHistory(entry: {
  milestoneId: string;
  sliceId?: string | null;
  taskId?: string | null;
  summary: string;
  previousArtifactPath?: string | null;
  replacementArtifactPath?: string | null;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  // INSERT OR REPLACE: idempotent on (milestone_id, slice_id, task_id) via schema v11 unique index.
  // Retrying the same replan silently updates summary instead of accumulating duplicate rows.
  currentDb.prepare(
    `INSERT OR REPLACE INTO replan_history (milestone_id, slice_id, task_id, summary, previous_artifact_path, replacement_artifact_path, created_at)
     VALUES (:milestone_id, :slice_id, :task_id, :summary, :previous_artifact_path, :replacement_artifact_path, :created_at)`,
  ).run({
    ":milestone_id": entry.milestoneId,
    ":slice_id": entry.sliceId ?? null,
    ":task_id": entry.taskId ?? null,
    ":summary": entry.summary,
    ":previous_artifact_path": entry.previousArtifactPath ?? null,
    ":replacement_artifact_path": entry.replacementArtifactPath ?? null,
    ":created_at": new Date().toISOString(),
  });
}

export function insertAssessment(entry: {
  path: string;
  milestoneId: string;
  sliceId?: string | null;
  taskId?: string | null;
  status: string;
  scope: string;
  fullContent: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  // Idempotent: PRIMARY KEY is `path`, which is deterministic given (milestone_id, scope) per
  // the artifact-path resolver. Retrying the same reassess-roadmap silently overwrites the row
  // instead of accumulating duplicates.
  currentDb.prepare(
    `INSERT OR REPLACE INTO assessments (path, milestone_id, slice_id, task_id, status, scope, full_content, created_at)
     VALUES (:path, :milestone_id, :slice_id, :task_id, :status, :scope, :full_content, :created_at)`,
  ).run({
    ":path": entry.path,
    ":milestone_id": entry.milestoneId,
    ":slice_id": entry.sliceId ?? null,
    ":task_id": entry.taskId ?? null,
    ":status": entry.status,
    ":scope": entry.scope,
    ":full_content": entry.fullContent,
    ":created_at": new Date().toISOString(),
  });
}

export function deleteAssessmentByScope(milestoneId: string, scope: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `DELETE FROM assessments WHERE milestone_id = :mid AND scope = :scope`,
  ).run({ ":mid": milestoneId, ":scope": scope });
}

export function deleteVerificationEvidence(milestoneId: string, sliceId: string, taskId: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `DELETE FROM verification_evidence WHERE milestone_id = :mid AND slice_id = :sid AND task_id = :tid`,
  ).run({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
}

export function deleteTask(milestoneId: string, sliceId: string, taskId: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  transaction(() => {
    // Must delete verification_evidence first (FK constraint)
    currentDb!.prepare(
      `DELETE FROM verification_evidence WHERE milestone_id = :mid AND slice_id = :sid AND task_id = :tid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
    currentDb!.prepare(
      `DELETE FROM tasks WHERE milestone_id = :mid AND slice_id = :sid AND id = :tid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId, ":tid": taskId });
  });
}

export function deleteSlice(milestoneId: string, sliceId: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  transaction(() => {
    // Cascade-style manual deletion: evidence → tasks → dependencies → slice
    currentDb!.prepare(
      `DELETE FROM verification_evidence WHERE milestone_id = :mid AND slice_id = :sid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId });
    currentDb!.prepare(
      `DELETE FROM tasks WHERE milestone_id = :mid AND slice_id = :sid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId });
    currentDb!.prepare(
      `DELETE FROM slice_dependencies WHERE milestone_id = :mid AND slice_id = :sid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId });
    currentDb!.prepare(
      `DELETE FROM slice_dependencies WHERE milestone_id = :mid AND depends_on_slice_id = :sid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId });
    currentDb!.prepare(
      `DELETE FROM slices WHERE milestone_id = :mid AND id = :sid`,
    ).run({ ":mid": milestoneId, ":sid": sliceId });
  });
}

export function deleteMilestone(milestoneId: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  transaction(() => {
    currentDb!.prepare(
      `DELETE FROM verification_evidence WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM quality_gates WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM gate_runs WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM tasks WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM slice_dependencies WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM slices WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM replan_history WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM assessments WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM artifacts WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM milestone_commit_attributions WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM milestone_leases WHERE milestone_id = :mid`,
    ).run({ ":mid": milestoneId });
    currentDb!.prepare(
      `DELETE FROM milestones WHERE id = :mid`,
    ).run({ ":mid": milestoneId });
  });
}

export function updateSliceFields(milestoneId: string, sliceId: string, fields: {
  title?: string;
  risk?: string;
  depends?: string[];
  demo?: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE slices SET
      title = COALESCE(:title, title),
      risk = COALESCE(:risk, risk),
      depends = COALESCE(:depends, depends),
      demo = COALESCE(:demo, demo)
     WHERE milestone_id = :milestone_id AND id = :id`,
  ).run({
    ":milestone_id": milestoneId,
    ":id": sliceId,
    ":title": fields.title ?? null,
    ":risk": fields.risk ?? null,
    ":depends": fields.depends ? JSON.stringify(fields.depends) : null,
    ":demo": fields.demo ?? null,
  });
}

export function getReplanHistory(milestoneId: string, sliceId?: string): Array<Record<string, unknown>> {
  if (!currentDb) return [];
  if (sliceId) {
    return currentDb.prepare(
      `SELECT * FROM replan_history WHERE milestone_id = :mid AND slice_id = :sid ORDER BY created_at DESC`,
    ).all({ ":mid": milestoneId, ":sid": sliceId });
  }
  return currentDb.prepare(
    `SELECT * FROM replan_history WHERE milestone_id = :mid ORDER BY created_at DESC`,
  ).all({ ":mid": milestoneId });
}

export function getAssessment(path: string): Record<string, unknown> | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    `SELECT * FROM assessments WHERE path = :path`,
  ).get({ ":path": path });
  return row ?? null;
}

export function getLatestAssessmentByScope(
  milestoneId: string,
  scope: string,
): Record<string, unknown> | null {
  if (!currentDb) return null;
  const row = currentDb.prepare(
    `SELECT * FROM assessments
      WHERE milestone_id = :mid AND scope = :scope
      ORDER BY created_at DESC
      LIMIT 1`,
  ).get({ ":mid": milestoneId, ":scope": scope });
  return row ?? null;
}

// ─── Quality Gates ───────────────────────────────────────────────────────

export function insertGateRow(g: {
  milestoneId: string;
  sliceId: string;
  gateId: GateId;
  scope: GateScope;
  taskId?: string | null;
  status?: GateStatus;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO quality_gates (milestone_id, slice_id, gate_id, scope, task_id, status)
     VALUES (:mid, :sid, :gid, :scope, :tid, :status)`,
  ).run({
    ":mid": g.milestoneId,
    ":sid": g.sliceId,
    ":gid": g.gateId,
    ":scope": g.scope,
    ":tid": g.taskId ?? "",
    ":status": g.status ?? "pending",
  });
}

export function saveGateResult(g: {
  milestoneId: string;
  sliceId: string;
  gateId: string;
  taskId?: string | null;
  verdict: GateVerdict;
  rationale: string;
  findings: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE quality_gates
     SET status = 'complete', verdict = :verdict, rationale = :rationale,
         findings = :findings, evaluated_at = :evaluated_at
     WHERE milestone_id = :mid AND slice_id = :sid AND gate_id = :gid
       AND task_id = :tid`,
  ).run({
    ":mid": g.milestoneId,
    ":sid": g.sliceId,
    ":gid": g.gateId,
    ":tid": g.taskId ?? "",
    ":verdict": g.verdict,
    ":rationale": g.rationale,
    ":findings": g.findings,
    ":evaluated_at": new Date().toISOString(),
  });

  const outcome =
    g.verdict === "pass"
      ? "pass"
      : g.verdict === "omitted"
        ? "manual-attention"
        : "fail";
  insertGateRun({
    traceId: `quality-gate:${g.milestoneId}:${g.sliceId}`,
    turnId: `gate:${g.gateId}:${g.taskId ?? "slice"}`,
    gateId: g.gateId,
    gateType: "quality-gate",
    milestoneId: g.milestoneId,
    sliceId: g.sliceId,
    taskId: g.taskId ?? undefined,
    outcome,
    failureClass: outcome === "fail" ? "verification" : outcome === "manual-attention" ? "manual-attention" : "none",
    rationale: g.rationale,
    findings: g.findings,
    attempt: 1,
    maxAttempts: 1,
    retryable: false,
    evaluatedAt: new Date().toISOString(),
  });
}

export function getPendingGates(milestoneId: string, sliceId: string, scope?: GateScope): GateRow[] {
  if (!currentDb) return [];
  const sql = scope
    ? `SELECT * FROM quality_gates WHERE milestone_id = :mid AND slice_id = :sid AND scope = :scope AND status = 'pending'`
    : `SELECT * FROM quality_gates WHERE milestone_id = :mid AND slice_id = :sid AND status = 'pending'`;
  const params: Record<string, unknown> = { ":mid": milestoneId, ":sid": sliceId };
  if (scope) params[":scope"] = scope;
  return currentDb.prepare(sql).all(params).map(rowToGate);
}

export function getGateResults(milestoneId: string, sliceId: string, scope?: GateScope): GateRow[] {
  if (!currentDb) return [];
  const sql = scope
    ? `SELECT * FROM quality_gates WHERE milestone_id = :mid AND slice_id = :sid AND scope = :scope`
    : `SELECT * FROM quality_gates WHERE milestone_id = :mid AND slice_id = :sid`;
  const params: Record<string, unknown> = { ":mid": milestoneId, ":sid": sliceId };
  if (scope) params[":scope"] = scope;
  return currentDb.prepare(sql).all(params).map(rowToGate);
}

export function markAllGatesOmitted(milestoneId: string, sliceId: string): void {
  if (!currentDb) return;
  currentDb.prepare(
    `UPDATE quality_gates SET status = 'complete', verdict = 'omitted', evaluated_at = :now
     WHERE milestone_id = :mid AND slice_id = :sid AND status = 'pending'`,
  ).run({
    ":mid": milestoneId,
    ":sid": sliceId,
    ":now": new Date().toISOString(),
  });
}

export function getPendingSliceGateCount(milestoneId: string, sliceId: string): number {
  if (!currentDb) return 0;
  const row = currentDb.prepare(
    `SELECT COUNT(*) as cnt FROM quality_gates
     WHERE milestone_id = :mid AND slice_id = :sid AND scope = 'slice' AND status = 'pending'`,
  ).get({ ":mid": milestoneId, ":sid": sliceId });
  return row ? (row["cnt"] as number) : 0;
}

/**
 * Return pending gate rows owned by a specific workflow turn.
 *
 * Unlike `getPendingGates(..., scope)`, this filters by the registry's
 * `ownerTurn` metadata so callers can distinguish Q3/Q4 (owned by
 * gate-evaluate) from Q8 (owned by complete-slice) even though both are
 * scope:"slice". Pass `taskId` to narrow task-scoped results to one task.
 */
export function getPendingGatesForTurn(
  milestoneId: string,
  sliceId: string,
  turn: OwnerTurn,
  taskId?: string,
): GateRow[] {
  if (!currentDb) return [];
  const ids = getGateIdsForTurn(turn);
  if (ids.size === 0) return [];
  const idList = [...ids];
  const placeholders = idList.map((_, i) => `:gid${i}`).join(",");
  const params: Record<string, unknown> = {
    ":mid": milestoneId,
    ":sid": sliceId,
  };
  idList.forEach((id, i) => {
    params[`:gid${i}`] = id;
  });
  let sql =
    `SELECT * FROM quality_gates
     WHERE milestone_id = :mid AND slice_id = :sid
       AND status = 'pending'
       AND gate_id IN (${placeholders})`;
  if (taskId !== undefined) {
    sql += ` AND task_id = :tid`;
    params[":tid"] = taskId;
  }
  return currentDb.prepare(sql).all(params).map(rowToGate);
}

/**
 * Count pending gates for a turn. Convenience wrapper used by state
 * derivation to decide whether a phase transition should pause.
 */
export function getPendingGateCountForTurn(
  milestoneId: string,
  sliceId: string,
  turn: OwnerTurn,
): number {
  return getPendingGatesForTurn(milestoneId, sliceId, turn).length;
}

export function insertGateRun(entry: {
  traceId: string;
  turnId: string;
  gateId: string;
  gateType: string;
  unitType?: string;
  unitId?: string;
  milestoneId?: string;
  sliceId?: string;
  taskId?: string;
  outcome: "pass" | "fail" | "retry" | "manual-attention";
  failureClass: "none" | "policy" | "input" | "execution" | "artifact" | "verification" | "closeout" | "git" | "timeout" | "manual-attention" | "unknown";
  rationale?: string;
  findings?: string;
  attempt: number;
  maxAttempts: number;
  retryable: boolean;
  evaluatedAt: string;
}): void {
  if (!currentDb) return;
  currentDb.prepare(
    `INSERT INTO gate_runs (
      trace_id, turn_id, gate_id, gate_type, unit_type, unit_id, milestone_id, slice_id, task_id,
      outcome, failure_class, rationale, findings, attempt, max_attempts, retryable, evaluated_at
    ) VALUES (
      :trace_id, :turn_id, :gate_id, :gate_type, :unit_type, :unit_id, :milestone_id, :slice_id, :task_id,
      :outcome, :failure_class, :rationale, :findings, :attempt, :max_attempts, :retryable, :evaluated_at
    )`,
  ).run({
    ":trace_id": entry.traceId,
    ":turn_id": entry.turnId,
    ":gate_id": entry.gateId,
    ":gate_type": entry.gateType,
    ":unit_type": entry.unitType ?? null,
    ":unit_id": entry.unitId ?? null,
    ":milestone_id": entry.milestoneId ?? null,
    ":slice_id": entry.sliceId ?? null,
    ":task_id": entry.taskId ?? null,
    ":outcome": entry.outcome,
    ":failure_class": entry.failureClass,
    ":rationale": entry.rationale ?? "",
    ":findings": entry.findings ?? "",
    ":attempt": entry.attempt,
    ":max_attempts": entry.maxAttempts,
    ":retryable": entry.retryable ? 1 : 0,
    ":evaluated_at": entry.evaluatedAt,
  });
}

export function upsertTurnGitTransaction(entry: {
  traceId: string;
  turnId: string;
  unitType?: string;
  unitId?: string;
  stage: string;
  action: "commit" | "snapshot" | "status-only";
  push: boolean;
  status: "ok" | "failed";
  error?: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}): void {
  if (!currentDb) return;
  currentDb.prepare(
    `INSERT OR REPLACE INTO turn_git_transactions (
      trace_id, turn_id, unit_type, unit_id, stage, action, push, status, error, metadata_json, updated_at
    ) VALUES (
      :trace_id, :turn_id, :unit_type, :unit_id, :stage, :action, :push, :status, :error, :metadata_json, :updated_at
    )`,
  ).run({
    ":trace_id": entry.traceId,
    ":turn_id": entry.turnId,
    ":unit_type": entry.unitType ?? null,
    ":unit_id": entry.unitId ?? null,
    ":stage": entry.stage,
    ":action": entry.action,
    ":push": entry.push ? 1 : 0,
    ":status": entry.status,
    ":error": entry.error ?? null,
    ":metadata_json": JSON.stringify(entry.metadata ?? {}),
    ":updated_at": entry.updatedAt,
  });
}

export function getMilestoneCommitAttributionShas(milestoneId: string): string[] {
  if (!currentDb) return [];
  const rows = currentDb.prepare(
    `SELECT commit_sha
     FROM milestone_commit_attributions
     WHERE milestone_id = :mid
     ORDER BY created_at, commit_sha`,
  ).all({ ":mid": milestoneId }) as Array<Record<string, unknown>>;
  return rows
    .map((row) => typeof row["commit_sha"] === "string" ? row["commit_sha"] : "")
    .filter(Boolean);
}

export function recordMilestoneCommitAttribution(entry: {
  commitSha: string;
  milestoneId: string;
  sliceId?: string;
  taskId?: string;
  source: "recorded" | "backfill";
  confidence: number;
  files: string[];
  createdAt: string;
}): void {
  if (!currentDb) return;
  transaction(() => {
    currentDb!.prepare(
      `INSERT OR REPLACE INTO milestone_commit_attributions (
        commit_sha, milestone_id, slice_id, task_id, source, confidence, files_json, created_at
      ) VALUES (
        :commit_sha, :milestone_id, :slice_id, :task_id, :source, :confidence, :files_json, :created_at
      )`,
    ).run({
      ":commit_sha": entry.commitSha,
      ":milestone_id": entry.milestoneId,
      ":slice_id": entry.sliceId ?? null,
      ":task_id": entry.taskId ?? null,
      ":source": entry.source,
      ":confidence": entry.confidence,
      ":files_json": JSON.stringify(entry.files),
      ":created_at": entry.createdAt,
    });

    currentDb!.prepare(
      `INSERT OR IGNORE INTO audit_events (
        event_id, trace_id, turn_id, caused_by, category, type, ts, payload_json
      ) VALUES (
        :event_id, :trace_id, :turn_id, :caused_by, :category, :type, :ts, :payload_json
      )`,
    ).run({
      ":event_id": `milestone-commit-attribution:${entry.milestoneId}:${entry.commitSha}`,
      ":trace_id": "milestone-commit-attribution",
      ":turn_id": null,
      ":caused_by": null,
      ":category": "git",
      ":type": "milestone-commit-attribution-recorded",
      ":ts": entry.createdAt,
      ":payload_json": JSON.stringify({
        commitSha: entry.commitSha,
        milestoneId: entry.milestoneId,
        sliceId: entry.sliceId ?? null,
        taskId: entry.taskId ?? null,
        source: entry.source,
        confidence: entry.confidence,
        files: entry.files,
      }),
    });
  });
}

export function insertAuditEvent(entry: {
  eventId: string;
  traceId: string;
  turnId?: string;
  causedBy?: string;
  category: string;
  type: string;
  ts: string;
  payload: Record<string, unknown>;
}): void {
  if (!currentDb) return;
  transaction(() => {
    currentDb!.prepare(
      `INSERT OR IGNORE INTO audit_events (
        event_id, trace_id, turn_id, caused_by, category, type, ts, payload_json
      ) VALUES (
        :event_id, :trace_id, :turn_id, :caused_by, :category, :type, :ts, :payload_json
      )`,
    ).run({
      ":event_id": entry.eventId,
      ":trace_id": entry.traceId,
      ":turn_id": entry.turnId ?? null,
      ":caused_by": entry.causedBy ?? null,
      ":category": entry.category,
      ":type": entry.type,
      ":ts": entry.ts,
      ":payload_json": JSON.stringify(entry.payload ?? {}),
    });

    if (entry.turnId) {
      const row = currentDb!.prepare(
        `SELECT event_count, first_ts, last_ts
         FROM audit_turn_index
         WHERE trace_id = :trace_id AND turn_id = :turn_id`,
      ).get({
        ":trace_id": entry.traceId,
        ":turn_id": entry.turnId,
      });
      if (row) {
        currentDb!.prepare(
          `UPDATE audit_turn_index
           SET first_ts = CASE WHEN :ts < first_ts THEN :ts ELSE first_ts END,
               last_ts = CASE WHEN :ts > last_ts THEN :ts ELSE last_ts END,
               event_count = event_count + 1
           WHERE trace_id = :trace_id AND turn_id = :turn_id`,
        ).run({
          ":trace_id": entry.traceId,
          ":turn_id": entry.turnId,
          ":ts": entry.ts,
        });
      } else {
        currentDb!.prepare(
          `INSERT INTO audit_turn_index (trace_id, turn_id, first_ts, last_ts, event_count)
           VALUES (:trace_id, :turn_id, :first_ts, :last_ts, :event_count)`,
        ).run({
          ":trace_id": entry.traceId,
          ":turn_id": entry.turnId,
          ":first_ts": entry.ts,
          ":last_ts": entry.ts,
          ":event_count": 1,
        });
      }
    }
  });
}

// ─── Single-writer bypass wrappers ───────────────────────────────────────
// These wrappers exist so modules outside this file never need to call
// `_getAdapter()` for writes. Each one is a byte-equivalent replacement for
// a raw prepare/run previously issued from another module. Keep them
// minimal and direct — they exist to hold SQL text in one place, not to
// add new behavior.

/** Delete a decision row by id. Used by db-writer.ts rollback on disk-write failure. */
export function deleteDecisionById(id: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare("DELETE FROM decisions WHERE id = :id").run({ ":id": id });
}

/** Delete a requirement row by id. Used by db-writer.ts rollback on disk-write failure. */
export function deleteRequirementById(id: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare("DELETE FROM requirements WHERE id = :id").run({ ":id": id });
}

/** Delete an artifact row by path. Used by db-writer.ts rollback on disk-write failure. */
export function deleteArtifactByPath(path: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare("DELETE FROM artifacts WHERE path = :path").run({ ":path": path });
}

/**
 * Drop hierarchy rows in dependency order inside a transaction. Used by
 * `gsd recover` to rebuild engine state from markdown.
 */
export function clearEngineHierarchy(): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  transaction(() => {
    currentDb!.exec("DELETE FROM verification_evidence");
    currentDb!.exec("DELETE FROM quality_gates");
    currentDb!.exec("DELETE FROM slice_dependencies");
    currentDb!.exec("DELETE FROM assessments");
    currentDb!.exec("DELETE FROM replan_history");
    currentDb!.exec("DELETE FROM milestone_commit_attributions");
    currentDb!.exec("DELETE FROM tasks");
    currentDb!.exec("DELETE FROM slices");
    currentDb!.exec("DELETE FROM milestone_leases");
    currentDb!.exec("DELETE FROM milestones");
  });
}

/**
 * INSERT OR IGNORE a slice during event replay (workflow-reconcile.ts).
 * Strict insert-or-ignore semantics are required here to avoid the
 * `insertSlice` ON CONFLICT path that could downgrade an already-completed
 * slice back to 'pending'.
 */
export function insertOrIgnoreSlice(args: {
  milestoneId: string;
  sliceId: string;
  title: string;
  createdAt: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO slices (milestone_id, id, title, status, created_at)
     VALUES (:mid, :sid, :title, 'pending', :ts)`,
  ).run({
    ":mid": args.milestoneId,
    ":sid": args.sliceId,
    ":title": args.title,
    ":ts": args.createdAt,
  });
}

/**
 * INSERT OR IGNORE a task during event replay (workflow-reconcile.ts).
 * Same rationale as `insertOrIgnoreSlice`.
 */
export function insertOrIgnoreTask(args: {
  milestoneId: string;
  sliceId: string;
  taskId: string;
  title: string;
  createdAt: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO tasks (milestone_id, slice_id, id, title, status, created_at)
     VALUES (:mid, :sid, :tid, :title, 'pending', :ts)`,
  ).run({
    ":mid": args.milestoneId,
    ":sid": args.sliceId,
    ":tid": args.taskId,
    ":title": args.title,
    ":ts": args.createdAt,
  });
}

/**
 * Stamp the `replan_triggered_at` column on a slice. Used by triage-resolution
 * when a user capture requests a replan so the dispatcher can detect the
 * trigger via DB in addition to the on-disk REPLAN-TRIGGER.md marker.
 */
export function setSliceReplanTriggeredAt(milestoneId: string, sliceId: string, ts: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    "UPDATE slices SET replan_triggered_at = :ts WHERE milestone_id = :mid AND id = :sid",
  ).run({ ":ts": ts, ":mid": milestoneId, ":sid": sliceId });
}

/**
 * INSERT OR REPLACE a quality_gates row. Used by milestone-validation-gates.ts
 * to persist milestone-level (MV*) gate outcomes after validate-milestone runs.
 */
export function upsertQualityGate(g: {
  milestoneId: string;
  sliceId: string;
  gateId: string;
  scope: string;
  taskId: string;
  status: string;
  verdict: string;
  rationale: string;
  findings: string;
  evaluatedAt: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR REPLACE INTO quality_gates
     (milestone_id, slice_id, gate_id, scope, task_id, status, verdict, rationale, findings, evaluated_at)
     VALUES (:mid, :sid, :gid, :scope, :tid, :status, :verdict, :rationale, :findings, :evaluated_at)`,
  ).run({
    ":mid": g.milestoneId,
    ":sid": g.sliceId,
    ":gid": g.gateId,
    ":scope": g.scope,
    ":tid": g.taskId,
    ":status": g.status,
    ":verdict": g.verdict,
    ":rationale": g.rationale,
    ":findings": g.findings,
    ":evaluated_at": g.evaluatedAt,
  });
}

/**
 * Atomically replace all workflow state from a manifest. Lifted verbatim from
 * workflow-manifest.ts so the single-writer invariant holds. Only touches
 * engine tables + decisions. Does NOT modify artifacts or memories.
 */
export function restoreManifest(manifest: StateManifest): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  const db = currentDb;

  transaction(() => {
    // Clear engine tables (order matters for foreign-key-like consistency)
    db.exec("DELETE FROM verification_evidence");
    db.exec("DELETE FROM tasks");
    db.exec("DELETE FROM slices");
    db.exec("DELETE FROM milestone_leases");
    db.exec("DELETE FROM milestones");
    db.exec("DELETE FROM decisions WHERE 1=1");

    // Restore milestones
    const msStmt = db.prepare(
      `INSERT INTO milestones (id, title, status, depends_on, created_at, completed_at,
        vision, success_criteria, key_risks, proof_strategy,
        verification_contract, verification_integration, verification_operational, verification_uat,
        definition_of_done, requirement_coverage, boundary_map_markdown, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const m of manifest.milestones) {
      msStmt.run(
        m.id, m.title, m.status,
        JSON.stringify(m.depends_on), m.created_at, m.completed_at,
        m.vision, JSON.stringify(m.success_criteria), JSON.stringify(m.key_risks),
        JSON.stringify(m.proof_strategy),
        m.verification_contract, m.verification_integration, m.verification_operational, m.verification_uat,
        JSON.stringify(m.definition_of_done), m.requirement_coverage, m.boundary_map_markdown, m.sequence ?? 0,
      );
    }

    // Restore slices (ADR-011 Phase 1: includes is_sketch + sketch_scope)
    const slStmt = db.prepare(
      `INSERT INTO slices (milestone_id, id, title, status, risk, depends, demo,
        created_at, completed_at, full_summary_md, full_uat_md,
        goal, success_criteria, proof_level, integration_closure, observability_impact,
        sequence, replan_triggered_at, is_sketch, sketch_scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of manifest.slices) {
      slStmt.run(
        s.milestone_id, s.id, s.title, s.status, s.risk,
        JSON.stringify(s.depends), s.demo,
        s.created_at, s.completed_at, s.full_summary_md, s.full_uat_md,
        s.goal, s.success_criteria, s.proof_level, s.integration_closure, s.observability_impact,
        s.sequence, s.replan_triggered_at,
        s.is_sketch ?? 0,
        s.sketch_scope ?? "",
      );
    }

    // Restore tasks (ADR-011 P2: includes blocker_source + escalation_* columns)
    const tkStmt = db.prepare(
      `INSERT INTO tasks (milestone_id, slice_id, id, title, status,
        one_liner, narrative, verification_result, duration, completed_at,
        blocker_discovered, deviations, known_issues, key_files, key_decisions,
        full_summary_md, description, estimate, files, verify,
        inputs, expected_output, observability_impact, sequence,
        blocker_source, escalation_pending, escalation_awaiting_review,
        escalation_artifact_path, escalation_override_applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const t of manifest.tasks) {
      tkStmt.run(
        t.milestone_id, t.slice_id, t.id, t.title, t.status,
        t.one_liner, t.narrative, t.verification_result, t.duration, t.completed_at,
        t.blocker_discovered ? 1 : 0, t.deviations, t.known_issues,
        JSON.stringify(t.key_files), JSON.stringify(t.key_decisions),
        t.full_summary_md, t.description, t.estimate, JSON.stringify(t.files), t.verify,
        JSON.stringify(t.inputs), JSON.stringify(t.expected_output),
        t.observability_impact, t.sequence,
        t.blocker_source ?? "",
        t.escalation_pending ?? 0,
        t.escalation_awaiting_review ?? 0,
        t.escalation_artifact_path ?? null,
        t.escalation_override_applied_at ?? null,
      );
    }

    // Restore decisions (ADR-011 P2: include source so escalation decisions survive)
    const dcStmt = db.prepare(
      `INSERT INTO decisions (seq, id, when_context, scope, decision, choice, rationale, revisable, made_by, source, superseded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const d of manifest.decisions) {
      dcStmt.run(d.seq, d.id, d.when_context, d.scope, d.decision, d.choice, d.rationale, d.revisable, d.made_by, d.source ?? "discussion", d.superseded_by);
    }

    // Restore verification evidence
    const evStmt = db.prepare(
      `INSERT INTO verification_evidence (task_id, slice_id, milestone_id, command, exit_code, verdict, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of manifest.verification_evidence) {
      evStmt.run(e.task_id, e.slice_id, e.milestone_id, e.command, e.exit_code, e.verdict, e.duration_ms, e.created_at);
    }
  });
}

// ─── Legacy markdown → DB bulk migration ─────────────────────────────────

export interface LegacyMilestoneInsert {
  id: string;
  title: string;
  status: string;
}

export interface LegacySliceInsert {
  id: string;
  milestoneId: string;
  title: string;
  status: string;
  risk: string;
  sequence: number;
}

export interface LegacyTaskInsert {
  id: string;
  sliceId: string;
  milestoneId: string;
  title: string;
  status: string;
  sequence: number;
}

/**
 * Bulk delete + insert a legacy milestone hierarchy for markdown → DB migration.
 * Used by workflow-migration.ts to populate engine tables from parsed ROADMAP/PLAN
 * files. All operations run inside a single transaction.
 */
export function bulkInsertLegacyHierarchy(payload: {
  milestones: LegacyMilestoneInsert[];
  slices: LegacySliceInsert[];
  tasks: LegacyTaskInsert[];
  clearMilestoneIds: string[];
  createdAt: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  const db = currentDb;
  const { milestones, slices, tasks, clearMilestoneIds, createdAt } = payload;

  if (clearMilestoneIds.length === 0) return;
  const placeholders = clearMilestoneIds.map(() => "?").join(",");

  transaction(() => {
    db.prepare(`DELETE FROM tasks WHERE milestone_id IN (${placeholders})`).run(...clearMilestoneIds);
    db.prepare(`DELETE FROM slices WHERE milestone_id IN (${placeholders})`).run(...clearMilestoneIds);
    db.prepare(`DELETE FROM milestone_leases WHERE milestone_id IN (${placeholders})`).run(...clearMilestoneIds);
    db.prepare(`DELETE FROM milestones WHERE id IN (${placeholders})`).run(...clearMilestoneIds);

    const insertMilestone = db.prepare(
      "INSERT INTO milestones (id, title, status, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const m of milestones) {
      insertMilestone.run(m.id, m.title, m.status, createdAt);
    }

    const insertSliceStmt = db.prepare(
      "INSERT INTO slices (id, milestone_id, title, status, risk, depends, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const s of slices) {
      insertSliceStmt.run(s.id, s.milestoneId, s.title, s.status, s.risk, "[]", s.sequence, createdAt);
    }

    const insertTaskStmt = db.prepare(
      "INSERT INTO tasks (id, slice_id, milestone_id, title, description, status, estimate, files, sequence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const t of tasks) {
      insertTaskStmt.run(t.id, t.sliceId, t.milestoneId, t.title, "", t.status, "", "[]", t.sequence);
    }
  });
}

// ─── Memory store writers ────────────────────────────────────────────────
// All memory writes go through gsd-db.ts so the single-writer invariant
// holds. These are direct pass-throughs to the SQL previously in
// memory-store.ts — same bindings, same behavior.

export function insertMemoryRow(args: {
  id: string;
  category: string;
  content: string;
  confidence: number;
  sourceUnitType: string | null;
  sourceUnitId: string | null;
  createdAt: string;
  updatedAt: string;
  scope?: string;
  tags?: string[];
  /**
   * ADR-013 Step 2: optional structured payload preserved alongside the flat
   * `content` field. Used to retain gsd_save_decision-style fields (scope,
   * decision, choice, rationale, made_by, revisable) on architecture-category
   * memories so the cutover in Step 6 is lossless. Schema is intentionally
   * open inside the JSON; documented per category in ADR-013.
   */
  structuredFields?: Record<string, unknown> | null;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT INTO memories (id, category, content, confidence, source_unit_type, source_unit_id, created_at, updated_at, scope, tags, structured_fields)
     VALUES (:id, :category, :content, :confidence, :source_unit_type, :source_unit_id, :created_at, :updated_at, :scope, :tags, :structured_fields)`,
  ).run({
    ":id": args.id,
    ":category": args.category,
    ":content": args.content,
    ":confidence": args.confidence,
    ":source_unit_type": args.sourceUnitType,
    ":source_unit_id": args.sourceUnitId,
    ":created_at": args.createdAt,
    ":updated_at": args.updatedAt,
    ":scope": args.scope ?? "project",
    ":tags": JSON.stringify(args.tags ?? []),
    ":structured_fields": args.structuredFields == null ? null : JSON.stringify(args.structuredFields),
  });
}

export function insertMemorySourceRow(args: {
  id: string;
  kind: string;
  uri: string | null;
  title: string | null;
  content: string;
  contentHash: string;
  importedAt: string;
  scope?: string;
  tags?: string[];
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO memory_sources (id, kind, uri, title, content, content_hash, imported_at, scope, tags)
     VALUES (:id, :kind, :uri, :title, :content, :content_hash, :imported_at, :scope, :tags)`,
  ).run({
    ":id": args.id,
    ":kind": args.kind,
    ":uri": args.uri,
    ":title": args.title,
    ":content": args.content,
    ":content_hash": args.contentHash,
    ":imported_at": args.importedAt,
    ":scope": args.scope ?? "project",
    ":tags": JSON.stringify(args.tags ?? []),
  });
}

export function deleteMemorySourceRow(id: string): boolean {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  const res = currentDb
    .prepare("DELETE FROM memory_sources WHERE id = :id")
    .run({ ":id": id }) as { changes?: number };
  return (res?.changes ?? 0) > 0;
}

export function upsertMemoryEmbedding(args: {
  memoryId: string;
  model: string;
  dim: number;
  vector: Uint8Array;
  updatedAt: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT INTO memory_embeddings (memory_id, model, dim, vector, updated_at)
     VALUES (:memory_id, :model, :dim, :vector, :updated_at)
     ON CONFLICT(memory_id) DO UPDATE SET
       model = excluded.model,
       dim = excluded.dim,
       vector = excluded.vector,
       updated_at = excluded.updated_at`,
  ).run({
    ":memory_id": args.memoryId,
    ":model": args.model,
    ":dim": args.dim,
    ":vector": args.vector,
    ":updated_at": args.updatedAt,
  });
}

export function deleteMemoryEmbedding(memoryId: string): boolean {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  const res = currentDb
    .prepare("DELETE FROM memory_embeddings WHERE memory_id = :id")
    .run({ ":id": memoryId }) as { changes?: number };
  return (res?.changes ?? 0) > 0;
}

export function insertMemoryRelationRow(args: {
  fromId: string;
  toId: string;
  rel: string;
  confidence: number;
  createdAt: string;
}): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR REPLACE INTO memory_relations (from_id, to_id, rel, confidence, created_at)
     VALUES (:from_id, :to_id, :rel, :confidence, :created_at)`,
  ).run({
    ":from_id": args.fromId,
    ":to_id": args.toId,
    ":rel": args.rel,
    ":confidence": args.confidence,
    ":created_at": args.createdAt,
  });
}

export function deleteMemoryRelationsFor(memoryId: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb
    .prepare("DELETE FROM memory_relations WHERE from_id = :id OR to_id = :id")
    .run({ ":id": memoryId });
}

export function rewriteMemoryId(placeholderId: string, realId: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare("UPDATE memories SET id = :real_id WHERE id = :placeholder").run({
    ":real_id": realId,
    ":placeholder": placeholderId,
  });
}

export function updateMemoryContentRow(
  id: string,
  content: string,
  confidence: number | undefined,
  updatedAt: string,
): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  if (confidence != null) {
    currentDb.prepare(
      "UPDATE memories SET content = :content, confidence = :confidence, updated_at = :updated_at WHERE id = :id",
    ).run({ ":content": content, ":confidence": confidence, ":updated_at": updatedAt, ":id": id });
  } else {
    currentDb.prepare(
      "UPDATE memories SET content = :content, updated_at = :updated_at WHERE id = :id",
    ).run({ ":content": content, ":updated_at": updatedAt, ":id": id });
  }
}

export function incrementMemoryHitCount(id: string, updatedAt: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    "UPDATE memories SET hit_count = hit_count + 1, updated_at = :updated_at, last_hit_at = :last_hit_at WHERE id = :id",
  ).run({ ":updated_at": updatedAt, ":last_hit_at": updatedAt, ":id": id });
}

export function supersedeMemoryRow(oldId: string, newId: string, updatedAt: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    "UPDATE memories SET superseded_by = :new_id, updated_at = :updated_at WHERE id = :old_id",
  ).run({ ":new_id": newId, ":updated_at": updatedAt, ":old_id": oldId });
}

export function markMemoryUnitProcessed(
  unitKey: string,
  activityFile: string,
  processedAt: string,
): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `INSERT OR IGNORE INTO memory_processed_units (unit_key, activity_file, processed_at)
     VALUES (:key, :file, :at)`,
  ).run({ ":key": unitKey, ":file": activityFile, ":at": processedAt });
}

export function decayMemoriesBefore(cutoffTs: string, now: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE memories
     SET confidence = MAX(0.1, confidence - 0.1), updated_at = :now
     WHERE superseded_by IS NULL AND updated_at < :cutoff AND confidence > 0.1`,
  ).run({ ":now": now, ":cutoff": cutoffTs });
}

export function supersedeLowestRankedMemories(limit: number, now: string): void {
  if (!currentDb) throw new GSDError(GSD_STALE_STATE, "gsd-db: No database open");
  currentDb.prepare(
    `UPDATE memories SET superseded_by = 'CAP_EXCEEDED', updated_at = :now
     WHERE id IN (
       SELECT id FROM memories
       WHERE superseded_by IS NULL
       ORDER BY (confidence * (1.0 + hit_count * 0.1)) ASC
       LIMIT :limit
     )`,
  ).run({ ":now": now, ":limit": limit });
}
