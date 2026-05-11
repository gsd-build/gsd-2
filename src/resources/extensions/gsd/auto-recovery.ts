/**
 * Auto-mode Recovery — artifact resolution, verification, blocker placeholders,
 * skip artifacts, merge state reconciliation,
 * self-heal runtime records, and loop remediation steps.
 *
 * Pure functions that receive all needed state as parameters — no module-level
 * globals or AutoContext dependency.
 */

import { parseUnitId } from "./unit-id.js";
import { MILESTONE_ID_RE } from "./milestone-ids.js";
import { appendEvent } from "./workflow-events.js";
import { atomicWriteSync } from "./atomic-write.js";
import { clearParseCache } from "./files.js";
import { parseRoadmap as parseLegacyRoadmap, parsePlan as parseLegacyPlan } from "./parsers-legacy.js";
import { isDbAvailable, getTask, getSlice, getSliceTasks, getPendingGates, updateTaskStatus, updateSliceStatus, insertSlice, getMilestone, refreshOpenDatabaseFromDisk, getCompletedMilestoneTaskFileHints, getMilestoneCommitAttributionShas, recordMilestoneCommitAttribution } from "./gsd-db.js";
import { isValidationTerminal } from "./state.js";
import { getErrorMessage } from "./error-utils.js";
import { logWarning, logError } from "./workflow-logger.js";
import { readIntegrationBranch } from "./git-service.js";
import { isClosedStatus } from "./status-guards.js";
import {
  resolveSlicePath,
  resolveSliceFile,
  resolveTasksDir,
  resolveTaskFiles,
  relMilestoneFile,
  relSliceFile,
  buildSliceFileName,
  resolveMilestoneFile,
  clearPathCache,
  resolveGsdRootFile,
} from "./paths.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import {
  resolveExpectedArtifactPath,
  diagnoseExpectedArtifact,
} from "./auto-artifact-paths.js";
import { classifyMilestoneSummaryContent } from "./milestone-summary-classifier.js";
import { validateArtifact } from "./schemas/validate.js";
import { getProjectResearchStatus } from "./project-research-policy.js";

// Re-export so existing consumers of auto-recovery.ts keep working.
export { resolveExpectedArtifactPath, diagnoseExpectedArtifact };
export {
  classifyMilestoneSummaryContent,
  type MilestoneSummaryOutcome,
} from "./milestone-summary-classifier.js";

// ─── Artifact Resolution & Verification ───────────────────────────────────────

export type ArtifactRecoveryDbRefreshResult =
  | { ok: true }
  | { ok: false; fatal: boolean; message: string; reason: string };

export function refreshRecoveryDbForArtifact(
  unitType: string,
  unitId: string,
): ArtifactRecoveryDbRefreshResult {
  if (unitType !== "plan-slice" && unitType !== "execute-task") return { ok: true };
  if (!isDbAvailable()) return { ok: true };

  if (!refreshOpenDatabaseFromDisk()) {
    return {
      ok: false,
      fatal: unitType === "execute-task",
      reason: `${unitType}-db-refresh-failed`,
      message: `Stuck recovery found ${unitType} ${unitId} artifacts, but the DB refresh failed.`,
    };
  }

  if (unitType !== "execute-task") return { ok: true };

  const { milestone: mid, slice: sid, task: tid } = parseUnitId(unitId);
  if (!mid || !sid || !tid) {
    return {
      ok: false,
      fatal: true,
      reason: "execute-task-invalid-unit-id",
      message: `Stuck recovery found execute-task ${unitId} artifacts, but the unit id could not be parsed for DB verification.`,
    };
  }

  const task = getTask(mid, sid, tid);
  if (!task) {
    return {
      ok: false,
      fatal: true,
      reason: "execute-task-artifact-db-missing",
      message: `Stuck recovery found execute-task ${unitId} artifacts, but no matching DB task row exists after refresh.`,
    };
  }

  if (!isClosedStatus(task.status)) {
    return {
      ok: false,
      fatal: true,
      reason: "execute-task-artifact-db-mismatch",
      message: `Stuck recovery found execute-task ${unitId} artifacts, but the DB task status is still '${task.status}' after refresh.`,
    };
  }

  return { ok: true };
}

