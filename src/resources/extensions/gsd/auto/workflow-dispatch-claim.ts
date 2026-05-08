// Project/App: GSD-2
// File Purpose: Best-effort unit dispatch claim adapter for auto-mode loop.

import type { AutoSession } from "./session.js";
import type { IterationData } from "./types.js";

export type DispatchClaimOutcome =
  | { kind: "opened"; dispatchId: number }
  | { kind: "skip"; reason: "already-active" | "stale-lease"; existingId?: number; existingWorker?: string }
  | { kind: "degraded" };

interface RecentDispatch {
  attempt_n?: number | null;
}

interface RecordDispatchClaimInput {
  traceId: string;
  turnId?: string | null;
  workerId: string;
  milestoneLeaseToken: number;
  milestoneId: string;
  sliceId?: string | null;
  taskId?: string | null;
  unitType: string;
  unitId: string;
  attemptN?: number;
}

type RecordDispatchClaimResult =
  | { ok: true; dispatchId: number }
  | { ok: false; error: "already_active"; existingId: number; existingWorker: string }
  | { ok: false; error: string; existingId?: number; existingWorker?: string };

export interface OpenDispatchClaimDeps {
  getRecentDispatchesForUnit: (unitId: string, limit: number) => RecentDispatch[];
  recordDispatchClaim: (input: RecordDispatchClaimInput) => RecordDispatchClaimResult;
  markDispatchRunning: (dispatchId: number) => void;
  logClaimRejected: (details: {
    unitId: string;
    reason: string;
    existingId?: number;
    existingWorker?: string;
  }) => void;
  logClaimFailed: (err: unknown) => void;
}

export function openDispatchClaim(
  s: AutoSession,
  flowId: string,
  turnId: string,
  iterData: IterationData,
  deps: OpenDispatchClaimDeps,
): DispatchClaimOutcome {
  if (!s.workerId || s.milestoneLeaseToken === null) return { kind: "degraded" };
  const mid = iterData.mid;
  if (!mid) return { kind: "degraded" };

  const recent = deps.getRecentDispatchesForUnit(iterData.unitId, 1);
  const attemptN = (recent[0]?.attempt_n ?? 0) + 1;

  try {
    const claim = deps.recordDispatchClaim({
      traceId: flowId,
      turnId,
      workerId: s.workerId,
      milestoneLeaseToken: s.milestoneLeaseToken,
      milestoneId: mid,
      sliceId: iterData.state.activeSlice?.id ?? null,
      taskId: iterData.state.activeTask?.id ?? null,
      unitType: iterData.unitType,
      unitId: iterData.unitId,
      attemptN,
    });
    if (!claim.ok) {
      deps.logClaimRejected({
        unitId: iterData.unitId,
        reason: claim.error,
        existingId: claim.existingId,
        existingWorker: claim.existingWorker,
      });
      if (claim.error === "already_active") {
        return {
          kind: "skip",
          reason: "already-active",
          existingId: claim.existingId,
          existingWorker: claim.existingWorker,
        };
      }
      return { kind: "skip", reason: "stale-lease" };
    }
    deps.markDispatchRunning(claim.dispatchId);
    return { kind: "opened", dispatchId: claim.dispatchId };
  } catch (err) {
    deps.logClaimFailed(err);
    return { kind: "degraded" };
  }
}
