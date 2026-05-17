/**
 * GSD Crash Recovery (Phase C pt 2 — DB-backed)
 *
 * Detects interrupted auto-mode sessions via the DB-backed workers +
 * unit_dispatches + runtime_kv tables. The auto.lock file is gone; the
 * `LockData` shape is preserved for backward compatibility with callers
 * (auto.ts, doctor checks, interrupted-session.ts), but the contents are
 * now synthesized from:
 *
 *   - workers.pid / .started_at / .last_heartbeat_at  → liveness + age
 *   - unit_dispatches.unit_type / .unit_id / .started_at  → what was running
 *   - runtime_kv("worker", workerId, "session_file")  → pi session JSONL path
 *
 * "Crashed" is detected via workers.status='active' + heartbeat past TTL,
 * cross-checked with the OS PID via isLockProcessAlive(). When the DB is
 * unavailable (fresh project before init), all readers return null and
 * writers no-op — preserving the historical "no lock means no prior
 * crash" semantics.
 *
 * The journal-based emitCrashRecoveredUnitEnd is unchanged from the file
 * era — it queries the journal independently of the lock mechanism.
 */

import {
  emitJournalEvent,
  queryJournal,
} from "./journal.js";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  findStaleWorkerForProject,
  getAllAutoWorkers,
  markWorkerCrashed,
  markWorkerStopping,
  markWorkerStoppingByPid,
  type AutoWorkerRow,
} from "./db/auto-workers.js";
import { forceReleaseLeasesForWorker } from "./db/milestone-leases.js";
import { markLatestActiveForWorkerCanceled, type DispatchStatus } from "./db/unit-dispatches.js";
import { getRuntimeKv, setRuntimeKv, deleteRuntimeKv } from "./db/runtime-kv.js";
import { _getAdapter, isDbAvailable } from "./gsd-db.js";
import { gsdRoot, normalizeRealPath } from "./paths.js";
import { atomicWriteSync } from "./atomic-write.js";
import { effectiveLockFile } from "./session-lock.js";
import { isInFlightRuntimePhase, listUnitRuntimeRecords, type AutoUnitRuntimeRecord } from "./unit-runtime.js";

export interface LockData {
  pid: number;
  startedAt: string;
  unitType: string;
  unitId: string;
  unitStartedAt: string;
  /** Path to the pi session JSONL file that was active when this unit started. */
  sessionFile?: string;
}

const SESSION_FILE_KV_KEY = "session_file";

function lockPath(basePath: string): string {
  return join(gsdRoot(basePath), effectiveLockFile());
}

function clearLegacyLockFile(basePath: string): void {
  try {
    const p = lockPath(basePath);
    if (existsSync(p)) unlinkSync(p);
  } catch {
    // Best-effort.
  }
}

function readLegacyLock(basePath: string): LockData | null {
  try {
    const p = lockPath(basePath);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8")) as LockData;
  } catch {
    return null;
  }
}

function findActiveWorkerForCurrentProcess(
  projectRootRealpath: string,
): AutoWorkerRow | null {
  if (!isDbAvailable()) return null;
  const workers = getAllAutoWorkers();
  for (const worker of workers) {
    if (
      worker.pid === process.pid
      && worker.project_root_realpath === projectRootRealpath
    ) {
      return worker;
    }
  }
  return null;
}

/**
 * Look up the most recent dispatch row for a worker, regardless of status.
 * Returns null if the worker has no dispatch history yet (e.g. crashed
 * during bootstrap before claiming the first unit).
 */
function getLatestDispatchForWorker(workerId: string):
  | { unit_type: string; unit_id: string; started_at: string; status: DispatchStatus }
  | null {
  if (!isDbAvailable()) return null;
  const db = _getAdapter()!;
  const row = db.prepare(
    `SELECT unit_type, unit_id, started_at, status
     FROM unit_dispatches
     WHERE worker_id = :worker_id
     ORDER BY id DESC
     LIMIT 1`,
  ).get({ ":worker_id": workerId }) as
    | { unit_type: string; unit_id: string; started_at: string; status: DispatchStatus }
    | undefined;
  return row ?? null;
}

function latestInFlightRuntimeRecord(basePath: string): AutoUnitRuntimeRecord | null {
  const records = listUnitRuntimeRecords(basePath).filter((record) =>
    isInFlightRuntimePhase(record.phase),
  );
  if (records.length === 0) return null;
  return records.sort((a, b) => {
    const bTime = b.updatedAt || b.startedAt || 0;
    const aTime = a.updatedAt || a.startedAt || 0;
    return bTime - aTime;
  })[0] ?? null;
}

function runtimeRecordToLockData(worker: AutoWorkerRow, record: AutoUnitRuntimeRecord, sessionFile?: string): LockData {
  const startedAt = Number.isFinite(record.startedAt)
    ? new Date(record.startedAt).toISOString()
    : worker.started_at;
  return {
    pid: worker.pid,
    startedAt: worker.started_at,
    unitType: record.unitType,
    unitId: record.unitId,
    unitStartedAt: startedAt,
    sessionFile,
  };
}

