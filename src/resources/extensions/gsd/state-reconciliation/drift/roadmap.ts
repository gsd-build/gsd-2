// Project/App: GSD-2
// File Purpose: ADR-017 roadmap-divergence drift handler. Detects mismatches
// between ROADMAP.md (parsed slice sequence + depends declarations) and the
// DB slice rows for that milestone, then reconciles via the markdown
// importer plus an explicit junction-table sync.

import { existsSync, readFileSync } from "node:fs";

import {
  getMilestone,
  getMilestoneSlices,
  isDbAvailable,
  syncSliceDependencies,
} from "../../gsd-db.js";
import { migrateHierarchyToDb } from "../../md-importer.js";
import { findMilestoneIds } from "../../milestone-ids.js";
import { parseRoadmap } from "../../parsers-legacy.js";
import { resolveMilestoneFile } from "../../paths.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type RoadmapDivergenceDrift = Extract<
  DriftRecord,
  { kind: "roadmap-divergence" }
>;

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function milestoneHasDivergence(
  basePath: string,
  milestoneId: string,
): boolean {
  const roadmapPath = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  if (!roadmapPath || !existsSync(roadmapPath)) return false;

  let roadmap: ReturnType<typeof parseRoadmap>;
  try {
    roadmap = parseRoadmap(readFileSync(roadmapPath, "utf-8"));
  } catch {
    return false;
  }

  const dbSlices = getMilestoneSlices(milestoneId);
  const dbSliceMap = new Map(dbSlices.map((s) => [s.id, s]));

  for (let i = 0; i < roadmap.slices.length; i++) {
    const roadmapSlice = roadmap.slices[i]!;
    const expectedSequence = i + 1;
    const dbSlice = dbSliceMap.get(roadmapSlice.id);
    if (!dbSlice) return true; // Roadmap has a slice the DB doesn't.
    if (dbSlice.sequence !== expectedSequence) return true;
    if (!arraysEqual(dbSlice.depends, roadmapSlice.depends)) return true;
  }
  return false;
}

export function detectRoadmapDivergenceDrift(
  _state: GSDState,
  ctx: DriftContext,
): RoadmapDivergenceDrift[] {
  if (!isDbAvailable()) return [];

  const drifts: RoadmapDivergenceDrift[] = [];
  for (const milestoneId of findMilestoneIds(ctx.basePath)) {
    // Skip milestones that don't yet have a DB row — that's the
    // unregistered-milestone drift handler's responsibility.
    if (!getMilestone(milestoneId)) continue;
    if (milestoneHasDivergence(ctx.basePath, milestoneId)) {
      drifts.push({ kind: "roadmap-divergence", milestoneId });
    }
  }
  return drifts;
}

/**
 * Repair a milestone's roadmap divergence:
 *   1. migrateHierarchyToDb upserts slice rows (sequence + depends JSON
 *      update via ON CONFLICT DO UPDATE).
 *   2. syncSliceDependencies updates the junction table per slice — the
 *      importer only writes the JSON column, not the relational view.
 */
export function repairRoadmapDivergence(
  record: RoadmapDivergenceDrift,
  ctx: DriftContext,
): void {
  migrateHierarchyToDb(ctx.basePath);

  const roadmapPath = resolveMilestoneFile(ctx.basePath, record.milestoneId, "ROADMAP");
  if (!roadmapPath || !existsSync(roadmapPath)) return;

  try {
    const roadmap = parseRoadmap(readFileSync(roadmapPath, "utf-8"));
    for (const slice of roadmap.slices) {
      syncSliceDependencies(record.milestoneId, slice.id, slice.depends);
    }
  } catch {
    /* parse failure: detector will fire again next pass */
  }
}

export const roadmapDivergenceHandler: DriftHandler<RoadmapDivergenceDrift> = {
  kind: "roadmap-divergence",
  detect: detectRoadmapDivergenceDrift,
  repair: repairRoadmapDivergence,
};
