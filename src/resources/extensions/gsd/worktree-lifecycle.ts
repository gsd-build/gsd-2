// GSD-2 — Worktree Lifecycle module: owns milestone entry/exit lifecycle behind a small, typed Interface.
/**
 * Worktree Lifecycle module — first-class Module for worktree create/enter/exit/merge.
 *
 * Per ADR-016, this Module is the sole owner of:
 *   - `s.basePath` mutation across the session
 *   - `process.chdir()` discipline for worktree transitions (delegated to
 *     `enterAutoWorktree`/`createAutoWorktree`, which chdir internally)
 *   - milestone lease coordination (claim/refresh/release fencing tokens)
 *
 * Phase 1 of the migration ships only `enterMilestone`. The remaining verbs
 * (`exitMilestone`, `degradeToBranchMode`, `restoreToProjectRoot`, queries) are
 * extracted from `WorktreeResolver` in subsequent slices.
 *
 * The implementation lives in `_enterMilestoneCore` so `WorktreeResolver` can
 * call the same body during its internal `mergeAndEnterNext` recursion without
 * a circular reference. Both classes share the body until the Resolver retires.
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { AutoSession } from "./auto/session.js";
import { debugLog } from "./debug-logger.js";
import { logWarning } from "./workflow-logger.js";
import { emitJournalEvent } from "./journal.js";
import { emitWorktreeCreated, emitWorktreeMerged } from "./worktree-telemetry.js";
import {
  resolveWorktreeProjectRoot,
  normalizeWorktreePathForCompare,
} from "./worktree-root.js";
import {
  claimMilestoneLease,
  refreshMilestoneLease,
  releaseMilestoneLease,
} from "./db/milestone-leases.js";
import { MergeConflictError } from "./git-service.js";
import type { GitPreferences } from "./git-service.js";
import {
  getCollapseCadence,
  getMilestoneResquash,
  resquashMilestoneOnMain,
} from "./slice-cadence.js";
// ADR-016 phase 2 / C3 (#5626): cache + preferences + path helpers inlined
// as direct imports. They are leaf-level functions that do not vary across
// callers — production wiring previously injected them via deps; the seam
// added type churn without enabling test variation.
import { loadEffectiveGSDPreferences, getIsolationMode } from "./preferences.js";
import { invalidateAllCaches } from "./cache.js";
import { resolveMilestoneFile } from "./paths.js";
import type { WorktreeStateProjection } from "./worktree-state-projection.js";
import { createWorkspace, scopeMilestone } from "./workspace.js";
// ADR-016 phase 2 / C1 (#5624): file-system + git-CLI leaf primitives
// inlined as direct imports rather than injected through `WorktreeLifecycleDeps`.
// These four symbols (`readFileSync` from node:fs, `getCurrentBranch` and
// `autoCommitCurrentBranch` from `./worktree.js`, `nativeCheckoutBranch` from
// `./native-git-bridge.js`) are leaf-level primitives — no environment varies
// across callers — so the dependency-injection seam they used to inhabit was
// adding type churn without enabling any test variation.
import {
  autoCommitCurrentBranch,
  getCurrentBranch,
} from "./worktree.js";
import { nativeCheckoutBranch } from "./native-git-bridge.js";
// ADR-016 phase 2 / C2 (#5625): worktree-manager helpers inlined from
// `./auto-worktree.js`. These seven functions are not real seams — Lifecycle
// is the only Module that calls them, and they live alongside the Module's
// other primitives in `auto-worktree.ts`.
import {
  autoWorktreeBranch,
  createAutoWorktree,
  enterAutoWorktree,
  enterBranchModeForMilestone,
  getAutoWorktreePath,
  isInAutoWorktree,
  teardownAutoWorktree,
} from "./auto-worktree.js";

const recentWorktreeMergeFailures = new Map<string, number>();
const MERGE_FAILURE_DEDUPE_MS = 60_000;

export function resetRecentWorktreeMergeFailuresForTest(): void {
  recentWorktreeMergeFailures.clear();
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface NotifyCtx {
  notify: (
    msg: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
}

/**
 * Dependencies the Worktree Lifecycle Module needs from auto-mode wiring.
 *
 * Structurally a subset of `WorktreeResolverDeps`. `WorktreeResolver` can pass
 * its own deps where these are expected — TypeScript's structural typing
 * handles the narrowing.
 *
 * TODO(#5586): collapse this to the ADR target dep set after the resolver
 * recursion retires; shrinking it now would force a parallel migration.
 */
export interface WorktreeLifecycleDeps {
  // ── Git service factory (ADR-016 phase 2 / C4) ───────────────────────
  /**
   * Build a fresh `GitService` instance bound to `basePath`.
   *
   * Hides the constructor shape (new GitServiceImpl(basePath, gitConfig))
   * and the gitConfig load from Lifecycle. The factory takes only a
   * `basePath` and is responsible for loading any config it needs.
   * Tests substitute fakes by passing a function that returns a stub.
   */
  gitServiceFactory: (basePath: string) => AutoSession["gitService"];

  // ── State Projection Module (ADR-016 one-way edge) ───────────────────
  /**
   * State Projection Module called by Lifecycle on enter/exit transitions.
   * Per ADR-016 the dependency direction is one-way: Lifecycle → Projection.
   */
  worktreeProjection: WorktreeStateProjection;

  // ── Merge primitive ──────────────────────────────────────────────────
  /**
   * Inner squash-merge primitive (`auto-worktree.ts:mergeMilestoneToMain`).
   *
   * **Module-internal seam — do not construct your own.** Only the wiring
   * factory `auto.ts:buildWorktreeLifecycleDeps()` is permitted to populate
   * this field. The primitive is `@internal`; production callers reach the
   * merge body through `WorktreeLifecycle.exitMilestone({ merge: true })`,
   * never by calling this dep directly.
   */
  mergeMilestoneToMain: (
    basePath: string,
    milestoneId: string,
    roadmapContent: string,
  ) => {
    pushed: boolean;
    codeFilesChanged: boolean;
    commitMessage?: string;
  };

  // ADR-016 phase 2 / C1 + C2 + C3 + C4 inlined the following fields as
  // direct imports — leaf primitives that did not vary across callers:
  //   C1 (#5624): readFileSync, getCurrentBranch, checkoutBranch,
  //               autoCommitCurrentBranch
  //   C2 (#5625): enterAutoWorktree, createAutoWorktree,
  //               enterBranchModeForMilestone, getAutoWorktreePath,
  //               teardownAutoWorktree, isInAutoWorktree, autoWorktreeBranch
  //   C3 (#5626): invalidateAllCaches, loadEffectiveGSDPreferences,
  //               getIsolationMode, resolveMilestoneFile
  //   C4 (#5627): GitServiceImpl constructor → gitServiceFactory above
  //
  // ADR-016 phase 3 (#5693) deleted the @deprecated optional fields that
  // remained on this Interface for legacy test fixtures. Tests that need to
  // substitute primitive implementations cast their deps to
  // `WorktreeLifecycleTestOverrides` (exported below) — the test seam now
  // lives outside the public Interface.
  //
  // Final dep bag: 3 fields. The ADR's envisioned shape was ≤6.
}

/**
 * Test-only override shim. Production callers do not use this type — it
 * exists so legacy test fixtures can substitute the primitive implementations
 * that were inlined into Lifecycle in ADR-016 phase 2 (C1-C4). Pass an object
 * typed `WorktreeLifecycleDeps & WorktreeLifecycleTestOverrides` to the
 * `WorktreeLifecycle` constructor; Lifecycle reads the overrides through the
 * structural-typing escape hatch in `primitiveOverrides()`.
 *
 * The fields here intentionally duplicate the C1-C4-inlined primitive
 * signatures. Adding new fields is fine when a test needs to vary a primitive
 * that has no other seam.
 */
export type WorktreeLifecycleTestOverrides = WorktreeLifecyclePrimitiveOverrides;

/**
 * Internal sentinel — thrown by `_mergeBranchMode` when it has already
 * emitted a user-visible error. The outer `mergeAndExit` catches the type
 * and skips its own warning toast to avoid duplicate notifications.
 */
class UserNotifiedError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "UserNotifiedError";
    this.cause = cause;
  }
}

