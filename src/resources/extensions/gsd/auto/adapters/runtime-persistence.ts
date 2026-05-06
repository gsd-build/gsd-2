import { randomUUID } from "node:crypto";

import type { DispatchDecision, RuntimePersistenceAdapter } from "../contracts.js";
import { getSessionLockStatus } from "../../session-lock.js";
import { emitJournalEvent } from "../../journal.js";
import { parseUnitId } from "../../unit-id.js";
import { recordDispatchClaim } from "../../db/unit-dispatches.js";

export interface RuntimePersistenceWorkerContext {
  workerId: string | null;
  milestoneLeaseToken: number | null;
  milestoneId: string | null;
}

export interface RuntimePersistenceAdapterOptions {
  basePath: string;
  lockBasePath: string;
  flowId: string;
  nextSeq: () => number;
  getWorkerContext: () => RuntimePersistenceWorkerContext;
}

function mapTransitionEventType(name: string): "iteration-start" | "dispatch-match" | "guard-block" | "dispatch-stop" | "iteration-end" | "terminal" {
  if (name === "start" || name === "resume") return "iteration-start";
  if (name === "advance") return "dispatch-match";
  if (name === "advance-blocked" || name === "advance-paused" || name === "advance-retry") return "guard-block";
  if (name === "advance-stopped") return "dispatch-stop";
  if (name === "stop") return "terminal";
  return "iteration-end";
}

function mapClaimReason(result: ReturnType<typeof recordDispatchClaim>): string {
  if (result.ok) return "opened";
  if (result.error === "already_active") {
    return `unit already active by worker ${result.existingWorker} (dispatch ${result.existingId})`;
  }
  return `stale milestone lease for ${result.workerId}/${result.milestoneId} token ${result.milestoneLeaseToken}`;
}

export function createRuntimePersistenceAdapter(
  options: RuntimePersistenceAdapterOptions,
): RuntimePersistenceAdapter {
  const { basePath, lockBasePath, flowId, nextSeq, getWorkerContext } = options;

  return {
    async ensureLockOwnership() {
      const status = getSessionLockStatus(lockBasePath);
      if (!status.valid || status.failureReason === "pid-mismatch") {
        throw new Error("session lock held by another process");
      }
    },
    async claimAndJournalDispatch(decision: DispatchDecision) {
      const worker = getWorkerContext();
      if (!worker.workerId || worker.milestoneLeaseToken === null || !worker.milestoneId) {
        return { kind: "skipped" as const, reason: "missing worker/lease context" };
      }

      const parsed = parseUnitId(decision.unitId);
      const claim = recordDispatchClaim({
        traceId: flowId,
        turnId: `${decision.unitType}:${decision.unitId}`,
        workerId: worker.workerId,
        milestoneLeaseToken: worker.milestoneLeaseToken,
        milestoneId: worker.milestoneId ?? parsed.milestone,
        sliceId: parsed.slice ?? null,
        taskId: parsed.task ?? null,
        unitType: decision.unitType,
        unitId: decision.unitId,
      });

      emitJournalEvent(basePath, {
        ts: new Date().toISOString(),
        flowId,
        seq: nextSeq(),
        eventType: "dispatch-match",
        data: {
          source: "auto-orchestrator",
          action: "dispatch-claim",
          unitType: decision.unitType,
          unitId: decision.unitId,
          reason: mapClaimReason(claim),
          dispatchId: claim.ok ? claim.dispatchId : undefined,
          evidence: decision.evidence ?? {},
          preconditions: decision.preconditions,
        },
      });

      if (claim.ok) return { kind: "opened" as const, dispatchId: claim.dispatchId };
      if (claim.error === "already_active") {
        return {
          kind: "already-active" as const,
          reason: mapClaimReason(claim),
        };
      }
      return {
        kind: "stale-lease" as const,
        reason: mapClaimReason(claim),
      };
    },
    async journalTransition(event) {
      emitJournalEvent(basePath, {
        ts: new Date().toISOString(),
        flowId,
        seq: nextSeq(),
        eventType: mapTransitionEventType(event.name),
        data: {
          source: "auto-orchestrator",
          name: event.name,
          reason: event.reason,
          unitType: event.unitType,
          unitId: event.unitId,
          eventId: randomUUID(),
        },
      });
    },
  };
}