function hasCapturedWorkflowPrefs(base: string): boolean {
  const prefsPath = resolveExpectedArtifactPath("workflow-preferences", "WORKFLOW-PREFS", base);
  if (!prefsPath || !existsSync(prefsPath)) return false;
  const content = readFileSync(prefsPath, "utf-8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return !!match && /^workflow_prefs_captured:\s*true\s*$/m.test(match[1]);
}

function hasValidResearchDecision(base: string): boolean {
  const decisionPath = resolveExpectedArtifactPath("research-decision", "RESEARCH-DECISION", base);
  if (!decisionPath || !existsSync(decisionPath)) return false;
  try {
    const cfg = JSON.parse(readFileSync(decisionPath, "utf-8")) as Record<string, unknown>;
    return cfg.decision === "research" || cfg.decision === "skip";
  } catch {
    return false;
  }
}

function hasCompleteProjectResearch(base: string): boolean {
  return getProjectResearchStatus(base).complete;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCheckedTaskCompletionOnDisk(base: string, mid: string, sid: string, tid: string): boolean {
  const tasksDir = resolveTasksDir(base, mid, sid);
  if (!tasksDir) return false;
  if (!existsSync(join(tasksDir, `${tid}-SUMMARY.md`))) return false;

  const planAbs = resolveSliceFile(base, mid, sid, "PLAN");
  if (!planAbs || !existsSync(planAbs)) return false;

  const planContent = readFileSync(planAbs, "utf-8");
  const cbRe = new RegExp(`^\\s*-\\s+\\[[xX]\\]\\s+\\*\\*${escapeRegExp(tid)}:`, "m");
  return cbRe.test(planContent);
}

/**
 * Check whether a milestone produced implementation artifacts (non-`.gsd/`
 * files) in git history. The primary signal is the branch diff against the
 * integration branch. When a retry is already on the integration branch, that
 * diff is a self-diff; if a milestone ID is available, fall back to recent
 * GSD-tagged commits for that milestone.
 *
 * Returns "present" if implementation files found, "absent" if only .gsd/ files,
 * "unknown" if git is unavailable or check failed (callers decide how to handle).
 */
export function hasImplementationArtifacts(basePath: string, milestoneId?: string): "present" | "absent" | "unknown" {
  try {
    // Verify we're in a git repo
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: basePath,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
      });
    } catch (e) {
      logWarning("recovery", `git rev-parse check failed: ${(e as Error).message}`);
      return "unknown";
    }

    // Strategy: check `git diff --name-only` against the merge-base with the
    // main branch. This captures ALL files changed during the milestone's
    // lifetime while running on a milestone branch.
    const integrationBranch = milestoneId
      ? readIntegrationBranch(basePath, milestoneId) ?? detectMainBranch(basePath)
      : detectMainBranch(basePath);
    const currentBranch = getCurrentBranch(basePath);
    const branchDiff = getChangedFilesSinceBranch(basePath, integrationBranch);
    if (!branchDiff.ok) return "unknown";
    const changedFiles = branchDiff.files;

    // No branch-diff files can mean the unit retried on main after milestone
    // commits already landed there. In that topology, inspect GSD-tagged
    // milestone commits instead of treating the self-diff as proof of no work.
    if (changedFiles.length === 0) {
      if (milestoneId && currentBranch === integrationBranch) {
        const milestoneEvidence = getChangedFilesFromMilestoneEvidence(basePath, milestoneId);
        if (!milestoneEvidence.ok) return "unknown";
        if (milestoneEvidence.matched) return classifyImplementationFiles(milestoneEvidence.files);
      }
      if (currentBranch && currentBranch !== "HEAD") return "absent";
      return "unknown";
    }

    const branchClassification = classifyImplementationFiles(changedFiles);
    if (branchClassification === "present") return "present";

    // A completing milestone branch can have a non-empty diff containing only
    // .gsd/ closeout files after implementation commits already landed on the
    // recorded integration branch. In that topology, the branch diff alone is
    // insufficient; use the same milestone-tagged evidence fallback as the
    // self-diff retry path before declaring the milestone implementation-free.
    if (milestoneId) {
      const milestoneEvidence = getChangedFilesFromMilestoneEvidence(basePath, milestoneId);
      if (!milestoneEvidence.ok) return "unknown";
      if (milestoneEvidence.matched) return classifyImplementationFiles(milestoneEvidence.files);
    }

    return "absent";
  } catch (e) {
    // Non-fatal — if git operations fail, return unknown so callers can decide
    logWarning("recovery", `implementation artifact check failed: ${(e as Error).message}`);
    return "unknown";
  }
}