function workerToLockData(basePath: string, worker: AutoWorkerRow): LockData {
  const dispatch = getLatestDispatchForWorker(worker.worker_id);
  const sessionFile =
    getRuntimeKv<string>("worker", worker.worker_id, SESSION_FILE_KV_KEY) ?? undefined;
  if (!dispatch) {
    const runtimeRecord = latestInFlightRuntimeRecord(basePath);
    if (runtimeRecord) return runtimeRecordToLockData(worker, runtimeRecord, sessionFile);
  }
  return {
    pid: worker.pid,
    startedAt: worker.started_at,
    // Pre-Phase-C-pt-2 default: when no dispatch row exists yet (bootstrap
    // crash), report unitType="starting", unitId="bootstrap" — same shape
    // the file-based writer used to produce.
    unitType: dispatch?.unit_type ?? "starting",
    unitId: dispatch?.unit_id ?? "bootstrap",
    unitStartedAt: dispatch?.started_at ?? worker.started_at,
    sessionFile,
  };
}

/**
 * Write or update the lock state for the current auto-mode session.
 *
 * Phase C pt 2: the only persistent state this function adds beyond what
 * the workers + unit_dispatches tables already track is the pi session
 * JSONL path, which lands in runtime_kv (worker scope, key
 * "session_file"). The pid/startedAt/unitType/unitId/unitStartedAt are
 * recorded by registerAutoWorker / heartbeatAutoWorker / recordDispatchClaim
 * already.
 *
 * basePath is unused by the new implementation (kept as a parameter for
 * back-compat with the 15+ call sites) — the worker is identified by
 * pid + project_root_realpath in the workers table.
 */
export function writeLock(
  basePath: string,
  unitType: string,
  unitId: string,
  sessionFile?: string,
): void {
  try {
    const data: LockData = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      unitType,
      unitId,
      unitStartedAt: new Date().toISOString(),
      sessionFile,
    };
    atomicWriteSync(lockPath(basePath), JSON.stringify(data, null, 2));
  } catch {
    // Best-effort — never throw from the lock writer.
  }

  if (!isDbAvailable()) return;
  try {
    const projectRoot = normalizeRealPath(basePath);
    const worker = findActiveWorkerForCurrentProcess(projectRoot);
    if (!worker) return;
    if (sessionFile) {
      setRuntimeKv("worker", worker.worker_id, SESSION_FILE_KV_KEY, sessionFile);
    } else {
      // Preliminary unit locks (before runUnit/newSession settles) must clear
      // any prior pointer so crash recovery cannot ingest stale cross-unit context.
      deleteRuntimeKv("worker", worker.worker_id, SESSION_FILE_KV_KEY);
    }
  } catch {
    // Best-effort — never throw from the lock writer.
  }
}

/**
 * Phase C pt 2: clearLock no longer deletes a file. The cleanup path
 * (markWorkerStopping in stopAuto) flips the workers row to 'stopping'.
 * This function additionally drops the session_file runtime_kv row for
 * the current worker so a follow-up crash detection doesn't pick up a
 * stale session-file pointer.
 */
export function clearLock(basePath: string): void {
  clearLegacyLockFile(basePath);

  if (!isDbAvailable()) return;
  try {
    const projectRoot = normalizeRealPath(basePath);
    const staleWorker = findStaleWorkerForProject(projectRoot);
    if (staleWorker) {
      markWorkerCrashed(staleWorker.worker_id);
      forceReleaseLeasesForWorker(staleWorker.worker_id);
      deleteRuntimeKv("worker", staleWorker.worker_id, SESSION_FILE_KV_KEY);
      return;
    }
    const lock = readLegacyLock(basePath);
    if (lock?.pid) markWorkerStoppingByPid(projectRoot, lock.pid);
    const worker = findActiveWorkerForCurrentProcess(projectRoot);
    if (worker) deleteRuntimeKv("worker", worker.worker_id, SESSION_FILE_KV_KEY);

    const stale = findStaleWorkerForProject(projectRoot);
    if (stale) {
      markWorkerStopping(stale.worker_id);
      deleteRuntimeKv("worker", stale.worker_id, SESSION_FILE_KV_KEY);
    }
  } catch {
    // Best-effort.
  }
}

/**
 * Clear a stale DB-backed worker lock after readCrashLock/findStaleWorkerForProject
 * has identified a dead worker. Unlike clearLock(), this targets the stale
 * worker row instead of the current process's active worker.
 */
