/**
 * GSD Slice Branch Management
 *
 * Simple branch-per-slice workflow. No worktrees, no registry.
 * Runtime state (metrics, activity, lock, STATE.md) is gitignored
 * so branch switches are clean.
 *
 * Flow:
 *   1. ensureSliceBranch() — create + checkout slice branch
 *   2. agent does work, commits
 *   3. mergeSliceToMain() — checkout main, squash-merge, delete branch
 */

import { existsSync, readFileSync } from "node:fs";
import { sep, join } from "node:path";
import { GitService } from "./git-service.ts";
import { loadEffectiveGSDPreferences } from "./preferences.ts";

export interface MergeSliceResult {
  branch: string;
  mergedCommitMessage: string;
  deletedBranch: boolean;
}

// Internal singleton or factory for GitService
let _gitService: GitService | null = null;
function getGit(basePath: string): GitService {
  if (!_gitService || (_gitService as any).basePath !== basePath) {
    _gitService = new GitService(basePath);
  }
  return _gitService;
}

/**
 * Detect the active worktree name from the current working directory.
 * Returns null if not inside a GSD worktree (.gsd/worktrees/<name>/).
 */
export function detectWorktreeName(basePath: string): string | null {
  const marker = `${sep}.gsd${sep}worktrees${sep}`;
  const idx = basePath.indexOf(marker);
  if (idx === -1) return null;
  const afterMarker = basePath.slice(idx + marker.length);
  const name = afterMarker.split(sep)[0] ?? afterMarker.split("/")[0];
  return name || null;
}

/**
 * Get the slice branch name, namespaced by worktree when inside one.
 */
export function getSliceBranchName(milestoneId: string, sliceId: string, worktreeName?: string | null): string {
  if (worktreeName) {
    return `gsd/${worktreeName}/${milestoneId}/${sliceId}`;
  }
  return `gsd/${milestoneId}/${sliceId}`;
}

/** Regex that matches both plain and worktree-namespaced slice branches. */
export const SLICE_BRANCH_RE = /^gsd\/(?:([a-zA-Z0-9_-]+)\/)?(M\d+)\/(S\d+)$/;

/**
 * Parse a slice branch name into its components.
 */
export function parseSliceBranch(branchName: string): {
  worktreeName: string | null;
  milestoneId: string;
  sliceId: string;
} | null {
  const match = branchName.match(SLICE_BRANCH_RE);
  if (!match) return null;
  return {
    worktreeName: match[1] ?? null,
    milestoneId: match[2]!,
    sliceId: match[3]!,
  };
}

/**
 * Get the "main" branch for GSD slice operations.
 */
export function getMainBranch(basePath: string): string {
  return getGit(basePath).getMainBranch();
}

export function getCurrentBranch(basePath: string): string {
  return getGit(basePath).getCurrentBranch();
}

