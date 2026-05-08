// Project/App: GSD-2
// File Purpose: Auto-mode coordination SQLite schema helper for the GSD database facade.

import type { DbAdapter } from "./db-adapter.js";

/**
 * Create the v24 coordination tables (workers, milestone_leases,
 * unit_dispatches, cancellation_requests, command_queue) and their indexes.
 *
 * Idempotent — uses IF NOT EXISTS throughout. Called from both the
 * fresh-install path and the v24 migration block in migrateSchema().
 *
 * Single-host invariant: these tables coordinate concurrent auto-mode
 * workers via shared SQLite WAL on local disk only. NFS / network
 * filesystems break the coordination semantics — multi-host execution
 * needs a real coordinator (etcd, Postgres) and is out of scope.
 */
export function createCoordinationTablesV24(db: DbAdapter): void {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS workers (
      worker_id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      pid INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      version TEXT NOT NULL,
      last_heartbeat_at TEXT NOT NULL,
      status TEXT NOT NULL,
      project_root_realpath TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS milestone_leases (
      milestone_id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (worker_id) REFERENCES workers(worker_id),
      FOREIGN KEY (milestone_id) REFERENCES milestones(id)
    )`,
    `CREATE TABLE IF NOT EXISTS unit_dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      turn_id TEXT,
      worker_id TEXT NOT NULL,
      milestone_lease_token INTEGER NOT NULL,
      milestone_id TEXT NOT NULL,
      slice_id TEXT,
      task_id TEXT,
      unit_type TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_n INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      exit_reason TEXT,
      error_summary TEXT,
      verification_evidence_id INTEGER,
      next_run_at TEXT,
      retry_after_ms INTEGER,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error_code TEXT,
      last_error_at TEXT,
      FOREIGN KEY (worker_id) REFERENCES workers(worker_id),
      FOREIGN KEY (verification_evidence_id) REFERENCES verification_evidence(id)
    )`,
    `CREATE TABLE IF NOT EXISTS cancellation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requested_at TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      dispatch_id INTEGER,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      acked_at TEXT,
      acked_worker_id TEXT,
      FOREIGN KEY (dispatch_id) REFERENCES unit_dispatches(id),
      FOREIGN KEY (acked_worker_id) REFERENCES workers(worker_id)
    )`,
    `CREATE TABLE IF NOT EXISTS command_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_worker TEXT,
      command TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '{}',
      enqueued_at TEXT NOT NULL,
      claimed_at TEXT,
      claimed_by TEXT,
      completed_at TEXT,
      result_json TEXT
    )`,
  ];
  for (const stmt of ddl) db.exec(stmt);

  // Indexes — created here so both fresh-install and v24-migration paths
  // produce identical structure.
  db.exec("CREATE INDEX IF NOT EXISTS idx_unit_dispatches_active ON unit_dispatches(milestone_id, status)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_unit_dispatches_trace ON unit_dispatches(trace_id, turn_id)");
  // Partial unique index — prevents two workers from claiming the same
  // unit concurrently. Codex review MEDIUM B2: enforces double-claim guard
  // at the DB level.
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_dispatches_active_per_unit "
    + "ON unit_dispatches(unit_id) WHERE status IN ('claimed','running')",
  );
  // command_queue index — SQLite indexes NULLs in B-trees, so this single
  // index serves both targeted (target_worker = ?) and broadcast
  // (target_worker IS NULL) queries. Codex review LOW B4 documented.
  db.exec("CREATE INDEX IF NOT EXISTS idx_command_queue_pending ON command_queue(target_worker, claimed_at)");
}
