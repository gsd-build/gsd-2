// Project/App: GSD-2
// File Purpose: Mutable auto-mode session state container.
/**
 * AutoSession — encapsulates all mutable auto-mode state into a single instance.
 *
 * Replaces ~40 module-level variables scattered across auto.ts with typed
 * properties on a class instance. Benefits:
 *
 * - reset() clears everything in one call (was 25+ manual resets in stopAuto)
 * - toJSON() provides diagnostic snapshots
 * - grep `s.` shows every state access
 * - Constructable for testing
 *
 * MAINTENANCE RULE: All new mutable auto-mode state MUST be added here as a
 * class property, not as a module-level variable in auto.ts. If the state
 * needs clearing on stop, add it to reset(). Tests in
 * auto-session-encapsulation.test.ts enforce that auto.ts has no module-level
 * `let` or `var` declarations.
 */

import type { Api, Model } from "@gsd/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { GitServiceImpl } from "../git-service.js";
import type { CaptureEntry } from "../captures.js";
import type { BudgetAlertLevel } from "../auto-budget.js";
import type { AutoOrchestrationModule } from "./contracts.js";
import { resolveWorktreeProjectRoot } from "../worktree-root.js";
import { normalizeRealPath } from "../paths.js";
import type { MilestoneScope } from "../workspace.js";

// ─── Exported Types ──────────────────────────────────────────────────────────

export interface CurrentUnit {
  type: string;
  id: string;
  startedAt: number;
}

export interface UnitRouting {
  tier: string;
  modelDowngraded: boolean;
}

export interface StartModel {
  provider: string;
  id: string;
}

export type ThinkingLevelSnapshot = ReturnType<ExtensionAPI["getThinkingLevel"]>;

export interface PendingVerificationRetry {
  unitId: string;
  failureContext: string;
  attempt: number;
}

export interface PendingOrchestrationDispatch {
  unitType: string;
  unitId: string;
  prompt: string;
  pauseAfterUatDispatch: boolean;
  state: import("../types.js").GSDState;
  mid: string | undefined;
  midTitle: string | undefined;
}

/**
 * A typed item enqueued by postUnitPostVerification for the main loop to
 * drain via the standard runUnit path. Replaces inline dispatch
 * (pi.sendMessage / s.cmdCtx.newSession()) for hooks, triage, and quick-tasks.
 */
export interface SidecarItem {
  kind: "hook" | "triage" | "quick-task";
  unitType: string;
  unitId: string;
  prompt: string;
  /** Model override for hook units (e.g. "anthropic/claude-3-5-sonnet"). */
  model?: string;
  /** Capture ID for quick-task items (already marked executed at enqueue time). */
  captureId?: string;
}

export interface PreExecFailure {
  /** Milestone/slice that failed (e.g. "M001/S02"). */
  unitId: string;
  /** Verbatim blocking check strings from the failed gate run. */
  blockingFindings: string[];
  /** Condensed gate verdict excerpt for context (status + rationale). */
  verdictExcerpt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const STUB_RECOVERY_THRESHOLD = 2;
export const NEW_SESSION_TIMEOUT_MS = 120_000;

// ─── AutoSession ─────────────────────────────────────────────────────────────

export class AutoSession {
  // ── Lifecycle ────────────────────────────────────────────────────────────
  active = false;
  paused = false;
  completionStopInProgress = false;
  preserveStepSurfaceAfterLoopExit = false;
  stepMode = false;
  verbose = false;
  activeEngineId: string | null = null;
  activeRunDir: string | null = null;
  cmdCtx: ExtensionCommandContext | null = null;

  // ── Paths ────────────────────────────────────────────────────────────────
  basePath = "";
  originalBasePath = "";
  // TODO(C8): remove basePath/originalBasePath once all readers use s.scope
  scope: MilestoneScope | null = null;