/**
 * Compare two paths for physical identity, tolerating trailing slashes,
 * symlink differences, and case variations on case-insensitive volumes.
 *
 * Used in place of string `===` / `!==` wherever one operand may be
 * realpath-normalised and the other may not be (e.g. raw caller-supplied
 * basePath vs. realpath-normalised projectRoot).
 */
function isSamePathPhysical(a: string, b: string): boolean {
  return normalizeWorktreePathForCompare(a) === normalizeWorktreePathForCompare(b);
}

export type EnterResult =
  | { ok: true; mode: "worktree" | "branch" | "none"; path: string }
  | {
      ok: false;
      reason:
        | "isolation-degraded"
        | "lease-conflict"
        | "creation-failed"
        | "invalid-milestone-id";
      cause?: unknown;
    };

export type ExitResult =
  | { ok: true; merged: boolean; codeFilesChanged: boolean }
  | { ok: false; reason: "merge-conflict" | "teardown-failed"; cause?: unknown };

/**
 * Session-less merge entry context. Per ADR-016 phase 2 / A1 (#5616), the
 * merge body is structurally session-less — it reads project root, worktree
 * path, and milestoneId. Single-loop callers (`_mergeAndExit`) build a
 * MergeContext from `this.s`. Parallel callers (`parallel-merge.ts`) build
 * one directly without an `AutoSession`.
 */
export interface MergeContext {
  /** Project root — merge target (where `git merge --squash` lands). */
  originalBasePath: string;
  /**
   * Current worktree path or project root when in branch mode. Used as the
   * cwd anchor for `mergeMilestoneToMain` and the source for
   * `Projection.finalizeProjectionForMerge`.
   */
  worktreeBasePath: string;
  milestoneId: string;
  /**
   * When true, `mergeMilestoneStandalone` returns `{ merged: false,
   * mode: "skipped" }` immediately (mirrors the single-loop guard). Default
   * `false` for parallel callers, which never run with degraded isolation.
   */
  isolationDegraded?: boolean;
  notify: NotifyCtx["notify"];
}

/**
 * Result of `mergeMilestoneStandalone`. `mode` lets callers decide which
 * session-bound side effects to run (worktree-mode → `restoreToProjectRoot`,
 * branch-mode → `rebuildGitService`, skipped → none).
 */
export interface MergeStandaloneResult {
  merged: boolean;
  mode: "worktree" | "branch" | "skipped";
  codeFilesChanged: boolean;
  pushed: boolean;
  /**
   * Commit message produced by the squash merge, if available. Forwarded
   * from `mergeMilestoneToMain`. Only populated when `merged === true`.
   */
  commitMessage?: string;
}

// ─── Validation ──────────────────────────────────────────────────────────

function isValidMilestoneId(milestoneId: string): boolean {
  return !/[\/\\]|\.\./.test(milestoneId);
}

function invalidMilestoneIdError(milestoneId: string): Error {
  return new Error(
    `Invalid milestoneId: ${milestoneId} — contains path separators or traversal`,
  );
}

type WorktreeLifecyclePrimitiveOverrides = {
  readFileSync?: (path: string, encoding: BufferEncoding) => string;
  getCurrentBranch?: (basePath: string) => string;
  checkoutBranch?: (basePath: string, branch: string) => void;
  autoCommitCurrentBranch?: (
    basePath: string,
    unitType: string,
    unitId: string,
    taskContext?: unknown,
  ) => string | null;
  getAutoWorktreePath?: (
    basePath: string,
    milestoneId: string,
  ) => string | null;
  // ADR-016 phase 2 / C2-inlined worktree-manager primitives. Tests still
  // stub these via the structural-typing escape hatch on `WorktreeLifecycleDeps`,
  // so the call sites below check for an override first and fall back to the
  // imported direct primitive.
  isInAutoWorktree?: (basePath: string) => boolean;
  autoWorktreeBranch?: (milestoneId: string) => string;
  teardownAutoWorktree?: (
    basePath: string,
    milestoneId: string,
    opts?: { preserveBranch?: boolean },
  ) => void;
  createAutoWorktree?: (basePath: string, milestoneId: string) => string;
  enterAutoWorktree?: (basePath: string, milestoneId: string) => string;
  enterBranchModeForMilestone?: (basePath: string, milestoneId: string) => void;
  // ADR-016 phase 2 / C3-inlined cache + preferences + path helpers.
  getIsolationMode?: (basePath?: string) => "worktree" | "branch" | "none";
  invalidateAllCaches?: () => void;
  resolveMilestoneFile?: (
    basePath: string,
    milestoneId: string,
    fileType: string,
  ) => string | null;
  loadEffectiveGSDPreferences?: (basePath?: string) =>
    | { preferences?: { git?: Record<string, unknown> } }
    | null
    | undefined;
};

function primitiveOverrides(
  deps: WorktreeLifecycleDeps,
): WorktreeLifecyclePrimitiveOverrides {
  return deps as WorktreeLifecycleDeps & WorktreeLifecyclePrimitiveOverrides;
}

function readLifecycleFile(
  deps: WorktreeLifecycleDeps,
  path: string,
): string {
  return primitiveOverrides(deps).readFileSync?.(path, "utf-8") ??
    readFileSync(path, "utf-8");
}

function currentLifecycleBranch(
  deps: WorktreeLifecycleDeps,
  basePath: string,
): string {
  return primitiveOverrides(deps).getCurrentBranch?.(basePath) ??
    getCurrentBranch(basePath);
}

function checkoutLifecycleBranch(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  branch: string,
): void {
  const checkoutBranch = primitiveOverrides(deps).checkoutBranch;
  if (checkoutBranch) {
    checkoutBranch(basePath, branch);
    return;
  }
  nativeCheckoutBranch(basePath, branch);
}

function autoCommitLifecycleBranch(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  unitType: string,
  unitId: string,
): string | null {
  return primitiveOverrides(deps).autoCommitCurrentBranch?.(
    basePath,
    unitType,
    unitId,
  ) ?? autoCommitCurrentBranch(basePath, unitType, unitId);
}

// ADR-016 phase 2 / C2-inlined worktree-manager primitives — helpers that
// honour the structural-typing override pattern so legacy test fixtures keep
// working without rewriting them onto real-git fixtures.
function lifecycleIsInAutoWorktree(
  deps: WorktreeLifecycleDeps,
  basePath: string,
): boolean {
  return primitiveOverrides(deps).isInAutoWorktree?.(basePath) ??
    isInAutoWorktree(basePath);
}

function lifecycleAutoWorktreeBranch(
  deps: WorktreeLifecycleDeps,
  milestoneId: string,
): string {
  return primitiveOverrides(deps).autoWorktreeBranch?.(milestoneId) ??
    autoWorktreeBranch(milestoneId);
}

function lifecycleTeardownAutoWorktree(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  milestoneId: string,
  opts?: { preserveBranch?: boolean },
): void {
  const override = primitiveOverrides(deps).teardownAutoWorktree;
  if (override) {
    override(basePath, milestoneId, opts);
    return;
  }
  teardownAutoWorktree(basePath, milestoneId, opts);
}

function lifecycleCreateAutoWorktree(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  milestoneId: string,
): string {
  return primitiveOverrides(deps).createAutoWorktree?.(basePath, milestoneId) ??
    createAutoWorktree(basePath, milestoneId);
}

function lifecycleEnterAutoWorktree(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  milestoneId: string,
): string {
  return primitiveOverrides(deps).enterAutoWorktree?.(basePath, milestoneId) ??
    enterAutoWorktree(basePath, milestoneId);
}

function lifecycleEnterBranchMode(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  milestoneId: string,
): void {
  const override = primitiveOverrides(deps).enterBranchModeForMilestone;
  if (override) {
    override(basePath, milestoneId);
    return;
  }
  enterBranchModeForMilestone(basePath, milestoneId);
}

// ADR-016 phase 2 / C3-inlined cache + preferences + path helpers.
function lifecycleGetIsolationMode(
  deps: WorktreeLifecycleDeps,
  basePath?: string,
): "worktree" | "branch" | "none" {
  return primitiveOverrides(deps).getIsolationMode?.(basePath) ??
    getIsolationMode(basePath);
}

function lifecycleInvalidateAllCaches(deps: WorktreeLifecycleDeps): void {
  const override = primitiveOverrides(deps).invalidateAllCaches;
  if (override) {
    override();
    return;
  }
  invalidateAllCaches();
}

