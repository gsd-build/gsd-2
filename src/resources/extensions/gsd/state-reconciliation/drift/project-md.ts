// Project/App: GSD-2
// File Purpose: ADR-017 unregistered-milestone drift handler. Detects
// milestones whose on-disk directory has meaningful content (ROADMAP/
// CONTEXT/SUMMARY) but no DB row, then runs the markdown importer to
// reconcile. PROJECT.md is the human-facing index — the importer's source
// of truth is the .gsd/milestones/ directory tree.

import { existsSync } from "node:fs";

import { getMilestone, isDbAvailable } from "../../gsd-db.js";
import { migrateHierarchyToDb } from "../../md-importer.js";
import { findMilestoneIds } from "../../milestone-ids.js";
import { resolveMilestoneFile } from "../../paths.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type UnregisteredMilestoneDrift = Extract<
  DriftRecord,
  { kind: "unregistered-milestone" }
>;

function milestoneHasContent(basePath: string, milestoneId: string): boolean {
  const roadmap = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  const context = resolveMilestoneFile(basePath, milestoneId, "CONTEXT");
  const summary = resolveMilestoneFile(basePath, milestoneId, "SUMMARY");
  return (
    (roadmap !== null && existsSync(roadmap)) ||
    (context !== null && existsSync(context)) ||
    (summary !== null && existsSync(summary))
  );
}

export function detectUnregisteredMilestoneDrift(
  _state: GSDState,
  ctx: DriftContext,
): UnregisteredMilestoneDrift[] {
  if (!isDbAvailable()) return [];

  const drifts: UnregisteredMilestoneDrift[] = [];
  for (const milestoneId of findMilestoneIds(ctx.basePath)) {
    if (getMilestone(milestoneId)) continue;
    if (!milestoneHasContent(ctx.basePath, milestoneId)) continue;
    drifts.push({ kind: "unregistered-milestone", milestoneId });
  }
  return drifts;
}

/**
 * Repair: invoke the markdown importer. migrateHierarchyToDb walks the same
 * findMilestoneIds list the detector uses and INSERTs OR IGNOREs every
 * missing milestone (and its slices/tasks) — idempotent under cap=2 retry.
 *
 * Note: even though we receive one record at a time, the importer is a
 * project-wide operation. Repeated invocation across multiple drift records
 * in the same pass is wasteful but safe; a future optimization could
 * coalesce by checking whether the importer has already run this pass.
 */
export function repairUnregisteredMilestone(
  _record: UnregisteredMilestoneDrift,
  ctx: DriftContext,
): void {
  migrateHierarchyToDb(ctx.basePath);
}

export const unregisteredMilestoneHandler: DriftHandler<UnregisteredMilestoneDrift> = {
  kind: "unregistered-milestone",
  detect: detectUnregisteredMilestoneDrift,
  repair: repairUnregisteredMilestone,
};