function branchExists(basePath: string, branch: string): boolean {
  try {
    getGit(basePath).run(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the slice branch exists and is checked out.
 */
export function ensureSliceBranch(basePath: string, milestoneId: string, sliceId: string): boolean {
  const git = getGit(basePath);
  const wtName = detectWorktreeName(basePath);
  const branch = getSliceBranchName(milestoneId, sliceId, wtName);
  const current = git.getCurrentBranch();

  if (current === branch) return false;

  let created = false;

  if (!branchExists(basePath, branch)) {
    const mainBranch = git.getMainBranch();
    const base = SLICE_BRANCH_RE.test(current) ? mainBranch : current;
    git.run(["branch", branch, base]);
    created = true;
  } else {
    const worktreeList = git.run(["worktree", "list", "--porcelain"]);
    if (worktreeList.includes(`branch refs/heads/${branch}`)) {
      throw new Error(
        `Branch "${branch}" is already in use by another worktree. ` +
        `Remove that worktree first, or switch it to a different branch.`,
      );
    }
  }

  // Auto-commit dirty files before checkout
  autoCommitCurrentBranch(basePath, "pre-checkout", branch);

  git.run(["checkout", branch]);
  return created;
}

/**
 * Auto-commit any dirty files in the current working tree.
 */
export function autoCommitCurrentBranch(
  basePath: string, unitType: string, unitId: string,
): string | null {
  const git = getGit(basePath);
  const status = git.run(["status", "--short"]);
  if (!status.trim()) return null;

  git.run(["add", "-A"]);

  const staged = git.run(["diff", "--cached", "--stat"]);
  if (!staged.trim()) return null;

  let message = `chore(${unitId}): auto-commit after ${unitType}`;

  // Try to find a better message for tasks
  if (unitType === "execute-task") {
    const [mid, sid, tid] = unitId.split("/");
    if (mid && sid && tid) {
      const summaryPath = join(basePath, ".gsd", "milestones", mid, "slices", sid, "tasks", `${tid}-SUMMARY.md`);
      if (existsSync(summaryPath)) {
        try {
          const content = readFileSync(summaryPath, "utf-8");
          const titleMatch = content.match(/^# (.*)/m);
          if (titleMatch && titleMatch[1]) {
            message = `feat(${sid}/${tid}): ${titleMatch[1].trim()}`;
          }
        } catch { /* ignore */ }
      }
    }
  }

  git.run(["commit", "-m", JSON.stringify(message)]);
  return message;
}

/**
 * Switch to main, auto-committing first.
 */
export function switchToMain(basePath: string): void {
  const git = getGit(basePath);
  const mainBranch = git.getMainBranch();
  const current = git.getCurrentBranch();
  if (current === mainBranch) return;

  // Auto-commit for visible history
  autoCommitCurrentBranch(basePath, "pre-switch", current);

  // Snapshot for recovery safety
  git.snapshot(current);

  git.run(["checkout", mainBranch]);
}

/**
 * Squash-merge a completed slice branch to main.
 */
export async function mergeSliceToMain(
  basePath: string, milestoneId: string, sliceId: string, sliceTitle: string,
): Promise<MergeSliceResult> {
  const git = getGit(basePath);
  const wtName = detectWorktreeName(basePath);
  const branch = getSliceBranchName(milestoneId, sliceId, wtName);
  const mainBranch = git.getMainBranch();

  const current = git.getCurrentBranch();
  if (current !== mainBranch) {
    throw new Error(`Expected to be on ${mainBranch}, found ${current}`);
  }

  if (!branchExists(basePath, branch)) {
    throw new Error(`Slice branch ${branch} does not exist`);
  }

  // Verification (Merge Guard)
  await git.verify();

  const ahead = git.run(["rev-list", "--count", `${mainBranch}..${branch}`]);
  if (Number(ahead) <= 0) {
    throw new Error(`Slice branch ${branch} has no commits ahead of ${mainBranch}`);
  }

  git.run(["merge", "--squash", branch]);
  
  // Richer commit message
  const log = git.run(["log", "--oneline", `${mainBranch}..${branch}`]);
  const taskLines = log
    .split("\n")
    .filter(line => line.includes("feat(") && line.includes("/T"))
    .map(line => {
      const match = line.match(/feat\([^)]*\/(T\d+)\):\s*(.*)/);
      return match ? `- ${match[1]}: ${match[2]}` : null;
    })
    .filter(Boolean);

  let mergedCommitMessage = `feat(${milestoneId}/${sliceId}): ${sliceTitle}`;
  if (taskLines.length > 0) {
    mergedCommitMessage += `\n\nTasks:\n${taskLines.join("\n")}`;
  }
  mergedCommitMessage += `\n\nBranch: ${branch}`;

  git.run(["commit", "-m", JSON.stringify(mergedCommitMessage)]);

  const prefs = loadEffectiveGSDPreferences()?.preferences.git;
  const preserve = prefs?.preserve_branches ?? false;

  if (!preserve) {
    git.run(["branch", "-D", branch]);
  }

  // Push if enabled
  git.push();

  return {
    branch,
    mergedCommitMessage,
    deletedBranch: !preserve,
  };
}

/**
 * Check if we're currently on a slice branch (not main).
 * Handles both plain (gsd/M001/S01) and worktree-namespaced (gsd/wt/M001/S01) branches.
 */
export function isOnSliceBranch(basePath: string): boolean {
  const current = getCurrentBranch(basePath);
  return SLICE_BRANCH_RE.test(current);
}

/**
 * Get the active slice branch name, or null if on main.
 * Handles both plain and worktree-namespaced branch patterns.
 */
export function getActiveSliceBranch(basePath: string): string | null {
  try {
    const current = getCurrentBranch(basePath);
    return SLICE_BRANCH_RE.test(current) ? current : null;
  } catch {
    return null;
  }
}
