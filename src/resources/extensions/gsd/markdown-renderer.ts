// GSD Markdown Renderer — DB → Markdown file generation
//
// Transforms DB state into correct markdown files on disk.
// Each render function reads from DB (with disk fallback),
// patches content to match DB status, writes atomically to disk,
// stores updated content in the artifacts table, and invalidates caches.
//
// Critical invariant: rendered markdown must round-trip through
// parseRoadmap(), parsePlan(), parseSummary() in files.ts.

import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  getAllMilestones,
  getMilestoneSlices,
  getSliceTasks,
  getTask,
  getSlice,
  getArtifact,
  insertArtifact,
} from "./gsd-db.js";
import type { MilestoneRow, SliceRow, TaskRow, ArtifactRow } from "./gsd-db.js";
import {
  resolveMilestoneFile,
  resolveSliceFile,
  resolveSlicePath,
  resolveTasksDir,
  gsdRoot,
  buildTaskFileName,
  buildSliceFileName,
} from "./paths.js";
import { saveFile, clearParseCache, parseRoadmap, parsePlan } from "./files.js";
import { invalidateStateCache } from "./state.js";
import { clearPathCache } from "./paths.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert an absolute file path to a .gsd-relative artifact path.
 * E.g. "/project/.gsd/milestones/M001/M001-ROADMAP.md" → "milestones/M001/M001-ROADMAP.md"
 */
function toArtifactPath(absPath: string, basePath: string): string {
  const root = gsdRoot(basePath);
  const rel = relative(root, absPath);
  // Normalize to forward slashes for consistent DB keys
  return rel.replace(/\\/g, "/");
}

/**
 * Invalidate all caches after a disk write.
 */
function invalidateCaches(): void {
  invalidateStateCache();
  clearPathCache();
  clearParseCache();
}

/**
 * Load artifact content from DB first, falling back to reading from disk.
 * On disk fallback, stores the content in the artifacts table for future use.
 * Returns null if content is unavailable from both sources.
 */
function loadArtifactContent(
  artifactPath: string,
  absPath: string | null,
  opts: {
    artifact_type: string;
    milestone_id: string;
    slice_id?: string;
    task_id?: string;
  },
): string | null {
  // Try DB first
  const artifact = getArtifact(artifactPath);
  if (artifact && artifact.full_content) {
    return artifact.full_content;
  }

  // Fall back to disk
  if (!absPath) {
    process.stderr.write(
      `markdown-renderer: artifact not found in DB or on disk: ${artifactPath}\n`,
    );
    return null;
  }

  let content: string;
  try {
    content = readFileSync(absPath, "utf-8");
  } catch {
    process.stderr.write(
      `markdown-renderer: cannot read file from disk: ${absPath}\n`,
    );
    return null;
  }

  // Store in DB for future use (graceful degradation path)
  try {
    insertArtifact({
      path: artifactPath,
      artifact_type: opts.artifact_type,
      milestone_id: opts.milestone_id,
      slice_id: opts.slice_id ?? null,
      task_id: opts.task_id ?? null,
      full_content: content,
    });
  } catch {
    // Non-fatal: we have the content, DB storage is best-effort
    process.stderr.write(
      `markdown-renderer: warning — failed to store disk fallback in DB: ${artifactPath}\n`,
    );
  }

  return content;
}

/**
 * Write rendered content to disk and update the artifacts table.
 */
async function writeAndStore(
  absPath: string,
  artifactPath: string,
  content: string,
  opts: {
    artifact_type: string;
    milestone_id: string;
    slice_id?: string;
    task_id?: string;
  },
): Promise<void> {
  await saveFile(absPath, content);

  try {
    insertArtifact({
      path: artifactPath,
      artifact_type: opts.artifact_type,
      milestone_id: opts.milestone_id,
      slice_id: opts.slice_id ?? null,
      task_id: opts.task_id ?? null,
      full_content: content,
    });
  } catch {
    // Non-fatal: file is on disk, DB is best-effort
    process.stderr.write(
      `markdown-renderer: warning — failed to update artifact in DB: ${artifactPath}\n`,
    );
  }

  invalidateCaches();
}

// ─── Roadmap Checkbox Rendering ───────────────────────────────────────────

/**
 * Render roadmap checkbox states from DB.
 *
 * For each slice in the milestone, sets [x] if status === 'complete',
 * [ ] otherwise. Handles bidirectional updates (can uncheck previously
 * checked slices if DB says pending).
 *
 * @returns true if the roadmap was written, false on skip/error
 */
