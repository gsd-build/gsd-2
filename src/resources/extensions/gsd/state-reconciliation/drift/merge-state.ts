// Project/App: GSD-2
// File Purpose: ADR-017 unmerged-merge-state drift handler. Relocated from
// auto-recovery.ts as part of issue #5701. Owns:
//   - rebase/cherry-pick/revert leftover cleanup (#4980 HIGH-7)
//   - MERGE_HEAD / SQUASH_MSG reconciliation with auto-resolve of .gsd/
//     conflicts (#530, #2542)

import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { ExtensionContext } from "@gsd/pi-coding-agent";

import { getErrorMessage } from "../../error-utils.js";
import {
  nativeAddPaths,
  nativeCheckoutTheirs,
  nativeCommit,
  nativeConflictFiles,
  nativeMergeAbort,
  nativeRebaseAbort,
  nativeResetHard,
} from "../../native-git-bridge.js";
import type { GSDState } from "../../types.js";
import { logError, logWarning } from "../../workflow-logger.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

export type MergeReconcileResult = "clean" | "reconciled" | "blocked";

type NotifyFn = (
  message: string,
  severity: "info" | "warning" | "error",
) => void;

const SILENT_NOTIFY: NotifyFn = () => {};

function resolveGitDir(basePath: string): string {
  try {
    const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();

    if (gitDir.length > 0) {
      return isAbsolute(gitDir) ? gitDir : resolve(basePath, gitDir);
    }
  } catch (err) {
    logWarning("recovery", `gitdir resolution failed: ${getErrorMessage(err)}`);
  }

  return join(basePath, ".git");
}

/**
 * Best-effort abort of a pending merge/squash and hard-reset to HEAD.
 * Handles both real merges (MERGE_HEAD) and squash merges (SQUASH_MSG).
 */
