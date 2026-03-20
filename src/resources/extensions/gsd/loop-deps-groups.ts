/**
 * LoopDeps sub-interfaces — role-based decomposition of auto.ts dependencies.
 *
 * These interfaces formalize the ~58 modules imported by auto.ts into typed
 * dependency groups. Each group represents a logical role in the auto-loop.
 *
 * Unlike engine-types.ts (a leaf node), this file IMPORTS types from existing
 * GSD modules — it wraps them into contracts for S02's engine implementations.
 *
 * Groups were derived by analyzing every import in auto.ts and clustering by
 * functional role. Small groups (<3 methods) were merged into related groups.
 *
 * @see auto.ts — the consumer of these dependency groups
 * @see engine-types.ts — the leaf-node engine abstractions (no GSD imports)
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { GSDState, SlicePlan, Summary, SecretsManifest } from "./types.js";
import type { AutoSession } from "./auto/session.js";
import type { GSDPreferences } from "./preferences.js";
import type { DispatchAction, DispatchContext } from "./auto-dispatch.js";
import type { ModelSelectionResult } from "./auto-model-selection.js";
import type { VerificationContext } from "./auto-verification.js";
import type { PostUnitContext } from "./auto-post-unit.js";
import type { SupervisionContext } from "./auto-timers.js";
import type { RecoveryContext } from "./auto-timeout-recovery.js";

// Inline type stubs for modules reorganized by ADR-004
/** Context for stuck detection — placeholder for reorganized auto-stuck-detection module */
interface StuckContext { basePath: string; unitType: string; unitId: string }
/** Context for idempotency checking — placeholder for reorganized auto-idempotency module */
interface IdempotencyContext { basePath: string; unitType: string; unitId: string }

import type { BootstrapDeps } from "./auto-start.js";
import type { GitServiceImpl } from "./git-service.js";
import type { CaptureEntry } from "./captures.js";

// Re-export context interfaces for downstream convenience
export type {
  DispatchContext,
  VerificationContext,
  PostUnitContext,
  SupervisionContext,
  StuckContext,
  IdempotencyContext,
  RecoveryContext,
  BootstrapDeps,
};

// ─── 1. GitOps ───────────────────────────────────────────────────────────────

/**
 * Git operations: commit, merge, worktree lifecycle, branch management.
 *
 * Modules: auto-worktree.ts, worktree.ts, git-service.ts, native-git-bridge.ts,
 *          gitignore.ts, git-self-heal.ts
 */
export interface GitOps {
  // ── Worktree lifecycle (auto-worktree.ts) ──

  /** @see auto-worktree.ts:createAutoWorktree */
  createAutoWorktree(basePath: string, milestoneId: string): string;
  /** @see auto-worktree.ts:enterAutoWorktree */
  enterAutoWorktree(basePath: string, milestoneId: string): string;
  /** @see auto-worktree.ts:teardownAutoWorktree */
  teardownAutoWorktree(basePath: string, milestoneId: string, opts?: { force?: boolean }): void;
  /** @see auto-worktree.ts:isInAutoWorktree */
  isInAutoWorktree(basePath: string): boolean;
  /** @see auto-worktree.ts:getAutoWorktreePath */
  getAutoWorktreePath(basePath: string, milestoneId: string): string | null;
  /** @see auto-worktree.ts:getAutoWorktreeOriginalBase */
  getAutoWorktreeOriginalBase(): string | null;
  /** @see auto-worktree.ts:mergeMilestoneToMain */
  mergeMilestoneToMain(basePath: string, milestoneId: string, mainBranch: string, opts?: { squash?: boolean }): void;
  /** @see auto-worktree.ts:autoWorktreeBranch */
  autoWorktreeBranch(milestoneId: string): string;

  // ── Branch operations (worktree.ts) ──