function lifecycleResolveMilestoneFile(
  deps: WorktreeLifecycleDeps,
  basePath: string,
  milestoneId: string,
  fileType: string,
): string | null {
  return primitiveOverrides(deps).resolveMilestoneFile?.(
    basePath,
    milestoneId,
    fileType,
  ) ?? resolveMilestoneFile(basePath, milestoneId, fileType);
}

function lifecycleLoadPreferences(
  deps: WorktreeLifecycleDeps,
  basePath?: string,
):
  | { preferences?: { git?: Record<string, unknown> } }
  | null
  | undefined {
  const override = primitiveOverrides(deps).loadEffectiveGSDPreferences;
  if (override) return override(basePath);
  return loadEffectiveGSDPreferences(basePath) as
    | { preferences?: { git?: Record<string, unknown> } }
    | null
    | undefined;
}

/**
 * Throwing variant used by the merge/exit paths that surface failures via
 * the typed `ExitResult` (callers wrap the throw → cause). The enter path
 * uses `isValidMilestoneId` + the typed result directly.
 */
function validateMilestoneId(milestoneId: string): void {
  if (!isValidMilestoneId(milestoneId)) {
    throw invalidMilestoneIdError(milestoneId);
  }
}

// ─── Implementation core ─────────────────────────────────────────────────

/**
 * Shared implementation of milestone entry. Called by both
 * `WorktreeLifecycle.enterMilestone` and the legacy
 * `WorktreeResolver.mergeAndEnterNext` internal recursion until the Resolver
 * retires (slice #5587).
 *
 * Side effects (preserved from the original `WorktreeResolver.enterMilestone`):
 *   - mutates `s.milestoneLeaseToken` on lease claim/release/refresh
 *   - mutates `s.basePath` on successful worktree entry
 *   - mutates `s.gitService` (rebuilt against the new base path)
 *   - mutates `s.isolationDegraded` on hard failure of branch/worktree setup
 *   - emits journal events: worktree-skip, worktree-enter, worktree-create-failed
 *   - emits worktree-created telemetry on successful entry
 *   - notifies the caller via `ctx.notify` for every user-visible outcome
 */
export function _enterMilestoneCore(
  s: AutoSession,
  deps: WorktreeLifecycleDeps,
  milestoneId: string,
  ctx: NotifyCtx,
): EnterResult {
  if (!isValidMilestoneId(milestoneId)) {
    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      rejected: "invalid-milestone-id",
    });
    return {
      ok: false,
      reason: "invalid-milestone-id",
      cause: invalidMilestoneIdError(milestoneId),
    };
  }

  // Phase B: claim a milestone lease before any worktree mutation. Two
  // workers cannot enter the same milestone concurrently. Best-effort:
  // warn if no worker registered (single-worker fallback) or skip if DB
  // unavailable; reuse existing lease if we already hold it on this
  // milestone (re-entry within the same session).
  if (s.workerId) {
    if (
      s.currentMilestoneId === milestoneId &&
      s.milestoneLeaseToken !== null
    ) {
      const refreshed = refreshMilestoneLease(
        s.workerId,
        milestoneId,
        s.milestoneLeaseToken,
      );
      if (refreshed) {
        debugLog("WorktreeLifecycle", {
          action: "enterMilestone",
          milestoneId,
          leaseRefreshed: true,
          fencingToken: s.milestoneLeaseToken,
        });
      } else {
        debugLog("WorktreeLifecycle", {
          action: "enterMilestone",
          milestoneId,
          staleLeaseToken: s.milestoneLeaseToken,
        });
        s.milestoneLeaseToken = null;
      }
    }

    // If we held a different milestone, release it first so other
    // workers don't have to wait for TTL.
    if (
      s.currentMilestoneId &&
      s.currentMilestoneId !== milestoneId &&
      s.milestoneLeaseToken !== null
    ) {
      try {
        releaseMilestoneLease(
          s.workerId,
          s.currentMilestoneId,
          s.milestoneLeaseToken,
        );
      } catch (err) {
        debugLog("WorktreeLifecycle", {
          action: "enterMilestone",
          milestoneId,
          releasePriorLeaseError:
            err instanceof Error ? err.message : String(err),
        });
      }
      s.milestoneLeaseToken = null;
    }

    if (s.milestoneLeaseToken === null) {
      try {
        const claim = claimMilestoneLease(s.workerId, milestoneId);
        if (claim.ok) {
          s.milestoneLeaseToken = claim.token;
          debugLog("WorktreeLifecycle", {
            action: "enterMilestone",
            milestoneId,
            leaseAcquired: true,
            fencingToken: claim.token,
            expiresAt: claim.expiresAt,
          });
        } else {
          // Lease held by another worker — fail loud so the user can
          // see the conflict instead of silently double-running.
          const msg = `Milestone ${milestoneId} is held by worker ${claim.byWorker} until ${claim.expiresAt}.`;
          debugLog("WorktreeLifecycle", {
            action: "enterMilestone",
            milestoneId,
            leaseHeldByOther: claim.byWorker,
            expiresAt: claim.expiresAt,
          });
          ctx.notify(
            `${msg} Another auto-mode worker is active. Stop it before entering ${milestoneId}.`,
            "error",
          );
          return { ok: false, reason: "lease-conflict" };
        }
      } catch (err) {
        // DB unavailable or other error — log and fall through to the
        // pre-Phase-B single-worker behavior so a fresh project before
        // DB init still works.
        debugLog("WorktreeLifecycle", {
          action: "enterMilestone",
          milestoneId,
          leaseError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else {
    logWarning(
      "worktree",
      `enterMilestone(${milestoneId}) ran before auto worker registration; milestone lease was not claimed.`,
    );
  }

  // Resolve the project root for worktree operations via shared helper.
  // Handles the case where originalBasePath is falsy and basePath is itself
  // a worktree path — prevents double-nested worktree paths (#3729).
  const basePath = resolveWorktreeProjectRoot(s.basePath, s.originalBasePath);
  const mode = getIsolationMode(basePath);

  if (s.isolationDegraded) {
    if (mode === "worktree") {
      try {
        lifecycleEnterBranchMode(deps, basePath, milestoneId);
        s.basePath = basePath;
        rebuildGitService(s, deps);
        invalidateAllCaches();
        ctx.notify(
          `Worktree isolation is degraded. Fell back to branch milestone/${milestoneId}.`,
          "warning",
        );
        return { ok: true, mode: "branch", path: basePath };
      } catch (err) {
        debugLog("WorktreeLifecycle", {
          action: "enterMilestone",
          milestoneId,
          skipped: true,
          reason: "isolation-degraded",
          fallback: "branch-failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      skipped: true,
      reason: "isolation-degraded",
    });
    return { ok: false, reason: "isolation-degraded" };
  }

  if (mode === "none") {
    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      skipped: true,
      reason: "isolation-disabled",
    });
    emitJournalEvent(s.originalBasePath || s.basePath, {
      ts: new Date().toISOString(),
      flowId: randomUUID(),
      seq: 0,
      eventType: "worktree-skip",
      data: { milestoneId, reason: "isolation-disabled" },
    });
    return { ok: true, mode: "none", path: basePath };
  }

  debugLog("WorktreeLifecycle", {
    action: "enterMilestone",
    milestoneId,
    mode,
    basePath,
  });

  if (
    mode === "worktree" &&
    s.currentMilestoneId === milestoneId &&
    s.basePath !== basePath
  ) {
    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      mode: "worktree",
      result: "already-entered",
      wtPath: s.basePath,
    });
    return { ok: true, mode: "worktree", path: s.basePath };
  }

  // ── Branch mode: create/checkout milestone branch, stay in project root ──
  if (mode === "branch") {
    try {
      lifecycleEnterBranchMode(deps, basePath, milestoneId);
      // basePath does not change — no worktree, no chdir.
      // Rebuild GitService so the new HEAD is reflected, then flush any
      // path-keyed caches that may have been populated before the checkout.
      rebuildGitService(s, deps);
      invalidateAllCaches();
      debugLog("WorktreeLifecycle", {
        action: "enterMilestone",
        milestoneId,
        mode: "branch",
        result: "success",
      });
      emitJournalEvent(basePath, {
        ts: new Date().toISOString(),
        flowId: randomUUID(),
        seq: 0,
        eventType: "worktree-skip",
        data: { milestoneId, reason: "branch-mode-no-worktree" },
      });
      ctx.notify(`Switched to branch milestone/${milestoneId}.`, "info");
      return { ok: true, mode: "branch", path: basePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLog("WorktreeLifecycle", {
        action: "enterMilestone",
        milestoneId,
        mode: "branch",
        result: "error",
        error: msg,
      });
      ctx.notify(
        `Branch isolation setup for ${milestoneId} failed: ${msg}. Continuing on current branch.`,
        "warning",
      );
      s.isolationDegraded = true;
      return { ok: false, reason: "creation-failed", cause: err };
    }
  }

  // ── Worktree mode ────────────────────────────────────────────────────────
  try {
    const existingPath =
      (primitiveOverrides(deps).getAutoWorktreePath ?? getAutoWorktreePath)(
        basePath,
        milestoneId,
      );
    let wtPath: string;

    if (existingPath) {
      wtPath = lifecycleEnterAutoWorktree(deps, basePath, milestoneId);
    } else {
      wtPath = lifecycleCreateAutoWorktree(deps, basePath, milestoneId);
    }

    s.basePath = wtPath;
    rebuildGitService(s, deps);
    invalidateAllCaches();

    // Per ADR-016: Lifecycle calls Projection on entry, before any Unit
    // dispatches. Build a temporary scope from the new basePath; callers may
    // later set s.scope via their own rebuildScope hook (the two are
    // independent — this scope is only used to drive the projection rules).
    try {
      const enterScope = scopeMilestone(createWorkspace(wtPath), milestoneId);
      deps.worktreeProjection.projectRootToWorktree(enterScope);
    } catch (projErr) {
      // Non-fatal: projection failures must not block worktree entry.
      // The pre-dispatch path in auto/phases.ts performs the same projection
      // on every iteration, so a transient failure here self-heals on the
      // next loop pass.
      debugLog("WorktreeLifecycle", {
        action: "enterMilestone",
        phase: "projection-on-enter",
        error: projErr instanceof Error ? projErr.message : String(projErr),
      });
    }

    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      result: "success",
      wtPath,
    });
    emitJournalEvent(s.originalBasePath || s.basePath, {
      ts: new Date().toISOString(),
      flowId: randomUUID(),
      seq: 0,
      eventType: "worktree-enter",
      data: { milestoneId, wtPath, created: !existingPath },
    });
    // #4764 — record creation/enter as a lifecycle event so the telemetry
    // aggregator can pair it with the eventual worktree-merged event.
    try {
      emitWorktreeCreated(s.originalBasePath || s.basePath, milestoneId, {
        reason: existingPath ? "enter-milestone" : "create-milestone",
      });
    } catch (telemetryErr) {
      debugLog("WorktreeLifecycle", {
        action: "enterMilestone",
        phase: "telemetry-emit",
        error:
          telemetryErr instanceof Error
            ? telemetryErr.message
            : String(telemetryErr),
      });
    }
    ctx.notify(`Entered worktree for ${milestoneId} at ${wtPath}`, "info");
    return { ok: true, mode: "worktree", path: wtPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      result: "error",
      error: msg,
    });
    emitJournalEvent(s.originalBasePath || s.basePath, {
      ts: new Date().toISOString(),
      flowId: randomUUID(),
      seq: 0,
      eventType: "worktree-create-failed",
      data: { milestoneId, error: msg, fallback: "project-root" },
    });
    ctx.notify(
      `Auto-worktree creation for ${milestoneId} failed: ${msg}. Continuing in project root.`,
      "warning",
    );
    // Degrade isolation for the rest of this session so mergeAndExit
    // doesn't try to merge a nonexistent worktree branch (#2483)
    s.isolationDegraded = true;
    // Do NOT update s.basePath — stay in project root
    return { ok: false, reason: "creation-failed", cause: err };
  }
}