export async function renderRoadmapCheckboxes(
  basePath: string,
  milestoneId: string,
): Promise<boolean> {
  const slices = getMilestoneSlices(milestoneId);
  if (slices.length === 0) {
    process.stderr.write(
      `markdown-renderer: no slices found for milestone ${milestoneId}\n`,
    );
    return false;
  }

  const absPath = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  const artifactPath = absPath ? toArtifactPath(absPath, basePath) : null;

  // Load content from DB (with disk fallback)
  let content: string | null = null;
  if (artifactPath) {
    content = loadArtifactContent(artifactPath, absPath, {
      artifact_type: "ROADMAP",
      milestone_id: milestoneId,
    });
  }

  if (!content) {
    process.stderr.write(
      `markdown-renderer: no roadmap content available for ${milestoneId}\n`,
    );
    return false;
  }

  // Apply checkbox patches for each slice
  let updated = content;
  for (const slice of slices) {
    const isDone = slice.status === "complete";
    const sid = slice.id;

    if (isDone) {
      // Set [x]: replace "- [ ] **S01:" with "- [x] **S01:"
      updated = updated.replace(
        new RegExp(`^(\\s*-\\s+)\\[ \\]\\s+\\*\\*${sid}:`, "m"),
        `$1[x] **${sid}:`,
      );
    } else {
      // Set [ ]: replace "- [x] **S01:" with "- [ ] **S01:"
      updated = updated.replace(
        new RegExp(`^(\\s*-\\s+)\\[x\\]\\s+\\*\\*${sid}:`, "mi"),
        `$1[ ] **${sid}:`,
      );
    }
  }

  if (!absPath) return false;

  await writeAndStore(absPath, artifactPath!, updated, {
    artifact_type: "ROADMAP",
    milestone_id: milestoneId,
  });

  return true;
}

// ─── Plan Checkbox Rendering ──────────────────────────────────────────────

/**
 * Render plan checkbox states from DB.
 *
 * For each task in the slice, sets [x] if status === 'done',
 * [ ] otherwise. Bidirectional.
 *
 * @returns true if the plan was written, false on skip/error
 */
export async function renderPlanCheckboxes(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): Promise<boolean> {
  const tasks = getSliceTasks(milestoneId, sliceId);
  if (tasks.length === 0) {
    process.stderr.write(
      `markdown-renderer: no tasks found for ${milestoneId}/${sliceId}\n`,
    );
    return false;
  }

  const absPath = resolveSliceFile(basePath, milestoneId, sliceId, "PLAN");
  const artifactPath = absPath ? toArtifactPath(absPath, basePath) : null;

  let content: string | null = null;
  if (artifactPath) {
    content = loadArtifactContent(artifactPath, absPath, {
      artifact_type: "PLAN",
      milestone_id: milestoneId,
      slice_id: sliceId,
    });
  }

  if (!content) {
    process.stderr.write(
      `markdown-renderer: no plan content available for ${milestoneId}/${sliceId}\n`,
    );
    return false;
  }

  // Apply checkbox patches for each task
  let updated = content;
  for (const task of tasks) {
    const isDone = task.status === "done" || task.status === "complete";
    const tid = task.id;

    if (isDone) {
      // Set [x]
      updated = updated.replace(
        new RegExp(`^(\\s*-\\s+)\\[ \\]\\s+\\*\\*${tid}:`, "m"),
        `$1[x] **${tid}:`,
      );
    } else {
      // Set [ ]
      updated = updated.replace(
        new RegExp(`^(\\s*-\\s+)\\[x\\]\\s+\\*\\*${tid}:`, "mi"),
        `$1[ ] **${tid}:`,
      );
    }
  }

  if (!absPath) return false;

  await writeAndStore(absPath, artifactPath!, updated, {
    artifact_type: "PLAN",
    milestone_id: milestoneId,
    slice_id: sliceId,
  });

  return true;
}

// ─── Task Summary Rendering ───────────────────────────────────────────────

/**
 * Render a task summary from DB to disk.
 * Reads full_summary_md from the tasks table and writes it to the appropriate file.
 *
 * @returns true if the summary was written, false on skip/error
 */