  /** @see worktree.ts:autoCommitCurrentBranch */
  autoCommitCurrentBranch(basePath: string, message: string, opts?: { allowEmpty?: boolean }): string | null;
  /** @see worktree.ts:captureIntegrationBranch */
  captureIntegrationBranch(basePath: string, milestoneId: string): void;
  /** @see worktree.ts:detectWorktreeName */
  detectWorktreeName(basePath: string): string | null;
  /** @see worktree.ts:getCurrentBranch */
  getCurrentBranch(basePath: string): string;
  /** @see worktree.ts:getMainBranch */
  getMainBranch(basePath: string): string;
  /** @see worktree.ts:parseSliceBranch */
  parseSliceBranch(branchName: string): { milestoneId: string; sliceId: string; worktreeName: string | null } | null;
  /** @see worktree.ts:setActiveMilestoneId */
  setActiveMilestoneId(basePath: string, milestoneId: string | null): void;

  // ── Git service (git-service.ts) ──

  /** @see git-service.ts:createGitService */
  createGitService(basePath: string): GitServiceImpl;

  // ── Native git (native-git-bridge.ts) ──

  /** @see native-git-bridge.ts:nativeIsRepo */
  nativeIsRepo(basePath: string): boolean;
  /** @see native-git-bridge.ts:nativeInit */
  nativeInit(basePath: string, initialBranch?: string): void;
  /** @see native-git-bridge.ts:nativeAddAll */
  nativeAddAll(basePath: string): void;
  /** @see native-git-bridge.ts:nativeCommit */
  nativeCommit(basePath: string, message: string, opts?: { allowEmpty?: boolean }): string;

  // ── Gitignore (gitignore.ts) ──

  /** @see gitignore.ts:ensureGitignore */
  ensureGitignore(basePath: string, options?: { manageGitignore?: boolean }): boolean;
  /** @see gitignore.ts:untrackRuntimeFiles */
  untrackRuntimeFiles(basePath: string): void;

  // ── Error formatting (git-self-heal.ts) ──

  /** @see git-self-heal.ts:formatGitError */
  formatGitError(error: string | Error): string;
}

// ─── 2. StateOps ─────────────────────────────────────────────────────────────

/**
 * State derivation, cache management, file parsing, and path resolution.
 *
 * Modules: state.ts, cache.ts, files.ts, paths.ts
 */
export interface StateOps {
  // ── State (state.ts) ──

  /** @see state.ts:deriveState */
  deriveState(basePath: string): Promise<GSDState>;

  // ── Cache (cache.ts) ──

  /** @see cache.ts:invalidateAllCaches */
  invalidateAllCaches(): void;

  // ── File operations (files.ts) ──

  /** @see files.ts:loadFile */
  loadFile(path: string): Promise<string | null>;
  /** @see files.ts:getManifestStatus */
  getManifestStatus(basePath: string, milestoneId: string): Promise<{ needed: boolean; manifest: SecretsManifest | null }>;
  /** @see files.ts:resolveAllOverrides */
  resolveAllOverrides(basePath: string): Promise<void>;
  /** @see files.ts:parsePlan */
  parsePlan(content: string): SlicePlan;
  /** @see files.ts:parseSummary */
  parseSummary(content: string): Summary;

  // ── Path resolution (paths.ts) ──

  /** @see paths.ts:gsdRoot */
  gsdRoot(basePath: string): string;
  /** @see paths.ts:milestonesDir */
  milestonesDir(basePath: string): string;
  /** @see paths.ts:resolveMilestoneFile */
  resolveMilestoneFile(basePath: string, milestoneId: string, suffix: string): string | null;
  /** @see paths.ts:resolveMilestonePath */
  resolveMilestonePath(basePath: string, milestoneId: string): string | null;
  /** @see paths.ts:resolveSliceFile */
  resolveSliceFile(basePath: string, milestoneId: string, sliceId: string, suffix: string): string | null;
  /** @see paths.ts:resolveSlicePath */
  resolveSlicePath(basePath: string, milestoneId: string, sliceId: string): string | null;
  /** @see paths.ts:resolveDir */
  resolveDir(parentDir: string, idPrefix: string): string | null;
  /** @see paths.ts:resolveTasksDir */
  resolveTasksDir(basePath: string, milestoneId: string, sliceId: string): string | null;
  /** @see paths.ts:resolveTaskFile */
  resolveTaskFile(basePath: string, milestoneId: string, sliceId: string, taskId: string, suffix: string): string | null;
  /** @see paths.ts:buildTaskFileName */
  buildTaskFileName(taskId: string, suffix: string): string;
}