/**
 * Resolve the basePath to adopt on resume from a paused session.
 *
 * Returns `persistedWorktreePath` when the path is non-null and exists on
 * disk; otherwise falls back to `base`. Used by
 * `WorktreeLifecycle.resumeFromPausedSession` (#5621). Exported as a pure
 * function so unit tests can exercise the path-resolution logic without
 * constructing a `WorktreeLifecycle` instance.
 *
 * The optional `pathExists` parameter exists only for tests that need to
 * substitute a stub for `existsSync`.
 */
export function resolvePausedResumeBasePath(
  base: string,
  persistedWorktreePath: string | null | undefined,
  pathExists: (p: string) => boolean = existsSync,
): string {
  return persistedWorktreePath && pathExists(persistedWorktreePath)
    ? persistedWorktreePath
    : base;
}

function rebuildGitService(
  s: AutoSession,
  deps: WorktreeLifecycleDeps,
): void {
  // ADR-016 phase 2 / C4 (#5627): the gitConfig load and constructor
  // construction live behind `gitServiceFactory`. Lifecycle no longer
  // sees the constructor shape, the gitConfig type, or the unknown→
  // GitService cast.
  s.gitService = deps.gitServiceFactory(s.basePath);
}

function emitWorktreeMergeFailedOnce(
  basePath: string,
  milestoneId: string,
  err: unknown,
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const errorCategory = err instanceof Error ? err.name : "Error";
  const now = Date.now();
  const key = `${basePath}\0${milestoneId}\0${errorCategory}`;
  const previous = recentWorktreeMergeFailures.get(key);
  if (previous && now - previous < MERGE_FAILURE_DEDUPE_MS) return;
  for (const [candidate, ts] of recentWorktreeMergeFailures) {
    if (now - ts >= MERGE_FAILURE_DEDUPE_MS) {
      recentWorktreeMergeFailures.delete(candidate);
    }
  }
  emitJournalEvent(basePath, {
    ts: new Date().toISOString(),
    flowId: randomUUID(),
    seq: 0,
    eventType: "worktree-merge-failed",
    data: { milestoneId, error: msg },
  });
  recentWorktreeMergeFailures.set(key, now);
}

// ─── Session-less merge entry (ADR-016 phase 2 / A1) ─────────────────────

/**
 * Worktree-mode merge body. Session-less — operates on a `MergeContext`.
 *
 * On error: emits the "worktree-merge-failed" journal event, notifies the
 * user, cleans up stale `SQUASH_MSG` / `MERGE_HEAD` / `MERGE_MSG` files
 * (#1389), and chdirs back to project root before rethrowing. Session-side
 * cleanup (`restoreToProjectRoot`, `gitService` rebuild) is the caller's
 * responsibility.
 */
