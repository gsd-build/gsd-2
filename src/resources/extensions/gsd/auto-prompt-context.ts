// Context aggregators and gating logic for auto-mode prompt dispatch.

import { loadFile, parseRoadmap, extractUatType } from "./files.js";
import type { UatType } from "./files.js";
import { resolveMilestoneFile, resolveSliceFile, resolveTasksDir, resolveTaskFiles, relSlicePath } from "./paths.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import type { GSDState } from "./types.js";
import type { GSDPreferences } from "./preferences.js";

export async function getPriorTaskSummaryPaths(
  mid: string, sid: string, currentTid: string, base: string,
): Promise<string[]> {
  const tDir = resolveTasksDir(base, mid, sid);
  if (!tDir) return [];

  const summaryFiles = resolveTaskFiles(tDir, "SUMMARY");
  const currentNum = parseInt(currentTid.replace(/^T/, ""), 10);
  const sRel = relSlicePath(base, mid, sid);

  return summaryFiles
    .filter(f => {
      const num = parseInt(f.replace(/^T/, ""), 10);
      return num < currentNum;
    })
    .map(f => `${sRel}/tasks/${f}`);
}

export async function getDependencyTaskSummaryPaths(
  mid: string, sid: string, currentTid: string,
  dependsOn: string[], base: string,
): Promise<string[]> {
  if (dependsOn.length === 0) {
    return getPriorTaskSummaryPaths(mid, sid, currentTid, base);
  }

  const tDir = resolveTasksDir(base, mid, sid);
  if (!tDir) return [];

  const summaryFiles = resolveTaskFiles(tDir, "SUMMARY");
  const sRel = relSlicePath(base, mid, sid);
  const depSet = new Set(dependsOn.map((d) => d.toUpperCase()));

  return summaryFiles
    .filter((f) => {
      const tid = f.replace(/-SUMMARY\.md$/i, "").toUpperCase();
      return depSet.has(tid);
    })
    .map((f) => `${sRel}/tasks/${f}`);
}

export async function checkNeedsReassessment(
  base: string, mid: string, state: GSDState,
): Promise<{ sliceId: string } | null> {
  const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapContent = roadmapFile ? await loadFile(roadmapFile) : null;
  if (!roadmapContent) return null;

  const roadmap = parseRoadmap(roadmapContent);
  const completedSlices = roadmap.slices.filter(s => s.done);
  const incompleteSlices = roadmap.slices.filter(s => !s.done);

  if (completedSlices.length === 0 || incompleteSlices.length === 0) return null;

  const lastCompleted = completedSlices[completedSlices.length - 1];
  const assessmentFile = resolveSliceFile(base, mid, lastCompleted.id, "ASSESSMENT");
  const hasAssessment = !!(assessmentFile && await loadFile(assessmentFile));

  if (hasAssessment) return null;

  const summaryFile = resolveSliceFile(base, mid, lastCompleted.id, "SUMMARY");
  const hasSummary = !!(summaryFile && await loadFile(summaryFile));

  if (!hasSummary) return null;

  return { sliceId: lastCompleted.id };
}

export async function checkNeedsRunUat(
  base: string, mid: string, state: GSDState, prefs: GSDPreferences | undefined,
): Promise<{ sliceId: string; uatType: UatType } | null> {
  const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapContent = roadmapFile ? await loadFile(roadmapFile) : null;
  if (!roadmapContent) return null;

  const roadmap = parseRoadmap(roadmapContent);
  const completedSlices = roadmap.slices.filter(s => s.done);
  const incompleteSlices = roadmap.slices.filter(s => !s.done);

  if (completedSlices.length === 0) return null;
  if (incompleteSlices.length === 0) return null;
  if (!prefs?.uat_dispatch) return null;

  const lastCompleted = completedSlices[completedSlices.length - 1];
  const sid = lastCompleted.id;

  const uatFile = resolveSliceFile(base, mid, sid, "UAT");
  if (!uatFile) return null;
  const uatContent = await loadFile(uatFile);
  if (!uatContent) return null;

  const uatResultFile = resolveSliceFile(base, mid, sid, "UAT-RESULT");
  if (uatResultFile) {
    const hasResult = !!(await loadFile(uatResultFile));
    if (hasResult) return null;
  }

  const uatType = extractUatType(uatContent) ?? "artifact-driven";

  return { sliceId: sid, uatType };
}