// ─── 3. DispatchOps ──────────────────────────────────────────────────────────

/**
 * Dispatch resolution, prompt building, and dispatch guards.
 *
 * Modules: auto-dispatch.ts, auto-prompts.ts, prompt-loader.ts, dispatch-guard.ts
 */
export interface DispatchOps {
  // ── Dispatch (auto-dispatch.ts) ──

  /** @see auto-dispatch.ts:resolveDispatch */
  resolveDispatch(ctx: DispatchContext): Promise<DispatchAction>;
  /** @see auto-dispatch.ts:resetRewriteCircuitBreaker */
  resetRewriteCircuitBreaker(): void;

  // ── Prompt loading (prompt-loader.ts) ──

  /** @see prompt-loader.ts:loadPrompt */
  loadPrompt(name: string, vars?: Record<string, string>): string;

  // ── Dispatch guard (dispatch-guard.ts) ──

  /** @see dispatch-guard.ts:getPriorSliceCompletionBlocker */
  getPriorSliceCompletionBlocker(base: string, mainBranch: string, unitType: string, unitId: string): string | null;
}

// ─── 4. ModelAndBudgetOps ────────────────────────────────────────────────────

/**
 * Model selection, preferences, context budgets, cost tracking, and routing history.
 *
 * Merged from ModelOps + BudgetOps + routing — these are tightly coupled through
 * the model selection → budget enforcement → routing history pipeline.
 *
 * Modules: auto-model-selection.ts, preferences.ts, context-budget.ts,
 *          auto-budget.ts, metrics.ts, routing-history.ts
 */
export interface ModelAndBudgetOps {
  // ── Model selection (auto-model-selection.ts) ──

  /** @see auto-model-selection.ts:selectAndApplyModel */
  selectAndApplyModel(
    ctx: ExtensionContext,
    pi: ExtensionAPI,
    unitType: string,
    unitId: string,
    basePath: string,
    prefs: GSDPreferences | undefined,
    verbose: boolean,
    autoModeStartModel: { provider: string; id: string } | null,
  ): Promise<ModelSelectionResult>;

  // ── Preferences (preferences.ts) ──

  /** @see preferences.ts:loadEffectiveGSDPreferences */
  loadEffectiveGSDPreferences(): { preferences: GSDPreferences; source: string } | null;
  /** @see preferences.ts:resolveAutoSupervisorConfig */
  resolveAutoSupervisorConfig(prefs: GSDPreferences | undefined): { unitTimeoutMinutes: number; wrapupWarningMinutes: number; idleTimeoutMinutes: number };
  /** @see preferences.ts:resolveSkillDiscoveryMode */
  resolveSkillDiscoveryMode(prefs: GSDPreferences | undefined): string;
  /** @see preferences.ts:getIsolationMode */
  getIsolationMode(): "none" | "worktree" | "branch";

  // ── Context budgets (context-budget.ts) ──

  /** @see context-budget.ts:computeBudgets */
  computeBudgets(contextWindow: number, provider?: string): { system: number; prompt: number; response: number };
  /** @see context-budget.ts:resolveExecutorContextWindow */
  resolveExecutorContextWindow(modelId: string, provider: string): number;

  // ── Budget alerting (auto-budget.ts) ──

  /** @see auto-budget.ts:getBudgetAlertLevel */
  getBudgetAlertLevel(budgetPct: number): number;
  /** @see auto-budget.ts:getNewBudgetAlertLevel */
  getNewBudgetAlertLevel(previousLevel: number, budgetPct: number): number | null;
  /** @see auto-budget.ts:getBudgetEnforcementAction */
  getBudgetEnforcementAction(level: number, prefs: GSDPreferences | undefined): "continue" | "warn" | "pause" | "stop";

  // ── Metrics (metrics.ts) ──

