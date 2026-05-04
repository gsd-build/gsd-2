// GSD-2 — In-TUI handler for /gsd worktree commands (list, merge, clean, remove).
//
// Mirrors the CLI subcommands in src/worktrees/worktree-cli.ts but emits results via
// ctx.ui.notify() instead of writing colored output to stderr. Reuses the
// same extension modules (worktree-manager, native-git-bridge, etc.) so the
// behavior is identical to the CLI surface.

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync } from "node:fs";

import { projectRoot } from "./commands/context.js";
import {
  listWorktrees,
  removeWorktree,
  mergeWorktreeToMain,
  diffWorktreeAll,
  diffWorktreeNumstat,
  worktreeBranchName,
} from "./worktree-manager.js";
import {
  nativeHasChanges,
  nativeDetectMainBranch,
  nativeCommitCountBetween,
} from "./native-git-bridge.js";
import { inferCommitType } from "./git-service.js";
import { autoCommitCurrentBranch } from "./worktree.js";
import { GSDError, GSD_GIT_ERROR } from "./errors.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorktreeStatus {
  name: string;
  path: string;
  branch: string;
  exists: boolean;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  uncommitted: boolean;
  commits: number;
}

// ─── Status helper ─────────────────────────────────────────────────────────

function getStatus(basePath: string, name: string, wtPath: string): WorktreeStatus {
  const diff = diffWorktreeAll(basePath, name);
  const numstat = diffWorktreeNumstat(basePath, name);
  const filesChanged = diff.added.length + diff.modified.length + diff.removed.length;
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const s of numstat) {
    linesAdded += s.added;
    linesRemoved += s.removed;
  }

  let uncommitted = false;
  try {
    uncommitted = existsSync(wtPath) && nativeHasChanges(wtPath);
  } catch {
    // native check failure → treat as clean for display purposes
  }

  let commits = 0;
  try {
    const main = nativeDetectMainBranch(basePath);
    commits = nativeCommitCountBetween(basePath, main, worktreeBranchName(name));
  } catch {
    // commit count unavailable → leave at 0
  }

  return {
    name,
    path: wtPath,
    branch: worktreeBranchName(name),
    exists: existsSync(wtPath),
    filesChanged,
    linesAdded,
    linesRemoved,
    uncommitted,
    commits,
  };
}

// ─── Formatters (exported for tests) ────────────────────────────────────────

export function formatWorktreeList(statuses: WorktreeStatus[]): string {
  if (statuses.length === 0) {
    return "No worktrees.\n\nCreate one from the CLI: gsd -w <name>";
  }

  const lines: string[] = [`Worktrees — ${statuses.length}`, ""];
  for (const s of statuses) {
    const badge = s.uncommitted
      ? "(uncommitted)"
      : s.filesChanged > 0
        ? "(unmerged)"
        : "(clean)";
    lines.push(`  ${s.name} ${badge}`);
    lines.push(`    branch  ${s.branch}`);
    lines.push(`    path    ${s.path}`);
    if (s.filesChanged > 0) {
      lines.push(
        `    diff    ${s.filesChanged} file${s.filesChanged === 1 ? "" : "s"}, +${s.linesAdded} -${s.linesRemoved}, ${s.commits} commit${s.commits === 1 ? "" : "s"}`,
      );
    }
    lines.push("");
  }
  lines.push("Commands:");
  lines.push("  /gsd worktree merge <name>   Merge into main and clean up");
  lines.push("  /gsd worktree remove <name>  Remove a worktree (--force to skip safety checks)");
  lines.push("  /gsd worktree clean          Remove all merged/empty worktrees");
  return lines.join("\n");
}

export function formatCleanKeepReason(status: WorktreeStatus): string {
  if (!status.exists) {
    return "directory missing — run 'git worktree prune' to unregister";
  }

  if (status.filesChanged > 0) {
    return `${status.filesChanged} changed file${status.filesChanged === 1 ? "" : "s"}${status.uncommitted ? ", uncommitted" : ""}`;
  }

  return "uncommitted changes";
}

// ─── Subcommand: list ───────────────────────────────────────────────────────

