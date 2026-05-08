// Project/App: GSD-2
// File Purpose: Sidecar iteration-data adapter for auto-mode loop.

import type { GSDState } from "../types.js";
import type { SidecarItem } from "./session.js";
import type { IterationData } from "./types.js";

export interface BuildSidecarIterationDataInput {
  sidecarItem: SidecarItem;
  basePath: string;
  canonicalProjectRoot: string;
  deriveState: (basePath: string) => Promise<GSDState>;
  logPostDerive: (details: {
    site: "sidecar";
    basePath: string;
    canonicalProjectRoot: string;
    derivedPhase: GSDState["phase"];
    activeUnit: string | undefined;
  }) => void;
}

export async function buildSidecarIterationData(
  input: BuildSidecarIterationDataInput,
): Promise<IterationData> {
  const sidecarState = await input.deriveState(input.canonicalProjectRoot);
  input.logPostDerive({
    site: "sidecar",
    basePath: input.basePath,
    canonicalProjectRoot: input.canonicalProjectRoot,
    derivedPhase: sidecarState.phase,
    activeUnit: sidecarState.activeTask?.id ?? sidecarState.activeSlice?.id ?? sidecarState.activeMilestone?.id,
  });

  return {
    unitType: input.sidecarItem.unitType,
    unitId: input.sidecarItem.unitId,
    prompt: input.sidecarItem.prompt,
    finalPrompt: input.sidecarItem.prompt,
    pauseAfterUatDispatch: false,
    state: sidecarState,
    mid: sidecarState.activeMilestone?.id,
    midTitle: sidecarState.activeMilestone?.title,
    isRetry: false,
    previousTier: undefined,
  };
}