  /** @see metrics.ts:initMetrics */
  initMetrics(base: string): void;
  /** @see metrics.ts:resetMetrics */
  resetMetrics(): void;
  /** @see metrics.ts:getLedger */
  getLedger(): unknown;
  /** @see metrics.ts:getProjectTotals */
  getProjectTotals(units: unknown[]): { totalCost: number; totalInputTokens: number; totalOutputTokens: number };
  /** @see metrics.ts:formatCost */
  formatCost(cost: number): string;
  /** @see metrics.ts:formatTokenCount */
  formatTokenCount(count: number): string;

  // ── Routing history (routing-history.ts) ──

  /** @see routing-history.ts:initRoutingHistory */
  initRoutingHistory(base: string): void;
  /** @see routing-history.ts:resetRoutingHistory */
  resetRoutingHistory(): void;
  /** @see routing-history.ts:recordOutcome */
  recordOutcome(unitType: string, unitId: string, tier: string, success: boolean, durationMs: number): void;
}

// ─── 5. VerificationOps ──────────────────────────────────────────────────────

/**
 * Verification gate execution, evidence writing, and post-unit verification.
 *
 * Modules: auto-verification.ts, verification-gate.ts, verification-evidence.ts
 */
export interface VerificationOps {
  // ── Post-unit verification (auto-verification.ts) ──

  /** @see auto-verification.ts:runPostUnitVerification */
  runPostUnitVerification(
    vctx: VerificationContext,
    dispatchNextUnit: (ctx: ExtensionContext, pi: ExtensionAPI) => Promise<void>,
    startDispatchGapWatchdog: (ctx: ExtensionContext, pi: ExtensionAPI) => void,
    pauseAuto: (ctx?: ExtensionContext, pi?: ExtensionAPI) => Promise<void>,
  ): Promise<"continue" | "retry" | "pause">;

  // ── Verification gate (verification-gate.ts) ──

  /** @see verification-gate.ts:runVerificationGate */
  runVerificationGate(options: {
    basePath: string;
    unitType: string;
    unitId: string;
    milestoneId: string;
    sliceId?: string;
    taskId?: string;
  }): { passed: boolean; checks: unknown[]; failures: unknown[] };
  /** @see verification-gate.ts:formatFailureContext */
  formatFailureContext(result: { passed: boolean; checks: unknown[]; failures: unknown[] }): string;
  /** @see verification-gate.ts:captureRuntimeErrors */
  captureRuntimeErrors(basePath: string, unitType: string, unitId: string): Promise<string[]>;
  /** @see verification-gate.ts:runDependencyAudit */
  runDependencyAudit(basePath: string, unitType: string, unitId: string): { issues: string[] };

  // ── Evidence writing (verification-evidence.ts) ──

  /** @see verification-evidence.ts:writeVerificationJSON */
  writeVerificationJSON(basePath: string, unitType: string, unitId: string, result: unknown): void;
}

// ─── 6. RecoveryOps ──────────────────────────────────────────────────────────

/**
 * Artifact recovery, stuck detection, idempotency, crash recovery, timeout
 * recovery, health checks, and doctor integration.
 *
 * Modules: auto-recovery.ts, auto-stuck-detection.ts, auto-idempotency.ts,
 *          auto-timeout-recovery.ts, crash-recovery.ts, session-forensics.ts,
 *          resource-version.ts, doctor.ts, doctor-proactive.ts
 */
export interface RecoveryOps {
  // ── Artifact recovery (auto-recovery.ts) ──

