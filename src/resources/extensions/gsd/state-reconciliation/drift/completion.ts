// Project/App: GSD-2
// File Purpose: ADR-017 missing-completion-timestamp drift handler. Detects
// tasks/slices/milestones marked complete (status = 'complete' | 'done') in
// the DB but whose `completed_at` column is null, and where the on-disk
// SUMMARY.md attests to completion. Backfills `completed_at` from the
// SUMMARY.md mtime — deterministic and idempotent (re-running yields the
// same value).

import { existsSync, statSync } from "node:fs";

import {
  getMilestone,
  getMilestoneSlices,
  getSliceTasks,
  isDbAvailable,
  updateMilestoneStatus,
  updateSliceStatus,
  updateTaskStatus,
} from "../../gsd-db.js";
import {
  resolveMilestoneFile,
  resolveSliceFile,
  resolveTaskFile,
} from "../../paths.js";
import type { GSDState } from "../../types.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type CompletionTimestampDrift = Extract<
  DriftRecord,
  { kind: "missing-completion-timestamp" }
>;

const COMPLETE_STATUSES = new Set(["complete", "done"]);

function summaryMtimeIso(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

export function detectMissingCompletionTimestampDrift(
  state: GSDState,
  ctx: DriftContext,
): CompletionTimestampDrift[] {
  if (!isDbAvailable()) return [];
  const mid = state.activeMilestone?.id;
  if (!mid) return [];

  const milestone = getMilestone(mid);
  if (!milestone) return [];

  const drifts: CompletionTimestampDrift[] = [];

  // Milestone-level
  if (
    COMPLETE_STATUSES.has(milestone.status) &&
    milestone.completed_at === null
  ) {
    const summary = resolveMilestoneFile(ctx.basePath, mid, "SUMMARY");
    if (summary && existsSync(summary)) {
      drifts.push({
        kind: "missing-completion-timestamp",
        entity: "milestone",
        ids: [mid],
      });
    }
  }

  // Slice and task levels iterate independently — tasks can complete before
  // the parent slice closes, so task drift must be checked even when the
  // slice is still pending.
  for (const slice of getMilestoneSlices(mid)) {
    if (
      COMPLETE_STATUSES.has(slice.status) &&
      slice.completed_at === null
    ) {
      const summary = resolveSliceFile(ctx.basePath, mid, slice.id, "SUMMARY");
      if (summary && existsSync(summary)) {
        drifts.push({
          kind: "missing-completion-timestamp",
          entity: "slice",
          ids: [`${mid}/${slice.id}`],
        });
      }
    }

    for (const task of getSliceTasks(mid, slice.id)) {
      if (!COMPLETE_STATUSES.has(task.status)) continue;
      if (task.completed_at !== null) continue;
      const taskSummary = resolveTaskFile(
        ctx.basePath,
        mid,
        slice.id,
        task.id,
        "SUMMARY",
      );
      if (taskSummary && existsSync(taskSummary)) {
        drifts.push({
          kind: "missing-completion-timestamp",
          entity: "task",
          ids: [`${mid}/${slice.id}/${task.id}`],
        });
      }
    }
  }

  return drifts;
}

export function repairMissingCompletionTimestamp(
  record: CompletionTimestampDrift,
  ctx: DriftContext,
): void {
  const composite = record.ids[0];
  if (!composite) return;
  const parts = composite.split("/");

  if (record.entity === "milestone") {
    const [mid] = parts;
    if (!mid) return;
    const milestone = getMilestone(mid);
    if (
      !milestone ||
      milestone.completed_at !== null ||
      !COMPLETE_STATUSES.has(milestone.status)
    ) return;
    const summary = resolveMilestoneFile(ctx.basePath, mid, "SUMMARY");
    const ts = summary ? summaryMtimeIso(summary) : null;
    if (!ts) return;
    updateMilestoneStatus(mid, milestone.status, ts);
    return;
  }

  if (record.entity === "slice") {
    const [mid, sid] = parts;
    if (!mid || !sid) return;
    const slice = getMilestoneSlices(mid).find((s) => s.id === sid);
    if (
      !slice ||
      slice.completed_at !== null ||
      !COMPLETE_STATUSES.has(slice.status)
    ) return;
    const summary = resolveSliceFile(ctx.basePath, mid, sid, "SUMMARY");
    const ts = summary ? summaryMtimeIso(summary) : null;
    if (!ts) return;
    updateSliceStatus(mid, sid, slice.status, ts);
    return;
  }

  if (record.entity === "task") {
    const [mid, sid, tid] = parts;
    if (!mid || !sid || !tid) return;
    const task = getSliceTasks(mid, sid).find((t) => t.id === tid);
    if (
      !task ||
      task.completed_at !== null ||
      !COMPLETE_STATUSES.has(task.status)
    ) return;
    const summary = resolveTaskFile(ctx.basePath, mid, sid, tid, "SUMMARY");
    const ts = summary ? summaryMtimeIso(summary) : null;
    if (!ts) return;
    updateTaskStatus(mid, sid, tid, task.status, ts);
  }
}

export const completionTimestampHandler: DriftHandler<CompletionTimestampDrift> = {
  kind: "missing-completion-timestamp",
  detect: detectMissingCompletionTimestampDrift,
  repair: repairMissingCompletionTimestamp,
};