async function handleList(ctx: ExtensionCommandContext): Promise<void> {
  const basePath = projectRoot();
  const worktrees = listWorktrees(basePath);
  const statuses = worktrees.map((wt) => getStatus(basePath, wt.name, wt.path));
  ctx.ui.notify(formatWorktreeList(statuses), "info");
}

// ─── Subcommand: merge ──────────────────────────────────────────────────────

async function handleMerge(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const basePath = projectRoot();
  const worktrees = listWorktrees(basePath);
  const trimmed = args.trim();

  let target = trimmed;
  if (!target) {
    if (worktrees.length === 1) {
      target = worktrees[0].name;
    } else if (worktrees.length === 0) {
      ctx.ui.notify("No worktrees to merge.", "info");
      return;
    } else {
      const names = worktrees.map((w) => w.name).join(", ");
      ctx.ui.notify(`Usage: /gsd worktree merge <name>\n\nWorktrees: ${names}`, "warning");
      return;
    }
  }

  const wt = worktrees.find((w) => w.name === target);
  if (!wt) {
    const available = worktrees.map((w) => w.name).join(", ") || "(none)";
    ctx.ui.notify(`Worktree "${target}" not found.\n\nAvailable: ${available}`, "error");
    return;
  }

  const status = getStatus(basePath, target, wt.path);
  if (status.filesChanged === 0 && !status.uncommitted) {
    try {
      removeWorktree(basePath, target, { deleteBranch: true });
      ctx.ui.notify(`Removed empty worktree ${target}.`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(
        `Worktree partially removed: ${msg}\n\nRun 'git worktree prune' to clean up any dangling registrations.`,
        "error",
      );
    }
    return;
  }

  if (status.uncommitted) {
    try {
      autoCommitCurrentBranch(wt.path, "worktree-merge", target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(
        [
          `Auto-commit before merge failed: ${msg}`,
          "",
          `Commit or stash changes in ${wt.path}, then re-run /gsd worktree merge ${target}.`,
        ].join("\n"),
        "error",
      );
      return;
    }
  }

  const commitType = inferCommitType(target);
  const mainBranch = nativeDetectMainBranch(basePath);
  const commitMessage = `${commitType}: merge worktree ${target}\n\nGSD-Worktree: ${target}`;

  try {
    mergeWorktreeToMain(basePath, target, commitMessage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof GSDError && err.code === GSD_GIT_ERROR) {
      ctx.ui.notify(
        `Merge requires the main branch to be checked out: ${msg}\n\nSwitch to ${mainBranch} (e.g. 'git checkout ${mainBranch}'), then re-run /gsd worktree merge ${target}.`,
        "error",
      );
    } else {
      ctx.ui.notify(
        `Merge failed: ${msg}\n\nResolve conflicts manually, then run /gsd worktree merge ${target} again.`,
        "error",
      );
    }
    return;
  }

  const successLines = [
    `Merged ${target} → ${mainBranch}`,
    `  ${status.filesChanged} file${status.filesChanged === 1 ? "" : "s"}, +${status.linesAdded} -${status.linesRemoved}`,
    `  commit: ${commitMessage.split("\n")[0]}`,
  ];

  try {
    removeWorktree(basePath, target, { deleteBranch: true });
    ctx.ui.notify(successLines.join("\n"), "info");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cleanupLines = [
      ...successLines,
      "",
      `Cleanup failed after the merge succeeded: ${msg}`,
      err instanceof GSDError && err.code === GSD_GIT_ERROR
        ? `Switch to ${mainBranch} (e.g. 'git checkout ${mainBranch}'), then remove the worktree manually with /gsd worktree remove ${target} --force.`
        : `Remove the worktree manually with /gsd worktree remove ${target} --force, or run 'git worktree prune' to clean up dangling registrations.`,
    ];
    ctx.ui.notify(cleanupLines.join("\n"), "warning");
  }
}

// ─── Subcommand: clean ──────────────────────────────────────────────────────

async function handleClean(ctx: ExtensionCommandContext): Promise<void> {
  const basePath = projectRoot();
  const worktrees = listWorktrees(basePath);
  if (worktrees.length === 0) {
    ctx.ui.notify("No worktrees to clean.", "info");
    return;
  }

  const removed: string[] = [];
  const kept: string[] = [];
  for (const wt of worktrees) {
    const status = getStatus(basePath, wt.name, wt.path);
    if (status.filesChanged === 0 && !status.uncommitted) {
      try {
        removeWorktree(basePath, wt.name, { deleteBranch: true });
        removed.push(wt.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        kept.push(`${wt.name} (failed: ${msg})`);
      }
    } else {
      const reason = formatCleanKeepReason(status);
      kept.push(`${wt.name} (${reason})`);
    }
  }

  const lines: string[] = [`Cleaned ${removed.length} worktree${removed.length === 1 ? "" : "s"}.`];
  if (removed.length > 0) {
    lines.push("", "Removed:");
    for (const n of removed) lines.push(`  ✓ ${n}`);
  }
  if (kept.length > 0) {
    lines.push("", "Kept:");
    for (const n of kept) lines.push(`  ─ ${n}`);
  }
  ctx.ui.notify(lines.join("\n"), "info");
}

// ─── Subcommand: remove ─────────────────────────────────────────────────────

async function handleRemove(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const basePath = projectRoot();
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const force = tokens.includes("--force");
  const name = tokens.find((t) => t !== "--force");
  if (!name) {
    ctx.ui.notify("Usage: /gsd worktree remove <name> [--force]", "warning");
    return;
  }

  const worktrees = listWorktrees(basePath);
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) {
    const available = worktrees.map((w) => w.name).join(", ") || "(none)";
    ctx.ui.notify(`Worktree "${name}" not found.\n\nAvailable: ${available}`, "error");
    return;
  }

  const status = getStatus(basePath, name, wt.path);
  if ((status.filesChanged > 0 || status.uncommitted) && !force) {
    ctx.ui.notify(
      [
        `Worktree "${name}" has pending changes (${formatCleanKeepReason(status)}).`,
        "",
        `  Merge first:     /gsd worktree merge ${name}`,
        `  Or force-remove: /gsd worktree remove ${name} --force`,
      ].join("\n"),
      "warning",
    );
    return;
  }

  try {
    removeWorktree(basePath, name, { deleteBranch: true });
    ctx.ui.notify(`Removed worktree ${name}.`, "info");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(
      `Worktree partially removed: ${msg}\n\nRun 'git worktree prune' to clean up any dangling registrations.`,
      "error",
    );
  }
}

// ─── Help text ──────────────────────────────────────────────────────────────

const HELP_TEXT = [
  "Usage: /gsd worktree <command> [args]",
  "",
  "Commands:",
  "  list                       Show all worktrees with status",
  "  merge [name]               Merge a worktree into main, then remove it",
  "  remove <name> [--force]    Remove a worktree (refuses unmerged changes without --force)",
  "  clean                      Remove all merged/empty worktrees",
  "",
  "The -w flag (CLI only) creates/resumes worktrees on session start:",
  "  gsd -w               Auto-name a new worktree, or resume the only active one",
  "  gsd -w my-feature    Create or resume a named worktree",
].join("\n");

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function handleWorktree(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const trimmed = args.trim();
  const lowered = trimmed.toLowerCase();

  if (!lowered || lowered === "help" || lowered === "--help" || lowered === "-h") {
    ctx.ui.notify(HELP_TEXT, "info");
    return;
  }

  try {
    if (lowered === "list" || lowered === "ls") {
      await handleList(ctx);
      return;
    }
    if (lowered === "merge" || lowered.startsWith("merge ")) {
      await handleMerge(trimmed.replace(/^merge\s*/i, ""), ctx);
      return;
    }
    if (lowered === "clean") {
      await handleClean(ctx);
      return;
    }
    if (
      lowered === "remove" ||
      lowered.startsWith("remove ") ||
      lowered === "rm" ||
      lowered.startsWith("rm ")
    ) {
      const stripped = trimmed.replace(/^(remove|rm)\s*/i, "");
      await handleRemove(stripped, ctx);
      return;
    }

    ctx.ui.notify(`Unknown worktree command: ${trimmed}\n\n${HELP_TEXT}`, "warning");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Worktree command failed: ${msg}`, "error");
  }
}