  /** @see auto-recovery.ts:resolveExpectedArtifactPath */
  resolveExpectedArtifactPath(unitType: string, unitId: string, base: string): string | null;
  /** @see auto-recovery.ts:verifyExpectedArtifact */
  verifyExpectedArtifact(unitType: string, unitId: string, base: string): boolean;
  /** @see auto-recovery.ts:writeBlockerPlaceholder */
  writeBlockerPlaceholder(unitType: string, unitId: string, base: string, reason: string): string | null;
  /** @see auto-recovery.ts:diagnoseExpectedArtifact */
  diagnoseExpectedArtifact(unitType: string, unitId: string, base: string): string | null;
  /** @see auto-recovery.ts:skipExecuteTask */
  skipExecuteTask(base: string, unitType: string, unitId: string, reason: string): void;
  /** @see auto-recovery.ts:completedKeysPath */
  completedKeysPath(base: string): string;
  /** @see auto-recovery.ts:persistCompletedKey */
  persistCompletedKey(base: string, key: string): void;
  /** @see auto-recovery.ts:removePersistedKey */
  removePersistedKey(base: string, key: string): void;
  /** @see auto-recovery.ts:loadPersistedKeys */
  loadPersistedKeys(base: string, target: Set<string>): void;
  /** @see auto-recovery.ts:selfHealRuntimeRecords */
  selfHealRuntimeRecords(basePath: string, completedKeySet: Set<string>): Promise<void>;
  /** @see auto-recovery.ts:buildLoopRemediationSteps */
  buildLoopRemediationSteps(unitType: string, unitId: string, base: string): string | null;
  /** @see auto-recovery.ts:reconcileMergeState */
  reconcileMergeState(basePath: string, ctx: ExtensionContext): boolean;

  // ── Stuck detection (auto-stuck-detection.ts) ──

  /** @see auto-stuck-detection.ts:checkStuckAndRecover */
  checkStuckAndRecover(sctx: StuckContext): Promise<{ action: "continue" | "skip" | "stop"; reason?: string }>;

  // ── Idempotency (auto-idempotency.ts) ──

  /** @see auto-idempotency.ts:checkIdempotency */
  checkIdempotency(ictx: IdempotencyContext): { action: "dispatch" | "skip" | "complete" | "recover"; reason?: string };

  // ── Timeout recovery (auto-timeout-recovery.ts) ──

  /** @see auto-timeout-recovery.ts:recoverTimedOutUnit */
  recoverTimedOutUnit(
    ctx: ExtensionContext,
    pi: ExtensionAPI,
    unitType: string,
    unitId: string,
    reason: "idle" | "hard",
    rctx: RecoveryContext,
  ): Promise<"recovered" | "paused">;

  // ── Crash recovery (crash-recovery.ts) ──

  /** @see crash-recovery.ts:writeLock */
  writeLock(basePath: string, milestoneId: string, pid: number, startedAt: number): void;
  /** @see crash-recovery.ts:clearLock */
  clearLock(basePath: string): void;
  /** @see crash-recovery.ts:readCrashLock */
  readCrashLock(basePath: string): { milestoneId: string; pid: number; startedAt: number } | null;
  /** @see crash-recovery.ts:isLockProcessAlive */
  isLockProcessAlive(lock: { pid: number }): boolean;
  /** @see crash-recovery.ts:formatCrashInfo */
  formatCrashInfo(lock: { milestoneId: string; pid: number; startedAt: number }): string;

  // ── Session forensics (session-forensics.ts) ──

  /** @see session-forensics.ts:synthesizeCrashRecovery */
  synthesizeCrashRecovery(basePath: string, milestoneId: string, activityDir: string): string | null;
  /** @see session-forensics.ts:getDeepDiagnostic */
  getDeepDiagnostic(basePath: string): string | null;

  // ── Resource staleness (resource-version.ts) ──

  /** @see resource-version.ts:readResourceVersion */
  readResourceVersion(): string | null;
  /** @see resource-version.ts:checkResourcesStale */
  checkResourcesStale(versionOnStart: string | null): string | null;
  /** @see resource-version.ts:escapeStaleWorktree */
  escapeStaleWorktree(base: string): string;

  // ── Doctor / health (doctor.ts, doctor-proactive.ts) ──

