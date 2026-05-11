// Project/App: GSD-2
// File Purpose: ADR-017 drift handler registry. Single source of truth for
// the catalog. Tests can override per-call via ReconciliationDeps.registry.

import { completionTimestampHandler } from "./drift/completion.js";
import { mergeStateHandler } from "./drift/merge-state.js";
import { unregisteredMilestoneHandler } from "./drift/project-md.js";
import { roadmapDivergenceHandler } from "./drift/roadmap.js";
import { sketchFlagHandler } from "./drift/sketch-flag.js";
import { staleRenderHandler } from "./drift/stale-render.js";
import { staleWorkerHandler } from "./drift/stale-worker.js";
import type { DriftHandler } from "./types.js";

// Each handler is parameterized over its specific DriftRecord variant for
// internal type safety. The registry stores them under DriftHandler<any> so
// handlers with disjoint repair parameter types coexist; the lifecycle matches
// by kind before invoking repair, so this is sound at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DRIFT_REGISTRY: ReadonlyArray<DriftHandler<any>> = [
  sketchFlagHandler,
  mergeStateHandler,
  staleRenderHandler,
  staleWorkerHandler,
  unregisteredMilestoneHandler,
  roadmapDivergenceHandler,
  completionTimestampHandler,
];
