// Project/App: GSD-2
// File Purpose: ADR-017 stale-worker drift handler. Detects session-lock
// artifacts whose owning PID is no longer alive (typical after SIGKILL or
// laptop sleep where the heartbeat wasn't released cleanly), and clears them
// before the next dispatch attempts to acquire the lock.

import {
  effectiveLockFile,
  isSessionLockProcessAlive,
  readSessionLockData,
  removeStaleSessionLock,
} from "../../session-lock.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type StaleWorkerDrift = Extract<DriftRecord, { kind: "stale-worker" }>;

export function detectStaleWorkerDrift(
  _state: GSDState,
  ctx: DriftContext,
): StaleWorkerDrift[] {
  const data = readSessionLockData(ctx.basePath);
  if (!data) return [];
  if (typeof data.pid !== "number") return [];
  if (isSessionLockProcessAlive(data)) return [];

  return [
    {
      kind: "stale-worker",
      lockPath: effectiveLockFile(),
      pid: data.pid,
    },
  ];
}

export function repairStaleWorker(_record: StaleWorkerDrift, ctx: DriftContext): void {
  // removeStaleSessionLock is idempotent: it re-reads lock state and is a
  // no-op when the lock is held by an alive process. Safe under cap=2 retry.
  removeStaleSessionLock(ctx.basePath);
}

export const staleWorkerHandler: DriftHandler<StaleWorkerDrift> = {
  kind: "stale-worker",
  detect: detectStaleWorkerDrift,
  repair: repairStaleWorker,
};
