import { existsSync, readdirSync, readFileSync } from "node:fs";

import { ensureDbOpen } from "./bootstrap/dynamic-tools.js";
import {
  clearEngineHierarchy,
  getAllMilestones,
  getMilestoneSlices,
  getSliceTasks,
  isDbAvailable,
  transaction,
} from "./gsd-db.js";
import { migrateHierarchyToDb } from "./md-importer.js";
import { parsePlan, parseRoadmap } from "./parsers-legacy.js";
import {
  milestonesDir,
  resolveMilestoneFile,
  resolveSliceFile,
} from "./paths.js";
import { invalidateStateCache } from "./state.js";

export interface HierarchyCounts {
  milestones: number;
  slices: number;
  tasks: number;
}

export interface MigrationAutoCheckResult {
  action: "none" | "imported";
  reason: "no-markdown" | "in-sync" | "db-empty" | "count-mismatch";
  markdown: HierarchyCounts;
  beforeDb: HierarchyCounts;
  afterDb: HierarchyCounts;
}

function zeroCounts(): HierarchyCounts {
  return { milestones: 0, slices: 0, tasks: 0 };
}

function sameCounts(a: HierarchyCounts, b: HierarchyCounts): boolean {
  return a.milestones === b.milestones && a.slices === b.slices && a.tasks === b.tasks;
}

export function countMarkdownHierarchy(basePath: string): HierarchyCounts {
  const root = milestonesDir(basePath);
  if (!existsSync(root)) return zeroCounts();

  const counts = zeroCounts();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^M\d+/.test(entry.name)) continue;
    counts.milestones++;

    const roadmapPath = resolveMilestoneFile(basePath, entry.name, "ROADMAP");
    if (!roadmapPath || !existsSync(roadmapPath)) continue;

    const roadmap = parseRoadmap(readFileSync(roadmapPath, "utf-8"));
    counts.slices += roadmap.slices.length;

    for (const slice of roadmap.slices) {
      const planPath = resolveSliceFile(basePath, entry.name, slice.id, "PLAN");
      if (!planPath || !existsSync(planPath)) continue;
      const plan = parsePlan(readFileSync(planPath, "utf-8"));
      counts.tasks += plan.tasks.length;
    }
  }

  return counts;
}

export function countDbHierarchy(): HierarchyCounts {
  if (!isDbAvailable()) return zeroCounts();
  const counts = zeroCounts();
  const milestones = getAllMilestones();
  counts.milestones = milestones.length;

  for (const milestone of milestones) {
    const slices = getMilestoneSlices(milestone.id);
    counts.slices += slices.length;
    for (const slice of slices) {
      counts.tasks += getSliceTasks(milestone.id, slice.id).length;
    }
  }

  return counts;
}

export async function autoImportMarkdownHierarchyIfDbMismatch(
  basePath: string,
): Promise<MigrationAutoCheckResult> {
  const markdown = countMarkdownHierarchy(basePath);
  if (sameCounts(markdown, zeroCounts())) {
    return {
      action: "none",
      reason: "no-markdown",
      markdown,
      beforeDb: zeroCounts(),
      afterDb: zeroCounts(),
    };
  }

  const opened = await ensureDbOpen(basePath);
  if (!opened || !isDbAvailable()) {
    throw new Error(`failed to open or create the GSD database at ${basePath}`);
  }

  const beforeDb = countDbHierarchy();
  if (sameCounts(markdown, beforeDb)) {
    return { action: "none", reason: "in-sync", markdown, beforeDb, afterDb: beforeDb };
  }

  const reason = sameCounts(beforeDb, zeroCounts()) ? "db-empty" : "count-mismatch";
  const imported = transaction(() => {
    clearEngineHierarchy();
    return migrateHierarchyToDb(basePath);
  });
  invalidateStateCache();

  const afterDb = {
    milestones: imported.milestones,
    slices: imported.slices,
    tasks: imported.tasks,
  };
  if (!sameCounts(markdown, afterDb)) {
    throw new Error(
      `migration auto-import verification failed: markdown ${markdown.milestones}M/${markdown.slices}S/${markdown.tasks}T, db ${afterDb.milestones}M/${afterDb.slices}S/${afterDb.tasks}T`,
    );
  }

  return { action: "imported", reason, markdown, beforeDb, afterDb };
}