  // ── Coordination identity (Phase B — DB-backed coordination) ────────────
  /**
   * Worker registry ID set by registerAutoWorker() at session start. Used by
   * heartbeatAutoWorker() each loop iteration and by recordDispatchClaim()
   * to fence dispatch ledger writes against stale workers.
   */
  workerId: string | null = null;
  /**
   * Active milestone lease fencing token, set by claimMilestoneLease() inside
   * WorktreeLifecycle.enterMilestone(). Threaded into recordDispatchClaim()
   * as milestone_lease_token so out-of-band dispatches by a stale worker
   * are detectable.
   */
  milestoneLeaseToken: number | null = null;
  previousProjectRootEnv: string | null = null;
  hadProjectRootEnv = false;
  projectRootEnvCaptured = false;
  previousMilestoneLockEnv: string | null = null;
  hadMilestoneLockEnv = false;
  milestoneLockEnvCaptured = false;
  sessionMilestoneLock: string | null = null;
  gitService: GitServiceImpl | null = null;

  // ── Dispatch counters ────────────────────────────────────────────────────
  readonly unitDispatchCount = new Map<string, number>();
  readonly unitLifetimeDispatches = new Map<string, number>();
  readonly unitRecoveryCount = new Map<string, number>();

  // ── Timers ───────────────────────────────────────────────────────────────
  unitTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  wrapupWarningHandle: ReturnType<typeof setTimeout> | null = null;
  idleWatchdogHandle: ReturnType<typeof setInterval> | null = null;
  continueHereHandle: ReturnType<typeof setInterval> | null = null;

  // ── Current unit ─────────────────────────────────────────────────────────
  currentUnit: CurrentUnit | null = null;
  currentTraceId: string | null = null;
  currentTurnId: string | null = null;
  currentUnitRouting: UnitRouting | null = null;
  currentMilestoneId: string | null = null;

  // ── Model state ──────────────────────────────────────────────────────────
  autoModeStartModel: StartModel | null = null;
  /** Explicit /gsd model pin captured at bootstrap (session-scoped policy override). */
  manualSessionModelOverride: StartModel | null = null;
  currentUnitModel: Model<Api> | null = null;
  /** Fully-qualified model ID (provider/id) set after selectAndApplyModel + hook overrides (#2899). */
  currentDispatchedModelId: string | null = null;
  originalModelId: string | null = null;
  originalModelProvider: string | null = null;
  autoModeStartThinkingLevel: ThinkingLevelSnapshot | null = null;
  originalThinkingLevel: ThinkingLevelSnapshot | null = null;
  lastBudgetAlertLevel: BudgetAlertLevel = 0;

  // ── Recovery ─────────────────────────────────────────────────────────────
  pendingCrashRecovery: string | null = null;
  pendingVerificationRetry: PendingVerificationRetry | null = null;
  readonly verificationRetryCount = new Map<string, number>();
  readonly verificationRetryFailureHashes = new Map<string, string>();
  pausedSessionFile: string | null = null;
  pausedUnitType: string | null = null;
  pausedUnitId: string | null = null;
  resourceVersionOnStart: string | null = null;
  lastStateRebuildAt = 0;

  // ── Sidecar queue ─────────────────────────────────────────────────────
  sidecarQueue: SidecarItem[] = [];

  // ── Pre-exec gate failure context (#4551) ───────────────────────────
  /**
   * Persisted when a pre-execution gate fails on a plan-slice or refine-slice
   * unit. The planning → plan-slice dispatch rule reads this field and injects
   * the failure details into the next re-dispatch prompt so the LLM can fix the
   * specific issues instead of producing an identical plan.
   *
   * Cleared after it has been consumed (injected into the prompt) to avoid
   * stale context bleeding into unrelated slices.
   */
  lastPreExecFailure: PreExecFailure | null = null;
  /**
   * Tracks how many consecutive times each slice unit has failed pre-execution
   * checks. Keyed by unitId (e.g. "M001/S01"). Used to break the infinite
   * plan-slice → pre-exec fail → re-dispatch loop when the planner cannot fix
   * the issues after MAX_PRE_EXEC_RETRIES re-attempts.
   */
  readonly preExecRetryCount: Map<string, number> = new Map();