function _mergeWorktreeModeImpl(
  deps: WorktreeLifecycleDeps,
  mctx: MergeContext,
): MergeStandaloneResult {
  const { originalBasePath, worktreeBasePath, milestoneId, notify } = mctx;
  if (!originalBasePath) {
    debugLog("WorktreeLifecycle", {
      action: "mergeAndExit",
      milestoneId,
      mode: "worktree",
      skipped: true,
      reason: "missing-original-base",
    });
    return {
      merged: false,
      mode: "worktree",
      codeFilesChanged: false,
      pushed: false,
    };
  }

  try {
    // ADR-016: final projection before teardown. Replaces the legacy
    // syncWorktreeStateBack(originalBase, basePath, milestoneId) call.
    const finalScope = scopeMilestone(
      createWorkspace(worktreeBasePath),
      milestoneId,
    );
    const { synced } = deps.worktreeProjection.finalizeProjectionForMerge(
      finalScope,
    );
    if (synced.length > 0) {
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        milestoneId,
        phase: "reverse-sync",
        synced: synced.length,
      });
    }

    // Resolve roadmap — try project root first, then worktree path as
    // fallback. The worktree may hold the only copy when state-back
    // projection silently dropped it or .gsd/ is not symlinked. Without
    // the fallback, a missing roadmap triggers bare teardown which
    // deletes the branch and orphans all milestone commits (#1573).
    let roadmapPath = resolveMilestoneFile(
      originalBasePath,
      milestoneId,
      "ROADMAP",
    );
    if (
      !roadmapPath &&
      !isSamePathPhysical(worktreeBasePath, originalBasePath)
    ) {
      roadmapPath = resolveMilestoneFile(
        worktreeBasePath,
        milestoneId,
        "ROADMAP",
      );
      if (roadmapPath) {
        debugLog("WorktreeLifecycle", {
          action: "mergeAndExit",
          milestoneId,
          phase: "roadmap-fallback",
          note: "resolved from worktree path",
        });
      }
    }

    if (!roadmapPath) {
      // No roadmap at either location — teardown but PRESERVE the branch
      // so commits are not orphaned (#1573).
      lifecycleTeardownAutoWorktree(deps, originalBasePath, milestoneId, {
        preserveBranch: true,
      });
      notify(
        `Exited worktree for ${milestoneId} (no roadmap found — branch preserved for manual merge).`,
        "warning",
      );
      return {
        merged: false,
        mode: "worktree",
        codeFilesChanged: false,
        pushed: false,
      };
    }

    const roadmapContent = readLifecycleFile(deps, roadmapPath);
    const mergeResult = deps.mergeMilestoneToMain(
      originalBasePath,
      milestoneId,
      roadmapContent,
    );

    // #2945 Bug 3: mergeMilestoneToMain performs best-effort worktree
    // cleanup internally (step 12), but it can silently fail on Windows
    // or when the worktree directory is locked. Perform a secondary
    // teardown here to ensure the worktree is properly cleaned up.
    // Idempotent — if already removed, teardownAutoWorktree no-ops.
    try {
      lifecycleTeardownAutoWorktree(deps, originalBasePath, milestoneId);
    } catch {
      // Best-effort — primary cleanup in mergeMilestoneToMain may have
      // already removed the worktree.
    }

    if (mergeResult.codeFilesChanged) {
      notify(
        `Milestone ${milestoneId} merged to main.${mergeResult.pushed ? " Pushed to remote." : ""}`,
        "info",
      );
    } else {
      // #1906 — milestone produced only .gsd/ metadata. Surface
      // clearly so the user knows the milestone is not truly complete.
      notify(
        `WARNING: Milestone ${milestoneId} merged to main but contained NO code changes — only .gsd/ metadata files. ` +
          `The milestone summary may describe planned work that was never implemented. ` +
          `Review the milestone output and re-run if code is missing.`,
        "warning",
      );
    }

    return {
      merged: true,
      mode: "worktree",
      codeFilesChanged: mergeResult.codeFilesChanged,
      pushed: mergeResult.pushed,
      commitMessage: mergeResult.commitMessage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog("WorktreeLifecycle", {
      action: "mergeAndExit",
      milestoneId,
      result: "error",
      error: msg,
      fallback: "chdir-to-project-root",
    });
    emitWorktreeMergeFailedOnce(originalBasePath || worktreeBasePath, milestoneId, err);
    // Surface a clear, actionable error. Worktree and milestone branch
    // are intentionally preserved — nothing has been deleted. User can
    // retry /gsd dispatch complete-milestone or merge manually once the
    // underlying issue is fixed (#1668, #1891).
    notify(
      `Milestone merge failed: ${msg}. Your worktree and milestone branch are preserved — retry with \`/gsd dispatch complete-milestone\` or merge manually.`,
      "warning",
    );

    // Clean up stale merge state left by failed squash-merge (#1389)
    try {
      const gitDir = join(originalBasePath || worktreeBasePath, ".git");
      for (const f of ["SQUASH_MSG", "MERGE_HEAD", "MERGE_MSG"]) {
        const p = join(gitDir, f);
        if (existsSync(p)) unlinkSync(p);
      }
    } catch {
      /* best-effort */
    }

    // Error recovery: chdir back to project root only when no real worktree
    // path is available. Session-side cleanup (restoreToProjectRoot,
    // gitService rebuild) is the caller's responsibility.
    if (originalBasePath && !worktreeBasePath) {
      try {
        process.chdir(originalBasePath);
      } catch {
        /* best-effort */
      }
    }

    // Re-throw: MergeConflictError stops the auto loop (#2330);
    // non-conflict errors must also propagate so broken states are
    // diagnosable (#4380).
    throw err;
  }
}

/**
 * Branch-mode merge body. Session-less.
 *
 * Session-side `gitService` rebuild after HEAD changes is the caller's
 * responsibility. The branch-mode `UserNotifiedError` sentinel still flows
 * through unchanged so the outer caller can suppress duplicate toasts.
 */
function _mergeBranchModeImpl(
  deps: WorktreeLifecycleDeps,
  mctx: MergeContext,
): MergeStandaloneResult {
  const { worktreeBasePath, milestoneId, notify } = mctx;
  try {
    const currentBranch = currentLifecycleBranch(deps, worktreeBasePath);
    const milestoneBranch = lifecycleAutoWorktreeBranch(deps, milestoneId);

    if (currentBranch !== milestoneBranch) {
      // #5538-followup: previous behaviour was to silently `return false`
      // when HEAD wasn't on the milestone branch — that let the loop
      // advance with the milestone's commits stranded on the branch.
      // Attempt recovery by force-checking-out the milestone branch; if
      // that fails, throw so the caller pauses auto-mode and the user
      // sees the failure instead of a silent merge skip.
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        milestoneId,
        mode: "branch",
        recovery: "checkout-milestone-branch",
        currentBranch,
        milestoneBranch,
      });
      try {
        checkoutLifecycleBranch(deps, worktreeBasePath, milestoneBranch);
      } catch (checkoutErr) {
        const checkoutMsg =
          checkoutErr instanceof Error
            ? checkoutErr.message
            : String(checkoutErr);
        notify(
          `Cannot merge milestone ${milestoneId}: working tree is on ${currentBranch} and checkout to ${milestoneBranch} failed (${checkoutMsg}). Resolve manually and run /gsd auto to resume.`,
          "error",
        );
        throw new UserNotifiedError(checkoutMsg, checkoutErr);
      }

      const reverify = currentLifecycleBranch(deps, worktreeBasePath);
      if (reverify !== milestoneBranch) {
        const reverifyMsg = `branch checkout to ${milestoneBranch} reported success but current branch is ${reverify}`;
        notify(
          `Cannot merge milestone ${milestoneId}: ${reverifyMsg}. Resolve manually and run /gsd auto to resume.`,
          "error",
        );
        throw new UserNotifiedError(reverifyMsg);
      }
    }

    const roadmapPath = resolveMilestoneFile(
      worktreeBasePath,
      milestoneId,
      "ROADMAP",
    );
    if (!roadmapPath) {
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        milestoneId,
        mode: "branch",
        skipped: true,
        reason: "no-roadmap",
      });
      return {
        merged: false,
        mode: "branch",
        codeFilesChanged: false,
        pushed: false,
      };
    }

    const roadmapContent = readLifecycleFile(deps, roadmapPath);
    const mergeResult = deps.mergeMilestoneToMain(
      worktreeBasePath,
      milestoneId,
      roadmapContent,
    );

    if (mergeResult.codeFilesChanged) {
      notify(
        `Milestone ${milestoneId} merged (branch mode).${mergeResult.pushed ? " Pushed to remote." : ""}`,
        "info",
      );
    } else {
      notify(
        `WARNING: Milestone ${milestoneId} merged (branch mode) but contained NO code changes — only .gsd/ metadata. ` +
          `Review the milestone output and re-run if code is missing.`,
        "warning",
      );
    }
    debugLog("WorktreeLifecycle", {
      action: "mergeAndExit",
      milestoneId,
      mode: "branch",
      result: "success",
    });
    return {
      merged: true,
      mode: "branch",
      codeFilesChanged: mergeResult.codeFilesChanged,
      pushed: mergeResult.pushed,
      commitMessage: mergeResult.commitMessage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog("WorktreeLifecycle", {
      action: "mergeAndExit",
      milestoneId,
      mode: "branch",
      result: "error",
      error: msg,
    });
    if (!(err instanceof UserNotifiedError)) {
      notify(`Milestone merge failed (branch mode): ${msg}`, "warning");
    }
    // Re-throw all errors so callers can apply their own recovery (#4380).
    throw err;
  }
}

/**
 * Session-less merge entry (ADR-016 phase 2 / A1, issue #5618).
 *
 * Runs the worktree-mode or branch-mode merge body without touching session
 * state. Used directly by `parallel-merge.ts` and indirectly (via
 * `_mergeAndExit`) by the single-loop path. Caller is responsible for any
 * session-side cleanup based on the returned `mode`.
 *
 * **CWD anchor**: anchors `process.cwd()` at `originalBasePath` before
 * non-worktree merge paths to mirror the single-loop guard against ENOENT
 * after teardown (de73fb43d). Worktree-mode merge paths keep the real
 * worktree as cwd because `mergeMilestoneToMain()` infers source worktree
 * state from `process.cwd()`. Best-effort; silent on failure.
 *
 * **Failure handling**: `MergeConflictError` and other unrecoverable errors
 * propagate to the caller. The caller is responsible for any state restore
 * (single-loop callers re-`chdir` and `restoreToProjectRoot`; parallel
 * callers surface to the user as a `MergeResult` with `success: false`).
 */
