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

import { randomUUID } from "node:crypto";

import type { AutoSession } from "./auto/session.js";
import { debugLog } from "./debug-logger.js";
import { emitJournalEvent } from "./journal.js";
import { emitWorktreeCreated } from "./worktree-telemetry.js";
import { resolveWorktreeProjectRoot } from "./worktree-root.js";
import {
  claimMilestoneLease,
  refreshMilestoneLease,
  releaseMilestoneLease,
} from "./db/milestone-leases.js";
import { MergeConflictError } from "./git-service.js";
import type { WorktreeResolver } from "./worktree-resolver.js";

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
  enterAutoWorktree: (basePath: string, milestoneId: string) => string;
  createAutoWorktree: (basePath: string, milestoneId: string) => string;
  enterBranchModeForMilestone: (basePath: string, milestoneId: string) => void;
  getAutoWorktreePath: (basePath: string, milestoneId: string) => string | null;
  getIsolationMode: (basePath?: string) => "worktree" | "branch" | "none";
  invalidateAllCaches: () => void;
  GitServiceImpl: new (basePath: string, gitConfig: unknown) => unknown;
  loadEffectiveGSDPreferences: () =>
    | { preferences?: { git?: Record<string, unknown> } }
    | undefined;
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

// ─── Validation ──────────────────────────────────────────────────────────

function isValidMilestoneId(milestoneId: string): boolean {
  return !/[\/\\]|\.\./.test(milestoneId);
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
      cause: new Error(
        `Invalid milestoneId: ${milestoneId} — contains path separators or traversal`,
      ),
    };
  }

  if (s.isolationDegraded) {
    debugLog("WorktreeLifecycle", {
      action: "enterMilestone",
      milestoneId,
      skipped: true,
      reason: "isolation-degraded",
    });
    return { ok: false, reason: "isolation-degraded" };
  }

  // Phase B: claim a milestone lease before any worktree mutation. Two
  // workers cannot enter the same milestone concurrently. Best-effort:
  // skip if no worker registered (single-worker fallback) or DB
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
  }

  // Resolve the project root for worktree operations via shared helper.
  // Handles the case where originalBasePath is falsy and basePath is itself
  // a worktree path — prevents double-nested worktree paths (#3729).
  const basePath = resolveWorktreeProjectRoot(s.basePath, s.originalBasePath);
  const mode = deps.getIsolationMode(basePath);

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
      deps.enterBranchModeForMilestone(basePath, milestoneId);
      // basePath does not change — no worktree, no chdir.
      // Rebuild GitService so the new HEAD is reflected, then flush any
      // path-keyed caches that may have been populated before the checkout.
      rebuildGitService(s, deps);
      deps.invalidateAllCaches();
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
    const existingPath = deps.getAutoWorktreePath(basePath, milestoneId);
    let wtPath: string;

    if (existingPath) {
      wtPath = deps.enterAutoWorktree(basePath, milestoneId);
    } else {
      wtPath = deps.createAutoWorktree(basePath, milestoneId);
    }

    s.basePath = wtPath;
    rebuildGitService(s, deps);

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

function rebuildGitService(
  s: AutoSession,
  deps: WorktreeLifecycleDeps,
): void {
  const gitConfig =
    deps.loadEffectiveGSDPreferences()?.preferences?.git ?? {};
  s.gitService = new deps.GitServiceImpl(
    s.basePath,
    gitConfig,
  ) as AutoSession["gitService"];
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
  private readonly resolverFactory?: () => WorktreeResolver;

  constructor(
    s: AutoSession,
    deps: WorktreeLifecycleDeps,
    resolverFactory?: () => WorktreeResolver,
  ) {
    this.s = s;
    this.deps = deps;
    this.resolverFactory = resolverFactory;
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
   *
   * Issue #5586 ships this as a delegating wrapper around
   * `WorktreeResolver.mergeAndExit`/`exitMilestone`. The full extraction
   * (~500 lines of merge logic across `_mergeWorktreeMode` and
   * `_mergeBranchMode`) happens in #5587 when `WorktreeResolver` retires.
   * The delegating shape preserves caller migration without rewriting
   * merge-conflict handling mid-flight.
   *
   * `codeFilesChanged` is best-effort `false` while delegation is in
   * place; #5587 will thread the actual value through once the merge
   * logic moves into the Module.
   */
  exitMilestone(
    milestoneId: string,
    opts: { merge: boolean; preserveBranch?: boolean },
    ctx: NotifyCtx,
  ): ExitResult {
    if (!this.resolverFactory) {
      throw new Error(
        "WorktreeLifecycle.exitMilestone requires a resolverFactory until #5587 retires WorktreeResolver",
      );
    }
    const resolver = this.resolverFactory();
    if (opts.merge) {
      try {
        resolver.mergeAndExit(milestoneId, ctx);
        return { ok: true, merged: true, codeFilesChanged: false };
      } catch (err) {
        if (err instanceof MergeConflictError) {
          return { ok: false, reason: "merge-conflict", cause: err };
        }
        return { ok: false, reason: "teardown-failed", cause: err };
      }
    }
    try {
      resolver.exitMilestone(milestoneId, ctx, {
        preserveBranch: opts.preserveBranch,
      });
      return { ok: true, merged: false, codeFilesChanged: false };
    } catch (err) {
      return { ok: false, reason: "teardown-failed", cause: err };
    }
  }
}