  // ── Tool invocation errors (#2883) ──────────────────────────────────
  /** Set when a GSD tool execution ends with isError due to malformed/truncated
   *  JSON arguments. Checked by postUnitPreVerification to break retry loops. */
  lastToolInvocationError: string | null = null;
  /** Agent-end messages from the just-finished unit, consumed during finalize. */
  lastUnitAgentEndMessages: unknown[] | null = null;
  /** Set when turn-level git action fails during closeout. */
  lastGitActionFailure: string | null = null;
  /** Last turn-level git action status captured during finalize. */
  lastGitActionStatus: "ok" | "failed" | null = null;

  // ── Isolation degradation ────────────────────────────────────────────
  /** Set to true when worktree creation fails; prevents merge of nonexistent branch. */
  isolationDegraded = false;

  // ── Merge guard ──────────────────────────────────────────────────────
  /** Set to true after phases.ts successfully calls mergeAndExit, so that
   *  stopAuto does not attempt the same merge a second time (#2645). */
  milestoneMergedInPhases = false;

  // #4765 — slice-cadence collapse: main-branch SHAs at the moment each
  // milestone's first slice merge began. Used by resquashMilestoneOnMain at
  // milestone completion to collapse N slice commits into one. Cleared when
  // the milestone finishes (or resquash runs).
  milestoneStartShas: Map<string, string> = new Map();

  // ── Dispatch circuit breakers ──────────────────────────────────────
  rewriteAttemptCount = 0;
  /** Tracks consecutive bootstrap attempts that found phase === "complete".
   *  Moved from module-level to per-session so s.reset() clears it (#1348). */
  consecutiveCompleteBootstraps = 0;

  // ── Metrics ──────────────────────────────────────────────────────────────
  autoStartTime = 0;
  lastPromptCharCount: number | undefined;
  lastBaselineCharCount: number | undefined;
  pendingQuickTasks: CaptureEntry[] = [];
  /** Timestamp of the last LLM request dispatch (ms since epoch). Used for proactive rate limiting. */
  lastRequestTimestamp = 0;

  // ── Safety harness ───────────────────────────────────────────────────────
  /** SHA of the pre-unit git checkpoint ref. Cleared on success or rollback. */
  checkpointSha: string | null = null;

  // ── Signal handler ───────────────────────────────────────────────────────
  sigtermHandler: (() => void) | null = null;

  // ── Remote command polling ───────────────────────────────────────────────
  /** Cleanup function returned by startCommandPolling(); null when not running. */
  commandPollingCleanup: (() => void) | null = null;

  // ── Orchestration seam ───────────────────────────────────────────────────
  orchestration: AutoOrchestrationModule | null = null;
  pendingOrchestrationDispatch: PendingOrchestrationDispatch | null = null;

  // ── Loop promise state ──────────────────────────────────────────────────
  // Per-unit resolve function and session-switch guard live at module level
  // in auto-loop.ts (_currentResolve, _sessionSwitchInFlight).

  // ── Methods ──────────────────────────────────────────────────────────────

  clearTimers(): void {
    if (this.unitTimeoutHandle) { clearTimeout(this.unitTimeoutHandle); this.unitTimeoutHandle = null; }
    if (this.wrapupWarningHandle) { clearTimeout(this.wrapupWarningHandle); this.wrapupWarningHandle = null; }
    if (this.idleWatchdogHandle) { clearInterval(this.idleWatchdogHandle); this.idleWatchdogHandle = null; }
    if (this.continueHereHandle) { clearInterval(this.continueHereHandle); this.continueHereHandle = null; }
  }

  resetDispatchCounters(): void {
    this.unitDispatchCount.clear();
    this.unitLifetimeDispatches.clear();
  }

  get lockBasePath(): string {
    return resolveWorktreeProjectRoot(this.basePath, this.originalBasePath);
  }

  /**
   * Canonical project root for state-derivation reads AND writer paths.
   *
   * Prefers the realpath-normalized projectRoot from the MilestoneScope
   * (introduced by PR #5236), falling back to resolveWorktreeProjectRoot
   * during early lifecycle / engine-bypass paths where scope may be null.
   *
   * Always realpath-normalized so cache keys (e.g. deriveState's _stateCache)
   * cannot drift across worktree↔project-root path-string variants for the
   * same filesystem location.
   */
  get canonicalProjectRoot(): string {
    const root =
      this.scope?.workspace.projectRoot
        ?? resolveWorktreeProjectRoot(this.basePath, this.originalBasePath);
    return normalizeRealPath(root);
  }

