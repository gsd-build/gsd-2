// Project/App: GSD-2
// File Purpose: Applies custom-engine dispatch decisions to auto-mode loop side effects.

import type { EngineDispatchDecision } from "./workflow-kernel.js";

export interface HandleCustomEngineDispatchOutcomeDeps {
  stopAuto: (reason: string) => Promise<void>;
}

export type CustomEngineDispatchFlow =
  | { action: "break" }
  | { action: "continue" }
  | { action: "dispatch" };

export async function handleCustomEngineDispatchOutcome(input: {
  decision: EngineDispatchDecision;
  deps: HandleCustomEngineDispatchOutcomeDeps;
}): Promise<CustomEngineDispatchFlow> {
  if (input.decision.action === "stop") {
    await input.deps.stopAuto(input.decision.reason);
    return { action: "break" };
  }
  if (input.decision.action === "skip") {
    return { action: "continue" };
  }

  return { action: "dispatch" };
}
