/**
 * Git worktree API for session-based branch isolation.
 * Enables each chat session to work in its own git worktree with auto-created branch.
 * Uses node:child_process.spawn with array args (no shell: true) — same pattern as git-api.ts.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

/* ── git spawn helper ─────────────────────────────────────────── */

interface SpawnResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Spawn git with array args, collect stdout/stderr, resolve on close.
 * Follows exact pattern from git-api.ts.
 */
function spawnGit(cwd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = nodeSpawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ ok: false, stdout: "", stderr: err.message });
    });
  });
}

/* ── .gitignore management ────────────────────────────────────── */

/**
 * Ensure an entry exists in .gitignore. Creates file if missing.
 * Idempotent — will not add duplicate entries.
 */
export async function ensureGitignoreEntry(
  repoRoot: string,
  entry: string
): Promise<void> {
  const gitignorePath = join(repoRoot, ".gitignore");
  let content = "";

  try {
    await access(gitignorePath, constants.F_OK);
    content = await readFile(gitignorePath, "utf-8");
  } catch {
    // File doesn't exist — will be created
  }

  // Check if entry already present (trimmed line comparison)
  const lines = content.split("\n").map((l) => l.trim());
  if (lines.includes(entry.trim())) {
    return;
  }

  // Append entry with newline
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, content + separator + entry + "\n", "utf-8");
}

/* ── worktree CRUD ────────────────────────────────────────────── */

interface WorktreeCreateSuccess {
  worktreePath: string;
  branchName: string;
}

interface WorktreeError {
  error: string;
}

/**
 * Create a session worktree at repoRoot/.worktrees/<slug>/ with branch session/<slug>.
 * Auto-manages .gitignore entry.
 */
export async function createSessionWorktree(
  repoRoot: string,
  sessionSlug: string
): Promise<WorktreeCreateSuccess | WorktreeError> {
  const worktreePath = join(repoRoot, ".worktrees", sessionSlug).replace(
    /\\/g,
    "/"
  );
  const branchName = `session/${sessionSlug}`;

  // Ensure .worktrees/ is in .gitignore
  await ensureGitignoreEntry(repoRoot, ".worktrees/");

  const result = await spawnGit(repoRoot, [
    "worktree",
    "add",
    "-b",
    branchName,
    worktreePath,
  ]);

  if (!result.ok) {
    return { error: result.stderr.trim() || "Failed to create worktree" };
  }

  return { worktreePath, branchName };
}

interface WorktreeRemoveResult {
  ok: boolean;
  error?: string;
}

/**
 * Remove a session worktree. Optionally delete its branch.
 */
export async function removeSessionWorktree(
  repoRoot: string,
  worktreePath: string,
  deleteBranch: boolean = false
): Promise<WorktreeRemoveResult> {
  // Normalize to forward slashes
  const normalizedPath = worktreePath.replace(/\\/g, "/");

  const result = await spawnGit(repoRoot, [
    "worktree",
    "remove",
    normalizedPath,
    "--force",
  ]);

  if (!result.ok) {
    return { ok: false, error: result.stderr.trim() || "Failed to remove worktree" };
  }

  if (deleteBranch) {
    // Derive branch name from the worktree path slug (last segment)
    const slug = normalizedPath.split("/").pop() || "";
    const branchName = `session/${slug}`;
    const branchResult = await spawnGit(repoRoot, [
      "branch",
      "-D",
      branchName,
    ]);
    if (!branchResult.ok) {
      // Non-fatal — worktree was removed, branch deletion is best-effort
      console.warn(
        `[worktree-api] Branch ${branchName} deletion failed:`,
        branchResult.stderr.trim()
      );
    }
  }

  return { ok: true };
}

/* ── rename worktree ──────────────────────────────────────────── */

/**
 * Rename a session worktree: remove old worktree, rename branch, re-add at new path.
 * Old path: .worktrees/<oldSlug>, new path: .worktrees/<newSlug>
 * Old branch: session/<oldSlug>, new branch: session/<newSlug>
 */
export async function renameSessionWorktree(
  repoRoot: string,
  oldSlug: string,
  newSlug: string,
): Promise<WorktreeCreateSuccess | WorktreeError> {
  const oldWorktreePath = join(repoRoot, ".worktrees", oldSlug).replace(/\\/g, "/");
  const newWorktreePath = join(repoRoot, ".worktrees", newSlug).replace(/\\/g, "/");
  const oldBranchName = `session/${oldSlug}`;
  const newBranchName = `session/${newSlug}`;

  // Step 1: Remove the old worktree
  const removeResult = await spawnGit(repoRoot, ["worktree", "remove", oldWorktreePath, "--force"]);
  if (!removeResult.ok) {
    return { error: `Failed to remove old worktree: ${removeResult.stderr.trim()}` };
  }

  // Step 2: Rename the branch
  const renameResult = await spawnGit(repoRoot, ["branch", "-m", oldBranchName, newBranchName]);
  if (!renameResult.ok) {
    return { error: `Failed to rename branch: ${renameResult.stderr.trim()}` };
  }

  // Step 3: Re-add worktree at new path with existing branch
  const addResult = await spawnGit(repoRoot, ["worktree", "add", newWorktreePath, newBranchName]);
  if (!addResult.ok) {
    return { error: `Failed to re-add worktree at new path: ${addResult.stderr.trim()}` };
  }

  return { worktreePath: newWorktreePath, branchName: newBranchName };
}

/* ── list worktrees ───────────────────────────────────────────── */

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

/**
 * List all worktrees via git worktree list --porcelain.
 * Parses porcelain output into structured objects.
 */
export async function listWorktrees(
  repoRoot: string
): Promise<WorktreeInfo[]> {
  const result = await spawnGit(repoRoot, [
    "worktree",
    "list",
    "--porcelain",
  ]);

  if (!result.ok) {
    return [];
  }

  const worktrees: WorktreeInfo[] = [];
  // Porcelain format: blocks separated by blank lines
  // Each block has lines like:
  //   worktree /path/to/worktree
  //   HEAD abc1234...
  //   branch refs/heads/main
  const blocks = result.stdout.trim().split("\n\n");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    let path = "";
    let head = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length).replace(/\\/g, "/");
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        // Strip refs/heads/ prefix
        branch = line.slice("branch ".length).replace("refs/heads/", "");
      }
    }

    if (path) {
      worktrees.push({ path, branch, head });
    }
  }

  return worktrees;
}