export async function renderTaskSummary(
  basePath: string,
  milestoneId: string,
  sliceId: string,
  taskId: string,
): Promise<boolean> {
  const task = getTask(milestoneId, sliceId, taskId);
  if (!task || !task.full_summary_md) {
    return false; // No summary to render — skip silently
  }

  // Resolve the tasks directory, creating path if needed
  const slicePath = resolveSlicePath(basePath, milestoneId, sliceId);
  if (!slicePath) {
    process.stderr.write(
      `markdown-renderer: cannot resolve slice path for ${milestoneId}/${sliceId}\n`,
    );
    return false;
  }

  const tasksDir = join(slicePath, "tasks");
  const fileName = buildTaskFileName(taskId, "SUMMARY");
  const absPath = join(tasksDir, fileName);
  const artifactPath = toArtifactPath(absPath, basePath);

  await writeAndStore(absPath, artifactPath, task.full_summary_md, {
    artifact_type: "SUMMARY",
    milestone_id: milestoneId,
    slice_id: sliceId,
    task_id: taskId,
  });

  return true;
}

// ─── Slice Summary Rendering ──────────────────────────────────────────────

/**
 * Render slice summary and UAT files from DB to disk.
 * Reads full_summary_md and full_uat_md from the slices table.
 *
 * @returns true if at least one file was written, false on skip/error
 */
export async function renderSliceSummary(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): Promise<boolean> {
  const slice = getSlice(milestoneId, sliceId);
  if (!slice) {
    return false; // No slice data — skip silently
  }

  const slicePath = resolveSlicePath(basePath, milestoneId, sliceId);
  if (!slicePath) {
    process.stderr.write(
      `markdown-renderer: cannot resolve slice path for ${milestoneId}/${sliceId}\n`,
    );
    return false;
  }

  let wrote = false;

  // Write SUMMARY
  if (slice.full_summary_md) {
    const summaryName = buildSliceFileName(sliceId, "SUMMARY");
    const summaryAbs = join(slicePath, summaryName);
    const summaryArtifact = toArtifactPath(summaryAbs, basePath);

    await writeAndStore(summaryAbs, summaryArtifact, slice.full_summary_md, {
      artifact_type: "SUMMARY",
      milestone_id: milestoneId,
      slice_id: sliceId,
    });
    wrote = true;
  }

  // Write UAT
  if (slice.full_uat_md) {
    const uatName = buildSliceFileName(sliceId, "UAT");
    const uatAbs = join(slicePath, uatName);
    const uatArtifact = toArtifactPath(uatAbs, basePath);

    await writeAndStore(uatAbs, uatArtifact, slice.full_uat_md, {
      artifact_type: "UAT",
      milestone_id: milestoneId,
      slice_id: sliceId,
    });
    wrote = true;
  }

  return wrote;
}

// ─── Render All From DB ───────────────────────────────────────────────────

export interface RenderAllResult {
  rendered: number;
  skipped: number;
  errors: string[];
}

/**
 * Iterate all milestones, slices, and tasks in the DB and render each artifact to disk.
 * Returns structured result for inspection.
 */
