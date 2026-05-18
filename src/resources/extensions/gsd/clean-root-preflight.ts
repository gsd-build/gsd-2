/**
 * clean-root-preflight.ts — Preflight gate for dirty working trees before milestone merges.
 *
 * #2909: Adds a fast-path git status check before milestone completion merges.
 * When the working tree is dirty the user is warned and changes are auto-stashed
 * so the merge can proceed cleanly. After the merge completes, postflightPopStash
 * restores the stashed changes and reports whether manual recovery is needed.
 *
 * Design constraints (from Trek-e approval):
 *  - Warn the user before stashing (no silent surprises)
 *  - git stash push / git stash apply+drop for targeted restore
 *  - Stash/apply errors are logged but MUST NOT block the merge itself
 *  - Fast-path status check — clean trees pay no extra cost
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GIT_NO_PROMPT_ENV } from "./git-constants.js";
import { logWarning } from "./workflow-logger.js";
import { nativeHasChanges } from "./native-git-bridge.js";
import { listUnmergedGitPaths } from "./git-conflict-state.js";

export interface PreflightResult {
  /** true when a stash was pushed and postflightPopStash should be called */
  stashPushed: boolean;
  /** true when the merge must not start because dirty files need user action */
  blocked?: boolean;
  /** Machine-readable reason for blocked preflight. */
  blockedReason?: "dirty-overlap" | "dirty-overlap-eval-failed" | "unmerged-conflicts" | "unmerged-conflicts-eval-failed";
  /** Unique marker embedded in the stash message for targeted restoration */
  stashMarker?: string;
  /** Dirty paths that overlap the milestone branch diff and would conflict after merge */
  overlappingPaths?: string[] | null;
  /** Paths with unresolved Git conflict stages. */
  conflictedPaths?: string[] | null;
  /** human-readable summary of what happened (empty string for clean trees) */
  summary: string;
}

export interface PostflightResult {
  restored: boolean;
  needsManualRecovery: boolean;
  message: string;
  stashRef?: string;
  resolution?: "applied" | "already-present-dropped" | "already-present-preserved" | "manual-recovery";
  collidedPaths?: string[];
}

function gitText(basePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: GIT_NO_PROMPT_ENV,
  });
}

function gitBuffer(basePath: string, args: string[]): Buffer {
  return execFileSync("git", args, {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    env: GIT_NO_PROMPT_ENV,
  });
}

function errorText(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const parts: string[] = [];
  const stderr = (err as { stderr?: unknown }).stderr;
  const stdout = (err as { stdout?: unknown }).stdout;
  for (const value of [stderr, stdout]) {
    if (typeof value === "string") parts.push(value);
    else if (value instanceof Uint8Array) parts.push(Buffer.from(value).toString("utf-8"));
  }
  parts.push(err instanceof Error ? err.message : String(err));
  return parts.filter(Boolean).join("\n");
}

function parseAlreadyExistsNoCheckoutPaths(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^(.+?) already exists, no checkout$/i.exec(line.trim());
    if (match?.[1]) paths.push(match[1]);
  }
  return [...new Set(paths)];
}