function abortAndResetMerge(
  basePath: string,
  hasMergeHead: boolean,
  squashMsgPath: string,
): void {
  if (hasMergeHead) {
    try {
      nativeMergeAbort(basePath);
    } catch (err) {
      /* best-effort */
      logWarning(
        "recovery",
        `git merge-abort failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (squashMsgPath) {
    try {
      unlinkSync(squashMsgPath);
    } catch (err) {
      /* best-effort */
      logWarning(
        "recovery",
        `file unlink failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  try {
    nativeResetHard(basePath);
  } catch (err) {
    /* best-effort */
    logError(
      "recovery",
      `git reset failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Detect and abort other in-progress git operations left behind by a SIGKILL'd
 * worker (rebase, cherry-pick, revert). Without this, a killed worker
 * mid-rebase leaves `.git/rebase-merge/` or `.git/CHERRY_PICK_HEAD` and the
 * worktree is wedged until the user manually runs the matching `--abort`.
 *
 * Called before merge-state reconciliation because these states block any
 * subsequent merge/commit operation. (#4980 HIGH-7)
 */
function reconcileOtherInProgressGitOps(
  basePath: string,
  notify: NotifyFn,
): MergeReconcileResult {
  const gitDir = resolveGitDir(basePath);
  const states: Array<{
    label: string;
    indicators: string[];
    abort: () => void;
  }> = [
    {
      label: "rebase",
      indicators: [join(gitDir, "rebase-merge"), join(gitDir, "rebase-apply")],
      abort: () => nativeRebaseAbort(basePath),
    },
    {
      label: "cherry-pick",
      indicators: [join(gitDir, "CHERRY_PICK_HEAD")],
      abort: () => {
        try {
          execFileSync("git", ["cherry-pick", "--abort"], {
            cwd: basePath,
            stdio: ["ignore", "pipe", "pipe"],
            encoding: "utf-8",
          });
        } catch (err) {
          throw new Error(`cherry-pick --abort failed: ${getErrorMessage(err)}`);
        }
      },
    },
    {
      label: "revert",
      indicators: [join(gitDir, "REVERT_HEAD")],
      abort: () => {
        try {
          execFileSync("git", ["revert", "--abort"], {
            cwd: basePath,
            stdio: ["ignore", "pipe", "pipe"],
            encoding: "utf-8",
          });
        } catch (err) {
          throw new Error(`revert --abort failed: ${getErrorMessage(err)}`);
        }
      },
    },
  ];

  let reconciled = false;
  for (const s of states) {
    const present = s.indicators.some((p) => existsSync(p));
    if (!present) continue;
    try {
      s.abort();
      notify(
        `Detected leftover ${s.label} state from prior session — aborted.`,
        "warning",
      );
      reconciled = true;
    } catch (err) {
      logError("recovery", `${s.label} abort failed: ${getErrorMessage(err)}`);
      notify(
        `Detected leftover ${s.label} state but auto-abort failed. ` +
          `Run \`git ${s.label} --abort\` manually before retrying.`,
        "error",
      );
      return "blocked";
    }
  }
  return reconciled ? "reconciled" : "clean";
}

/**
 * Core: detect leftover merge state and reconcile it. Takes a NotifyFn so the
 * legacy reconcileMergeState(basePath, ctx) wrapper and the drift handler can
 * both call it — the drift handler uses SILENT_NOTIFY.
 */
function reconcileMergeStateCore(
  basePath: string,
  notify: NotifyFn,
): MergeReconcileResult {
  // First, abort any rebase/cherry-pick/revert left over from a SIGKILL'd
  // worker. Doing this before the merge-state check unblocks any merge that
  // would otherwise refuse with "you have unfinished operation". (HIGH-7)
  const otherOpsResult = reconcileOtherInProgressGitOps(basePath, notify);
  if (otherOpsResult === "blocked") return "blocked";

  const gitDir = resolveGitDir(basePath);
  const mergeHeadPath = join(gitDir, "MERGE_HEAD");
  const squashMsgPath = join(gitDir, "SQUASH_MSG");
  const hasMergeHead = existsSync(mergeHeadPath);
  const hasSquashMsg = existsSync(squashMsgPath);
  if (!hasMergeHead && !hasSquashMsg) {
    return otherOpsResult === "reconciled" ? "reconciled" : "clean";
  }

  const conflictedFiles = nativeConflictFiles(basePath);
  if (conflictedFiles.length === 0) {
    // All conflicts resolved — finalize the merge/squash commit
    try {
      const commitSha = nativeCommit(basePath, "chore(gsd): reconcile merge state");
      if (commitSha) {
        const mode = hasMergeHead ? "merge" : "squash commit";
        notify(`Finalized leftover ${mode} from prior session.`, "info");
      } else {
        notify(
          "No new commit needed for leftover merge/squash state — already committed.",
          "info",
        );
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      notify(
        `Failed to finalize leftover merge/squash commit: ${errorMessage}`,
        "error",
      );
      return "blocked";
    }
  } else {
    // Still conflicted — try auto-resolving .gsd/ state file conflicts (#530)
    const gsdConflicts = conflictedFiles.filter((f) => f.startsWith(".gsd/"));
    const codeConflicts = conflictedFiles.filter((f) => !f.startsWith(".gsd/"));

    if (gsdConflicts.length > 0 && codeConflicts.length === 0) {
      let resolved = true;
      try {
        nativeCheckoutTheirs(basePath, gsdConflicts);
        nativeAddPaths(basePath, gsdConflicts);
      } catch (e) {
        logError(
          "recovery",
          `auto-resolve .gsd/ conflicts failed: ${(e as Error).message}`,
        );
        resolved = false;
      }
      if (resolved) {
        try {
          nativeCommit(
            basePath,
            "chore: auto-resolve .gsd/ state file conflicts",
          );
          notify(
            `Auto-resolved ${gsdConflicts.length} .gsd/ state file conflict(s) from prior merge.`,
            "info",
          );
        } catch (e) {
          logError(
            "recovery",
            `auto-commit .gsd/ conflict resolution failed: ${(e as Error).message}`,
          );
          resolved = false;
        }
      }
      if (!resolved) {
        abortAndResetMerge(basePath, hasMergeHead, squashMsgPath);
        notify(
          "Detected leftover merge state — auto-resolve failed, cleaned up. Re-deriving state.",
          "warning",
        );
      }
    } else {
      // Code conflicts present — fail safe and preserve any manual resolution
      // work instead of discarding it with merge --abort/reset --hard.
      notify(
        "Detected leftover merge state with unresolved code conflicts. Auto-mode will pause without modifying the worktree so manual conflict resolution is preserved.",
        "error",
      );
      return "blocked";
    }
  }
  return "reconciled";
}

/**
 * Legacy entry point preserved for existing callers (auto.ts, auto/phases.ts
 * via loop-deps, integration tests). New code prefers the drift handler.
 */
export function reconcileMergeState(
  basePath: string,
  ctx: ExtensionContext,
): MergeReconcileResult {
  return reconcileMergeStateCore(basePath, (message, severity) =>
    ctx.ui.notify(message, severity),
  );
}

// ─── Drift Handler ────────────────────────────────────────────────────────────

type MergeStateDrift = Extract<DriftRecord, { kind: "unmerged-merge-state" }>;

function hasMergeStateLeftovers(basePath: string): boolean {
  const gitDir = resolveGitDir(basePath);
  return (
    existsSync(join(gitDir, "MERGE_HEAD")) ||
    existsSync(join(gitDir, "SQUASH_MSG")) ||
    existsSync(join(gitDir, "rebase-merge")) ||
    existsSync(join(gitDir, "rebase-apply")) ||
    existsSync(join(gitDir, "CHERRY_PICK_HEAD")) ||
    existsSync(join(gitDir, "REVERT_HEAD"))
  );
}

export function detectMergeStateDrift(
  _state: GSDState,
  ctx: DriftContext,
): MergeStateDrift[] {
  if (hasMergeStateLeftovers(ctx.basePath)) {
    return [{ kind: "unmerged-merge-state", basePath: ctx.basePath }];
  }
  return [];
}

/**
 * Repair: invoke the reconciliation core with a silent notify. If the
 * underlying reconciliation reports "blocked" (e.g., unresolved code
 * conflicts present), throw so reconcileBeforeDispatch surfaces the drift
 * via ReconciliationFailedError.
 */
export function repairMergeStateDrift(record: MergeStateDrift): void {
  const result = reconcileMergeStateCore(record.basePath, SILENT_NOTIFY);
  if (result === "blocked") {
    throw new Error(
      `Merge state reconciliation blocked for ${record.basePath} — likely unresolved code conflicts. Manual intervention required.`,
    );
  }
}

export const mergeStateHandler: DriftHandler<MergeStateDrift> = {
  kind: "unmerged-merge-state",
  detect: detectMergeStateDrift,
  repair: (record) => {
    repairMergeStateDrift(record);
  },
};
