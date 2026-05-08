// Project/App: GSD-2
// File Purpose: Custom-engine successful verification reconcile adapter for auto-mode loop.

import type { EngineState, ReconcileResult } from "../engine-types.js";
import type { IterationData } from "./types.js";
import {
  decideEngineReconcile,
  type EngineReconcileDecision,
} from "./workflow-kernel.js";

export interface CustomEngineReconcileSession {
  currentUnit?: { startedAt: number } | null;
  verificationRetryCount?: Map<string, number>;
}

export interface HandleCustomEngineReconcileDeps {
  saveRetryCounts: () => void;
  logReconcile: (details: { iteration: number; unitId: string }) => void;
  reconcile: (
    state: EngineState,
    completedStep: {
      unitType: string;
      unitId: string;
      startedAt: number;
      finishedAt: number;
    },
  ) => Promise<ReconcileResult>;
  now: () => number;
  clearUnitTimeout: () => void;
  completeIteration: () => void;
}

export interface CustomEngineReconcileOutcome {
  decision: EngineReconcileDecision;
  reason?: string;
}

export async function handleCustomEngineReconcile(input: {
  session: CustomEngineReconcileSession;
  engineState: EngineState;
  iterData: IterationData;
  iteration: number;
  deps: HandleCustomEngineReconcileDeps;
}): Promise<CustomEngineReconcileOutcome> {
  input.session.verificationRetryCount?.delete(`${input.iterData.unitType}/${input.iterData.unitId}`);
  input.deps.saveRetryCounts();
  input.deps.logReconcile({
    iteration: input.iteration,
    unitId: input.iterData.unitId,
  });

  const finishedAt = input.deps.now();
  const reconcileResult = await input.deps.reconcile(input.engineState, {
    unitType: input.iterData.unitType,
    unitId: input.iterData.unitId,
    startedAt: input.session.currentUnit?.startedAt ?? finishedAt,
    finishedAt,
  });

  input.deps.clearUnitTimeout();
  input.deps.completeIteration();

  return {
    decision: decideEngineReconcile(
      reconcileResult.outcome === "stop"
        ? { outcome: "stop", reason: reconcileResult.reason }
        : { outcome: reconcileResult.outcome },
    ),
    reason: reconcileResult.reason,
  };
}