function readZeroDelimitedPaths(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

function listDirtyPaths(basePath: string): string[] | null {
  try {
    const paths = new Set<string>();
    for (const args of [
      ["diff", "--name-only", "-z"],
      ["diff", "--cached", "--name-only", "-z"],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ]) {
      for (const path of readZeroDelimitedPaths(gitText(basePath, args))) {
        paths.add(path);
      }
    }
    return [...paths];
  } catch {
    return null;
  }
}

function listMilestoneChangedPaths(basePath: string, milestoneId: string): string[] | null {
  const milestoneBranch = `milestone/${milestoneId}`;
  try {
    gitText(basePath, ["rev-parse", "--verify", "--quiet", `refs/heads/${milestoneBranch}`]);
  } catch {
    return [];
  }
  try {
    const mergeBase = gitText(basePath, ["merge-base", "HEAD", milestoneBranch]).trim();
    if (!mergeBase) return null;
    return readZeroDelimitedPaths(gitText(basePath, ["diff", "--name-only", "-z", mergeBase, milestoneBranch]));
  } catch {
    return null;
  }
}

function findOverlappingDirtyMilestonePaths(basePath: string, milestoneId: string): string[] | null {
  const dirtyPaths = listDirtyPaths(basePath);
  const changedPaths = listMilestoneChangedPaths(basePath, milestoneId);
  if (!dirtyPaths || !changedPaths) return null;

  const changedPathSet = new Set(changedPaths.filter((path) => !path.startsWith(".gsd/")));
  return dirtyPaths
    .filter((path) => !path.startsWith(".gsd/") && changedPathSet.has(path))
    .sort();
}

function listStashUntrackedPaths(basePath: string, stashRef: string): string[] | null {
  try {
    const output = gitText(basePath, ["ls-tree", "-r", "-z", "--name-only", `${stashRef}^3`]);
    return readZeroDelimitedPaths(output);
  } catch {
    return null;
  }
}

function listStashTrackedPaths(basePath: string, stashRef: string): string[] | null {
  try {
    const output = gitText(basePath, ["diff", "--name-only", "-z", `${stashRef}^1`, stashRef]);
    return readZeroDelimitedPaths(output);
  } catch {
    return null;
  }
}

function isWorktreeClean(basePath: string): boolean | null {
  try {
    return gitText(basePath, ["status", "--porcelain"]).trim() === "";
  } catch {
    return null;
  }
}

function stashBlobEqualsWorktreeFile(basePath: string, stashRef: string, path: string): boolean | null {
  try {
    const worktreePath = join(basePath, path);
    if (!existsSync(worktreePath)) return false;
    const worktreeContent = readFileSync(worktreePath);
    const stashContent = gitBuffer(basePath, ["show", `${stashRef}^3:${path}`]);
    return Buffer.compare(worktreeContent, stashContent) === 0;
  } catch {
    return null;
  }
}

function reconcileAlreadyPresentUntrackedStash(
  basePath: string,
  milestoneId: string,
  stashRef: string,
  err: unknown,
): PostflightResult | null {
  const text = errorText(err);
  const collidedPaths = parseAlreadyExistsNoCheckoutPaths(text);
  if (collidedPaths.length === 0) return null;

  const untrackedPaths = listStashUntrackedPaths(basePath, stashRef);
  if (!untrackedPaths || untrackedPaths.length === 0) return null;

  const trackedPaths = listStashTrackedPaths(basePath, stashRef);
  if (trackedPaths === null || trackedPaths.length > 0) return null;

  const untrackedPathSet = new Set(untrackedPaths);
  if (!collidedPaths.every((path) => untrackedPathSet.has(path))) return null;
  if (!untrackedPaths.every((path) => existsSync(join(basePath, path)))) return null;
  if (isWorktreeClean(basePath) !== true) return null;

  const blobComparisons = untrackedPaths.map((path) => stashBlobEqualsWorktreeFile(basePath, stashRef, path));
  if (blobComparisons.some((result) => result === null)) return null;
  const allIdentical = blobComparisons.every(Boolean);
  if (allIdentical) {
    let dropped = true;
    try {
      execFileSync("git", ["stash", "drop", stashRef], {
        cwd: basePath,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
        env: GIT_NO_PROMPT_ENV,
      });
    } catch (err) {
      dropped = false;
      logWarning("preflight", `git stash drop ${stashRef} failed after identical preflight stash reconciliation: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {
      restored: true,
      needsManualRecovery: false,
      message: dropped
        ? `Preflight stash for milestone ${milestoneId} contained files already present after merge; identical stash dropped.`
        : `Preflight stash for milestone ${milestoneId} contained files already present after merge, but ${stashRef} could not be dropped and remains as a backup.`,
      stashRef,
      resolution: dropped ? "already-present-dropped" : "already-present-preserved",
      collidedPaths,
    };
  }

  return {
    restored: false,
    needsManualRecovery: false,
    message: `Preflight stash for milestone ${milestoneId} contained untracked files already present after merge. Keeping merged files and preserving ${stashRef} as a backup.`,
    stashRef,
    resolution: "already-present-preserved",
    collidedPaths,
  };
}

function findPreflightStashRef(basePath: string, milestoneId: string, stashMarker?: string): string | null {
  const markerPrefix = `gsd-preflight-stash:${milestoneId}:`;
  let fallbackRef: string | null = null;
  try {
    const list = execFileSync("git", ["stash", "list", "--format=%gd%x00%s"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
    });
    for (const line of list.split("\n")) {
      const [ref, subject] = line.split("\x00");
      if (!ref || !subject) continue;
      if (stashMarker && subject.includes(stashMarker)) return ref;
      if (!fallbackRef && subject.includes(markerPrefix)) fallbackRef = ref;
    }
  } catch (err) {
    logWarning("preflight", `stash list failed before restore: ${err instanceof Error ? err.message : String(err)}`);
  }
  return fallbackRef;
}

/**
 * Check the working tree for dirty files before a milestone merge.
 *
 * Clean tree path: O(1) — returns immediately with stashPushed=false.
 *
 * Dirty tree path:
 *  1. Emits a warning notification via the provided `notify` callback.
 *  2. Runs `git stash push --include-untracked -m "gsd-preflight-stash"`.
 *  3. Returns stashPushed=true so the caller knows to call postflightPopStash.
 *
 * Any stash error is logged but does NOT throw — the merge proceeds regardless.
 */
export function preflightCleanRoot(
  basePath: string,
  milestoneId: string,
  notify: (message: string, level: "info" | "warning" | "error") => void,
): PreflightResult {
  // Fast-path: clean tree — nothing to do
  let isDirty = false;
  try {
    isDirty = nativeHasChanges(basePath);
  } catch (err) {
    // If the status check itself fails, treat as clean and let the merge decide
    logWarning("preflight", `clean-root status check failed: ${err instanceof Error ? err.message : String(err)}`);
    return { stashPushed: false, summary: "" };
  }

  if (!isDirty) {
    return { stashPushed: false, summary: "" };
  }

  const conflictedPaths = listUnmergedGitPaths(basePath);
  if (conflictedPaths === null) {
    const msg =
      `Unable to verify unresolved Git conflicts before milestone ${milestoneId} merge. ` +
      `Resolve Git/worktree state manually before resuming auto-mode.`;
    notify(msg, "error");
    return {
      stashPushed: false,
      blocked: true,
      blockedReason: "unmerged-conflicts-eval-failed",
      conflictedPaths: null,
      summary: msg,
    };
  }
  if (conflictedPaths.length > 0) {
    const msg =
      `Working tree has unresolved Git conflicts before milestone ${milestoneId} merge: ` +
      `${conflictedPaths.join(", ")}. Resolve these files manually before resuming auto-mode.`;
    notify(msg, "error");
    return {
      stashPushed: false,
      blocked: true,
      blockedReason: "unmerged-conflicts",
      conflictedPaths,
      summary: msg,
    };
  }

  const overlappingPaths = findOverlappingDirtyMilestonePaths(basePath, milestoneId);
  if (overlappingPaths === null) {
    const msg =
      `Unable to verify dirty-path overlap for milestone ${milestoneId}. ` +
      `Resolve Git/worktree state manually before resuming auto-mode.`;
    notify(msg, "error");
    return {
      stashPushed: false,
      blocked: true,
      blockedReason: "dirty-overlap-eval-failed",
      overlappingPaths: null,
      summary: msg,
    };
  }
  if (overlappingPaths && overlappingPaths.length > 0) {
    const msg =
      `Working tree has uncommitted files that overlap milestone ${milestoneId} changes: ` +
      `${overlappingPaths.join(", ")}. Commit, stash, or discard those files before resuming auto-mode.`;
    notify(msg, "error");
    return {
      stashPushed: false,
      blocked: true,
      blockedReason: "dirty-overlap",
      overlappingPaths,
      summary: msg,
    };
  }

  // Warn the user before stashing
  const warnMsg = `Working tree has uncommitted changes before milestone ${milestoneId} merge. Auto-stashing to allow clean merge (stash will be restored after merge).`;
  notify(warnMsg, "warning");

  // Push the stash
  try {
    const stashMarker = `gsd-preflight-stash:${milestoneId}:${process.pid}:${Date.now()}:${process.hrtime.bigint().toString(36)}`;
    execFileSync("git", ["stash", "push", "--include-untracked", "-m", `gsd-preflight-stash [${stashMarker}]`], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
    });
    const stashCreated = findPreflightStashRef(basePath, milestoneId, stashMarker) !== null;
    return {
      stashPushed: stashCreated,
      stashMarker: stashCreated ? stashMarker : undefined,
      summary: stashCreated
        ? `Stashed uncommitted changes before merge (milestone ${milestoneId}).`
        : `No stashable changes found before merge (milestone ${milestoneId}).`,
    };
  } catch (err) {
    // Stash failure is non-fatal — log and let the merge attempt proceed
    const msg = `git stash push failed before merge of milestone ${milestoneId}: ${err instanceof Error ? err.message : String(err)}`;
    logWarning("preflight", msg);
    notify(`Auto-stash failed before milestone ${milestoneId} merge — proceeding anyway. ${msg}`, "warning");
    return { stashPushed: false, summary: `stash-push-failed: ${msg}` };
  }
}

/**
 * Restore stashed changes after a milestone merge completes.
 *
 * Only called when preflightCleanRoot returned stashPushed=true.
 * Any pop error (e.g. conflict) is logged and notified but does NOT throw —
 * the merge already completed successfully. Callers must treat
 * needsManualRecovery=true as a dirty workspace stop, not a clean completion.
 */
export function postflightPopStash(
  basePath: string,
  milestoneId: string,
  stashMarker: string | undefined,
  notify: (message: string, level: "info" | "warning" | "error") => void,
): PostflightResult {
  let stashRef: string | null = null;
  try {
    stashRef = findPreflightStashRef(basePath, milestoneId, stashMarker);
    if (!stashRef) {
      const msg = `No matching GSD preflight stash found for milestone ${milestoneId}; leaving stash list untouched.`;
      logWarning("preflight", msg);
      notify(msg, "warning");
      return {
        restored: false,
        needsManualRecovery: true,
        message: msg,
      };
    }
    execFileSync("git", ["stash", "apply", stashRef], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
    });
    let dropWarning: string | null = null;
    try {
      execFileSync("git", ["stash", "drop", stashRef], {
        cwd: basePath,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
        env: GIT_NO_PROMPT_ENV,
      });
    } catch (err) {
      dropWarning = ` Stash was restored, but git stash drop ${stashRef} failed: ${err instanceof Error ? err.message : String(err)}.`;
      logWarning("preflight", dropWarning.trim());
    }
    const msg = `Restored stashed changes after milestone ${milestoneId} merge.`;
    notify(`${msg}${dropWarning ?? ""}`, dropWarning ? "warning" : "info");
    return {
      restored: true,
      needsManualRecovery: false,
      message: `${msg}${dropWarning ?? ""}`,
      stashRef,
      resolution: "applied",
    };
  } catch (err) {
    if (stashRef) {
      const reconciled = reconcileAlreadyPresentUntrackedStash(basePath, milestoneId, stashRef, err);
      if (reconciled) {
        logWarning("preflight", reconciled.message);
        notify(reconciled.message, reconciled.resolution === "already-present-preserved" ? "warning" : "info");
        return reconciled;
      }
    }
    // Apply conflicts mean the merged code collides with the stashed changes.
    // Log a warning — the user needs to resolve manually, but the merge succeeded.
    const restoreHint = stashRef
      ? `Run "git stash apply ${stashRef}" manually to restore the correct stash, then "git stash drop ${stashRef}" after recovery.`
      : `Run "git stash list" to find the matching GSD preflight stash before restoring manually.`;
    const msg = `git stash apply ${stashRef ?? ""}`.trim() + ` failed after merge of milestone ${milestoneId}: ${err instanceof Error ? err.message : String(err)}. ${restoreHint}`;
    logWarning("preflight", msg);
    notify(msg, "warning");
    return {
      restored: false,
      needsManualRecovery: true,
      message: msg,
      ...(stashRef ? { stashRef } : {}),
      resolution: "manual-recovery",
    };
  }
}