function getCurrentBranch(basePath: string): string | null {
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

function classifyImplementationFiles(files: readonly string[]): "present" | "absent" {
  const implFiles = files.filter(isImplementationPath);
  return implFiles.length > 0 ? "present" : "absent";
}

function isImplementationPath(file: string): boolean {
  return !file.startsWith(".gsd/") && !file.startsWith(".gsd\\");
}

function normalizeRepoPath(file: string): string {
  return file.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

/**
 * Detect the main/master branch name.
 */
function detectMainBranch(basePath: string): string {
  try {
    const result = execFileSync("git", ["rev-parse", "--verify", "main"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
    if (result.trim()) return "main";
  } catch (_) {
    // Expected — main doesn't exist, try master next
    void _;
  }
  try {
    const result = execFileSync("git", ["rev-parse", "--verify", "master"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
    if (result.trim()) return "master";
  } catch (_) {
    // Expected — master doesn't exist either
    void _;
  }
  // Neither main nor master found — warn and fall back
  logWarning("recovery", "neither main nor master branch found, defaulting to main");
  return "main";
}

/**
 * Get files changed since the branch diverged from the target branch.
 * Falls back to checking HEAD~20 if merge-base detection fails.
 */
function getChangedFilesSinceBranch(basePath: string, targetBranch: string): { ok: boolean; files: string[] } {
  try {
    // Try merge-base approach first
    const mergeBase = execFileSync(
      "git", ["merge-base", targetBranch, "HEAD"],
      { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
    ).trim();

    if (mergeBase) {
      const result = execFileSync(
        "git", ["diff", "--name-only", mergeBase, "HEAD"],
        { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
      ).trim();
      return { ok: true, files: result ? result.split("\n").filter(Boolean) : [] };
    }
  } catch (err) {
    // merge-base failed — fall back
    logWarning("recovery", `merge-base detection failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fallback: check last 20 commits
  try {
    const result = execFileSync(
      "git", ["log", "--name-only", "--pretty=format:", "-20", "HEAD"],
      { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
    ).trim();
    return { ok: true, files: result ? [...new Set(result.split("\n").filter(Boolean))] : [] };
  } catch (e) {
    logWarning("recovery", `git log fallback failed: ${(e as Error).message}`);
    return { ok: false, files: [] };
  }
}

function getChangedFilesFromMilestoneTaggedCommits(
  basePath: string,
  milestoneId: string,
): { ok: boolean; matched: boolean; files: string[] } {
  // Primary: path-scoped log against .gsd/milestones/<id>. Fast and unbounded
  // by depth when .gsd/ is tracked in git.
  const scoped = scanGsdTaggedCommits(basePath, milestoneId, [
    "log", "--format=%H%x1f%B%x1e", "HEAD", "--", `.gsd/milestones/${milestoneId}`,
  ]);
  if (!scoped.ok) return scoped;
  if (scoped.matched && classifyImplementationFiles(scoped.files) === "present") return scoped;

  // Fallback (#5033): when .gsd/ is gitignored / external / untracked, the
  // path-scoped scan matches no commits even though GSD-tagged commits
  // referencing the milestone exist on the integration branch. Re-scan all
  // of HEAD's history and rely on commitMatchesMilestone to bind by
  // explicit milestone mention in the message body.
  //
  // Intentionally unbounded — symmetric with the primary scan, and avoids
  // reintroducing the rolling-depth failure class removed in #4699 where
  // milestone evidence aged out behind unrelated activity.
  const unscoped = scanGsdTaggedCommits(basePath, milestoneId, [
    "log", "--format=%H%x1f%B%x1e", "HEAD",
  ]);
  if (!unscoped.ok) return scoped.matched ? scoped : unscoped;
  if (!unscoped.matched) return scoped;

  return {
    ok: true,
    matched: true,
    files: [...new Set([...scoped.files, ...unscoped.files])],
  };
}

function getChangedFilesFromMilestoneEvidence(
  basePath: string,
  milestoneId: string,
): { ok: boolean; matched: boolean; files: string[] } {
  const tagged = getChangedFilesFromMilestoneTaggedCommits(basePath, milestoneId);
  if (!tagged.ok) return tagged;
  if (tagged.matched && classifyImplementationFiles(tagged.files) === "present") return tagged;

  const attributed = getChangedFilesFromAttributedMilestoneCommits(basePath, milestoneId);
  if (!attributed.ok) return tagged.matched ? tagged : attributed;
  if (attributed.matched && classifyImplementationFiles(attributed.files) === "present") return attributed;

  const backfilled = backfillChangedFilesFromUntaggedMilestoneCommits(basePath, milestoneId);
  if (!backfilled.ok) return tagged.matched ? tagged : attributed.matched ? attributed : backfilled;
  if (!backfilled.matched) {
    if (tagged.matched) return tagged;
    return attributed.matched ? attributed : backfilled;
  }

  return {
    ok: true,
    matched: true,
    files: [...new Set([...tagged.files, ...attributed.files, ...backfilled.files])],
  };
}

function getChangedFilesFromAttributedMilestoneCommits(
  basePath: string,
  milestoneId: string,
): { ok: boolean; matched: boolean; files: string[] } {
  try {
    const shas = getMilestoneCommitAttributionShas(milestoneId);
    if (shas.length === 0) return { ok: true, matched: false, files: [] };

    const files = new Set<string>();
    let matched = false;
    for (const sha of shas) {
      if (!isFullCommitSha(sha)) continue;
      const commitFiles = getChangedFilesForCommit(basePath, sha);
      if (commitFiles.length === 0) continue;
      matched = true;
      for (const file of commitFiles) files.add(file);
    }
    return { ok: true, matched, files: [...files] };
  } catch (e) {
    logWarning("recovery", `milestone attribution scan failed: ${(e as Error).message}`);
    return { ok: false, matched: false, files: [] };
  }
}

function backfillChangedFilesFromUntaggedMilestoneCommits(
  basePath: string,
  milestoneId: string,
): { ok: boolean; matched: boolean; files: string[] } {
  try {
    const milestone = getMilestone(milestoneId);
    const milestoneStartedAt = milestone?.created_at ? Math.floor(Date.parse(milestone.created_at) / 1000) * 1000 : NaN;
    if (!Number.isFinite(milestoneStartedAt)) return { ok: true, matched: false, files: [] };

    const taskFileHints = getCompletedMilestoneTaskFileHints(milestoneId);
    if (taskFileHints.length === 0) return { ok: true, matched: false, files: [] };

    const hintSet = new Set(taskFileHints.map(normalizeRepoPath).filter(Boolean));
    if (hintSet.size === 0) return { ok: true, matched: false, files: [] };

    const records = getCommitRecords(basePath);
    const files = new Set<string>();
    let matched = false;
    for (const record of records) {
      if (!isFullCommitSha(record.hash)) continue;
      if (Date.parse(record.committedAt) < milestoneStartedAt) continue;
      if (record.parents.trim().split(/\s+/).filter(Boolean).length > 1) continue;
      if (commitMessageHasGsdTrailer(record.message)) continue;

      const commitFiles = getChangedFilesForCommit(basePath, record.hash);
      const implementationFiles = commitFiles.map(normalizeRepoPath).filter(isImplementationPath);
      if (implementationFiles.length === 0) continue;
      if (!implementationFiles.some((file) => hintSet.has(file))) continue;

      matched = true;
      for (const file of implementationFiles) files.add(file);
      recordMilestoneCommitAttribution({
        commitSha: record.hash,
        milestoneId,
        source: "backfill",
        confidence: 0.8,
        files: implementationFiles,
        createdAt: new Date().toISOString(),
      });
    }

    return { ok: true, matched, files: [...files] };
  } catch (e) {
    logWarning("recovery", `milestone attribution backfill failed: ${(e as Error).message}`);
    return { ok: false, matched: false, files: [] };
  }
}

function getCommitRecords(basePath: string): Array<{ hash: string; parents: string; committedAt: string; message: string }> {
  const logOutput = execFileSync("git", ["log", "--format=%H%x1f%P%x1f%cI%x1f%B%x1e", "HEAD"], {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  return logOutput
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .flatMap((record) => {
      const parts = record.split("\x1f");
      if (parts.length < 4) return [];
      const [hash, parents, committedAt, ...messageParts] = parts;
      return [{ hash: hash.trim(), parents: parents.trim(), committedAt: committedAt.trim(), message: messageParts.join("\x1f") }];
    });
}

function isFullCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

function scanGsdTaggedCommits(
  basePath: string,
  milestoneId: string,
  gitArgs: readonly string[],
): { ok: boolean; matched: boolean; files: string[] } {
  try {
    const logOutput = execFileSync("git", [...gitArgs], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
    const records = logOutput
      .split("\x1e")
      .map((record) => record.trim())
      .filter(Boolean)
      .flatMap((record) => {
        const sep = record.indexOf("\x1f");
        if (sep === -1) return [];
        const hash = record.slice(0, sep).trim();
        const message = record.slice(sep + 1);
        return [{ hash, message }];
      });

    const files = new Set<string>();
    let matched = false;
    for (const { hash, message } of records) {
      if (!commitMessageHasGsdTrailer(message)) continue;

      const commitFiles = getChangedFilesForCommit(basePath, hash);
      if (!commitMatchesMilestone(basePath, message, milestoneId, commitFiles)) continue;

      matched = true;
      for (const file of commitFiles) {
        files.add(file);
      }
    }

    return { ok: true, matched, files: [...files] };
  } catch (e) {
    logWarning("recovery", `milestone-tagged commit scan failed: ${(e as Error).message}`);
    return { ok: false, matched: false, files: [] };
  }
}

function getChangedFilesForCommit(basePath: string, hash: string): string[] {
  const fileOutput = execFileSync(
    "git",
    ["diff-tree", "--root", "--no-commit-id", "-r", "--name-only", hash],
    { cwd: basePath, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
  ).trim();
  return fileOutput.split("\n").map((f) => f.trim()).filter(Boolean);
}

function commitMessageHasGsdTrailer(message: string): boolean {
  return /^GSD-(?:Task|Unit):\s*\S+/m.test(message);
}

function commitMatchesMilestone(basePath: string, message: string, milestoneId: string, files: readonly string[]): boolean {
  if (commitTrailerStartsWithMilestone(message, milestoneId)) return true;

  // Meaningful execute-task commits currently store task scope as Sxx/Tyy
  // rather than Mxx/Sxx/Tyy. Bind those commits back to the milestone when
  // either the commit touched this milestone's artifacts, or — for projects
  // where .gsd/ is gitignored/external (#5033) — the message explicitly
  // names the milestone or local GSD state proves the task belongs here.
  if (/^GSD-Task:\s*S[^/\s]+\/T\S+/m.test(message)) {
    if (files.some((file) => isMilestoneArtifactPath(file, milestoneId))) return true;
    if (commitMessageMentionsMilestone(message, milestoneId)) return true;
    if (commitTaskTrailerBelongsToMilestone(basePath, message, milestoneId)) return true;
  }

  return false;
}

function commitTaskTrailerBelongsToMilestone(basePath: string, message: string, milestoneId: string): boolean {
  const match = message.match(/^GSD-Task:\s*(S[^/\s]+)\/(T[^\s]+)/m);
  if (!match) return false;
  const [, sliceId, taskId] = match;

  if (getTask(milestoneId, sliceId, taskId)) return true;

  const tasksDir = resolveTasksDir(basePath, milestoneId, sliceId);
  if (!tasksDir) return false;
  return existsSync(join(tasksDir, `${taskId}-PLAN.md`))
    || existsSync(join(tasksDir, `${taskId}-SUMMARY.md`));
}

function commitMessageMentionsMilestone(message: string, milestoneId: string): boolean {
  if (!MILESTONE_ID_RE.test(milestoneId)) return false;

  const escapedMilestone = milestoneId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapedMilestone}\\b`).test(message);
}

function commitTrailerStartsWithMilestone(message: string, milestoneId: string): boolean {
  const escapedMilestone = milestoneId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const trailerPattern = new RegExp(
    `^GSD-(?:Task|Unit):\\s*${escapedMilestone}(?:$|[\\s/])`,
    "m",
  );
  return trailerPattern.test(message);
}

function isMilestoneArtifactPath(file: string, milestoneId: string): boolean {
  return file.startsWith(`.gsd/milestones/${milestoneId}/`)
    || file.startsWith(`.gsd\\milestones\\${milestoneId}\\`);
}

/**
 * Check whether the expected artifact(s) for a unit exist on disk.
 * Returns true if all required artifacts exist, or if the unit type has no
 * single verifiable artifact (e.g., replan-slice).
 *
 * complete-slice requires both SUMMARY and UAT files — verifying only
 * the summary allowed the unit to be marked complete when the LLM
 * skipped writing the UAT file (see #176).
 */
export function verifyExpectedArtifact(
  unitType: string,
  unitId: string,
  base: string,
): boolean {
  // Hook units have no standard artifact — always pass. Their lifecycle
  // is managed by the hook engine, not the artifact verification system.
  if (unitType.startsWith("hook/")) return true;

  // Clear stale directory listing cache AND parse cache so artifact checks see
  // fresh disk state (#431). The parse cache must also be cleared because
  // cacheKey() uses length + first/last 100 chars — when a checkbox changes
  // from [ ] to [x], the key collides with the pre-edit version, returning
  // stale parsed results (e.g., slice.done = false when it's actually true).
  clearPathCache();
  clearParseCache();

  if (unitType === "rewrite-docs") {
    const overridesPath = resolveGsdRootFile(base, "OVERRIDES");
    if (!existsSync(overridesPath)) return true;
    const content = readFileSync(overridesPath, "utf-8");
    return !content.includes("**Scope:** active");
  }

  if (unitType === "workflow-preferences") {
    return hasCapturedWorkflowPrefs(base);
  }

  if (unitType === "discuss-project") {
    const projectPath = resolveExpectedArtifactPath(unitType, unitId, base);
    return !!projectPath && existsSync(projectPath) && validateArtifact(projectPath, "project").ok;
  }

  if (unitType === "discuss-requirements") {
    const requirementsPath = resolveExpectedArtifactPath(unitType, unitId, base);
    return !!requirementsPath && existsSync(requirementsPath) && validateArtifact(requirementsPath, "requirements").ok;
  }

  if (unitType === "research-decision") {
    return hasValidResearchDecision(base);
  }

  if (unitType === "research-project") {
    return hasCompleteProjectResearch(base);
  }

  // Reactive-execute: verify that each dispatched task's summary exists.
  // The unitId encodes the batch: "{mid}/{sid}/reactive+T02,T03"
  if (unitType === "reactive-execute") {
    const { milestone: mid, slice: sid, task: batchPart } = parseUnitId(unitId);
    if (!mid || !sid || !batchPart) return false;
    const plusIdx = batchPart.indexOf("+");
    if (plusIdx === -1) {
      // Legacy format "reactive" without batch IDs — fall back to "any summary"
      const tDir = resolveTasksDir(base, mid, sid);
      if (!tDir) return false;
      const summaryFiles = resolveTaskFiles(tDir, "SUMMARY");
      return summaryFiles.length > 0;
    }

    const batchIds = batchPart.slice(plusIdx + 1).split(",").filter(Boolean);
    if (batchIds.length === 0) return false;

    const tDir = resolveTasksDir(base, mid, sid);
    if (!tDir) return false;

    const existingSummaries = new Set(
      resolveTaskFiles(tDir, "SUMMARY").map((f) =>
        f.replace(/-SUMMARY\.md$/i, "").toUpperCase(),
      ),
    );

    // Every dispatched task must have a summary file
    for (const tid of batchIds) {
      if (!existingSummaries.has(tid.toUpperCase())) return false;
    }
    return true;
  }

  // Gate-evaluate: verify that each dispatched gate has been resolved in the DB.
  // The unitId encodes the batch: "{mid}/{sid}/gates+Q3,Q4"
  if (unitType === "gate-evaluate") {
    const { milestone: mid, slice: sid, task: batchPart } = parseUnitId(unitId);
    if (!mid || !sid || !batchPart) return false;

    const plusIdx = batchPart.indexOf("+");
    if (plusIdx === -1) return true; // no specific gates encoded — pass

    const gateIds = batchPart.slice(plusIdx + 1).split(",").filter(Boolean);
    if (gateIds.length === 0) return true;

    try {
      const pending = getPendingGates(mid, sid, "slice");
      const pendingIds = new Set(pending.map((g: any) => g.gate_id));
      // All dispatched gates must no longer be pending
      for (const gid of gateIds) {
        if (pendingIds.has(gid)) return false;
      }
    } catch (err) {
      // DB unavailable — treat as verified to avoid blocking
      logWarning("recovery", `gate-evaluate DB check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  }

  // #4414: research-slice parallel-research sentinel. The unitId
  // `{mid}/parallel-research` is not a real slice — it triggers a single agent
  // that fans out research across multiple slices. Verify success by checking
  // that every slice which was "research-ready" in the roadmap now has a
  // RESEARCH file. Without this, resolveExpectedArtifactPath returns null and
  // the retry/escalation machinery silently re-dispatches forever.
  //
  // #4068: Also treat a PARALLEL-BLOCKER placeholder as a terminal completion
  // so that timeout-recovery can write the blocker, have verifyExpectedArtifact
  // return true, and let the dispatch loop advance past this unit.  Without
  // this, the blocker is written but verification still returns false, the unit
  // is never cleared from unitDispatchCount, and on the next iteration the
  // dispatch rule (which correctly skips parallel-research when PARALLEL-BLOCKER
  // exists) returns null — leaving the loop stuck re-deriving indefinitely.
  //
  // NOTE: this predicate mirrors the dispatch rule at
  // auto-dispatch.ts parallel-research-slices — keep the two in sync.
  if (unitType === "research-slice" && unitId.endsWith("/parallel-research")) {
    const { milestone: mid } = parseUnitId(unitId);
    if (!mid) return false;

    // #4068: PARALLEL-BLOCKER written by timeout-recovery is a terminal state.
    const blockerPath = resolveExpectedArtifactPath(unitType, unitId, base);
    if (blockerPath && existsSync(blockerPath)) {
      return true;
    }

    const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
    if (!roadmapFile || !existsSync(roadmapFile)) {
      logWarning("recovery", `verify-fail ${unitType} ${unitId}: roadmap missing`);
      return false;
    }
    try {
      const roadmap = parseLegacyRoadmap(readFileSync(roadmapFile, "utf-8"));
      const milestoneResearchFile = resolveMilestoneFile(base, mid, "RESEARCH");
      for (const slice of roadmap.slices) {
        if (slice.done) continue;
        if (milestoneResearchFile && slice.id === "S01") continue;
        const depsComplete = (slice.depends ?? []).every((depId) =>
          !!resolveSliceFile(base, mid, depId, "SUMMARY"),
        );
        if (!depsComplete) continue;
        if (!resolveSliceFile(base, mid, slice.id, "RESEARCH")) {
          logWarning("recovery", `verify-fail ${unitType} ${unitId}: slice ${slice.id} missing RESEARCH`);
          return false;
        }
      }
      return true;
    } catch (err) {
      logWarning("recovery", `parallel-research verification failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  const absPath = resolveExpectedArtifactPath(unitType, unitId, base);
  // For unit types with no verifiable artifact (null path), the parent directory
  // is missing on disk — treat as stale completion state so the key gets evicted (#313).
  if (!absPath) {
    logWarning("recovery", `verify-fail ${unitType} ${unitId}: resolveExpectedArtifactPath returned null (parent dir missing)`);
    return false;
  }
  if (!existsSync(absPath)) {
    logWarning("recovery", `verify-fail ${unitType} ${unitId}: existsSync false for ${absPath}`);
    return false;
  }

  if (unitType === "validate-milestone") {
    const validationContent = readFileSync(absPath, "utf-8");
    if (!isValidationTerminal(validationContent)) {
      logWarning("recovery", `verify-fail ${unitType} ${unitId}: validation not terminal (len=${validationContent.length}) at ${absPath}`);
      return false;
    }
  }

  if (unitType === "plan-milestone") {
    try {
      const roadmap = parseLegacyRoadmap(readFileSync(absPath, "utf-8"));
      if (roadmap.slices.length === 0) {
        logWarning("recovery", `verify-fail ${unitType} ${unitId}: roadmap has zero slices at ${absPath}`);
        return false;
      }
    } catch (err) {
      logWarning("recovery", `plan-milestone roadmap verification failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // plan-slice verification is DB-primary. The slice plan is a projection, so
  // DB task rows prove the slice was planned even if the rendered markdown no
  // longer uses legacy checkbox/heading syntax.
  if (unitType === "plan-slice") {
    const { milestone: mid, slice: sid } = parseUnitId(unitId);
    if (mid && sid) {
      try {
        let taskIds: string[] | null = null;
        if (isDbAvailable()) {
          const refreshed = refreshOpenDatabaseFromDisk();
          if (refreshed) {
            const tasks = getSliceTasks(mid, sid);
            if (tasks.length > 0) taskIds = tasks.map(t => t.id);
          }
        }

        if (!taskIds) {
          // LEGACY: DB unavailable or no tasks in DB. Require actual task
          // entries so an empty scaffold cannot advance the pipeline (#699).
          const planContent = readFileSync(absPath, "utf-8");
          const hasCheckboxTask = /^\s*- \[[xX ]\] \*\*T\d+:/m.test(planContent);
          const hasHeadingTask = /^\s*#{2,4}\s+T\d+\s*(?:--|—|:)/m.test(planContent);
          if (!hasCheckboxTask && !hasHeadingTask) {
            logWarning("recovery", `verify-fail ${unitType} ${unitId}: plan has no task checkbox/heading (len=${planContent.length}) at ${absPath}`);
            return false;
          }
          const plan = parseLegacyPlan(planContent);
          if (plan.tasks.length > 0) taskIds = plan.tasks.map((t: { id: string }) => t.id);
        }

        if (taskIds && taskIds.length > 0) {
          const tasksDir = resolveTasksDir(base, mid, sid);
          if (!tasksDir) {
            logWarning("recovery", `verify-fail ${unitType} ${unitId}: resolveTasksDir returned null for ${mid}/${sid}`);
            return false;
          }
          for (const tid of taskIds) {
            const taskPlanFile = join(tasksDir, `${tid}-PLAN.md`);
            if (!existsSync(taskPlanFile)) {
              logWarning("recovery", `verify-fail ${unitType} ${unitId}: task plan missing ${taskPlanFile}`);
              return false;
            }
          }
        }
      } catch (err) {
        // Parse failure — don't block; slice plan may have non-standard format
        logWarning("recovery", `plan-slice task plan verification failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // execute-task: DB status is authoritative. Fall back to checked-checkbox
  // detection when the DB is unavailable (unmigrated projects), or when the
  // disk artifacts already reflect completion but the DB replay is one beat
  // behind the completion write.
  if (unitType === "execute-task") {
    const { milestone: mid, slice: sid, task: tid } = parseUnitId(unitId);
    if (mid && sid && tid) {
      const dbTask = getTask(mid, sid, tid);
      if (dbTask) {
        if (dbTask.status !== "complete" && dbTask.status !== "done" && !hasCheckedTaskCompletionOnDisk(base, mid, sid, tid)) {
          return false;
        }
      } else if (!isDbAvailable()) {
        // LEGACY: Pre-migration fallback for projects without DB.
        // Require a CHECKED checkbox — a bare heading or unchecked checkbox
        // does not prove gsd_complete_task ran. Summary file on disk alone
        // is not sufficient evidence (could be a rogue write) (#3607).
        if (!hasCheckedTaskCompletionOnDisk(base, mid, sid, tid)) return false;
      } else {
        // DB available but task row not found — completion tool never ran (#3607)
        return false;
      }
    }
  }

  // complete-slice: DB status is authoritative for whether the slice is done.
  // Fall back to file-based check (roadmap [x]) when DB is unavailable.
  if (unitType === "complete-slice") {
    const { milestone: mid, slice: sid } = parseUnitId(unitId);
    if (mid && sid) {
      const dir = resolveSlicePath(base, mid, sid);
      if (dir) {
        const uatPath = join(dir, buildSliceFileName(sid, "UAT"));
        if (!existsSync(uatPath)) return false;
      }

      const dbSlice = getSlice(mid, sid);
      if (dbSlice) {
        // DB available — trust it
        if (dbSlice.status !== "complete") return false;
      } else if (!isDbAvailable()) {
        // LEGACY: Pre-migration fallback for projects without DB.
        // Fall back to roadmap checkbox check via parsers-legacy
        const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
        if (roadmapFile && existsSync(roadmapFile)) {
          try {
            const roadmapContent = readFileSync(roadmapFile, "utf-8");
            const roadmap = parseLegacyRoadmap(roadmapContent);
            const slice = roadmap.slices.find((s) => s.id === sid);
            if (slice && !slice.done) return false;
          } catch (e) {
            logWarning("recovery", `roadmap parse failed: ${(e as Error).message}`);
            return false;
          }
        }
      }
      // else: DB available but slice not found — summary + UAT exist,
      // treat as verified (slice may not be imported yet)
    }
  }

  // complete-milestone must have produced implementation artifacts (#1703).
  // A milestone with only .gsd/ plan files and zero implementation code is
  // not genuinely complete — the LLM wrote plan files but skipped actual work.
  if (unitType === "complete-milestone") {
    const summaryOutcome = classifyMilestoneSummaryContent(readFileSync(absPath, "utf-8"));
    if (summaryOutcome === "failure") return false;
    const { milestone: mid } = parseUnitId(unitId);
    if (mid && isDbAvailable()) {
      const dbMilestone = getMilestone(mid);
      if (!dbMilestone) return false;
      if (!isClosedStatus(dbMilestone.status) && summaryOutcome !== "success") return false;
    }
    if (hasImplementationArtifacts(base, mid) === "absent") return false;
  }

  return true;
}

/**
 * Write a placeholder artifact so the pipeline can advance past a stuck unit.
 * Returns the relative path written, or null if the path couldn't be resolved.
 */
export function writeBlockerPlaceholder(
  unitType: string,
  unitId: string,
  base: string,
  reason: string,
): string | null {
  const absPath = resolveExpectedArtifactPath(unitType, unitId, base);
  if (!absPath) return null;
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const recoveryLine = unitType === "research-project"
    ? "This placeholder was written by auto-mode so the project research gate can stop fail-closed."
    : "This placeholder was written by auto-mode so the pipeline can advance.";
  const content = [
    `# BLOCKER — auto-mode recovery failed`,
    ``,
    `Unit \`${unitType}\` for \`${unitId}\` failed to produce this artifact after idle recovery exhausted all retries.`,
    ``,
    `**Reason**: ${reason}`,
    ``,
    recoveryLine,
    `Review and replace this file before relying on downstream artifacts.`,
  ].join("\n");
  writeFileSync(absPath, content, "utf-8");

  // #4414: Clear caches so subsequent dispatch guards (e.g.
  // resolveMilestoneFile) see the placeholder file. Without this, the
  // cached directory listing is stale and the dispatch rule re-fires,
  // producing an infinite loop despite the placeholder being on disk.
  // Matches the pattern used in verifyExpectedArtifact above.
  clearPathCache();
  clearParseCache();

  // Mark the task/slice as complete in the DB so verifyExpectedArtifact passes.
  // Without this, the DB status stays "pending" and the dispatch loop
  // re-derives the same unit indefinitely (#2531, #2653).
  if (isDbAvailable()) {
    const { milestone: mid, slice: sid, task: tid } = parseUnitId(unitId);
    const ts = new Date().toISOString();
    if (unitType === "execute-task" && mid && sid && tid) {
      try {
        updateTaskStatus(mid, sid, tid, "complete", ts);
        const planPath = resolveSliceFile(base, mid, sid, "PLAN");
        if (planPath && existsSync(planPath)) {
          const planContent = readFileSync(planPath, "utf-8");
          const updatedPlan = planContent.replace(
            new RegExp(`^(\\s*-\\s+)\\[ \\]\\s+\\*\\*${tid}:`, "m"),
            `$1[x] **${tid}:`,
          );
          if (updatedPlan !== planContent) {
            atomicWriteSync(planPath, updatedPlan);
          }
        }
      } catch (e) {
        logWarning("recovery", `updateTaskStatus failed during context exhaustion: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Append event so worktree reconciliation can replay this recovery completion
      try { appendEvent(base, { cmd: "complete-task", params: { milestoneId: mid, sliceId: sid, taskId: tid }, ts, actor: "system", trigger_reason: "blocker-placeholder-recovery" }); } catch (e) { logWarning("recovery", `appendEvent failed for task recovery: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (unitType === "complete-slice" && mid && sid) {
      try { updateSliceStatus(mid, sid, "complete", ts); } catch (e) { logWarning("recovery", `updateSliceStatus failed during context exhaustion: ${e instanceof Error ? e.message : String(e)}`); }
      try { appendEvent(base, { cmd: "complete-slice", params: { milestoneId: mid, sliceId: sid }, ts, actor: "system", trigger_reason: "blocker-placeholder-recovery" }); } catch (e) { logWarning("recovery", `appendEvent failed for slice recovery: ${e instanceof Error ? e.message : String(e)}`); }
    }
    // Insert a placeholder complete slice so deriveState sees activeMilestoneSlices.length > 0
    // and exits the pre-planning phase. Without this, activeMilestoneSlices stays empty
    // after the blocker ROADMAP.md is written, causing deriveState to return phase:'pre-planning'
    // indefinitely and re-dispatching plan-milestone in an infinite loop (#4378).
    if (unitType === "plan-milestone" && mid) {
      try {
        insertSlice({ id: "S00-blocker", milestoneId: mid, title: "Blocker placeholder — planning failed", status: "complete", sequence: 0 });
      } catch (e) { logWarning("recovery", `insertSlice placeholder failed for plan-milestone recovery: ${e instanceof Error ? e.message : String(e)}`); }
      try { appendEvent(base, { cmd: "plan-milestone", params: { milestoneId: mid }, ts, actor: "system", trigger_reason: "blocker-placeholder-recovery" }); } catch (e) { logWarning("recovery", `appendEvent failed for plan-milestone recovery: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  return diagnoseExpectedArtifact(unitType, unitId, base);
}

// ─── Merge State Reconciliation ───────────────────────────────────────────────
// Body relocated to state-reconciliation/drift/merge-state.ts (ADR-017 #5701).
// Re-exported here for backward compatibility with existing call sites:
// auto.ts, auto/loop-deps.ts, tests/integration/auto-recovery.test.ts.

export {
  reconcileMergeState,
  type MergeReconcileResult,
} from "./state-reconciliation/drift/merge-state.js";

// ─── Loop Remediation ─────────────────────────────────────────────────────────

/**
 * Build concrete, manual remediation steps for a loop-detected unit failure.
 * These are shown when automatic reconciliation is not possible.
 */
export function buildLoopRemediationSteps(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const { milestone: mid, slice: sid, task: tid } = parseUnitId(unitId);
  switch (unitType) {
    case "execute-task": {
      if (!mid || !sid || !tid) break;
      return [
        `   1. Run \`gsd undo-task ${tid}\` to reset the task state`,
        `   2. Resume auto-mode — it will re-execute the task`,
        `   3. If the task keeps failing, run \`gsd recover\` to rebuild DB state from disk`,
      ].join("\n");
    }
    case "plan-slice":
    case "research-slice": {
      if (!mid || !sid) break;
      const artifactRel =
        unitType === "plan-slice"
          ? relSliceFile(base, mid, sid, "PLAN")
          : relSliceFile(base, mid, sid, "RESEARCH");
      return [
        `   1. Write ${artifactRel} manually (or with the LLM in interactive mode)`,
        `   2. Run \`gsd recover\` to rebuild DB state from disk`,
        `   3. Resume auto-mode`,
      ].join("\n");
    }
    case "complete-slice": {
      if (!mid || !sid) break;
      return [
        `   1. Run \`gsd reset-slice ${sid}\` to reset the slice and all its tasks`,
        `   2. Resume auto-mode — it will re-execute incomplete tasks and re-complete the slice`,
        `   3. If the slice keeps failing, run \`gsd recover\` to rebuild DB state from disk`,
      ].join("\n");
    }
    case "validate-milestone": {
      if (!mid) break;
      const artifactRel = relMilestoneFile(base, mid, "VALIDATION");
      return [
        `   1. Write ${artifactRel} with verdict: pass`,
        `   2. Run \`gsd recover\` to rebuild DB state from disk`,
        `   3. Resume auto-mode`,
      ].join("\n");
    }
    default:
      break;
  }
  return null;
}