  /** @see doctor.ts:runGSDDoctor */
  runGSDDoctor(basePath: string, options?: { fix?: boolean; scope?: string; fixLevel?: "task" | "all"; isolationMode?: "none" | "worktree" | "branch" }): Promise<unknown>;
  /** @see doctor.ts:rebuildState */
  rebuildState(basePath: string): Promise<void>;
  /** @see doctor.ts:summarizeDoctorIssues */
  summarizeDoctorIssues(report: unknown): string;
  /** @see doctor-proactive.ts:preDispatchHealthGate */
  preDispatchHealthGate(basePath: string): Promise<{ proceed: boolean; action?: string; reason?: string }>;
  /** @see doctor-proactive.ts:recordHealthSnapshot */
  recordHealthSnapshot(errors: number, warnings: number, fixesApplied: number): void;
  /** @see doctor-proactive.ts:checkHealEscalation */
  checkHealEscalation(basePath: string, options?: { maxConsecutiveErrors?: number }): { escalate: boolean; reason?: string };
  /** @see doctor-proactive.ts:resetProactiveHealing */
  resetProactiveHealing(): void;
  /** @see doctor-proactive.ts:formatHealthSummary */
  formatHealthSummary(): string;
  /** @see doctor-proactive.ts:getConsecutiveErrorUnits */
  getConsecutiveErrorUnits(): number;
}

// ─── 7. SupervisionOps ───────────────────────────────────────────────────────

/**
 * Unit timeout supervision, SIGTERM handling, and tool flight tracking.
 *
 * Modules: auto-timers.ts, auto-supervisor.ts, auto-tool-tracking.ts
 */
export interface SupervisionOps {
  // ── Timers (auto-timers.ts) ──

  /** @see auto-timers.ts:startUnitSupervision */
  startUnitSupervision(sctx: SupervisionContext): void;

  // ── Supervisor (auto-supervisor.ts) ──

  /** @see auto-supervisor.ts:registerSigtermHandler */
  registerSigtermHandler(basePath: string, handler: () => void): void;
  /** @see auto-supervisor.ts:deregisterSigtermHandler */
  deregisterSigtermHandler(handler: (() => void) | null): void;
  /** @see auto-supervisor.ts:detectWorkingTreeActivity */
  detectWorkingTreeActivity(cwd: string): boolean;

  // ── Tool tracking (auto-tool-tracking.ts) ──

  /** @see auto-tool-tracking.ts:markToolStart */
  markToolStart(toolCallId: string, isActive: boolean): void;
  /** @see auto-tool-tracking.ts:markToolEnd */
  markToolEnd(toolCallId: string): void;
  /** @see auto-tool-tracking.ts:getOldestInFlightToolAgeMs */
  getOldestInFlightToolAgeMs(): number;
  /** @see auto-tool-tracking.ts:getInFlightToolCount */
  getInFlightToolCount(): number;
  /** @see auto-tool-tracking.ts:getOldestInFlightToolStart */
  getOldestInFlightToolStart(): number | undefined;
  /** @see auto-tool-tracking.ts:clearInFlightTools */
  clearInFlightTools(): void;
}

// ─── 8. PostUnitOps ──────────────────────────────────────────────────────────

/**
 * Pre/post verification processing, unit closeout, and hook lifecycle.
 *
 * Modules: auto-post-unit.ts, auto-unit-closeout.ts, post-unit-hooks.ts
 */
export interface PostUnitOps {
  // ── Post-unit processing (auto-post-unit.ts) ──

  /** @see auto-post-unit.ts:postUnitPreVerification */
  postUnitPreVerification(pctx: PostUnitContext): Promise<"dispatched" | "continue">;
  /** @see auto-post-unit.ts:postUnitPostVerification */
  postUnitPostVerification(pctx: PostUnitContext): Promise<"dispatched" | "continue" | "step-wizard" | "stopped">;

  // ── Closeout (auto-unit-closeout.ts) ──

  /** @see auto-unit-closeout.ts:closeoutUnit */
  closeoutUnit(
    ctx: ExtensionContext,
    basePath: string,
    unitType: string,
    unitId: string,
    startedAt: number,
    opts?: Record<string, unknown>,
  ): Promise<string | undefined>;

  // ── Hooks (post-unit-hooks.ts) ──

