// Project/App: GSD-2
// File Purpose: Applies custom-engine reconcile outcomes to auto-mode loop side effects.

import type { CustomEngineReconcileOutcome } from "./workflow-custom-engine-reconcile.js";

export interface HandleCustomEngineReconcileOutcomeDeps {
  stopAuto: (reason: string) => Promise<void>;
  pauseAuto: () => Promise<void>;
  report: (
    action: "milestone-complete" | "pause" | "stop" | "continue",
    details: { unitType: string; unitId: string; reason?: string },
  ) => void;
  finishTurn: (
    status: "completed" | "paused" | "stopped",
    failureClass?: "manual-attention",
    error?: string,
  ) => void;
}

export type CustomEngineReconcileFlow = { action: "break" } | { action: "continue" };

export async function handleCustomEngineReconcileOutcome(input: {
  outcome: CustomEngineReconcileOutcome;
  unitType: string;
  unitId: string;
  deps: HandleCustomEngineReconcileOutcomeDeps;
}): Promise<CustomEngineReconcileFlow> {
  const details = {
    unitType: input.unitType,
    unitId: input.unitId,
  };
  const decision = input.outcome.decision;
  if (decision.action === "complete-workflow") {
    await input.deps.stopAuto(decision.stopReason);
    input.deps.report("milestone-complete", details);
    input.deps.finishTurn("completed");
    return { action: "break" };
  }
  if (decision.action === "pause") {
    await input.deps.pauseAuto();
    input.deps.report("pause", details);
    input.deps.finishTurn("paused", "manual-attention");
    return { action: "break" };
  }
  if (decision.action === "stop") {
    await input.deps.stopAuto(decision.reason);
    input.deps.report("stop", {
      ...details,
      reason: input.outcome.reason,
    });
    input.deps.finishTurn("stopped", "manual-attention", input.outcome.reason);
    return { action: "break" };
  }

  input.deps.report("continue", details);
  input.deps.finishTurn("completed");
  return { action: "continue" };
}
