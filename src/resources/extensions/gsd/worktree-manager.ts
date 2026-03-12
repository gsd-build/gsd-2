/**
 * GSD Worktree Manager
 *
 * Creates and manages git worktrees under .gsd/worktrees/<name>/.
 * Each worktree gets its own branch (worktree/<name>) and a full
 * working copy of the project, enabling parallel work streams.
 *
 * The merge helper compares .gsd/ artifacts between a worktree and
 * the main branch, then dispatches an LLM-guided merge flow.
 *
 * Flow:
 *   1. create()  — git worktree add .gsd/worktrees/<name> -b worktree/<name>
 *   2. user works in the worktree (new plans, milestones, etc.)
 *   3. merge()   — LLM-guided reconciliation of .gsd/ artifacts back to main
 *   4. remove()  — git worktree remove + branch cleanup
 */

import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { GitService } from "./git-service.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  exists: boolean;
}

/** Per-file line change stats from git diff --numstat. */
export interface FileLineStat {
  file: string;
  added: number;
  removed: number;
}

export interface WorktreeDiffSummary {
  /** Files only in the worktree .gsd/ (new artifacts) */
  added: string[];
  /** Files in both but with different content */
  modified: string[];
  /** Files only in main .gsd/ (deleted in worktree) */
  removed: string[];
}

// ─── Git Helpers ───────────────────────────────────────────────────────────

let _gitService: GitService | null = null;
function getGit(basePath: string): GitService {
  if (!_gitService || (_gitService as any).basePath !== basePath) {
    _gitService = new GitService(basePath);
  }
  return _gitService;
}

export function getMainBranch(basePath: string): string {
  return getGit(basePath).getMainBranch();
}

// ─── Path Helpers ──────────────────────────────────────────────────────────

export function worktreesDir(basePath: string): string {
  return join(basePath, ".gsd", "worktrees");
}

export function worktreePath(basePath: string, name: string): string {
  return join(worktreesDir(basePath), name);
}

export function worktreeBranchName(name: string): string {
  return `worktree/${name}`;
}

// ─── Core Operations ───────────────────────────────────────────────────────

/**
 * Create a new git worktree under .gsd/worktrees/<name>/ with branch worktree/<name>.
 */
export function createWorktree(basePath: string, name: string): WorktreeInfo {
  const git = getGit(basePath);
  // Validate name: alphanumeric, hyphens, underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid worktree name "${name}". Use only letters, numbers, hyphens, and underscores.`);
  }

  const wtPath = worktreePath(basePath, name);
  const branch = worktreeBranchName(name);

  if (existsSync(wtPath)) {
    throw new Error(`Worktree "${name}" already exists at ${wtPath}`);
  }

  // Ensure the .gsd/worktrees/ directory exists
  const wtDir = worktreesDir(basePath);
  mkdirSync(wtDir, { recursive: true });

  // Prune any stale worktree entries from a previous removal
  git.run(["worktree", "prune"], { allowFailure: true });

  // Check if the branch already exists (leftover from a previous worktree)
  const branchExists = git.run(["show-ref", "--verify", `refs/heads/${branch}`], { allowFailure: true });
  const mainBranch = git.getMainBranch();

  if (branchExists) {
    // Check if the branch is actively used by an existing worktree.
    const worktreeUsing = git.run(["worktree", "list", "--porcelain"], { allowFailure: true });
    const branchInUse = worktreeUsing.includes(`branch refs/heads/${branch}`);

    if (branchInUse) {
      throw new Error(
        `Branch "${branch}" is already in use by another worktree. ` +
        `Remove the existing worktree first with /worktree remove ${name}.`,
      );
    }

    // Reset the stale branch to current main, then attach worktree to it
    git.run(["branch", "-f", branch, mainBranch]);
    git.run(["worktree", "add", wtPath, branch]);
  } else {
    git.run(["worktree", "add", "-b", branch, wtPath, mainBranch]);
  }

  return {
    name,
    path: wtPath,
    branch,
    exists: true,
  };
}

/**
 * List all GSD-managed worktrees.
 */
export function listWorktrees(basePath: string): WorktreeInfo[] {
  const git = getGit(basePath);
  // Resolve real paths to handle symlinks (e.g. /tmp → /private/tmp on macOS)
  const resolvedBase = existsSync(basePath) ? realpathSync(basePath) : resolve(basePath);
  const wtDir = join(resolvedBase, ".gsd", "worktrees");
  const rawList = git.run(["worktree", "list", "--porcelain"]);

  if (!rawList.trim()) return [];

  const worktrees: WorktreeInfo[] = [];
  const entries = rawList.split("\n\n").filter(Boolean);

  for (const entry of entries) {
    const lines = entry.split("\n");
    const wtLine = lines.find(l => l.startsWith("worktree "));
    const branchLine = lines.find(l => l.startsWith("branch "));

    if (!wtLine || !branchLine) continue;

    const entryPath = wtLine.replace("worktree ", "");
    const branch = branchLine.replace("branch refs/heads/", "");

    // Only include worktrees under .gsd/worktrees/
    if (!entryPath.startsWith(wtDir)) continue;

    const name = relative(wtDir, entryPath);
    // Skip nested paths — only direct children
    if (name.includes("/") || name.includes("\\")) continue;

    worktrees.push({
      name,
      path: entryPath,
      branch,
      exists: existsSync(entryPath),
    });
  }

  return worktrees;
}

/**
 * Remove a worktree and optionally delete its branch.
 */
