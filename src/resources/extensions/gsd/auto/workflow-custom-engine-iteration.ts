// Project/App: GSD-2
// File Purpose: Custom-engine iteration-data adapter for auto-mode loop.

import type { GSDState } from "../types.js";
import type { IterationData } from "./types.js";

export interface CustomEngineStep {
  unitType: string;
  unitId: string;
  prompt: string;
}

export interface BuildCustomEngineIterationDataInput {
  step: CustomEngineStep;
  basePath: string;
  canonicalProjectRoot: string;
  currentMilestoneId?: string | null;
  deriveState: (basePath: string) => Promise<GSDState>;
  logPostDerive: (details: {
    site: "custom-engine-gsd-state";
    basePath: string;
    canonicalProjectRoot: string;
    derivedPhase: GSDState["phase"];
    activeUnit: string | undefined;
  }) => void;
}

export async function buildCustomEngineIterationData(
  input: BuildCustomEngineIterationDataInput,
): Promise<IterationData> {
  const gsdState = await input.deriveState(input.canonicalProjectRoot);
  input.logPostDerive({
    site: "custom-engine-gsd-state",
    basePath: input.basePath,
    canonicalProjectRoot: input.canonicalProjectRoot,
    derivedPhase: gsdState.phase,
    activeUnit: gsdState.activeTask?.id ?? gsdState.activeSlice?.id ?? gsdState.activeMilestone?.id,
  });

  return {
    unitType: input.step.unitType,
    unitId: input.step.unitId,
    prompt: input.step.prompt,
    finalPrompt: input.step.prompt,
    pauseAfterUatDispatch: false,
    state: gsdState,
    mid: input.currentMilestoneId ?? "workflow",
    midTitle: "Workflow",
    isRetry: false,
    previousTier: undefined,
  };
}