export function mergeMilestoneStandalone(
  deps: WorktreeLifecycleDeps,
  mctx: MergeContext,
): MergeStandaloneResult {
  const { originalBasePath, worktreeBasePath, milestoneId, notify } = mctx;
  validateMilestoneId(milestoneId);
  if (!originalBasePath && !worktreeBasePath) {
    throw new Error(
      `Internal error: mergeMilestoneStandalone(${milestoneId}) requires originalBasePath or worktreeBasePath.`,
    );
  }

  if (mctx.isolationDegraded) {
    if (originalBasePath) {
      try {
        process.chdir(originalBasePath);
      } catch (err) {
        debugLog("WorktreeLifecycle", {
          action: "mergeAndExit",
          phase: "pre-merge-chdir-failed",
          milestoneId,
          originalBasePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    debugLog("WorktreeLifecycle", {
      action: "mergeAndExit",
      milestoneId,
      skipped: true,
      reason: "isolation-degraded",
    });
    notify(
      `Skipping worktree merge for ${milestoneId} — isolation was degraded (worktree creation failed earlier). Work is on the current branch.`,
      "info",
    );
    return {
      merged: false,
      mode: "skipped",
      codeFilesChanged: false,
      pushed: false,
    };
  }

  const mode = getIsolationMode(originalBasePath || worktreeBasePath);
  debugLog("WorktreeLifecycle", {
    action: "mergeAndExit",
    milestoneId,
    mode,
    basePath: worktreeBasePath,
  });
  emitJournalEvent(originalBasePath || worktreeBasePath, {
    ts: new Date().toISOString(),
    flowId: randomUUID(),
    seq: 0,
    eventType: "worktree-merge-start",
    data: { milestoneId, mode },
  });

  // #2625: If we are physically inside an auto-worktree, we MUST merge
  // regardless of the current isolation config. This prevents data loss
  // when the default isolation mode changes between versions.
  const inWorktree =
    lifecycleIsInAutoWorktree(deps, worktreeBasePath) && Boolean(originalBasePath);

  if (mode === "none" && !inWorktree) {
    debugLog("WorktreeLifecycle", {
      action: "mergeAndExit",
      milestoneId,
      skipped: true,
      reason: "mode-none",
    });
    // Anchor cwd at project root before the early return so subsequent
    // process.cwd() calls after the skip don't ENOENT if we were inside a
    // worktree directory that gets torn down later. Best-effort.
    if (originalBasePath) {
      try {
        process.chdir(originalBasePath);
      } catch {
        /* best-effort */
      }
    }
    return {
      merged: false,
      mode: "skipped",
      codeFilesChanged: false,
      pushed: false,
    };
  }

  // Set cwd to the correct anchor before dispatching to mode implementations.
  // Worktree mode / in-worktree override must run from the live worktree so
  // mergeMilestoneToMain can find worktree-local state; branch mode runs from
  // the original project root. Best-effort for synthetic test paths.
  const targetCwd = mode === "worktree" || inWorktree
    ? worktreeBasePath
    : originalBasePath;
  if (targetCwd) {
    try {
      process.chdir(targetCwd);
    } catch (err) {
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        phase: "pre-merge-chdir-failed",
        milestoneId,
        targetCwd,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (mode === "worktree" || inWorktree) {
    return _mergeWorktreeModeImpl(deps, mctx);
  }
  if (mode === "branch") {
    return _mergeBranchModeImpl(deps, mctx);
  }
  // Defensive fallback — should not reach here given the mode-none guard above.
  return {
    merged: false,
    mode: "skipped",
    codeFilesChanged: false,
    pushed: false,
  };
}

// ─── Module class ────────────────────────────────────────────────────────

/**
 * Worktree Lifecycle module instance.
 *
 * Constructed once per auto-mode session. Holds the session reference so
 * verbs can mutate `s.basePath` and related coordination state directly
 * without round-tripping through callers.
 */
export class WorktreeLifecycle {
  private readonly s: AutoSession;
  private readonly deps: WorktreeLifecycleDeps;

  constructor(s: AutoSession, deps: WorktreeLifecycleDeps) {
    this.s = s;
    this.deps = deps;
  }

  /**
   * Enter or create the auto-worktree for `milestoneId`. Idempotent if
   * already in this milestone (lease refreshed; basePath unchanged).
   *
   * Returns a typed `EnterResult` describing the outcome. Callers may
   * ignore the result if they read `s.basePath` directly afterwards
   * (legacy behaviour); new callers should branch on the result.
   */
  enterMilestone(milestoneId: string, ctx: NotifyCtx): EnterResult {
    return _enterMilestoneCore(this.s, this.deps, milestoneId, ctx);
  }

  /**
   * Exit the current worktree. With `opts.merge === true`, runs the full
   * merge-and-teardown path (worktree-mode or branch-mode auto-detected).
   * With `opts.merge === false`, runs auto-commit and teardown without
   * merging to main.
   *
   * Returns a typed `ExitResult`. `MergeConflictError` is surfaced as
   * `{ ok: false, reason: "merge-conflict", cause }` instead of thrown,
   * giving callers a typed branch for the expected failure path.
   * Unexpected failures (filesystem, git permissions, etc.) are wrapped
   * as `{ ok: false, reason: "teardown-failed", cause }` so callers always
   * receive a discriminated union — no exceptions for any expected outcome.
   */
  exitMilestone(
    milestoneId: string,
    opts: { merge: boolean; preserveBranch?: boolean },
    ctx: NotifyCtx,
  ): ExitResult {
    if (opts.merge) {
      try {
        const merged = this._mergeAndExit(milestoneId, ctx);
        return {
          ok: true,
          merged: merged.merged,
          codeFilesChanged: merged.codeFilesChanged,
        };
      } catch (err) {
        if (err instanceof MergeConflictError) {
          return { ok: false, reason: "merge-conflict", cause: err };
        }
        return { ok: false, reason: "teardown-failed", cause: err };
      }
    }
    try {
      this._exitWithoutMerge(milestoneId, ctx, {
        preserveBranch: opts.preserveBranch,
      });
      return { ok: true, merged: false, codeFilesChanged: false };
    } catch (err) {
      return { ok: false, reason: "teardown-failed", cause: err };
    }
  }

  /**
   * Milestone transition: merge the current milestone, then enter the next
   * one. Pattern used when the loop detects that the active milestone has
   * changed (current completed, next is now active). Caller is responsible
   * for re-deriving state between the merge and the enter.
   */
  mergeAndEnterNext(
    currentMilestoneId: string,
    nextMilestoneId: string,
    ctx: NotifyCtx,
  ): void {
    debugLog("WorktreeLifecycle", {
      action: "mergeAndEnterNext",
      currentMilestoneId,
      nextMilestoneId,
    });
    let merged = false;
    let mergeThrew = false;
    try {
      merged = this._mergeAndExit(currentMilestoneId, ctx).merged;
    } catch (err) {
      if (err instanceof UserNotifiedError) throw err;
      mergeThrew = true;
      // _mergeAndExit emits a warning and restores state on failure during
      // merge/cleanup. If it throws before recovery runs (e.g. validation,
      // emitJournalEvent), basePath isn't restored — re-throw so we don't
      // enter the next milestone with the current one unmerged.
      const projectRoot = resolveWorktreeProjectRoot(
        this.s.basePath,
        this.s.originalBasePath,
      );
      if (this.s.basePath !== projectRoot) throw err;
      // Otherwise: merge attempted, failed cleanly with state restored.
      // The loop intentionally continues to the next milestone — the
      // failed milestone's branch is preserved for manual recovery.
    }
    if (!merged && !mergeThrew && !this.s.isolationDegraded) {
      // _mergeAndExit returned without attempting a merge (no roadmap
      // → preserveBranch path) and state is restored. The current
      // milestone was deliberately NOT merged; halt before entering the
      // next so we don't silently strand commits on the preserved
      // branch. (#5602 halt-on-no-merge regression coverage.)
      //
      // mergeThrew=true means a merge was attempted but failed — that
      // path proceeds (existing test "enters next even if merge fails").
      // isolationDegraded=true means the loop intentionally continues
      // without merging — that path proceeds too.
      throw new Error(
        `Cannot enter milestone ${nextMilestoneId} because ${currentMilestoneId} was not merged`,
      );
    }
    _enterMilestoneCore(this.s, this.deps, nextMilestoneId, ctx);
  }

  // ── Private — exit without merge ─────────────────────────────────────

  private _exitWithoutMerge(
    milestoneId: string,
    ctx: NotifyCtx,
    opts: { preserveBranch?: boolean },
  ): void {
    validateMilestoneId(milestoneId);
    if (!lifecycleIsInAutoWorktree(this.deps, this.s.basePath)) {
      debugLog("WorktreeLifecycle", {
        action: "exitMilestone",
        milestoneId,
        skipped: true,
        reason: "not-in-worktree",
      });
      return;
    }

    debugLog("WorktreeLifecycle", {
      action: "exitMilestone",
      milestoneId,
      basePath: this.s.basePath,
    });

    try {
      autoCommitLifecycleBranch(this.deps, this.s.basePath, "stop", milestoneId);
    } catch (err) {
      debugLog("WorktreeLifecycle", {
        action: "exitMilestone",
        milestoneId,
        phase: "auto-commit-failed",
        error: err instanceof Error ? err.message : String(err),
      });
      ctx.notify(
        `Auto-commit before exiting ${milestoneId} failed: ${err instanceof Error ? err.message : String(err)}. Branch ${lifecycleAutoWorktreeBranch(this.deps, milestoneId)} is preserved for recovery.`,
        "warning",
      );
    }

    if (this.s.originalBasePath) {
      try {
        process.chdir(this.s.originalBasePath);
      } catch (err) {
        debugLog("WorktreeLifecycle", {
          action: "exitMilestone",
          milestoneId,
          phase: "pre-teardown-chdir-failed",
          originalBasePath: this.s.originalBasePath,
          error: err instanceof Error ? err.message : String(err),
        });
        ctx.notify(
          `Could not leave milestone worktree before cleanup: ${err instanceof Error ? err.message : String(err)}. Branch ${lifecycleAutoWorktreeBranch(this.deps, milestoneId)} is preserved for recovery.`,
          "warning",
        );
      }
    }

    let teardownFailed = false;
    try {
      lifecycleTeardownAutoWorktree(this.deps, this.s.originalBasePath, milestoneId, {
        preserveBranch: opts.preserveBranch ?? false,
      });
    } catch (err) {
      teardownFailed = true;
      debugLog("WorktreeLifecycle", {
        action: "exitMilestone",
        milestoneId,
        phase: "teardown-failed",
        error: err instanceof Error ? err.message : String(err),
      });
      ctx.notify(
        `Worktree cleanup failed for ${milestoneId}: ${err instanceof Error ? err.message : String(err)}. Branch ${lifecycleAutoWorktreeBranch(this.deps, milestoneId)} is preserved for recovery.`,
        "warning",
      );
    }

    this.restoreToProjectRoot();
    debugLog("WorktreeLifecycle", {
      action: "exitMilestone",
      milestoneId,
      result: "done",
      basePath: this.s.basePath,
    });
    ctx.notify(
      teardownFailed
        ? `Worktree exit for ${milestoneId} needs manual cleanup.`
        : `Exited worktree for ${milestoneId}`,
      teardownFailed ? "warning" : "info",
    );
  }

  // ── Private — merge and exit (worktree-mode or branch-mode) ──────────

  /**
   * Merge the completed milestone branch back to main and exit the worktree.
   *
   * Session-bound wrapper around `mergeMilestoneStandalone`. Builds a
   * `MergeContext` from `this.s`, layers session-side bookkeeping on top of
   * the result:
   *
   * - resquash-on-merge using `s.milestoneStartShas`
   * - merge-completion telemetry (duration)
   * - mode-specific session restore: worktree-mode → `restoreToProjectRoot`,
   *   branch-mode → `gitService` rebuild
   *
   * Returns the session-less merge result. Errors propagate after
   * `restoreToProjectRoot()` runs so callers always receive a consistent
   * session.
   */
  private _mergeAndExit(
    milestoneId: string,
    ctx: NotifyCtx,
  ): MergeStandaloneResult {
    // #4764 — telemetry: record start timestamp so we can emit merge duration.
    const mergeStartedAt = new Date().toISOString();
    const mergeStartMs = Date.now();

    let result: MergeStandaloneResult;
    try {
      result = mergeMilestoneStandalone(this.deps, {
        originalBasePath: this.s.originalBasePath,
        worktreeBasePath: this.s.basePath,
        milestoneId,
        isolationDegraded: this.s.isolationDegraded,
        notify: ctx.notify,
      });
    } catch (err) {
      // Standalone has already done its session-less cleanup
      // (chdir, SQUASH_MSG cleanup, journal event). Layer session-side
      // restore on top so callers get a consistent session.
      this.restoreToProjectRoot();
      throw err;
    }

    if (!result.merged) {
      // Skip / no-roadmap / mode-none paths. milestoneStartShas housekeeping
      // is unconditional; mode-specific session restore happens for
      // worktree-mode (preserve-branch path tore down the worktree, so
      // basePath must restore) and not for branch-mode (no basePath change).
      this.s.milestoneStartShas.delete(milestoneId);
      if (result.mode === "worktree") {
        this.restoreToProjectRoot();
        debugLog("WorktreeLifecycle", {
          action: "mergeAndExit",
          milestoneId,
          result: "done",
          basePath: this.s.basePath,
        });
      }
      return result;
    }

    // #4765 — when collapse_cadence=slice AND milestone_resquash=true, the
    // N per-slice commits on main should be collapsed into one milestone
    // commit. Done AFTER the primary merge-and-teardown so the branch and
    // worktree are already cleaned up; we operate on main directly.
    try {
      const startSha = this.s.milestoneStartShas.get(milestoneId);
      if (startSha) {
        const prefs = lifecycleLoadPreferences(
          this.deps,
          this.s.originalBasePath || this.s.basePath,
        )?.preferences;
        if (
          getCollapseCadence(prefs) === "slice" &&
          getMilestoneResquash(prefs)
        ) {
          const resquashResult = resquashMilestoneOnMain(
            this.s.originalBasePath || this.s.basePath,
            milestoneId,
            startSha,
          );
          if (resquashResult.resquashed) {
            ctx.notify(
              `slice-cadence: re-squashed slice commits for ${milestoneId} into a single milestone commit.`,
              "info",
            );
          }
        }
        this.s.milestoneStartShas.delete(milestoneId);
      }
    } catch (err) {
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        milestoneId,
        phase: "resquash",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // #4764 — record merge completion. Only reaches here when an actual
    // merge ran; failure paths throw out before this point.
    try {
      emitWorktreeMerged(
        this.s.originalBasePath || this.s.basePath,
        milestoneId,
        {
          reason: "milestone-complete",
          startedAt: mergeStartedAt,
          durationMs: Date.now() - mergeStartMs,
        },
      );
    } catch (telemetryErr) {
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        phase: "telemetry-emit",
        error:
          telemetryErr instanceof Error
            ? telemetryErr.message
            : String(telemetryErr),
      });
    }

    // Mode-specific session restore.
    if (result.mode === "worktree") {
      this.restoreToProjectRoot();
      debugLog("WorktreeLifecycle", {
        action: "mergeAndExit",
        milestoneId,
        result: "done",
        basePath: this.s.basePath,
      });
    } else if (result.mode === "branch") {
      // Rebuild GitService after merge (branch HEAD changed)
      rebuildGitService(this.s, this.deps);
    }
    return result;
  }

  // ── Removed: _mergeWorktreeMode / _mergeBranchMode bodies ────────────
  // The merge bodies moved to file-scope `_mergeWorktreeModeImpl` and
  // `_mergeBranchModeImpl`, callable from the session-less
  // `mergeMilestoneStandalone` entry. The previous private methods are
  // gone; `_mergeAndExit` above is the only session-bound caller.

  /**
   * Fall back to branch-mode for `milestoneId` after a failed worktree
   * creation, marking the session's isolation as degraded.
   *
   * Currently delegates to `enterBranchModeForMilestone` from auto-worktree.
   * Idempotent: subsequent calls in a degraded session are no-ops.
   *
   * Issue #5587 ships this as a thin adapter; the body extraction joins the
   * other merge-logic move-out in a follow-up cleanup slice.
   */
  degradeToBranchMode(milestoneId: string, ctx: NotifyCtx): void {
    if (this.s.isolationDegraded) {
      debugLog("WorktreeLifecycle", {
        action: "degradeToBranchMode",
        milestoneId,
        skipped: true,
        reason: "already-degraded",
      });
      return;
    }
    const basePath = resolveWorktreeProjectRoot(
      this.s.basePath,
      this.s.originalBasePath,
    );
    try {
      lifecycleEnterBranchMode(this.deps, basePath, milestoneId);
      rebuildGitService(this.s, this.deps);
      invalidateAllCaches();
      this.s.isolationDegraded = true;
      ctx.notify(
        `Switched to branch milestone/${milestoneId} (isolation degraded).`,
        "info",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.notify(
        `Branch isolation setup for ${milestoneId} failed: ${msg}. Continuing on current branch.`,
        "warning",
      );
      this.s.isolationDegraded = true;
    }
  }

  /**
   * Restore `s.basePath` to `s.originalBasePath`, chdir process cwd, and
   * rebuild `s.gitService`. No-op when `originalBasePath` is empty (fresh
   * sessions).
   *
   * Used by error/cleanup paths that need the session to behave as if the
   * worktree was never entered. Does NOT teardown the worktree directory —
   * callers that need teardown go through `exitMilestone({ merge: false })`.
   *
   * ADR-016 phase 3 (#5693): chdir lives inside the verb so callers do not
   * pair `restoreToProjectRoot()` with a redundant `process.chdir`. The
   * chdir runs BEFORE the throwable work (`rebuildGitService`, cache
   * invalidation) so that cleanup-path cwd is restored even if the
   * downstream rebuild throws. The chdir itself is best-effort; failure is
   * logged via debugLog and swallowed.
   */
  restoreToProjectRoot(): void {
    if (!this.s.originalBasePath) return;
    this.s.basePath = this.s.originalBasePath;
    try {
      process.chdir(this.s.basePath);
    } catch (err) {
      debugLog("WorktreeLifecycle", {
        action: "restoreToProjectRoot",
        result: "chdir-failed",
        basePath: this.s.basePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    rebuildGitService(this.s, this.deps);
    invalidateAllCaches();
  }

  /**
   * Adopt a session root (ADR-016 phase 2 / B2, issue #5620).
   *
   * Sole owner of `s.basePath` mutation for bootstrap-class transitions:
   * initial session start, paused-resume entry (before persisted-state
   * consultation), and hook-trigger session activation. Defensive about
   * `s.originalBasePath`:
   *
   * - When `originalBase` is explicit: overwrite.
   * - Otherwise, set `s.originalBasePath` only if it is currently empty —
   *   resume paths that already restored `s.originalBasePath` from paused
   *   metadata keep their value.
   *
   * Does NOT chdir; callers that need cwd alignment with the new basePath
   * are responsible for it. Does NOT rebuild `s.gitService` — callers that
   * mutate `s.basePath` to a non-project-root path (e.g. a worktree on a
   * subsequent milestone enter) go through `enterMilestone`, which handles
   * the rebuild.
   */
  adoptSessionRoot(base: string, originalBase?: string): void {
    this.s.basePath = base;
    if (originalBase !== undefined) {
      this.s.originalBasePath = originalBase;
    } else if (!this.s.originalBasePath) {
      this.s.originalBasePath = base;
    }
  }

  /**
   * Resume from a paused session (ADR-016 phase 2 / B3, issue #5621).
   *
   * Adopts `persistedWorktreePath` as `s.basePath` when the path is
   * non-null and exists on disk; otherwise falls back to `base`. Mirrors
   * the resume guard at `auto.ts:2164` — a stale or removed worktree
   * directory must not strand the resumed session in an invalid root.
   *
   * Folds in the body of the legacy `_resolvePausedResumeBasePathForTest`
   * helper (see `resolvePausedResumeBasePath` below). After this verb
   * lands the helper is deleted from `auto.ts` per the slice-7 closure
   * decision to retire `_*ForTest` suffixes from production paths.
   *
   * Like `adoptSessionRoot`, this is a pure session-state mutation — no
   * chdir, no git service rebuild, no cache invalidation.
   */
  resumeFromPausedSession(
    base: string,
    persistedWorktreePath: string | null,
  ): void {
    this.s.basePath = resolvePausedResumeBasePath(base, persistedWorktreePath);
  }

  /**
   * Adopt an orphan worktree for a bootstrap-time merge (ADR-016 phase 2 / B4,
   * issue #5622).
   *
   * Owns the swap-run-revert protocol that bootstrap previously open-coded:
   *
   *   1. Snapshot prior `s.basePath` and `s.originalBasePath`.
   *   2. Resolve `getAutoWorktreePath(base, milestoneId) ?? base` before
   *      mutating session state, then set `s.originalBasePath = base` and
   *      `s.basePath` to the resolved path.
   *   3. Invoke the caller-supplied `run` callback under the swap.
   *   4. On `!result.merged`: revert to `base` and `chdir(base)` so the
   *      caller can return early without leaving the session in a half-
   *      swapped state.
   *   5. On `result.merged && !s.active`: revert to the snapshotted prior
   *      paths (the orphan merge succeeded but bootstrap chose not to keep
   *      the session active).
   *   6. On `result.merged && s.active`: leave the swap in place — the
   *      loop will continue from the worktree path.
   *
   * The callback shape forces every caller through the same revert
   * protocol; an open-coded swap that forgets to revert on failure was the
   * original bug pattern this verb is designed to prevent.
   */
  adoptOrphanWorktree<T extends { merged: boolean }>(
    milestoneId: string,
    base: string,
    run: () => T,
  ): T {
    validateMilestoneId(milestoneId);

    const priorBasePath = this.s.basePath;
    const priorOriginalBasePath = this.s.originalBasePath;
    const restorePriorPaths = (phase: string): void => {
      this.s.basePath = priorBasePath || base;
      this.s.originalBasePath = priorOriginalBasePath || base;
      try {
        process.chdir(this.s.originalBasePath || base);
      } catch (err) {
        debugLog("WorktreeLifecycle", {
          action: "adoptOrphanWorktree",
          phase,
          base: this.s.originalBasePath || base,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    let adoptedBasePath: string;
    try {
      const wtPathFn =
        primitiveOverrides(this.deps).getAutoWorktreePath ?? getAutoWorktreePath;
      adoptedBasePath = wtPathFn(base, milestoneId) ?? base;
    } catch (err) {
      restorePriorPaths("rollback-resolve-worktree-failed");
      throw err;
    }

    // Swap into the orphan worktree.
    this.s.originalBasePath = base;
    this.s.basePath = adoptedBasePath;

    let result: T;
    try {
      result = run();
    } catch (err) {
      restorePriorPaths("rollback-run-failed");
      throw err;
    }

    if (!result.merged) {
      // Failed orphan merge — revert to project root so the caller can
      // safely return early without leaving the session in an invalid
      // basePath. Mirror the chdir that bootstrap performed inline.
      this.s.basePath = base;
      this.s.originalBasePath = base;
      try {
        process.chdir(base);
      } catch (err) {
        debugLog("WorktreeLifecycle", {
          action: "adoptOrphanWorktree",
          phase: "revert-chdir-failed",
          base,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return result;
    }

    if (!this.s.active) {
      // Merge succeeded but the session was not (re)activated — restore
      // the snapshotted paths so the calling context resumes where it
      // was, with the orphan branch now merged on main.
      this.s.basePath = priorBasePath || base;
      this.s.originalBasePath = priorOriginalBasePath || base;
    }
    // else: merged && active — leave the swap; the loop continues from
    // the worktree path. Subsequent milestone enters mutate `s.basePath`
    // through their own Lifecycle verbs.

    return result;
  }

  /** True if `milestoneId` is the session's currently-active milestone. */
  isInMilestone(milestoneId: string): boolean {
    return this.s.currentMilestoneId === milestoneId;
  }

  /** The active milestone id, or `null` if no milestone is active. */
  getCurrentMilestoneIfAny(): string | null {
    return this.s.currentMilestoneId;
  }
}