  reset(): void {
    this.clearTimers();

    // Lifecycle
    this.active = false;
    this.paused = false;
    this.completionStopInProgress = false;
    this.preserveStepSurfaceAfterLoopExit = false;
    this.stepMode = false;
    this.verbose = false;
    this.activeEngineId = null;
    this.activeRunDir = null;
    this.cmdCtx = null;

    // Paths
    this.basePath = "";
    this.originalBasePath = "";
    this.scope = null;
    this.workerId = null;
    this.milestoneLeaseToken = null;
    this.previousProjectRootEnv = null;
    this.hadProjectRootEnv = false;
    this.projectRootEnvCaptured = false;
    this.previousMilestoneLockEnv = null;
    this.hadMilestoneLockEnv = false;
    this.milestoneLockEnvCaptured = false;
    this.sessionMilestoneLock = null;
    this.gitService = null;

    // Dispatch
    this.unitDispatchCount.clear();
    this.unitLifetimeDispatches.clear();
    this.unitRecoveryCount.clear();

    // Unit
    this.currentUnit = null;
    this.currentTraceId = null;
    this.currentTurnId = null;
    this.currentUnitRouting = null;
    this.currentMilestoneId = null;

    // Model
    this.autoModeStartModel = null;
    this.manualSessionModelOverride = null;
    this.currentUnitModel = null;
    this.currentDispatchedModelId = null;
    this.originalModelId = null;
    this.originalModelProvider = null;
    this.autoModeStartThinkingLevel = null;
    this.originalThinkingLevel = null;
    this.lastBudgetAlertLevel = 0;

    // Recovery
    this.pendingCrashRecovery = null;
    this.pendingVerificationRetry = null;
    this.verificationRetryCount.clear();
    this.verificationRetryFailureHashes.clear();
    this.pausedSessionFile = null;
    this.pausedUnitType = null;
    this.pausedUnitId = null;
    this.resourceVersionOnStart = null;
    this.lastStateRebuildAt = 0;

    // Metrics
    this.autoStartTime = 0;
    this.lastPromptCharCount = undefined;
    this.lastBaselineCharCount = undefined;
    this.pendingQuickTasks = [];
    this.lastRequestTimestamp = 0;
    this.sidecarQueue = [];
    this.rewriteAttemptCount = 0;
    this.consecutiveCompleteBootstraps = 0;
    this.lastPreExecFailure = null;
    this.preExecRetryCount.clear();
    this.lastToolInvocationError = null;
    this.lastUnitAgentEndMessages = null;
    this.lastGitActionFailure = null;
    this.lastGitActionStatus = null;
    this.isolationDegraded = false;
    this.milestoneMergedInPhases = false;
    this.milestoneStartShas = new Map();
    this.checkpointSha = null;

    // Signal handler
    this.sigtermHandler = null;

    // Remote command polling — cleanup must be called before reset (auto.ts stopAuto)
    this.commandPollingCleanup = null;

    // Orchestration seam
    this.orchestration = null;
    this.pendingOrchestrationDispatch = null;

    // Loop promise state lives in auto-loop.ts module scope
  }

  resetAfterStop(options: { preserveCompletionSurface?: boolean } = {}): void {
    const completionStopInProgress = options.preserveCompletionSurface ? this.completionStopInProgress : false;
    this.reset();
    this.completionStopInProgress = completionStopInProgress;
  }

  toJSON(): Record<string, unknown> {
    const orchestrationStatus = this.orchestration?.getStatus();
    return {
      active: this.active,
      paused: this.paused,
      stepMode: this.stepMode,
      basePath: this.basePath,
      activeEngineId: this.activeEngineId,
      activeRunDir: this.activeRunDir,
      currentMilestoneId: this.currentMilestoneId,
      currentUnit: this.currentUnit,
      orchestrationPhase: orchestrationStatus?.phase,
      orchestrationTransitionCount: orchestrationStatus?.transitionCount,
      orchestrationLastTransitionAt: orchestrationStatus?.lastTransitionAt,
      unitDispatchCount: Object.fromEntries(this.unitDispatchCount),
    };
  }
}