  /** @see post-unit-hooks.ts:checkPostUnitHooks */
  checkPostUnitHooks(unitType: string, unitId: string, basePath: string, ctx: ExtensionContext): Promise<void>;
  /** @see post-unit-hooks.ts:getActiveHook */
  getActiveHook(): { hookName: string; phase: string } | null;
  /** @see post-unit-hooks.ts:resetHookState */
  resetHookState(): void;
  /** @see post-unit-hooks.ts:isRetryPending */
  isRetryPending(): boolean;
  /** @see post-unit-hooks.ts:consumeRetryTrigger */
  consumeRetryTrigger(): { unitType: string; unitId: string } | null;
  /** @see post-unit-hooks.ts:runPreDispatchHooks */
  runPreDispatchHooks(unitType: string, unitId: string, basePath: string, ctx: ExtensionContext): Promise<void>;
  /** @see post-unit-hooks.ts:persistHookState */
  persistHookState(basePath: string): void;
  /** @see post-unit-hooks.ts:restoreHookState */
  restoreHookState(basePath: string): void;
  /** @see post-unit-hooks.ts:clearPersistedHookState */
  clearPersistedHookState(basePath: string): void;
}

// ─── 9. SessionOps ───────────────────────────────────────────────────────────

/**
 * Session lifecycle, locking, bootstrap, unit runtime records, queue management,
 * signal handling, and pending captures.
 *
 * Modules: auto-start.ts, session-lock.ts, unit-runtime.ts, queue-order.ts,
 *          session-status-io.ts, captures.ts
 */
export interface SessionOps {
  // ── Bootstrap (auto-start.ts) ──

  /** @see auto-start.ts:bootstrapAutoSession */
  bootstrapAutoSession(
    s: AutoSession,
    ctx: ExtensionCommandContext,
    pi: ExtensionAPI,
    base: string,
    verboseMode: boolean,
    requestedStepMode: boolean,
    deps: BootstrapDeps,
  ): Promise<boolean>;

  // ── Session locking (session-lock.ts) ──

  /** @see session-lock.ts:acquireSessionLock */
  acquireSessionLock(basePath: string): { acquired: boolean; reason?: string; existingPid?: number };
  /** @see session-lock.ts:validateSessionLock */
  validateSessionLock(basePath: string): boolean;
  /** @see session-lock.ts:releaseSessionLock */
  releaseSessionLock(basePath: string): void;
  /** @see session-lock.ts:updateSessionLock */
  updateSessionLock(basePath: string, data: Record<string, unknown>): void;

  // ── Unit runtime records (unit-runtime.ts) ──

  /** @see unit-runtime.ts:writeUnitRuntimeRecord */
  writeUnitRuntimeRecord(basePath: string, unitType: string, unitId: string, record: Record<string, unknown>): void;
  /** @see unit-runtime.ts:readUnitRuntimeRecord */
  readUnitRuntimeRecord(basePath: string, unitType: string, unitId: string): Record<string, unknown> | null;
  /** @see unit-runtime.ts:clearUnitRuntimeRecord */
  clearUnitRuntimeRecord(basePath: string, unitType: string, unitId: string): void;
  /** @see unit-runtime.ts:inspectExecuteTaskDurability */
  inspectExecuteTaskDurability(basePath: string, unitId: string): Promise<unknown>;

  // ── Queue (queue-order.ts) ──

  /** @see queue-order.ts:pruneQueueOrder */
  pruneQueueOrder(basePath: string, validIds: string[]): void;

  // ── Session signals (session-status-io.ts) ──

  /** @see session-status-io.ts:consumeSignal */
  consumeSignal(basePath: string, milestoneId: string): { signal: string; payload?: unknown } | null;

  // ── Captures (captures.ts) ──

  /** @see captures.ts:hasPendingCaptures */
  hasPendingCaptures(basePath: string): boolean;
  /** @see captures.ts:loadPendingCaptures */
  loadPendingCaptures(basePath: string): CaptureEntry[];
  /** @see captures.ts:countPendingCaptures */
  countPendingCaptures(basePath: string): number;
}

// ─── 10. ObservabilityOps ────────────────────────────────────────────────────

/**
 * Logging, notifications, telemetry, dashboard display, and skill discovery.
 *
 * Merged from ObservabilityOps + DashboardOps + skill telemetry — all are
 * output/display/instrumentation concerns.
 *
 * Modules: auto-observability.ts, debug-logger.ts, activity-log.ts,
 *          notifications.ts, auto-dashboard.ts, skill-discovery.ts,
 *          skill-telemetry.ts
 */
