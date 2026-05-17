import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkRemoteAutoSession } from "../auto.ts";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import { registerAutoWorker } from "../db/auto-workers.ts";
import { normalizeRealPath } from "../paths.ts";
import { readCrashLock } from "../crash-recovery.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-remote-lock-cleanup-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch {}
  try { rmSync(base, { recursive: true, force: true }); } catch {}
}

function expireWorker(workerId: string): void {
  const db = _getAdapter()!;
  db.prepare(
    `UPDATE workers SET last_heartbeat_at = '1970-01-01T00:00:00.000Z' WHERE worker_id = :worker_id`,
  ).run({ ":worker_id": workerId });
}

function setWorkerPid(workerId: string, pid: number): void {
  const db = _getAdapter()!;
  db.prepare(
    `UPDATE workers SET pid = :pid WHERE worker_id = :worker_id`,
  ).run({ ":pid": pid, ":worker_id": workerId });
}

function findDeadPidCandidate(): number {
  const candidates = [99_999, 199_999, 299_999, 399_999];
  for (const pid of candidates) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") return pid;
    }
  }
  throw new Error("Could not find a dead PID candidate for stale-lock test");
}

test("checkRemoteAutoSession clears stale lock state when lock PID is dead", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));

  openDatabase(join(base, ".gsd", "gsd.db"));
  const workerId = registerAutoWorker({ projectRootRealpath: normalizeRealPath(base) });
  setWorkerPid(workerId, findDeadPidCandidate());
  expireWorker(workerId);

  assert.ok(readCrashLock(base), "precondition: stale lock exists before remote session check");

  const remote = checkRemoteAutoSession(base);
  assert.deepEqual(remote, { running: false });
  assert.equal(readCrashLock(base), null, "stale lock should be cleared by remote session check");
});