export async function renderAllFromDb(basePath: string): Promise<RenderAllResult> {
  const result: RenderAllResult = { rendered: 0, skipped: 0, errors: [] };
  const milestones = getAllMilestones();

  for (const milestone of milestones) {
    // Render roadmap checkboxes
    try {
      const ok = await renderRoadmapCheckboxes(basePath, milestone.id);
      if (ok) result.rendered++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(`roadmap ${milestone.id}: ${(err as Error).message}`);
    }

    // Iterate slices
    const slices = getMilestoneSlices(milestone.id);
    for (const slice of slices) {
      // Render plan checkboxes
      try {
        const ok = await renderPlanCheckboxes(basePath, milestone.id, slice.id);
        if (ok) result.rendered++;
        else result.skipped++;
      } catch (err) {
        result.errors.push(
          `plan ${milestone.id}/${slice.id}: ${(err as Error).message}`,
        );
      }

      // Render slice summary
      try {
        const ok = await renderSliceSummary(basePath, milestone.id, slice.id);
        if (ok) result.rendered++;
        else result.skipped++;
      } catch (err) {
        result.errors.push(
          `slice summary ${milestone.id}/${slice.id}: ${(err as Error).message}`,
        );
      }

      // Iterate tasks
      const tasks = getSliceTasks(milestone.id, slice.id);
      for (const task of tasks) {
        try {
          const ok = await renderTaskSummary(
            basePath,
            milestone.id,
            slice.id,
            task.id,
          );
          if (ok) result.rendered++;
          else result.skipped++;
        } catch (err) {
          result.errors.push(
            `task summary ${milestone.id}/${slice.id}/${task.id}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  return result;
}

// ─── Stale Detection ──────────────────────────────────────────────────────

export interface StaleEntry {
  path: string;
  reason: string;
}

/**
 * Detect stale renders by comparing DB state against file content.
 *
 * Checks:
 * 1. Roadmap checkbox states vs DB slice statuses
 * 2. Plan checkbox states vs DB task statuses
 * 3. Missing SUMMARY.md files for complete tasks with full_summary_md
 * 4. Missing SUMMARY.md/UAT.md files for complete slices with content
 *
 * Returns a list of stale entries with file path and reason.
 * Logs to stderr when stale files are detected.
 */
export function detectStaleRenders(basePath: string): StaleEntry[] {
  const stale: StaleEntry[] = [];
  const milestones = getAllMilestones();

  for (const milestone of milestones) {
    const slices = getMilestoneSlices(milestone.id);

    // ── Check roadmap checkbox state ──────────────────────────────────
    const roadmapPath = resolveMilestoneFile(basePath, milestone.id, "ROADMAP");
    if (roadmapPath && existsSync(roadmapPath)) {
      try {
        const content = readFileSync(roadmapPath, "utf-8");
        const parsed = parseRoadmap(content);

        for (const slice of slices) {
          const isCompleteInDb = slice.status === "complete";
          const roadmapSlice = parsed.slices.find(s => s.id === slice.id);
          if (!roadmapSlice) continue;

          if (isCompleteInDb && !roadmapSlice.done) {
            stale.push({
              path: roadmapPath,
              reason: `${slice.id} is complete in DB but unchecked in roadmap`,
            });
          } else if (!isCompleteInDb && roadmapSlice.done) {
            stale.push({
              path: roadmapPath,
              reason: `${slice.id} is not complete in DB but checked in roadmap`,
            });
          }
        }
      } catch {
        // Can't parse roadmap — skip silently
      }
    }

    // ── Check plan checkbox state and summaries for each slice ────────
    for (const slice of slices) {
      const tasks = getSliceTasks(milestone.id, slice.id);

      // Check plan checkboxes
      const planPath = resolveSliceFile(basePath, milestone.id, slice.id, "PLAN");
      if (planPath && existsSync(planPath)) {
        try {
          const content = readFileSync(planPath, "utf-8");
          const parsed = parsePlan(content);

          for (const task of tasks) {
            const isDoneInDb = task.status === "done" || task.status === "complete";
            const planTask = parsed.tasks.find(t => t.id === task.id);
            if (!planTask) continue;

            if (isDoneInDb && !planTask.done) {
              stale.push({
                path: planPath,
                reason: `${task.id} is done in DB but unchecked in plan`,
              });
            } else if (!isDoneInDb && planTask.done) {
              stale.push({
                path: planPath,
                reason: `${task.id} is not done in DB but checked in plan`,
              });
            }
          }
        } catch {
          // Can't parse plan — skip silently
        }
      }

      // Check missing task summary files
      for (const task of tasks) {
        if ((task.status === "done" || task.status === "complete") && task.full_summary_md) {
          const slicePath = resolveSlicePath(basePath, milestone.id, slice.id);
          if (slicePath) {
            const tasksDir = join(slicePath, "tasks");
            const fileName = buildTaskFileName(task.id, "SUMMARY");
            const summaryAbsPath = join(tasksDir, fileName);

            if (!existsSync(summaryAbsPath)) {
              stale.push({
                path: summaryAbsPath,
                reason: `${task.id} is complete with summary in DB but SUMMARY.md missing on disk`,
              });
            }
          }
        }
      }

      // Check missing slice summary/UAT files
      const sliceRow = getSlice(milestone.id, slice.id);
      if (sliceRow && sliceRow.status === "complete") {
        const slicePath = resolveSlicePath(basePath, milestone.id, slice.id);
        if (slicePath) {
          if (sliceRow.full_summary_md) {
            const summaryName = buildSliceFileName(slice.id, "SUMMARY");
            const summaryAbsPath = join(slicePath, summaryName);
            if (!existsSync(summaryAbsPath)) {
              stale.push({
                path: summaryAbsPath,
                reason: `${slice.id} is complete with summary in DB but SUMMARY.md missing on disk`,
              });
            }
          }

          if (sliceRow.full_uat_md) {
            const uatName = buildSliceFileName(slice.id, "UAT");
            const uatAbsPath = join(slicePath, uatName);
            if (!existsSync(uatAbsPath)) {
              stale.push({
                path: uatAbsPath,
                reason: `${slice.id} is complete with UAT in DB but UAT.md missing on disk`,
              });
            }
          }
        }
      }
    }
  }

  if (stale.length > 0) {
    process.stderr.write(
      `markdown-renderer: detected ${stale.length} stale render(s):\n`,
    );
    for (const entry of stale) {
      process.stderr.write(`  - ${entry.path}: ${entry.reason}\n`);
    }
  }

  return stale;
}

// ─── Stale Repair ─────────────────────────────────────────────────────────

/**
 * Repair all stale renders detected by `detectStaleRenders()`.
 *
 * For each stale entry, calls the appropriate render function:
 * - Roadmap checkbox mismatches → renderRoadmapCheckboxes()
 * - Plan checkbox mismatches → renderPlanCheckboxes()
 * - Missing task summaries → renderTaskSummary()
 * - Missing slice summaries/UATs → renderSliceSummary()
 *
 * Idempotent: calling twice with no DB changes produces zero repairs on the second call.
 *
 * @returns the number of files repaired
 */
export async function repairStaleRenders(basePath: string): Promise<number> {
  const staleEntries = detectStaleRenders(basePath);
  if (staleEntries.length === 0) return 0;

  // Deduplicate: a single roadmap/plan file might appear multiple times
  // (once per mismatched checkbox). We only need to re-render it once.
  const repairedPaths = new Set<string>();
  let repairCount = 0;

  for (const entry of staleEntries) {
    if (repairedPaths.has(entry.path)) continue;

    try {
      // Determine repair action from the reason
      if (entry.reason.includes("in roadmap")) {
        // Roadmap checkbox mismatch — extract milestone ID from path
        const milestoneMatch = entry.path.match(/milestones\/([^/]+)\//);
        if (milestoneMatch) {
          const ok = await renderRoadmapCheckboxes(basePath, milestoneMatch[1]);
          if (ok) {
            repairedPaths.add(entry.path);
            repairCount++;
          }
        }
      } else if (entry.reason.includes("in plan")) {
        // Plan checkbox mismatch — extract milestone + slice IDs from path
        const pathMatch = entry.path.match(/milestones\/([^/]+)\/slices\/([^/]+)\//);
        if (pathMatch) {
          const ok = await renderPlanCheckboxes(basePath, pathMatch[1], pathMatch[2]);
          if (ok) {
            repairedPaths.add(entry.path);
            repairCount++;
          }
        }
      } else if (entry.reason.includes("SUMMARY.md missing") && entry.reason.match(/^T\d+/)) {
        // Missing task summary — extract IDs from path
        const pathMatch = entry.path.match(/milestones\/([^/]+)\/slices\/([^/]+)\/tasks\//);
        const taskMatch = entry.reason.match(/^(T\d+)/);
        if (pathMatch && taskMatch) {
          const ok = await renderTaskSummary(basePath, pathMatch[1], pathMatch[2], taskMatch[1]);
          if (ok) {
            repairedPaths.add(entry.path);
            repairCount++;
          }
        }
      } else if (entry.reason.includes("SUMMARY.md missing") && entry.reason.match(/^S\d+/)) {
        // Missing slice summary — extract IDs from path
        const pathMatch = entry.path.match(/milestones\/([^/]+)\/slices\/([^/]+)\//);
        if (pathMatch) {
          const ok = await renderSliceSummary(basePath, pathMatch[1], pathMatch[2]);
          if (ok) {
            repairedPaths.add(entry.path);
            repairCount++;
          }
        }
      } else if (entry.reason.includes("UAT.md missing")) {
        // Missing slice UAT — renderSliceSummary handles both SUMMARY + UAT
        const pathMatch = entry.path.match(/milestones\/([^/]+)\/slices\/([^/]+)\//);
        if (pathMatch) {
          const ok = await renderSliceSummary(basePath, pathMatch[1], pathMatch[2]);
          if (ok) {
            repairedPaths.add(entry.path);
            repairCount++;
          }
        }
      }
    } catch (err) {
      process.stderr.write(
        `markdown-renderer: repair failed for ${entry.path}: ${(err as Error).message}\n`,
      );
    }
  }

  if (repairCount > 0) {
    process.stderr.write(
      `markdown-renderer: repaired ${repairCount} stale render(s)\n`,
    );
  }

  return repairCount;
}
