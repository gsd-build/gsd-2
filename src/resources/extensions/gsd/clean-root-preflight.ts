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
 *  - git stash push / git stash pop only — no custom stash management layer
 *  - Stash/pop errors are logged but MUST NOT block the merge itself
 *  - Fast-path status check — clean trees pay no extra cost
 */

import { execFileSync } from "node:child_process";
import { GIT_NO_PROMPT_ENV } from "./git-constants.js";
import { logWarning } from "./workflow-logger.js";
import { nativeHasChanges } from "./native-git-bridge.js";

export interface PreflightResult {
  /** true when a stash was pushed and postflightPopStash should be called */
  stashPushed: boolean;
  /** Unique marker embedded in the stash message for targeted restoration */
  stashMarker?: string;
  /** human-readable summary of what happened (empty string for clean trees) */
  summary: string;
}

export interface PostflightResult {
  restored: boolean;
  needsManualRecovery: boolean;
  message: string;
  stashRef?: string;
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
    return {
      stashPushed: true,
      stashMarker,
      summary: `Stashed uncommitted changes before merge (milestone ${milestoneId}).`,
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
    execFileSync("git", ["stash", "pop", stashRef], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
    });
    const msg = `Restored stashed changes after milestone ${milestoneId} merge.`;
    notify(msg, "info");
    return {
      restored: true,
      needsManualRecovery: false,
      message: msg,
      stashRef,
    };
  } catch (err) {
    // Pop conflicts mean the merged code collides with the stashed changes.
    // Log a warning — the user needs to resolve manually, but the merge succeeded.
    const restoreHint = stashRef
      ? `Run "git stash pop ${stashRef}" or "git stash apply ${stashRef}" manually to restore the correct stash.`
      : `Run "git stash list" to find the matching GSD preflight stash before restoring manually.`;
    const msg = `git stash pop ${stashRef ?? ""}`.trim() + ` failed after merge of milestone ${milestoneId}: ${err instanceof Error ? err.message : String(err)}. ${restoreHint}`;
    logWarning("preflight", msg);
    notify(msg, "warning");
    return {
      restored: false,
      needsManualRecovery: true,
      message: msg,
      ...(stashRef ? { stashRef } : {}),
    };
  }
}
