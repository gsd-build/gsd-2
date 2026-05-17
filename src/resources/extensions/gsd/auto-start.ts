// Project/App: GSD-2
// File Purpose: Auto-mode bootstrap, worktree recovery, and fresh-start initialization.
/**
 * Auto-mode bootstrap — fresh-start initialization path.
 *
 * Git/state bootstrap, crash lock detection, debug init, worktree recovery,
 * guided flow gate, session init, worktree lifecycle, DB lifecycle,
 * preflight validation.
 *
 * Extracted from startAuto() in auto.ts. The resume path (s.paused)
 * remains in auto.ts — this module handles only the fresh-start path.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@gsd/pi-coding-agent";
import { deriveState } from "./state.js";
import { loadFile, getManifestStatus } from "./files.js";
import type { InterruptedSessionAssessment } from "./interrupted-session.js";
import {
  loadEffectiveGSDPreferences,
  resolveSkillDiscoveryMode,
  getIsolationMode,
} from "./preferences.js";
import { ensureGsdSymlink, isInheritedRepo, validateProjectId } from "./repo-identity.js";
import { migrateToExternalState, recoverFailedMigration } from "./migrate-external.js";
import { collectSecretsFromManifest } from "../get-secrets-from-user.js";
import { gsdRoot, resolveMilestoneFile } from "./paths.js";
import { invalidateAllCaches } from "./cache.js";
import { writeLock, clearLock, readCrashLock, isLockProcessAlive } from "./crash-recovery.js";
import {
  acquireSessionLock,
  releaseSessionLock,
  updateSessionLock,
} from "./session-lock.js";
import { ensureGitignore, untrackRuntimeFiles } from "./gitignore.js";
import {
  nativeIsRepo,
  nativeInit,
  nativeAddAll,
  nativeCommit,
  nativeGetCurrentBranch,
  nativeDetectMainBranch,
  nativeBranchList,
  nativeBranchExists,
  nativeBranchListMerged,
  nativeBranchDelete,
  nativeWorktreeRemove,
  nativeCommitCountBetween,
} from "./native-git-bridge.js";
import { GitServiceImpl } from "./git-service.js";
import {
  captureIntegrationBranch,
  detectWorktreeName,
  setActiveMilestoneId,
} from "./worktree.js";
import { getAutoWorktreePath, isInAutoWorktree, checkoutBranchWithStashGuard } from "./auto-worktree.js";
import { readResourceVersion, cleanStaleRuntimeUnits } from "./auto-worktree.js";
import { worktreePath as getWorktreeDir, isInsideWorktreesDir } from "./worktree-manager.js";
import { emitWorktreeOrphaned } from "./worktree-telemetry.js";
import { initMetrics } from "./metrics.js";
import { initRoutingHistory } from "./routing-history.js";
import { restoreHookState, resetHookState } from "./post-unit-hooks.js";
import { resetProactiveHealing, setLevelChangeCallback } from "./doctor-proactive.js";
import { snapshotSkills } from "./skill-discovery.js";
import { isDbAvailable, getMilestone, getAllMilestones, openDatabase, getDbStatus } from "./gsd-db.js";
import { isClosedStatus } from "./status-guards.js";
import { classifyMilestoneSummaryContent } from "./milestone-summary-classifier.js";
import { auditOrphanedPreflightStashes } from "./orphan-stash-audit.js";

import {
  debugLog,
  enableDebug,
  isDebugEnabled,
  getDebugLogPath,
} from "./debug-logger.js";
import { logWarning, logError } from "./workflow-logger.js";
import { parseUnitId } from "./unit-id.js";
import type { AutoSession } from "./auto/session.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { sep as pathSep } from "node:path";

import { resolveProjectRootDbPath } from "./bootstrap/dynamic-tools.js";
import { validateDirectory } from "./validate-directory.js";
import {
  isCustomProvider,
  resolveDefaultSessionModel,
  resolveDynamicRoutingConfig,
} from "./preferences-models.js";
import type { WorktreeLifecycle } from "./worktree-lifecycle.js";
import { getSessionModelOverride } from "./session-model-override.js";

export interface BootstrapDeps {
  shouldUseWorktreeIsolation: (basePath?: string) => boolean;
  registerSigtermHandler: (basePath: string) => void;
  registerAutoWorkerForSession: (basePath: string) => void;
  lockBase: () => string;
  buildLifecycle: () => WorktreeLifecycle;
}

export function resolveIsolationNoneBranchCheckout(
  currentBranch: string,
  integrationBranch: string,
  isolationMode: string,
  isRepo: boolean,
): string | null {
  if (!isRepo || isolationMode !== "none") return null;
  return currentBranch.startsWith("milestone/") ? integrationBranch : null;
}

/**
 * Bootstrap a fresh auto-mode session. Handles everything from git init
 * through secrets collection, returning when ready for the first
 * dispatchNextUnit call.
 *
 * Returns false if the bootstrap aborted (e.g., guided flow returned,
 * concurrent session detected). Returns true when ready to dispatch.
 */

// Guard constant for consecutive bootstrap attempts that found phase === "complete".
// Counter moved to AutoSession.consecutiveCompleteBootstraps so s.reset() clears it.
const MAX_CONSECUTIVE_COMPLETE_BOOTSTRAPS = 2;

export function hasGitIndexLockForTest(basePath: string): boolean {
  return existsSync(join(basePath, ".git", "index.lock"));
}

export function _shouldAbortBootstrapForUnavailableDbForTest(
  gsdDbPath: string,
  dbAvailable: boolean,
  pathExists: (path: string) => boolean = existsSync,
): boolean {
  return pathExists(gsdDbPath) && !dbAvailable;
}

