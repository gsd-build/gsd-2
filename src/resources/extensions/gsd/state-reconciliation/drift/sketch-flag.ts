// Project/App: GSD-2
// File Purpose: ADR-017 stale-sketch-flag drift handler. Relocated from
// gsd-db.ts where autoHealSketchFlags previously lived with zero callers.
//
// Recovers from two scenarios (per ADR-011):
//   1. Crash between gsd_plan_slice's PLAN.md write and the sketch flag flip.
//   2. Flag-OFF downgrade: when progressive_planning is off, dispatch routes
//      sketch slices to plan-slice, which writes PLAN.md but leaves
//      is_sketch=1 — the next reconciliation pass clears it.

import { existsSync } from "node:fs";

import {
  getSketchedSliceIds,
  isDbAvailable,
  setSliceSketchFlag,
} from "../../gsd-db.js";
import { resolveSliceFile } from "../../paths.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type SketchFlagDrift = Extract<DriftRecord, { kind: "stale-sketch-flag" }>;

export function detectStaleSketchFlags(
  state: GSDState,
  ctx: DriftContext,
): SketchFlagDrift[] {
  if (!isDbAvailable()) return [];
  const mid = state.activeMilestone?.id;
  if (!mid) return [];

  const sliceIds = getSketchedSliceIds(mid);
  return sliceIds
    .filter((sid) => {
      const planPath = resolveSliceFile(ctx.basePath, mid, sid, "PLAN");
      return planPath !== null && existsSync(planPath);
    })
    .map((sid) => ({ kind: "stale-sketch-flag" as const, mid, sid }));
}

export function repairStaleSketchFlag(record: SketchFlagDrift): void {
  setSliceSketchFlag(record.mid, record.sid, false);
}

export const sketchFlagHandler: DriftHandler<SketchFlagDrift> = {
  kind: "stale-sketch-flag",
  detect: detectStaleSketchFlags,
  repair: (record) => {
    repairStaleSketchFlag(record);
  },
};

/**
 * Legacy entry point preserved for callers that supply a custom hasPlanFile
 * predicate. Prefer the drift handler (sketchFlagHandler) for new code.
 */
export function autoHealSketchFlags(
  milestoneId: string,
  hasPlanFile: (sliceId: string) => boolean,
): void {
  if (!isDbAvailable()) return;
  const sliceIds = getSketchedSliceIds(milestoneId);
  for (const sid of sliceIds) {
    if (hasPlanFile(sid)) {
      setSliceSketchFlag(milestoneId, sid, false);
    }
  }
}