export function removeWorktree(
  basePath: string,
  name: string,
  opts: { deleteBranch?: boolean; force?: boolean } = {},
): void {
  const git = getGit(basePath);
  const wtPath = worktreePath(basePath, name);
  const resolvedWtPath = existsSync(wtPath) ? realpathSync(wtPath) : wtPath;
  const branch = worktreeBranchName(name);
  const { deleteBranch = true, force = false } = opts;

  // If we're inside the worktree, move out first
  const cwd = process.cwd();
  const resolvedCwd = existsSync(cwd) ? realpathSync(cwd) : cwd;
  if (resolvedCwd === resolvedWtPath || resolvedCwd.startsWith(resolvedWtPath + "/")) {
    process.chdir(basePath);
  }

  if (!existsSync(wtPath)) {
    git.run(["worktree", "prune"], { allowFailure: true });
    if (deleteBranch) {
      git.run(["branch", "-D", branch], { allowFailure: true });
    }
    return;
  }

  // Force-remove to handle dirty worktrees
  git.run(["worktree", "remove", "--force", wtPath], { allowFailure: true });

  // If the directory is still there (e.g. locked), try harder
  if (existsSync(wtPath)) {
    git.run(["worktree", "remove", "--force", "--force", wtPath], { allowFailure: true });
  }

  // Prune stale entries
  git.run(["worktree", "prune"], { allowFailure: true });

  if (deleteBranch) {
    git.run(["branch", "-D", branch], { allowFailure: true });
  }
}

/** Paths to skip in all worktree diffs (internal/runtime artifacts). */
const SKIP_PATHS = [".gsd/worktrees/", ".gsd/runtime/", ".gsd/activity/"];
const SKIP_EXACT = [".gsd/STATE.md", ".gsd/auto.lock", ".gsd/metrics.json"];

function shouldSkipPath(filePath: string): boolean {
  if (SKIP_PATHS.some(p => filePath.startsWith(p))) return true;
  if (SKIP_EXACT.includes(filePath)) return true;
  return false;
}

function parseDiffNameStatus(diffOutput: string): WorktreeDiffSummary {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  if (!diffOutput.trim()) return { added, modified, removed };

  for (const line of diffOutput.split("\n").filter(Boolean)) {
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");

    if (shouldSkipPath(filePath)) continue;

    switch (status) {
      case "A": added.push(filePath); break;
      case "M": modified.push(filePath); break;
      case "D": removed.push(filePath); break;
      default:
        // Renames, copies — treat as modified
        if (status?.startsWith("R") || status?.startsWith("C")) {
          modified.push(filePath);
        }
    }
  }

  return { added, modified, removed };
}

/**
 * Diff the .gsd/ directory between the worktree branch and main branch.
 */
export function diffWorktreeGSD(basePath: string, name: string): WorktreeDiffSummary {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();

  const diffOutput = git.run([
    "diff", "--name-status", `${mainBranch}...${branch}`, "--", ".gsd/",
  ], { allowFailure: true });

  return parseDiffNameStatus(diffOutput);
}

/**
 * Diff ALL files between the worktree branch and main branch.
 */
export function diffWorktreeAll(basePath: string, name: string): WorktreeDiffSummary {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();

  const diffOutput = git.run([
    "diff", "--name-status", mainBranch, branch,
  ], { allowFailure: true });

  return parseDiffNameStatus(diffOutput);
}

/**
 * Get per-file line addition/deletion stats.
 */
export function diffWorktreeNumstat(basePath: string, name: string): FileLineStat[] {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();

  const raw = git.run([
    "diff", "--numstat", mainBranch, branch,
  ], { allowFailure: true });

  if (!raw.trim()) return [];

  const stats: FileLineStat[] = [];
  for (const line of raw.split("\n").filter(Boolean)) {
    const [a, r, ...pathParts] = line.split("\t");
    const file = pathParts.join("\t");
    if (shouldSkipPath(file)) continue;
    const added = a === "-" ? 0 : parseInt(a ?? "0", 10);
    const removed = r === "-" ? 0 : parseInt(r ?? "0", 10);
    stats.push({ file, added, removed });
  }
  return stats;
}

/**
 * Get the full diff content for .gsd/ between the worktree branch and main.
 */
export function getWorktreeGSDDiff(basePath: string, name: string): string {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();

  return git.run([
    "diff", `${mainBranch}...${branch}`, "--", ".gsd/",
  ], { allowFailure: true });
}

/**
 * Get the full diff content for non-.gsd/ files.
 */
export function getWorktreeCodeDiff(basePath: string, name: string): string {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();

  return git.run([
    "diff", `${mainBranch}...${branch}`, "--", ".", ":(exclude).gsd/",
  ], { allowFailure: true });
}

/**
 * Get commit log for the worktree branch since it diverged from main.
 */
export function getWorktreeLog(basePath: string, name: string): string {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();

  return git.run([
    "log", "--oneline", `${mainBranch}..${branch}`,
  ], { allowFailure: true });
}

/**
 * Merge the worktree branch into main using squash merge.
 */
export async function mergeWorktreeToMain(basePath: string, name: string, commitMessage: string): Promise<string> {
  const git = getGit(basePath);
  const branch = worktreeBranchName(name);
  const mainBranch = git.getMainBranch();
  const current = git.getCurrentBranch();

  if (current !== mainBranch) {
    throw new Error(`Must be on ${mainBranch} to merge. Currently on ${current}.`);
  }

  // Verification
  await git.verify();

  git.run(["merge", "--squash", branch]);
  git.run(["commit", "-m", JSON.stringify(commitMessage)]);

  // Push if enabled
  git.push();

  return commitMessage;
}