export function clearStaleWorkerLock(basePath: string): void {
  clearLegacyLockFile(basePath);

  if (!isDbAvailable()) return;
  try {
    const projectRoot = normalizeRealPath(basePath);
    const worker = findStaleWorkerForProject(projectRoot);
    if (!worker) return;
    markLatestActiveForWorkerCanceled(worker.worker_id, "crash-recovered");
    markWorkerCrashed(worker.worker_id);
    deleteRuntimeKv("worker", worker.worker_id, SESSION_FILE_KV_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * Detect a previous crashed auto-mode session.
 *
 * Phase C pt 2: synthesized from workers (status='active' + lapsed
 * heartbeat) + unit_dispatches (most recent for that worker) +
 * runtime_kv (session_file). Returns null when no stale worker exists
 * or the DB is unavailable.
 */
export function readCrashLock(basePath: string): LockData | null {
  if (isDbAvailable()) {
    try {
      const projectRoot = normalizeRealPath(basePath);
      const stale = findStaleWorkerForProject(projectRoot);
      if (stale) return workerToLockData(basePath, stale);
    } catch {
      // Fall through to the legacy lock-file compatibility path.
    }
  }
  return readLegacyLock(basePath);
}

/**
 * Check whether the process that wrote the lock is still running.
 * Uses `process.kill(pid, 0)` which sends no signal but checks liveness.
 * Returns true if the PID matches our own — we are the lock holder (#2470).
 *
 * Unchanged from the file-based era — pure stateless OS check.
 */
export function isLockProcessAlive(lock: LockData): boolean {
  const pid = lock.pid;
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

/** Format crash info for display or injection into a prompt. */
export function formatCrashInfo(lock: LockData): string {
  const lines = [
    `Previous auto-mode session was interrupted.`,
    `  Was executing: ${lock.unitType} (${lock.unitId})`,
    `  Started at: ${lock.unitStartedAt}`,
    `  PID: ${lock.pid}`,
  ];

  if (lock.unitType === "starting" && lock.unitId === "bootstrap") {
    lines.push(`No work was lost. Run /gsd auto to restart.`);
  } else if (lock.unitType.includes("research") || lock.unitType.includes("plan")) {
    lines.push(`The ${lock.unitType} unit may be incomplete. Run /gsd auto to re-run it.`);
  } else if (lock.unitType.includes("execute")) {
    lines.push(`Task execution was interrupted. Run /gsd auto to resume — completed work is preserved.`);
  } else if (lock.unitType.includes("complete")) {
    lines.push(`Slice/milestone completion was interrupted. Run /gsd auto to finish.`);
  }

  return lines.join("\n");
}

/**
 * Emit a synthetic unit-end event for a unit that crashed without emitting its own.
 * Unchanged from the file era — operates on the journal, not the lock.
 */
export function emitCrashRecoveredUnitEnd(basePath: string, lock: LockData): void {
  if (!lock.unitType || !lock.unitId || lock.unitType === "starting") return;
  emitOpenUnitEndForUnit(basePath, lock.unitType, lock.unitId, "crash-recovered");
}

export function emitOpenUnitEndForUnit(
  basePath: string,
  unitType: string,
  unitId: string,
  status: string,
  errorContext?: { message: string; category: string; stopReason?: string; isTransient?: boolean; retryAfterMs?: number },
): boolean {
  try {
    const all = queryJournal(basePath);

    const starts = all.filter(
      (e) =>
        e.eventType === "unit-start" &&
        e.data?.unitType === unitType &&
        e.data?.unitId === unitId,
    );
    if (starts.length === 0) return false;

    const lastStart = [...starts].reverse().find((start) => {
      return !all.some(
        (e) =>
          e.eventType === "unit-end" &&
          e.data?.unitType === unitType &&
          e.data?.unitId === unitId &&
          e.causedBy?.flowId === start.flowId &&
          e.causedBy?.seq === start.seq,
      );
    });
    if (!lastStart) return false;

    const alreadyClosed = all.some(
      (e) =>
        e.eventType === "unit-end" &&
        e.data?.unitType === unitType &&
        e.data?.unitId === unitId &&
        e.causedBy?.flowId === lastStart.flowId &&
        e.causedBy?.seq === lastStart.seq,
    );
    if (alreadyClosed) return false;

    const maxSeq = all
      .filter((e) => e.flowId === lastStart.flowId)
      .reduce((max, e) => Math.max(max, e.seq), lastStart.seq);

    emitJournalEvent(basePath, {
      ts: new Date().toISOString(),
      flowId: lastStart.flowId,
      seq: maxSeq + 1,
      eventType: "unit-end",
      data: {
        unitType,
        unitId,
        status,
        artifactVerified: false,
        ...(errorContext ? { errorContext } : {}),
      },
      causedBy: { flowId: lastStart.flowId, seq: lastStart.seq },
    });
    return true;
  } catch {
    // Never throw from crash recovery path.
    return false;
  }
}

/**
 * Used by the doctor checks (doctor-runtime-checks.ts, doctor-proactive.ts)
 * to enumerate stale workers across all projects this DB knows about.
 * Phase C pt 2 export — surface for the same diagnostics that previously
 * iterated `auto.lock` files.
 */
export function findStaleAutoWorker(basePath: string): LockData | null {
  return readCrashLock(basePath);
}