export interface ObservabilityOps {
  // ── Observability checks (auto-observability.ts) ──

  /** @see auto-observability.ts:collectObservabilityWarnings */
  collectObservabilityWarnings(basePath: string, unitType: string, unitId: string): Promise<Array<{ code: string; message: string }>>;
  /** @see auto-observability.ts:buildObservabilityRepairBlock */
  buildObservabilityRepairBlock(issues: Array<{ code: string; message: string }>): string;

  // ── Debug logging (debug-logger.ts) ──

  /** @see debug-logger.ts:debugLog */
  debugLog(event: string, data?: Record<string, unknown>): void;
  /** @see debug-logger.ts:debugTime */
  debugTime(event: string): (data?: Record<string, unknown>) => void;
  /** @see debug-logger.ts:debugCount */
  debugCount(counter: string, value?: number): void;
  /** @see debug-logger.ts:debugPeak */
  debugPeak(counter: string, value: number): void;
  /** @see debug-logger.ts:enableDebug */
  enableDebug(basePath: string): void;
  /** @see debug-logger.ts:isDebugEnabled */
  isDebugEnabled(): boolean;
  /** @see debug-logger.ts:getDebugLogPath */
  getDebugLogPath(): string | null;
  /** @see debug-logger.ts:writeDebugSummary */
  writeDebugSummary(): string | null;

  // ── Activity log (activity-log.ts) ──

  /** @see activity-log.ts:saveActivityLog */
  saveActivityLog(ctx: ExtensionContext, basePath: string, unitType: string, unitId: string): string | null;
  /** @see activity-log.ts:clearActivityLogState */
  clearActivityLogState(): void;

  // ── Notifications (notifications.ts) ──

  /** @see notifications.ts:sendDesktopNotification */
  sendDesktopNotification(title: string, message: string): void;

  // ── Dashboard (auto-dashboard.ts) ──

  /** @see auto-dashboard.ts:updateProgressWidget */
  updateProgressWidget(ctx: ExtensionContext, unitType: string, unitId: string, state: GSDState): void;
  /** @see auto-dashboard.ts:updateSliceProgressCache */
  updateSliceProgressCache(base: string, mid: string, activeSid?: string): void;
  /** @see auto-dashboard.ts:clearSliceProgressCache */
  clearSliceProgressCache(): void;
  /** @see auto-dashboard.ts:describeNextUnit */
  describeNextUnit(state: GSDState): { label: string; description: string };
  /** @see auto-dashboard.ts:unitVerb */
  unitVerb(unitType: string): string;
  /** @see auto-dashboard.ts:formatAutoElapsed */
  formatAutoElapsed(autoStartTime: number): string;
  /** @see auto-dashboard.ts:formatWidgetTokens */
  formatWidgetTokens(count: number): string;
  /** @see auto-dashboard.ts:hideFooter */
  hideFooter(): void;

  // ── Skill discovery (skill-discovery.ts) ──

  /** @see skill-discovery.ts:snapshotSkills */
  snapshotSkills(): void;
  /** @see skill-discovery.ts:clearSkillSnapshot */
  clearSkillSnapshot(): void;

  // ── Skill telemetry (skill-telemetry.ts) ──

  /** @see skill-telemetry.ts:captureAvailableSkills */
  captureAvailableSkills(): void;
  /** @see skill-telemetry.ts:getAndClearSkills */
  getAndClearSkills(): string[];
  /** @see skill-telemetry.ts:resetSkillTelemetry */
  resetSkillTelemetry(): void;
}

// ─── Composite LoopDeps ──────────────────────────────────────────────────────

/**
 * The full dependency surface of the auto-loop, decomposed into role-based groups.
 *
 * This union type enables S02's engine implementations to declare which
 * dependency groups they consume, rather than taking an opaque blob.
 */
export interface LoopDeps {
  git: GitOps;
  state: StateOps;
  dispatch: DispatchOps;
  modelAndBudget: ModelAndBudgetOps;
  verification: VerificationOps;
  recovery: RecoveryOps;
  supervision: SupervisionOps;
  postUnit: PostUnitOps;
  session: SessionOps;
  observability: ObservabilityOps;
}
