/**
 * GSD Quick Mode — /gsd quick <task>
 * Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
 *
 * Lightweight task execution with GSD guarantees (atomic commits, state
 * tracking) but without the full milestone/slice ceremony.
 *
 * Quick tasks live in `.gsd/quick/` and are tracked in STATE.md's
 * "Quick Tasks Completed" table.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { loadPrompt } from "./prompt-loader.js";
import { gsdRoot } from "./paths.js";
import { createGitService, runGit } from "./git-service.js";
import { getErrorMessage } from "./error-utils.js";

// ─── Quick Task Helpers ───────────────────────────────────────────────────────

/**
 * Generate a URL-friendly slug from a description.
 * Lowercase, hyphens, max 40 chars.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
}

/**
 * Determine the next quick task number by scanning existing directories.
 */
function getNextTaskNum(quickDir: string): number {
  if (!existsSync(quickDir)) return 1;
  try {
    const entries = readdirSync(quickDir, { withFileTypes: true });
    let max = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^(\d+)-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max + 1;
  } catch {
    return 1;
  }
}

/**
 * Ensure the quick task directory structure exists.
 * Returns the task directory path.
 */
function ensureQuickDir(basePath: string, taskNum: number, slug: string): string {
  const quickDir = join(gsdRoot(basePath), "quick");
  const taskDir = join(quickDir, `${taskNum}-${slug}`);
  mkdirSync(taskDir, { recursive: true });
  return taskDir;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleQuick(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const root = gsdRoot(basePath);

  // Validate: .gsd/ must exist
  if (!existsSync(root)) {
    ctx.ui.notify(
      "No .gsd/ directory found. Run /gsd to initialize a project first.",
      "error",
    );
    return;
  }

  // Parse description from args
  let description = args.trim();
  if (!description) {
    ctx.ui.notify(
      "Usage: /gsd quick <task description>\n\nExample: /gsd quick fix login button not responding on mobile",
      "info",
    );
    return;
  }

  // Setup
  const quickDir = join(root, "quick");
  const taskNum = getNextTaskNum(quickDir);
  const slug = slugify(description);
  const taskDir = ensureQuickDir(basePath, taskNum, slug);
  const taskDirRel = `.gsd/quick/${taskNum}-${slug}`;
  const date = new Date().toISOString().split("T")[0];

  // Create git branch for the quick task (unless isolation: none)
  const git = createGitService(basePath);
  const branchName = `gsd/quick/${taskNum}-${slug}`;
  const skipBranch = git.prefs.isolation === "none";

  let branchCreated = false;
  let originalBranch: string | undefined;
  if (!skipBranch) {
    try {
      originalBranch = git.getCurrentBranch();
      if (originalBranch !== branchName) {
        // Auto-commit any dirty state before switching
        try {
          git.autoCommit("quick-task", `Q${taskNum}`, []);
        } catch { /* nothing to commit — fine */ }

        runGit(basePath, ["checkout", "-b", branchName]);
        branchCreated = true;
      }
    } catch (err) {
      // Branch creation failed — continue on current branch
      const message = getErrorMessage(err);
      ctx.ui.notify(`Could not create branch ${branchName}: ${message}. Working on current branch.`, "warning");
    }
  }

  const actualBranch = branchCreated ? branchName : git.getCurrentBranch();

  // Notify user
  ctx.ui.notify(
    `Quick task ${taskNum}: ${description}\nDirectory: ${taskDirRel}\nBranch: ${actualBranch}`,
    "info",
  );

  // Build and dispatch the quick task prompt
  const summaryPath = `${taskDirRel}/${taskNum}-SUMMARY.md`;
  const prompt = loadPrompt("quick-task", {
    description,
    taskDir: taskDirRel,
    branch: actualBranch,
    summaryPath,
    date,
    taskNum: String(taskNum),
    slug,
  });

  pi.sendMessage(
    {
      customType: "gsd-quick-task",
      content: prompt,
      display: false,
    },
    { triggerTurn: true },
  );

  // Schedule branch merge-back after the quick task agent session ends.
  // Without this, auto-mode resumes on the quick-task branch (#1269).
  if (branchCreated && originalBranch) {
    _pendingQuickBranchReturn = {
      basePath,
      originalBranch,
      quickBranch: branchName,
      taskNum,
      slug,
      description,
    };
    // Persist to disk so recovery works across session crashes (#1293).
    persistPendingReturn(_pendingQuickBranchReturn, basePath);
  }
}

/** Pending quick-task branch return — consumed by cleanupQuickBranch(). */
let _pendingQuickBranchReturn: {
  basePath: string;
  originalBranch: string;
  quickBranch: string;
  taskNum: number;
  slug: string;
  description: string;
} | null = null;

// ─── Disk Persistence ─────────────────────────────────────────────────────

/** Path to the pending quick-task return file. */
function pendingReturnPath(basePath: string): string {
  return join(gsdRoot(basePath), "runtime", "quick-return.json");
}

/** Write pending return state to disk. */
function persistPendingReturn(state: NonNullable<typeof _pendingQuickBranchReturn>, basePath: string): void {
  const filePath = pendingReturnPath(basePath);
  mkdirSync(join(gsdRoot(basePath), "runtime"), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/** Remove pending return file from disk. */
function clearPendingReturn(basePath: string): void {
  try { unlinkSync(pendingReturnPath(basePath)); } catch { /* already gone */ }
}

/** Load pending return from disk (cross-session recovery). */
function loadPendingReturn(basePath: string): NonNullable<typeof _pendingQuickBranchReturn> | null {
  const filePath = pendingReturnPath(basePath);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Merge the quick-task branch back to the original branch and switch.
 * Called from the agent_end handler after a quick task completes.
 *
 * Checks both in-memory state (same session) and disk state (cross-session
 * recovery for crashed/interrupted sessions).
 *
 * Returns true if a branch return was performed.
 */
export function cleanupQuickBranch(): boolean {
  // Prefer in-memory state; fall back to disk for cross-session recovery
  let state = _pendingQuickBranchReturn;
  if (!state) {
    // Try loading from disk — handles the case where the session that
    // started the quick task crashed before agent_end could run (#1293).
    const basePath = process.cwd();
    state = loadPendingReturn(basePath);
  }
  if (!state) return false;

  _pendingQuickBranchReturn = null;
  const { basePath, originalBranch, quickBranch, taskNum, slug, description } = state;

  try {
    // Auto-commit any remaining work
    try { runGit(basePath, ["add", "-A"]); } catch {}
    try { runGit(basePath, ["commit", "-m", `quick(Q${taskNum}): ${slug}`]); } catch {}

    // Switch back and merge
    runGit(basePath, ["checkout", originalBranch]);
    try {
      runGit(basePath, ["merge", "--squash", quickBranch]);
      runGit(basePath, ["commit", "-m", `quick(Q${taskNum}): ${description.slice(0, 72)}`]);
    } catch { /* merge conflict or nothing — non-fatal */ }

    // Clean up quick branch
    try { runGit(basePath, ["branch", "-D", quickBranch]); } catch {}

    // Clean up disk state
    clearPendingReturn(basePath);
    return true;
  } catch {
    // Cleanup failed — leave disk state for next attempt
    return false;
  }
}