export async function openProjectDbIfPresent(basePath: string): Promise<void> {
  const gsdDbPath = resolveProjectRootDbPath(basePath);
  if (!existsSync(gsdDbPath) || isDbAvailable()) return;

  try {
    openDatabase(gsdDbPath);
  } catch (err) {
    logWarning("engine", `gsd-db: failed to open existing database: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Audit for orphaned milestone branches at bootstrap.
 *
 * After a milestone completes, the teardown step (merge branch → main,
 * delete branch, remove worktree) runs as a post-completion engine step.
 * If the session ends between completion and teardown, the branch and
 * worktree are orphaned — the DB says "complete" so auto-mode won't
 * re-enter the milestone, and the teardown is never retried.
 *
 * This audit runs on every fresh bootstrap to catch that gap:
 * 1. Lists all local `milestone/*` branches.
 * 2. For each, checks if the milestone's DB status is "complete".
 * 3. If the branch is already merged into main → deletes the branch
 *    and cleans up any orphaned worktree directory (safe, no data loss).
 * 4. If the branch is NOT merged → preserves it and warns the user
 *    so they can merge manually (data safety first).
 *
 * Returns a summary of actions taken for the caller to surface via notify.
 */
/**
 * Decide which survivor-branch recovery action bootstrapAutoSession must
 * run for the current (hasSurvivorBranch, phase) combination. Extracted
 * from the inline chain at `bootstrapAutoSession` (around line 604) so
 * the decision table is testable without constructing a full session.
 *
 * - `none`     — no survivor, or phase doesn't call for recovery. Fall
 *                through to normal bootstrap flow.
 * - `discuss`  — survivor + phase=needs-discussion (#1726). Route to
 *                showSmartEntry.
 * - `finalize` — survivor + phase=complete (#2358). Run mergeAndExit to
 *                merge the milestone branch and clear the worktree.
 *
 * Any other phase with a survivor (pre-planning, planning, executing…)
 * returns `none` — the caller continues its normal flow and the
 * survivor branch participates in whatever auto-mode happens next.
 */
export type SurvivorAction = "none" | "discuss" | "finalize";

export function decideSurvivorAction(
  hasSurvivorBranch: boolean,
  phase: string | null | undefined,
): SurvivorAction {
  if (!hasSurvivorBranch) return "none";
  if (phase === "needs-discussion") return "discuss";
  if (phase === "complete") return "finalize";
  return "none";
}

export function auditOrphanedMilestoneBranches(
  basePath: string,
  isolationMode: "worktree" | "branch" | "none",
  gitDeps: {
    branchList?: typeof nativeBranchList;
    branchExists?: typeof nativeBranchExists;
  } = {},
): { recovered: string[]; warnings: string[] } {
  const recovered: string[] = [];
  const warnings: string[] = [];
  const branchList = gitDeps.branchList ?? nativeBranchList;
  const branchExists = gitDeps.branchExists ?? nativeBranchExists;

  // Skip in none mode — no milestone branches are created
  if (isolationMode === "none") return { recovered, warnings };

  // Skip if DB not available — can't determine completion status
  if (!isDbAvailable()) return { recovered, warnings };

  let milestoneBranches: string[];
  let milestoneBranchListAvailable = true;
  try {
    milestoneBranches = branchList(basePath, "milestone/*");
  } catch {
    milestoneBranchListAvailable = false;
    // git branch list failed — fall through with an empty branch set so the
    // branch-less orphan pass can still run after per-milestone verification.
    milestoneBranches = [];
  }

  // Detect main branch for merge-check
  let mainBranch: string;
  try {
    mainBranch = nativeDetectMainBranch(basePath);
  } catch {
    mainBranch = "main";
  }

  // Get branches already merged into main
  let mergedBranches: Set<string>;
  try {
    mergedBranches = new Set(nativeBranchListMerged(basePath, mainBranch, "milestone/*"));
  } catch {
    mergedBranches = new Set();
  }

  for (const branch of milestoneBranches) {
    const milestoneId = branch.replace(/^milestone\//, "");
    const milestone = getMilestone(milestoneId);

    if (!milestone) continue;

    const isMerged = mergedBranches.has(branch);

    // #4762 — in-progress milestone branch with unmerged commits ahead of
    // main. This is the pre-completion orphan case: auto-mode exited without
    // completing the milestone (pause, stop, crash, merge error, blocker) and
    // work is stranded on the branch or in the worktree. Data safety first:
    // we never delete or touch; we just surface a warning so the user knows
    // where to look.
    //
    // Gate on isClosedStatus so we only warn about genuinely open milestones.
    // Parked/other closed statuses go through the legacy complete/unmerged
    // path below where appropriate.
    if (!isClosedStatus(milestone.status)) {
      if (isMerged) continue; // nothing to recover
      let commitsAhead = 0;
      try {
        commitsAhead = nativeCommitCountBetween(basePath, mainBranch, branch);
      } catch {
        // Rev-walk failure — skip rather than noise
        continue;
      }
      if (commitsAhead === 0) continue;

      const wtDir = getWorktreeDir(basePath, milestoneId);
      const wtDirExists = existsSync(wtDir);
      const wtSuffix = wtDirExists
        ? ` Worktree directory at .gsd/worktrees/${milestoneId}/ holds the live work.`
        : "";
      warnings.push(
        `Branch ${branch} has ${commitsAhead} commit(s) ahead of ${mainBranch} for in-progress milestone ${milestoneId}.` +
        wtSuffix +
        ` Run \`/gsd auto\` to resume, or merge manually if abandoning.`,
      );

      // #4764 telemetry
      try {
        emitWorktreeOrphaned(basePath, milestoneId, {
          reason: "in-progress-unmerged",
          commitsAhead,
          worktreeDirExists: wtDirExists,
        });
      } catch (err) {
        logWarning("engine", `worktree-orphaned telemetry failed for ${milestoneId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      continue;
    }

    // Only the "complete" status participates in the merged/unmerged cleanup
    // paths below — other closed statuses (parked, etc.) are intentionally
    // left alone.
    if (milestone.status !== "complete") continue;

    if (isMerged) {
      // Branch is merged — safe to delete branch and clean up worktree dir
      try {
        nativeBranchDelete(basePath, branch, true);
        recovered.push(`Deleted merged branch ${branch} for completed milestone ${milestoneId}.`);
      } catch (err) {
        warnings.push(`Failed to delete merged branch ${branch}: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Clean up orphaned worktree directory if it exists
      const wtDir = getWorktreeDir(basePath, milestoneId);
      if (existsSync(wtDir)) {
        // Try git worktree remove first (handles registered worktrees)
        try {
          nativeWorktreeRemove(basePath, wtDir, true);
        } catch (e) {
          // Not a registered worktree — expected for orphaned dirs
          logWarning("engine", `worktree remove failed (expected for orphaned dirs): ${e instanceof Error ? e.message : String(e)}`);
        }

        // If the directory still exists after git worktree remove (either it
        // wasn't registered or the remove was a noop), fall back to direct
        // filesystem removal — but only inside .gsd/worktrees/ for safety (#2365).
        if (existsSync(wtDir)) {
          if (isInsideWorktreesDir(basePath, wtDir)) {
            try {
              rmSync(wtDir, { recursive: true, force: true });
              recovered.push(`Removed orphaned worktree directory for ${milestoneId}.`);
            } catch (err2) {
              warnings.push(`Failed to remove worktree directory for ${milestoneId}: ${err2 instanceof Error ? err2.message : String(err2)}`);
            }
          } else {
            warnings.push(`Orphaned worktree directory for ${milestoneId} is outside .gsd/worktrees/ — skipping removal for safety.`);
          }
        } else {
          recovered.push(`Removed orphaned worktree directory for ${milestoneId}.`);
        }
      }
    } else {
      // Branch is NOT merged — preserve for safety, warn the user
      warnings.push(
        `Branch ${branch} exists for completed milestone ${milestoneId} but is NOT merged into ${mainBranch}. ` +
        `This may contain unmerged work. Merge manually or run \`/gsd doctor fix\` to resolve.`,
      );

      // #4764 telemetry
      try {
        emitWorktreeOrphaned(basePath, milestoneId, {
          reason: "complete-unmerged",
          worktreeDirExists: existsSync(getWorktreeDir(basePath, milestoneId)),
        });
      } catch (err) {
        logWarning("engine", `worktree-orphaned telemetry failed for ${milestoneId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Second pass (#5879): catch worktree directories stranded by a previous
  // audit that deleted the milestone/* branch but failed to remove the
  // directory (or the dir was orphaned by a separate path entirely, e.g.
  // postflight-stash-restore-failed during closeout). The branch-keyed loop
  // above is invisible to these cases — `nativeBranchList` returns nothing
  // for the milestone, so the dir-cleanup block at line ~310 is never
  // reached.
  //
  // Keyed on milestones whose DB status is `complete`. We do not iterate
  // over arbitrary directories under .gsd/worktrees/ to avoid touching
  // dirs that belong to an in-progress milestone whose branch was deleted
  // separately — those are handled by the in-progress orphan path above
  // when the branch is present, and by `/gsd doctor` when it is not.
  const seenMilestoneIds = new Set(
    milestoneBranches.map((branch) => branch.replace(/^milestone\//, "")),
  );
  let completedMilestones: readonly { id: string; status: string }[] = [];
  try {
    completedMilestones = getAllMilestones();
  } catch {
    // DB read failure — skip the second pass; the first pass is still useful.
    completedMilestones = [];
  }
  for (const m of completedMilestones) {
    if (m.status !== "complete") continue;
    if (seenMilestoneIds.has(m.id)) continue; // already processed in the branch loop
    if (!milestoneBranchListAvailable) {
      try {
        if (branchExists(basePath, `milestone/${m.id}`)) continue;
      } catch (err) {
        warnings.push(
          `Could not verify whether milestone/${m.id} still exists; skipping branch-less worktree cleanup for safety: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
    }
    const wtDir = getWorktreeDir(basePath, m.id);
    if (!existsSync(wtDir)) continue;
    if (!isInsideWorktreesDir(basePath, wtDir)) {
      warnings.push(
        `Orphaned worktree directory for ${m.id} is outside .gsd/worktrees/ — skipping removal for safety.`,
      );
      continue;
    }
    // Try `git worktree remove` first in case the dir is still registered
    // (defensive — usually it is not when we reach this branch-less pass).
    try {
      nativeWorktreeRemove(basePath, wtDir, true);
    } catch (e) {
      logWarning(
        "engine",
        `worktree remove failed (expected for branch-less orphans): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (existsSync(wtDir)) {
      try {
        rmSync(wtDir, { recursive: true, force: true });
        recovered.push(`Removed orphaned worktree directory for ${m.id} (branch already deleted).`);
      } catch (err) {
        warnings.push(
          `Failed to remove orphaned worktree directory for ${m.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      recovered.push(`Removed orphaned worktree directory for ${m.id} (branch already deleted).`);
    }
  }

  return { recovered, warnings };
}

/**
 * Pure decision function for picking which orphan milestone the auto-loop
 * should resume the merge transition for. Extracted so it can be unit-tested
 * without spinning up a git repo or a SQLite DB.
 *
 * Returns the lexicographically-greatest milestone id (e.g. "M002" beats
 * "M001") whose branch is unmerged AND has commits ahead of main AND whose
 * status is `complete`. Lex-ordering matches the project's M00x convention,
 * which is the most-recently-completed milestone in practice.
 * `isComplete` errors propagate; `commitsAhead` errors are treated as 0.
 */
export function _selectResumableMilestone(
  branchNames: readonly string[],
  mergedBranches: ReadonlySet<string>,
  isComplete: (milestoneId: string) => boolean,
  commitsAhead: (branch: string) => number,
): string | null {
  const candidates: string[] = [];
  for (const branch of branchNames) {
    if (!branch.startsWith("milestone/")) continue;
    const milestoneId = branch.slice("milestone/".length);
    if (mergedBranches.has(branch)) continue;
    if (!isComplete(milestoneId)) continue;
    let ahead = 0;
    try {
      ahead = commitsAhead(branch);
    } catch {
      continue;
    }
    if (ahead <= 0) continue;
    candidates.push(milestoneId);
  }
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[candidates.length - 1];
}

/**
 * Find the most-recent completed milestone whose branch still has unmerged
 * commits ahead of the integration branch. Used by `bootstrapAutoSession`
 * to seed `s.currentMilestoneId` so the auto-loop's transition guard at
 * `phases.ts:730` fires on the first iteration after a process restart —
 * without this, the in-memory-only `s.currentMilestoneId` is `null` after
 * restart, the guard short-circuits, and the orphaned milestone branch
 * never gets merged into main (#5538-followup).
 *
 * Returns null when isolation is `none`, the DB is unavailable, or no
 * orphan candidate exists. All git failures degrade silently — startup
 * must never block on this defensive lookup.
 */
export function findUnmergedCompletedMilestone(
  basePath: string,
  isolationMode: "worktree" | "branch" | "none",
): string | null {
  if (isolationMode === "none") return null;
  if (!isDbAvailable()) return null;

  let milestoneBranches: string[];
  try {
    milestoneBranches = nativeBranchList(basePath, "milestone/*");
  } catch {
    return null;
  }
  if (milestoneBranches.length === 0) return null;

  let mainBranch: string;
  try {
    mainBranch = nativeDetectMainBranch(basePath);
  } catch {
    mainBranch = "main";
  }

  let mergedBranches: Set<string>;
  try {
    mergedBranches = new Set(
      nativeBranchListMerged(basePath, mainBranch, "milestone/*"),
    );
  } catch {
    mergedBranches = new Set();
  }

  return _selectResumableMilestone(
    milestoneBranches,
    mergedBranches,
    (milestoneId) => {
      const row = getMilestone(milestoneId);
      return !!row && row.status === "complete";
    },
    (branch) => nativeCommitCountBetween(basePath, mainBranch, branch),
  );
}

/**
 * Run `mergeAndExit` for a milestone whose worktree/branch finalization
 * never completed in a prior session — the active-milestone in phase
 * `complete` with a survivor `milestone/<id>` branch still around.
 *
 * Wraps the call in try/catch so a thrown error from `_mergeBranchMode`
 * (made fail-loud in commit 68ef58a3c) is converted into a user-facing
 * error notify instead of an unhandled exception that propagates through
 * `bootstrapAutoSession` to the slash-command caller's `.catch` block.
 *
 * Returns `{ merged: true }` on success; `{ merged: false, error }` on
 * throw — caller decides whether to abort bootstrap.
 */
export function _finalizeSurvivorBranch(
  lifecycle: WorktreeLifecycle,
  milestoneId: string,
  ui: { notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void },
): { merged: boolean; error?: unknown } {
  ui.notify(
    `Milestone ${milestoneId} is complete but branch/worktree was not finalized. Running merge now.`,
    "info",
  );
  const result = lifecycle.exitMilestone(
    milestoneId,
    { merge: true },
    { notify: ui.notify.bind(ui) },
  );
  if (result.ok) return { merged: true };
  const err = result.cause instanceof Error ? result.cause : new Error(String(result.cause));
  const msg = err.message;
  ui.notify(
    `Survivor-branch finalization for ${milestoneId} failed: ${msg}. Resolve manually and re-run /gsd auto.`,
    "error",
  );
  return { merged: false, error: err };
}

/**
 * Merge a milestone whose DB row is `complete` but whose branch is still
 * unmerged into the integration branch. Called from `bootstrapAutoSession`
 * for orphans surfaced by `findUnmergedCompletedMilestone`.
 *
 * Notifies the user before and after, swallowing errors so a transient git
 * failure never blocks bootstrap. Returns `{ merged: true }` when the
 * underlying `mergeAndExit` completes; `{ merged: false, error }` on throw.
 *
 * Extracted to keep `bootstrapAutoSession` testable: the merge call and the
 * notify shape are exercised against a mock resolver in
 * `tests/orphan-merge-bootstrap.test.ts`.
 */
export function _mergeOrphanCompletedMilestone(
  lifecycle: WorktreeLifecycle,
  orphanId: string,
  ui: { notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void },
): { merged: boolean; error?: unknown } {
  ui.notify(`Detected unmerged completed milestone ${orphanId}. Merging now.`, "info");
  const result = lifecycle.exitMilestone(
    orphanId,
    { merge: true },
    { notify: ui.notify.bind(ui) },
  );
  if (result.ok) return { merged: true };
  const err = result.cause instanceof Error ? result.cause : new Error(String(result.cause));
  const msg = err.message;
  ui.notify(
    `Could not merge orphan milestone ${orphanId}: ${msg}. Resolve manually and re-run /gsd auto.`,
    "warning",
  );
  return { merged: false, error: err };
}

export async function bootstrapAutoSession(
  s: AutoSession,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  base: string,
  verboseMode: boolean,
  requestedStepMode: boolean,
  deps: BootstrapDeps,
  interrupted: InterruptedSessionAssessment,
): Promise<boolean> {
  const {
    shouldUseWorktreeIsolation,
    registerSigtermHandler,
    registerAutoWorkerForSession,
    lockBase,
    buildLifecycle,
  } = deps;

  const dirCheck = validateDirectory(base);
  if (dirCheck.severity === "blocked") {
    ctx.ui.notify(dirCheck.reason!, "error");
    return false;
  }

  const startupLock = readCrashLock(base);
  if (startupLock && !isLockProcessAlive(startupLock)) {
    clearLock(base);
    ctx.ui.notify("Cleared stale auto-mode worker state.", "info");
  }

  const lockResult = acquireSessionLock(base);
  if (!lockResult.acquired) {
    ctx.ui.notify(lockResult.reason, "error");
    return false;
  }

  function releaseLockAndReturn(): false {
    releaseSessionLock(base);
    clearLock(base);
    return false;
  }

  // Capture the user's session model before guided-flow dispatch can apply a
  // phase-specific planning model for a discuss turn (#2829).
  //
  // Precedence:
  // 1) Explicit session override via /gsd model (this session)
  // 2) Current session model from settings/session restore (if provider ready)
  // 3) GSD model preferences from PREFERENCES.md (validated against live auth)
  //
  // This preserves #3517 defaults while honoring explicit runtime model
  // selection for subsequent /gsd runs in the same session.
  //
  // Exception (#4122): when the session provider is a custom provider declared
  // in ~/.gsd/agent/models.json (Ollama, vLLM, OpenAI-compatible proxy, etc.),
  // PREFERENCES.md is skipped entirely. PREFERENCES.md cannot reference custom
  // providers, so honoring it would silently reroute auto-mode to a built-in
  // provider the user is not logged into and surface as "Not logged in · Please
  // run /login" before pausing and resetting to claude-code/claude-sonnet-4-6.
  const manualSessionOverride = getSessionModelOverride(ctx.sessionManager.getSessionId());
  const sessionProviderIsCustom = isCustomProvider(ctx.model?.provider);
  const preferredModel = sessionProviderIsCustom
    ? null
    : resolveDefaultSessionModel(ctx.model?.provider);
  // Validate the preferred model against the live registry + provider auth so
  // an unconfigured PREFERENCES.md entry (no API key / OAuth) can't become the
  // start-model snapshot. Without this, every subsequent unit would try to
  // fall back to an unusable model.
  let validatedPreferredModel: { provider: string; id: string } | undefined;
  if (preferredModel) {
    const { resolveModelId } = await import("./auto-model-selection.js");
    const available = ctx.modelRegistry.getAvailable();
    const match = resolveModelId(
      `${preferredModel.provider}/${preferredModel.id}`,
      available,
      ctx.model?.provider,
    );
    if (match) {
      validatedPreferredModel = { provider: match.provider, id: match.id };
    } else {
      ctx.ui.notify(
        `Preferred model ${preferredModel.provider}/${preferredModel.id} from PREFERENCES.md is not configured; falling back to session default.`,
        "warning",
      );
    }
  }
  const sessionModelReady =
    ctx.model && ctx.modelRegistry.isProviderRequestReady(ctx.model.provider);
  const currentSessionModel = (sessionModelReady && ctx.model)
    ? { provider: ctx.model.provider, id: ctx.model.id }
    : null;
  const startThinkingSnapshot = pi.getThinkingLevel();
  const startModelSnapshot = manualSessionOverride
    ?? currentSessionModel
    ?? validatedPreferredModel
    ?? null;

  try {
    // Validate GSD_PROJECT_ID early so the user gets immediate feedback
    const customProjectId = process.env.GSD_PROJECT_ID;
    if (customProjectId && !validateProjectId(customProjectId)) {
      ctx.ui.notify(
        `GSD_PROJECT_ID must contain only alphanumeric characters, hyphens, and underscores. Got: "${customProjectId}"`,
        "error",
      );
      return releaseLockAndReturn();
    }

    const gitLockFile = join(base, ".git", "index.lock");
    if (existsSync(gitLockFile)) {
      ctx.ui.notify(
        "Git index lock is present at .git/index.lock. Another git process may be running; resolve the lock before starting GSD.",
        "error",
      );
      debugLog("git-index-lock-present-preflight", { path: gitLockFile });
      return releaseLockAndReturn();
    }

    // Ensure git repo exists *locally* at base.
    // nativeIsRepo() uses `git rev-parse` which traverses up to parent dirs,
    // so a parent repo can make it return true even when base has no .git of
    // its own. Check for a local .git instead (defense-in-depth for the case
    // where isInheritedRepo() returns a false negative, e.g. stale .gsd at
    // the parent git root). See #2393 and related issue.
    const hasLocalGit = existsSync(join(base, ".git"));
    if (!hasLocalGit || isInheritedRepo(base)) {
      const mainBranch =
        loadEffectiveGSDPreferences(base)?.preferences?.git?.main_branch || "main";
      nativeInit(base, mainBranch);
    }

    // Migrate legacy in-project .gsd/ to external state directory.
    // Migration MUST run before ensureGitignore to avoid adding ".gsd" to
    // .gitignore when .gsd/ is git-tracked (data-loss bug #1364).
    recoverFailedMigration(base);
    const migration = migrateToExternalState(base);
    if (migration.error) {
      ctx.ui.notify(`External state migration warning: ${migration.error}`, "warning");
    }
    // Ensure symlink exists (handles fresh projects and post-migration)
    ensureGsdSymlink(base);

    // Ensure .gitignore has baseline patterns.
    // ensureGitignore checks for git-tracked .gsd/ files and skips the
    // ".gsd" pattern if the project intentionally tracks .gsd/ in git.
    const gitPrefs = loadEffectiveGSDPreferences(base)?.preferences?.git;
    const manageGitignore = gitPrefs?.manage_gitignore;
    ensureGitignore(base, { manageGitignore });
    if (manageGitignore !== false) untrackRuntimeFiles(base);

    // Bootstrap milestones/ if it doesn't exist.
    // Check milestones/ directly — ensureGsdSymlink above already created .gsd/,
    // so checking .gsd/ existence would be dead code (#2942).
    const gsdDir = join(base, ".gsd");
    const milestonesPath = join(gsdDir, "milestones");
    if (!existsSync(milestonesPath)) {
      mkdirSync(milestonesPath, { recursive: true });
      try {
        nativeAddAll(base);
        nativeCommit(base, "chore: init gsd");
      } catch (err) {
        /* nothing to commit */
        logWarning("engine", `mkdir failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    {
      const { prepareWorkflowMcpForProject } = await import("./workflow-mcp-auto-prep.js");
      prepareWorkflowMcpForProject(ctx, base);
    }

    // Initialize GitServiceImpl
    s.gitService = new GitServiceImpl(
      s.basePath,
      loadEffectiveGSDPreferences(base)?.preferences?.git ?? {},
    );

    // ── Debug mode ──
    if (!isDebugEnabled() && process.env.GSD_DEBUG === "1") {
      enableDebug(base);
    }
    if (isDebugEnabled()) {
      const { isNativeParserAvailable } =
        await import("./native-parser-bridge.js");
      debugLog("debug-start", {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        model: ctx.model?.id ?? "unknown",
        provider: ctx.model?.provider ?? "unknown",
        nativeParser: isNativeParserAvailable(),
        cwd: base,
      });
      ctx.ui.notify(`Debug logging enabled → ${getDebugLogPath()}`, "info");
    }

    if (interrupted.classification !== "recoverable") {
      s.pendingCrashRecovery = null;
    }

    // Invalidate caches before initial state derivation
    invalidateAllCaches();

    // Open the project-root DB before deriveState so DB-backed state
    // derivation (queue-order, task status) works on a cold start (#2841).
    // Must happen before cleanStaleRuntimeUnits so the cleanup predicate can
    // consult DB status and avoid clearing runtime units for milestones that
    // only have a failure-path SUMMARY on disk (#4663).
    await openProjectDbIfPresent(base);
    registerAutoWorkerForSession(base);

    // Clean stale runtime unit files for completed milestones (#887).
    // DB-authoritative: when DB is available, require DB status to be closed
    // before clearing runtime units. A SUMMARY file alone is no longer
    // trusted as proof of completion (#4663). Fall back to SUMMARY-file
    // presence only when DB is unavailable (legacy/pre-migration).
    cleanStaleRuntimeUnits(
      gsdRoot(base),
      (mid) => {
        if (isDbAvailable()) {
          const row = getMilestone(mid);
          return !!row && isClosedStatus(row.status);
        }
        const summaryFile = resolveMilestoneFile(base, mid, "SUMMARY");
        if (!summaryFile) return false;
        try {
          return classifyMilestoneSummaryContent(readFileSync(summaryFile, "utf-8")) !== "failure";
        } catch {
          return false;
        }
      },
    );

    // ── Orphaned milestone branch audit ──
    // Catches completed milestones whose teardown (merge + branch delete)
    // was lost due to session ending between completion and teardown.
    // Must run after DB open and before worktree entry.
    try {
      const auditResult = auditOrphanedMilestoneBranches(base, getIsolationMode(base));
      for (const msg of auditResult.recovered) {
        ctx.ui.notify(`Orphan audit: ${msg}`, "info");
      }
      for (const msg of auditResult.warnings) {
        ctx.ui.notify(`Orphan audit: ${msg}`, "warning");
      }
      if (auditResult.recovered.length > 0) {
        debugLog("orphan-audit", { recovered: auditResult.recovered, warnings: auditResult.warnings });
      }
    } catch (err) {
      // Non-fatal — the audit is defensive, never block bootstrap
      logWarning("bootstrap", `orphaned milestone branch audit failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── Orphaned preflight-stash audit (#5538-followup) ──
    // Reapplies pre-merge stashes whose milestone is now complete but whose
    // postflight pop was skipped by an interrupted merge in a prior session.
    // Uses `git stash apply` (not pop) so the entry remains as a backup.
    try {
      if (isDbAvailable()) {
        const stashAudit = auditOrphanedPreflightStashes(base, (milestoneId) => {
          const row = getMilestone(milestoneId);
          return !!row && isClosedStatus(row.status);
        });
        for (const entry of stashAudit.applied) {
          ctx.ui.notify(
            `Orphan audit: applied preflight stash ${entry.stashRef} for completed milestone ${entry.milestoneId}. The stash entry is preserved as a backup.`,
            "info",
          );
        }
        for (const msg of stashAudit.warnings) {
          ctx.ui.notify(`Orphan audit: ${msg}`, "warning");
        }
        if (stashAudit.applied.length > 0) {
          debugLog("orphan-stash-audit", {
            applied: stashAudit.applied,
            warnings: stashAudit.warnings,
          });
        }
      }
    } catch (err) {
      logWarning(
        "bootstrap",
        `orphaned preflight-stash audit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let state = await deriveState(base);

    // Stale worktree state recovery (#654)
    if (
      state.activeMilestone &&
      shouldUseWorktreeIsolation(base) &&
      !detectWorktreeName(base)
    ) {
      const wtPath = getAutoWorktreePath(base, state.activeMilestone.id);
      if (wtPath) {
        state = await deriveState(wtPath);
      }
    }

    // Milestone branch recovery (#601, #2358)
    // Detect survivor milestone branches in both pre-planning and complete phases.
    // In phase=complete, the milestone artifacts exist but finalization (merge,
    // worktree cleanup) was never run — the survivor branch must be merged.
    // Applies to both worktree and branch isolation modes.
    let hasSurvivorBranch = false;
    let survivorMilestoneId = state.activeMilestone?.id ?? null;
    if (!survivorMilestoneId && state.phase === "complete") {
      survivorMilestoneId = findUnmergedCompletedMilestone(base, getIsolationMode(base));
    }
    if (
      survivorMilestoneId &&
      (state.phase === "pre-planning" || state.phase === "complete") &&
      getIsolationMode(base) !== "none" &&
      !detectWorktreeName(base) &&
      !base.includes(`${pathSep}.gsd${pathSep}worktrees${pathSep}`)
    ) {
      const milestoneBranch = `milestone/${survivorMilestoneId}`;
      const { nativeBranchExists } = await import("./native-git-bridge.js");
      hasSurvivorBranch = nativeBranchExists(base, milestoneBranch);
      if (hasSurvivorBranch) {
        ctx.ui.notify(
          `Found prior session branch ${milestoneBranch}. Resuming.`,
          "info",
        );
      }
    }

    // Survivor branch exists but milestone still needs discussion (#1726):
    // The worktree/branch was created but the milestone only has CONTEXT-DRAFT.md.
    // Route to the interactive discussion handler instead of falling through to
    // auto-mode, which would immediately stop with "needs discussion".
    if (decideSurvivorAction(hasSurvivorBranch, state.phase) === "discuss") {
      const { showSmartEntry } = await import("./guided-flow.js");
      await showSmartEntry(ctx, pi, base, { step: requestedStepMode });

      invalidateAllCaches();
      const postState = await deriveState(base);
      if (
        postState.activeMilestone &&
        postState.phase !== "needs-discussion"
      ) {
        state = postState;
        // Discussion succeeded — clear survivor flag so normal flow continues
        hasSurvivorBranch = false;
      } else {
        ctx.ui.notify(
          "Discussion completed but milestone draft was not promoted. Run /gsd to try again.",
          "warning",
        );
        return releaseLockAndReturn();
      }
    }

    // Survivor branch exists and milestone is complete (#2358):
    // The milestone artifacts were written but finalization (merge, worktree
    // cleanup) never ran. Run mergeAndExit to finalize, then re-derive state
    // so the normal "all milestones complete" or "next milestone" path runs.
    // Re-evaluate via the helper — the discuss branch above may have cleared
    // hasSurvivorBranch after a successful promotion.
    if (decideSurvivorAction(hasSurvivorBranch, state.phase) === "finalize") {
      const mid = survivorMilestoneId!;
      const lifecycle = buildLifecycle();
      lifecycle.adoptSessionRoot(base);
      // Commit 68ef58a3c made `_mergeBranchMode` throw on wrong-branch
      // instead of returning false silently. Wrap the call so the throw is
      // converted into an error notify + clean bootstrap abort, not an
      // unhandled exception propagating to the slash-command caller (#5549
      // post-merge audit, R2).
      const finalize = _finalizeSurvivorBranch(lifecycle, mid, ctx.ui);
      if (!finalize.merged) {
        return releaseLockAndReturn();
      }
      invalidateAllCaches();
      state = await deriveState(base);
      // Clear survivor flag — finalization is done
      hasSurvivorBranch = false;
    }

    // ── Orphan-completed-milestone merge (#5538-followup) ──
    // A process killed between `complete-milestone` (DB flip + SUMMARY write)
    // and the loop's transition-guard merge strands the milestone branch
    // forever: `s.currentMilestoneId` is in-memory only, so on the next
    // bootstrap the guard at phases.ts:730 sees `mid === s.currentMilestoneId`
    // and short-circuits.
    //
    // The earlier attempt at this fix seeded `s.currentMilestoneId` to the
    // orphan id pre-state-derivation, but the unconditional assignment at
    // line 948 (`s.currentMilestoneId = state.activeMilestone?.id ?? null`)
    // immediately overwrote the seed. Active-merge is the more durable fix:
    // call `mergeAndExit` directly during bootstrap, then re-derive state so
    // the loop's normal flow continues without an in-memory hint.
    //
    // Mirrors the survivor-finalize block above. Failures degrade to a
    // warning notify so a transient git error doesn't block bootstrap.
    {
      const orphan = findUnmergedCompletedMilestone(base, getIsolationMode(base));
      if (orphan && orphan !== state.activeMilestone?.id) {
        // ADR-016 phase 2 / B4 (#5622): the swap-run-revert protocol for
        // the orphan-merge dance is owned by `adoptOrphanWorktree`. The
        // verb snapshots prior `s.basePath` / `s.originalBasePath`, swaps
        // into the orphan worktree, runs the merge callback under the
        // swap, and reverts (or holds the swap) based on the result.
        // Callers can no longer forget the revert step on failure — the
        // pattern that originally motivated this verb.
        const lifecycle = buildLifecycle();
        const result = lifecycle.adoptOrphanWorktree(orphan, base, () =>
          _mergeOrphanCompletedMilestone(lifecycle, orphan, ctx.ui),
        );
        if (!result.merged) {
          // Verb already restored basePath/originalBasePath to `base` and
          // chdir'd there. Return early.
          return releaseLockAndReturn();
        }
        invalidateAllCaches();
        state = await deriveState(base);
      }
    }

    const effectivePrefs = loadEffectiveGSDPreferences(base)?.preferences;
    const { shouldRunDeepProjectSetup } = await import("./auto-dispatch.js");
    const deepProjectStagePending = shouldRunDeepProjectSetup(
      state,
      effectivePrefs,
      base,
      { hasSurvivorBranch },
    );

    if (deepProjectStagePending) {
      // Deep project-level setup runs before the first milestone exists. Let
      // the auto loop dispatch workflow-preferences / project / requirements
      // units instead of recursing back through showSmartEntry while this
      // bootstrap still holds the session lock.
      s.currentMilestoneId = null;
    }

    if (!hasSurvivorBranch && !deepProjectStagePending) {
      // No active work — start a new milestone via discuss flow
      if (!state.activeMilestone || state.phase === "complete") {
        // Guard against recursive dialog loop (#1348):
        // If we've entered this branch multiple times in quick succession,
        // the discuss workflow isn't producing a milestone. Break the cycle.
        s.consecutiveCompleteBootstraps++;
        if (s.consecutiveCompleteBootstraps > MAX_CONSECUTIVE_COMPLETE_BOOTSTRAPS) {
          s.consecutiveCompleteBootstraps = 0;
          ctx.ui.notify(
            "All milestones are complete and the discussion didn't produce a new one. " +
            "Run /gsd to start a new milestone manually.",
            "warning",
          );
          return releaseLockAndReturn();
        }

        const { showSmartEntry } = await import("./guided-flow.js");
        await showSmartEntry(ctx, pi, base, { step: requestedStepMode });

        // showSmartEntry dispatches via pi.sendMessage() which is fire-and-forget:
        // it queues the message and returns immediately, before the LLM turn runs.
        // Checking postState here would always see the pre-dispatch state, causing
        // the premature "Discussion completed but..." warning (#3420).
        //
        // checkAutoStartAfterDiscuss (in guided-flow.ts) already handles re-entering
        // auto-mode by calling startAutoDetached after the discussion completes.
        // Release the lock and let the async dispatch proceed.
        return releaseLockAndReturn();
      }

      // Active milestone exists but has no roadmap
      if (state.phase === "pre-planning") {
        const mid = state.activeMilestone!.id;
        const contextFile = resolveMilestoneFile(base, mid, "CONTEXT");
        const hasContext = !!(contextFile && (await loadFile(contextFile)));
        if (!hasContext && effectivePrefs?.planning_depth !== "deep") {
          const { showSmartEntry } = await import("./guided-flow.js");
          await showSmartEntry(ctx, pi, base, { step: requestedStepMode });

          // showSmartEntry dispatches via pi.sendMessage() which is fire-and-forget:
          // it queues the message and returns immediately, before the LLM turn runs.
          // Checking postState here fires before the LLM has had a turn, so the
          // pre-planning phase would still appear unchanged and a premature warning
          // would be emitted (#3420).
          //
          // checkAutoStartAfterDiscuss (in guided-flow.ts) already handles re-entering
          // auto-mode by calling startAutoDetached after the discussion completes.
          // Release the lock and let the async dispatch proceed.
          return releaseLockAndReturn();
        }
      }

      // Active milestone has CONTEXT-DRAFT but no full context — needs discussion
      if (state.phase === "needs-discussion") {
        const { showSmartEntry } = await import("./guided-flow.js");
        await showSmartEntry(ctx, pi, base, { step: requestedStepMode });

        invalidateAllCaches();
        const postState = await deriveState(base);
        if (
          postState.activeMilestone &&
          postState.phase !== "needs-discussion"
        ) {
          state = postState;
        } else {
          ctx.ui.notify(
            "Discussion completed but milestone draft was not promoted. Run /gsd to try again.",
            "warning",
          );
          return releaseLockAndReturn();
        }
      }
    }

    // Unreachable safety check
    if (!state.activeMilestone && !deepProjectStagePending) {
      const { showSmartEntry } = await import("./guided-flow.js");
      await showSmartEntry(ctx, pi, base, { step: requestedStepMode });
      return releaseLockAndReturn();
    }

    // Successfully resolved an active milestone — reset the re-entry guard
    s.consecutiveCompleteBootstraps = 0;

    // ── Initialize session state ──
    // Notify shared phase state so subagent conflict checks can fire
    const { activateGSD: activateGSDPhaseState } = await import("../shared/gsd-phase-state.js");
    activateGSDPhaseState();
    s.active = true;
    s.stepMode = requestedStepMode;
    s.verbose = verboseMode;
    s.cmdCtx = ctx;
    // ADR-016 phase 2 / B2 (#5620): single owner of bootstrap basePath
    // mutation. Sets s.basePath = base and s.originalBasePath = base
    // (originalBasePath is empty on a fresh bootstrap).
    buildLifecycle().adoptSessionRoot(base);
    s.unitDispatchCount.clear();
    s.unitRecoveryCount.clear();
    s.lastBudgetAlertLevel = 0;
    s.unitLifetimeDispatches.clear();
    resetHookState();
    restoreHookState(base);
    resetProactiveHealing();
    // Notify user on health level transitions (green→yellow→red and back)
    setLevelChangeCallback((_from, to, summary) => {
      const level = to === "red" ? "error" : to === "yellow" ? "warning" : "info";
      ctx.ui.notify(summary, level as "info" | "warning" | "error");
    });
    s.autoStartTime = Date.now();
    s.resourceVersionOnStart = readResourceVersion();
    s.pendingQuickTasks = [];
    s.currentUnit = null;
    s.currentMilestoneId ??= deepProjectStagePending ? null : state.activeMilestone?.id ?? null;
    s.originalModelId = startModelSnapshot?.id ?? ctx.model?.id ?? null;
    s.originalModelProvider = startModelSnapshot?.provider ?? ctx.model?.provider ?? null;
    s.originalThinkingLevel = startThinkingSnapshot ?? null;

    // Register SIGTERM handler
    registerSigtermHandler(base);

    // Capture integration branch
    if (s.currentMilestoneId) {
      if (getIsolationMode(base) !== "none") {
        captureIntegrationBranch(base, s.currentMilestoneId);
      }
      setActiveMilestoneId(base, s.currentMilestoneId);
    }

    // Guard against stale milestone branch when isolation:none (#3613).
    // A prior session with isolation:branch/worktree may have left HEAD on
    // milestone/<MID>. Auto-checkout back to the integration branch.
    const isolationMode = getIsolationMode(base);
    const isRepo = nativeIsRepo(base);
    if (isolationMode === "none" && isRepo) {
      try {
        const currentBranch = nativeGetCurrentBranch(base);
        const integrationBranch = nativeDetectMainBranch(base);
        const branchToCheckout = resolveIsolationNoneBranchCheckout(
          currentBranch,
          integrationBranch,
          isolationMode,
          isRepo,
        );
        if (branchToCheckout) {
          checkoutBranchWithStashGuard(base, branchToCheckout, "isolation-none-recovery");
          logWarning("bootstrap", `Returned to "${branchToCheckout}" — HEAD was on stale milestone branch "${currentBranch}" (isolation: none does not use milestone branches).`);
        }
      } catch (err) {
        logWarning("bootstrap", `Could not auto-checkout from stale milestone branch: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Auto-worktree setup ──
    // s.originalBasePath was set to `base` by `adoptSessionRoot(base)` above
    // (ADR-016 phase 2 / B2, #5620). The redundant assignment that used to
    // live here is gone.

    const isUnderGsdWorktrees = (p: string): boolean => {
      // Direct layout: /.gsd/worktrees/
      const marker = `${pathSep}.gsd${pathSep}worktrees${pathSep}`;
      if (p.includes(marker)) return true;
      const worktreesSuffix = `${pathSep}.gsd${pathSep}worktrees`;
      if (p.endsWith(worktreesSuffix)) return true;
      // Symlink-resolved layout: /.gsd/projects/<hash>/worktrees/
      const symlinkRe = new RegExp(
        `\\${pathSep}\\.gsd\\${pathSep}projects\\${pathSep}[a-f0-9]+\\${pathSep}worktrees(?:\\${pathSep}|$)`,
      );
      return symlinkRe.test(p);
    };

    if (
      s.currentMilestoneId &&
      getIsolationMode(base) !== "none" &&
      !detectWorktreeName(base) &&
      !isUnderGsdWorktrees(base)
    ) {
      const enterResult = buildLifecycle().enterMilestone(s.currentMilestoneId, {
        notify: ctx.ui.notify.bind(ctx.ui),
      });
      if (!enterResult.ok) {
        s.active = false;
        if (enterResult.reason === "lease-conflict") {
          ctx.ui.notify(
            `Cannot enter milestone ${s.currentMilestoneId}: lease is held by another worker.`,
            "error",
          );
        } else if (enterResult.reason === "creation-failed") {
          ctx.ui.notify(
            `Cannot enter milestone ${s.currentMilestoneId}: worktree/branch creation failed. Isolation is degraded.`,
            "error",
          );
        } else if (enterResult.reason === "isolation-degraded") {
          ctx.ui.notify(
            `Cannot enter milestone ${s.currentMilestoneId}: isolation is degraded from a prior worktree failure. Close processes locking the worktree and retry, or run /gsd doctor fix.`,
            "error",
          );
        } else if (enterResult.reason === "invalid-milestone-id") {
          ctx.ui.notify(
            `Cannot enter milestone ${s.currentMilestoneId}: milestone id is invalid.`,
            "error",
          );
        } else {
          ctx.ui.notify(
            `Auto-mode bootstrap stopped: failed to enter milestone ${s.currentMilestoneId} (${enterResult.reason}).`,
            "error",
          );
        }
        return releaseLockAndReturn();
      }
      if (s.basePath !== base) {
        // Successfully entered worktree — re-register SIGTERM handler at original base
        registerSigtermHandler(s.originalBasePath);
      }
    }

    // ── DB lifecycle ──
    const gsdDbPath = resolveProjectRootDbPath(s.basePath);
    const gsdDirPath = join(s.basePath, ".gsd");
    if (existsSync(gsdDirPath) && !existsSync(gsdDbPath)) {
      try {
        const { openDatabase: openDb } = await import("./gsd-db.js");
        openDb(gsdDbPath);
      } catch (err) {
        logError("engine", `failed to initialize project database: ${(err as Error).message}`);
      }
    }
    if (_shouldAbortBootstrapForUnavailableDbForTest(gsdDbPath, isDbAvailable())) {
      try {
        const { openDatabase: openDb } = await import("./gsd-db.js");
        openDb(gsdDbPath);
      } catch (err) {
        logError("engine", `failed to open existing database: ${(err as Error).message}`);
      }
    }

    // Gate: abort bootstrap if the DB file exists but the provider is
    // still unavailable after both open attempts above. Without this,
    // auto-mode starts but every gsd_task_complete / gsd_slice_complete
    // call returns "db_unavailable", triggering artifact-retry which
    // re-dispatches the same task — producing an infinite loop (#2419).
    if (existsSync(gsdDbPath) && !isDbAvailable()) {
      const dbStatus = getDbStatus();
      const phaseHint = dbStatus.lastPhase === "open"
        ? "The database file could not be opened"
        : dbStatus.lastPhase === "initSchema"
          ? "The database schema could not be initialized"
          : dbStatus.lastPhase === "vacuum-recovery"
            ? "Corruption recovery (VACUUM) failed"
            : dbStatus.attempted
              ? "The database could not be opened (phase unknown)"
              : "The database provider could not be loaded";
      const errorDetail = dbStatus.lastError ? ` (${dbStatus.lastError.message})` : "";
      const providerHint = dbStatus.provider
        ? ` Provider: ${dbStatus.provider}.`
        : " No SQLite provider available — check Node >= 22 or install better-sqlite3.";
      ctx.ui.notify(
        `SQLite database exists but failed to open: ${gsdDbPath}. ${phaseHint}${errorDetail}.${providerHint}`,
        "error",
      );
      return releaseLockAndReturn();
    }

    // Initialize metrics
    initMetrics(s.basePath);

    // Initialize routing history
    initRoutingHistory(s.basePath);

    // Restore the model that was active when auto bootstrap began (#650, #2829).
    if (startModelSnapshot) {
      s.autoModeStartModel = {
        provider: startModelSnapshot.provider,
        id: startModelSnapshot.id,
      };
    }
    s.autoModeStartThinkingLevel = startThinkingSnapshot ?? null;
    s.manualSessionModelOverride = manualSessionOverride ?? null;

    // Apply worker model override from parallel orchestrator (#worker-model).
    // GSD_WORKER_MODEL is injected by the coordinator when parallel.worker_model
    // is configured, so parallel milestone workers use a cheaper model than the
    // coordinator session (e.g. Haiku for execution, Sonnet for planning).
    const workerModelOverride = process.env.GSD_WORKER_MODEL;
    if (workerModelOverride && process.env.GSD_PARALLEL_WORKER === "1") {
      const availableModels = ctx.modelRegistry.getAvailable();
      const { resolveModelId } = await import("./auto-model-selection.js");
      const overrideModel = resolveModelId(workerModelOverride, availableModels, ctx.model?.provider);
      if (overrideModel) {
        const ok = await pi.setModel(overrideModel, { persist: false });
        if (ok) {
          // Update start model so all subsequent units use this as the baseline
          s.autoModeStartModel = { provider: overrideModel.provider, id: overrideModel.id };
          ctx.ui.notify(`Worker model override: ${overrideModel.provider}/${overrideModel.id}`, "info");
        }
      }
    }

    // Snapshot installed skills
    if (resolveSkillDiscoveryMode(base) !== "off") {
      snapshotSkills();
    }

    ctx.ui.setStatus("gsd-auto", s.stepMode ? "next" : "auto");
    ctx.ui.setWidget("gsd-health", undefined);
    const modeLabel = s.stepMode ? "Step-mode" : "Auto-mode";
    const pendingCount = (state.registry ?? []).filter(
      (m) => m.status !== "complete" && m.status !== "parked",
    ).length;
    const scopeMsg =
      deepProjectStagePending
        ? "Will run project setup before milestone planning."
        : pendingCount > 1
        ? `Will loop through ${pendingCount} milestones.`
        : "Will loop until milestone complete.";
    ctx.ui.notify(`${modeLabel} started. ${scopeMsg}`, "info");

    const providerReportedWindow = ctx.model?.contextWindow ?? 0;
    const contextOverride = loadEffectiveGSDPreferences(base)?.preferences.context_window_override;
    if (providerReportedWindow > 500_000 && contextOverride === undefined) {
      ctx.ui.notify(
        `Model reports a ${Math.round(providerReportedWindow / 1000)}K context window. If the provider's real API limit is lower, set context_window_override in .gsd/PREFERENCES.md so wrap-up signals fire before context overflow.`,
        "warning",
      );
    }

    // Show dynamic routing status so users know upfront if models will be
    // downgraded for simple tasks (#3962).
    // Use the same effective logic as selectAndApplyModel: check flat-rate
    // provider suppression and resolve the actual ceiling model.
    const routingConfig = resolveDynamicRoutingConfig();
    const startModelLabel = s.autoModeStartModel
      ? `${s.autoModeStartModel.provider}/${s.autoModeStartModel.id}`
      : ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "default";

    // Flat-rate providers (e.g. GitHub Copilot, claude-code, user-declared
    // subscription proxies, externalCli CLIs) suppress routing at dispatch
    // time (#3453) — reflect that in the banner.  Thread the same
    // FlatRateContext used by selectAndApplyModel so user-declared
    // flat-rate providers and externalCli auto-detection are respected.
    const { isFlatRateProvider, buildFlatRateContext } = await import("./auto-model-selection.js");
    const bannerPrefs = loadEffectiveGSDPreferences(base)?.preferences;
    const effectiveProvider = s.autoModeStartModel?.provider ?? ctx.model?.provider;
    const effectivelyEnabled = routingConfig.enabled
      && (routingConfig.allow_flat_rate_providers
        || !(effectiveProvider && isFlatRateProvider(
          effectiveProvider,
          buildFlatRateContext(effectiveProvider, ctx, bannerPrefs),
        )));

    // The actual ceiling may come from tier_models.heavy, not the start model.
    const effectiveCeiling = (routingConfig.enabled && routingConfig.tier_models?.heavy)
      ? routingConfig.tier_models.heavy
      : startModelLabel;

    if (effectivelyEnabled) {
      ctx.ui.notify(
        `Dynamic routing: enabled — simple tasks may use cheaper models (ceiling: ${effectiveCeiling})`,
        "info",
      );
    } else {
      ctx.ui.notify(
        `Dynamic routing: disabled — all tasks will use ${startModelLabel}`,
        "info",
      );
    }

    updateSessionLock(
      lockBase(),
      "starting",
      s.currentMilestoneId ?? "unknown",
    );
    writeLock(lockBase(), "starting", s.currentMilestoneId ?? "unknown");

    // Secrets collection gate
    const mid = state.activeMilestone?.id;
    if (mid) {
      try {
        const manifestStatus = await getManifestStatus(base, mid, s.originalBasePath || base);
        if (manifestStatus && manifestStatus.pending.length > 0) {
          const result = await collectSecretsFromManifest(base, mid, ctx);
          if (
            result &&
            result.applied &&
            result.skipped &&
            result.existingSkipped
          ) {
            ctx.ui.notify(
              `Secrets collected: ${result.applied.length} applied, ${result.skipped.length} skipped, ${result.existingSkipped.length} already set.`,
              "info",
            );
          } else {
            ctx.ui.notify("Secrets collection skipped.", "info");
          }
        }
      } catch (err) {
        ctx.ui.notify(
          `Secrets collection error: ${err instanceof Error ? err.message : String(err)}. Continuing with next task.`,
          "warning",
        );
      }
    }

    // Pre-flight: validate milestone queue
    try {
      const msDir = join(base, ".gsd", "milestones");
      if (existsSync(msDir)) {
        const milestoneIds = readdirSync(msDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^M\d{3}/.test(d.name))
          .map((d) => d.name.match(/^(M\d{3})/)?.[1] ?? d.name);
        if (milestoneIds.length > 1) {
          const issues: string[] = [];
          for (const id of milestoneIds) {
            // Skip completed/parked milestones — a leftover CONTEXT-DRAFT.md
            // on a finished milestone is harmless residue, not an actionable warning.
            if (isDbAvailable()) {
              const ms = getMilestone(id);
              if (ms?.status === "complete" || ms?.status === "parked") continue;
            }
            const draft = resolveMilestoneFile(base, id, "CONTEXT-DRAFT");
            if (draft)
              issues.push(
                `${id}: has CONTEXT-DRAFT.md (will pause for discussion)`,
              );
          }
          if (issues.length > 0) {
            ctx.ui.notify(
              `Pre-flight: ${milestoneIds.length} milestones queued.\n${issues.map((i) => `  ⚠ ${i}`).join("\n")}`,
              "warning",
            );
          } else {
            ctx.ui.notify(
              `Pre-flight: ${milestoneIds.length} milestones queued. All have full context.`,
              "info",
            );
          }
        }
      }
    } catch (err) {
      /* non-fatal */
      logWarning("engine", `preflight validation failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return true;
  } catch (err) {
    releaseSessionLock(base);
    clearLock(base);
    throw err;
  }
}
