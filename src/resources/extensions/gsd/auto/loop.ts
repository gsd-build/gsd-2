// Project/App: GSD-2
// File Purpose: Main auto-mode execution loop.
/**
 * auto/loop.ts — Main auto-mode execution loop.
 *
 * Iterates: derive → dispatch → guards → runUnit → finalize → repeat.
 * Exits when s.active becomes false or a terminal condition is reached.
 *
 * Imports from: auto/types, auto/resolve, auto/phases
 */

import type { ExtensionAPI, ExtensionContext } from "@gsd/pi-coding-agent";

import { randomUUID } from "node:crypto";
import type { AutoSession } from "./session.js";
import type { LoopDeps } from "./loop-deps.js";
import {
  MAX_LOOP_ITERATIONS,
  type LoopState,
  type IterationContext,
  type IterationData,
} from "./types.js";
import { _clearCurrentResolve } from "./resolve.js";
import {
  runPreDispatch,
  runDispatch,
  runGuards,
  runFinalize,
  STUCK_WINDOW_SIZE,
} from "./phases.js";
import { debugLog } from "../debug-logger.js";
import { isInfrastructureError, isTransientCooldownError, getCooldownRetryAfterMs, COOLDOWN_FALLBACK_WAIT_MS, MAX_COOLDOWN_RETRIES } from "./infra-errors.js";
import { ModelPolicyDispatchBlockedError } from "../auto-model-selection.js";
import { resolveEngine } from "../engine-resolver.js";
import { logWarning } from "../workflow-logger.js";
import {
  recordDispatchClaim,
  markRunning as markDispatchRunning,
  markCompleted as markDispatchCompleted,
  markFailed as markDispatchFailed,
  getRecentForUnit as getRecentDispatchesForUnit,
  getRecentUnitKeysForProjectRoot,
} from "../db/unit-dispatches.js";
import { claimMilestoneLease, refreshMilestoneLease } from "../db/milestone-leases.js";
import { heartbeatAutoWorker } from "../db/auto-workers.js";
import { getRuntimeKv, setRuntimeKv } from "../db/runtime-kv.js";
import { resolveUokFlags } from "../uok/flags.js";
import { scheduleSidecarQueue } from "../uok/execution-graph.js";
import { normalizeRealPath } from "../paths.js";
import {
  decideCooldownRecovery,
  decideDispatchClaim,
  decideEngineDispatch,
  decideFinalizeResult,
  decideInfrastructureError,
  decideIterationErrorRecovery,
  decideMemoryPressure,
  decideModelPolicyBlocked,
  decideMinRequestInterval,
  decideWorkflowLoop,
  formatDispatchExceptionSummary,
  formatUnhandledDispatchErrorSummary,
  resolveUnitRequestTimestamp,
  shouldUseCustomEnginePath,
} from "./workflow-kernel.js";
import {
  hydrateCustomVerifyRetryCounts,
  saveCustomVerifyRetryCounts,
} from "./custom-verify-retry-store.js";
import {
  settleDispatchCompleted,
  settleDispatchFailed,
} from "./workflow-dispatch-ledger.js";
import { emitOpenUnitEndForUnit } from "../crash-recovery.js";
import { writeUnitRuntimeRecord } from "../unit-runtime.js";
import { ensureDispatchLease, openDispatchClaim } from "./workflow-dispatch-claim.js";
import { completeWorkflowIteration } from "./workflow-iteration-completion.js";
import { createWorkflowJournalReporter } from "./workflow-journal-reporter.js";
import { createWorkflowPhaseReporter } from "./workflow-phase-reporter.js";
import { createWorkflowTurnReporter } from "./workflow-turn-reporter.js";
import { validateWorkflowSessionLock } from "./workflow-session-lock.js";
import { dequeueSidecarItem } from "./workflow-sidecar-queue.js";
import { maintainWorkerHeartbeat } from "./workflow-worker-heartbeat.js";
import {
  measureMemoryPressure,
  shouldCheckMemoryPressure,
} from "./workflow-memory-pressure.js";
import { buildSidecarIterationData } from "./workflow-sidecar-iteration.js";
import {
  createExecutionGraphUnitDispatchDeps,
  runUnitPhaseViaContract,
  type DispatchContract,
} from "./workflow-unit-dispatch.js";
import { handleCustomEngineDispatchOutcome } from "./workflow-custom-engine-dispatch-outcome.js";
import { buildCustomEngineIterationData } from "./workflow-custom-engine-iteration.js";
import { handleCustomEngineVerifyRetry } from "./workflow-custom-engine-retry.js";
import {
  handleCustomEngineVerifyPause,
  handleCustomEngineVerifyRetryOutcome,
} from "./workflow-custom-engine-verify-outcome.js";
import { handleCustomEngineReconcile } from "./workflow-custom-engine-reconcile.js";
import { handleCustomEngineReconcileOutcome } from "./workflow-custom-engine-reconcile-outcome.js";

// ── Stuck detection persistence (#3704) ──────────────────────────────────
// Phase C migration: stuck-state.json deleted in favor of DB-backed
// equivalents. recentUnits is rebuilt from unit_dispatches (Phase B
// ledger) on session start; stuckRecoveryAttempts persists in runtime_kv
// under a stable project scope (soft state per the runtime_kv invariant). Single-host
// SQLite WAL only — multi-host would need a real coordinator.
//
// When no worker is registered (DB unavailable, fresh project), both
// helpers degrade to the empty-state fallback that #3704 already
// tolerates — same behavior as a fresh session.
const STUCK_RECOVERY_ATTEMPTS_KEY = "stuck_recovery_attempts";

function stableStuckStateScopeId(s: AutoSession): string {
  return normalizeRealPath(s.scope?.workspace.projectRoot ?? (s.originalBasePath || s.basePath));
}

function loadStuckState(s: AutoSession): { recentUnits: Array<{ key: string }>; stuckRecoveryAttempts: number } {
  const scopeId = stableStuckStateScopeId(s);
  if (!scopeId) return { recentUnits: [], stuckRecoveryAttempts: 0 };
  try {
    const recentUnits = getRecentUnitKeysForProjectRoot(scopeId, STUCK_WINDOW_SIZE);
    const stuckRecoveryAttempts =
      getRuntimeKv<number>("global", scopeId, STUCK_RECOVERY_ATTEMPTS_KEY) ?? 0;
    return { recentUnits, stuckRecoveryAttempts };
  } catch (err) {
    debugLog("autoLoop", { phase: "load-stuck-state-failed", error: err instanceof Error ? err.message : String(err) });
    return { recentUnits: [], stuckRecoveryAttempts: 0 };
  }
}

function saveStuckState(s: AutoSession, state: LoopState): void {
  const scopeId = stableStuckStateScopeId(s);
  if (!scopeId) return;
  // recentUnits is automatically derived from unit_dispatches by the
  // dispatch ledger writes in openDispatchClaim — no separate persistence
  // needed. Only the soft retry counter needs a runtime_kv row.
  try {
    setRuntimeKv("global", scopeId, STUCK_RECOVERY_ATTEMPTS_KEY, state.stuckRecoveryAttempts);
  } catch (err) {
    debugLog("autoLoop", { phase: "save-stuck-state-failed", error: err instanceof Error ? err.message : String(err) });
  }
}

function logDispatchLedgerWriteFailure(err: unknown): void {
  debugLog("autoLoop", {
    phase: "dispatch-ledger-write-failed",
    error: err instanceof Error ? err.message : String(err),
  });
}

function logDispatchClaimRejected(details: {
  unitId: string;
  reason: string;
  existingId?: number;
  existingWorker?: string;
}): void {
  debugLog("autoLoop", {
    phase: "dispatch-claim-rejected",
    ...details,
  });
}

function logDispatchClaimFailed(err: unknown): void {
  debugLog("autoLoop", {
    phase: "dispatch-claim-failed",
    error: err instanceof Error ? err.message : String(err),
  });
}

function logDispatchLeaseRecovered(details: {
  milestoneId: string;
  workerId: string;
  token: number;
  recovered: boolean;
}): void {
  debugLog("autoLoop", {
    phase: details.recovered ? "dispatch-lease-recovered" : "dispatch-lease-acquired",
    ...details,
  });
}

function logDispatchLeaseRecoveryFailed(details: {
  milestoneId?: string;
  workerId?: string;
  reason: string;
}): void {
  debugLog("autoLoop", {
    phase: "dispatch-lease-recovery-failed",
    ...details,
  });
}

function logCustomVerifyRetryLoadFailure(err: unknown): void {
  debugLog("autoLoop", {
    phase: "load-custom-verify-retries-failed",
    error: err instanceof Error ? err.message : String(err),
  });
}

function logCustomVerifyRetrySaveFailure(err: unknown): void {
  debugLog("autoLoop", {
    phase: "save-custom-verify-retries-failed",
    error: err instanceof Error ? err.message : String(err),
  });
}

// ── Memory pressure monitoring (#3331) ──────────────────────────────────
// Check heap usage on session startup, then every N iterations, and trigger
// graceful shutdown before the OS OOM killer sends SIGKILL. The threshold is
// 90% of the V8 heap limit (--max-old-space-size or default ~1.5-4GB depending on platform).
const MEMORY_CHECK_INTERVAL = 5; // check every 5 iterations
const MAX_CUSTOM_ENGINE_VERIFY_RETRIES = 3;

interface AutoLoopOptions {
  dispatchContract?: DispatchContract;
}

async function enforceMinRequestInterval(s: AutoSession, prefs: IterationContext["prefs"]): Promise<void> {
  const minInterval = prefs?.min_request_interval_ms ?? 0;
  const decision = decideMinRequestInterval({
    minIntervalMs: minInterval,
    lastRequestTimestamp: s.lastRequestTimestamp,
    nowMs: Date.now(),
  });
  if (decision.action === "wait") {
    debugLog("autoLoop", { phase: "rate-limit-wait", waitMs: decision.waitMs });
    await new Promise<void>(r => setTimeout(r, decision.waitMs));
  }
}

function closeOutCrashedUnit(s: AutoSession, iterData: IterationData, err: unknown): void {
  const summary = formatDispatchExceptionSummary({ error: err });
  try {
    emitOpenUnitEndForUnit(
      s.basePath,
      iterData.unitType,
      iterData.unitId,
      "cancelled",
      {
        message: summary,
        category: "unit-exception",
        isTransient: false,
      },
    );
    writeUnitRuntimeRecord(
      s.basePath,
      iterData.unitType,
      iterData.unitId,
      s.currentUnit?.startedAt ?? Date.now(),
      {
        phase: "crashed",
        lastProgressAt: Date.now(),
        lastProgressKind: "unit-exception",
      },
    );
  } catch (closeoutErr) {
    logWarning("dispatch", `unit crash closeout failed: ${closeoutErr instanceof Error ? closeoutErr.message : String(closeoutErr)}`);
  }
}

/**
 * Main auto-mode execution loop. Iterates: derive → dispatch → guards →
 * runUnit → finalize → repeat. Exits when s.active becomes false or a
 * terminal condition is reached.
 *
 * This is the linear replacement for the recursive
 * dispatchNextUnit → resolveAgentEnd → dispatchNextUnit chain.
 */
export async function autoLoop(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  s: AutoSession,
  deps: LoopDeps,
  options?: AutoLoopOptions,
): Promise<void> {
  debugLog("autoLoop", { phase: "enter" });
  let iteration = 0;
  const dispatchContract = options?.dispatchContract ?? "legacy-direct";
  const unitDispatchDeps = createExecutionGraphUnitDispatchDeps();
  // Load persisted stuck state so counters survive session restarts (#3704)
  const persisted = loadStuckState(s);
  const loopState: LoopState = {
    recentUnits: persisted.recentUnits,
    stuckRecoveryAttempts: persisted.stuckRecoveryAttempts,
    consecutiveFinalizeTimeouts: 0,
    consecutiveDispatchCount: new Map<string, number>(),
    lastDispatchedKey: null,
    lastDispatchPhase: null,
  };
  let consecutiveErrors = 0;
  let consecutiveCooldowns = 0;
  const recentErrorMessages: string[] = [];

  while (s.active) {
    iteration++;
    debugLog("autoLoop", { phase: "loop-top", iteration });

    maintainWorkerHeartbeat(s, {
      heartbeatAutoWorker,
      refreshMilestoneLease,
      logHeartbeatFailure: err => debugLog("autoLoop", {
        phase: "heartbeat-failed",
        error: err instanceof Error ? err.message : String(err),
      }),
      logLeaseRefreshMiss: details => debugLog("autoLoop", {
        phase: "lease-refresh-missed",
        ...details,
      }),
    });

    // ── Journal: per-iteration flow grouping ──
    const flowId = randomUUID();
    let seqCounter = 0;
    const nextSeq = () => ++seqCounter;
    const journalReporter = createWorkflowJournalReporter({
      emitJournalEvent: deps.emitJournalEvent,
      flowId,
      nextSeq,
    });
    const turnId = randomUUID();
    s.currentTraceId = flowId;
    s.currentTurnId = turnId;
    const turnStartedAt = new Date().toISOString();
    let observedUnitType: string | undefined;
    let observedUnitId: string | undefined;
    const phaseReporter = createWorkflowPhaseReporter({
      observer: deps.uokObserver,
    });
    const turnReporter = createWorkflowTurnReporter({
      observer: deps.uokObserver,
      traceId: flowId,
      turnId,
      iteration,
      basePath: s.basePath,
      startedAt: turnStartedAt,
      clearCurrentTurn: () => {
        s.currentTraceId = null;
        s.currentTurnId = null;
      },
    });
    const finishTurn = (
      status: "completed" | "failed" | "paused" | "stopped" | "skipped" | "retry",
      failureClass: "none" | "unknown" | "manual-attention" | "timeout" | "execution" | "closeout" | "git" = "none",
      error?: string,
    ): void => {
      turnReporter.finish({
        unitType: observedUnitType,
        unitId: observedUnitId,
        status,
        failureClass,
        error,
      });
    };
    turnReporter.start();

    const iterationDecision = decideWorkflowLoop({
      active: s.active,
      iteration,
      maxIterations: MAX_LOOP_ITERATIONS,
      hasCommandContext: true,
      sessionLockValid: true,
    });
    if (iterationDecision.action === "stop" && iterationDecision.reason === "max-iterations") {
      debugLog("autoLoop", {
        phase: "exit",
        reason: iterationDecision.reason,
        iteration,
      });
      await deps.stopAuto(
        ctx,
        pi,
        `Safety: loop exceeded ${MAX_LOOP_ITERATIONS} iterations — possible runaway`,
      );
      finishTurn("stopped", "manual-attention", "max-iterations");
      break;
    }

    // ── Memory pressure check (#3331) ──
    // Graceful shutdown before OOM killer sends SIGKILL.
    if (shouldCheckMemoryPressure(iteration, MEMORY_CHECK_INTERVAL)) {
      const mem = measureMemoryPressure();
      debugLog("autoLoop", { phase: "memory-check", ...mem });
      const memoryDecision = decideMemoryPressure({ ...mem, iteration });
      if (memoryDecision.action === "stop") {
        logWarning("dispatch", memoryDecision.warningMessage);
        await deps.stopAuto(ctx, pi, memoryDecision.stopMessage);
        finishTurn("stopped", "timeout", memoryDecision.turnError);
        break;
      }
    }

    const commandContextDecision = decideWorkflowLoop({
      active: s.active,
      iteration,
      maxIterations: MAX_LOOP_ITERATIONS,
      hasCommandContext: Boolean(s.cmdCtx),
      sessionLockValid: true,
    });
    if (commandContextDecision.action === "stop" && commandContextDecision.reason === "missing-command-context") {
      debugLog("autoLoop", { phase: "exit", reason: "no-cmdCtx" });
      finishTurn("stopped", "manual-attention", commandContextDecision.reason);
      break;
    }

    let dispatchId: number | null = null;
    let dispatchSettled = false;
    let iterationEndEmitted = false;
    const emitIterationEnd = (details: Record<string, unknown> = {}): void => {
      if (iterationEndEmitted) return;
      iterationEndEmitted = true;
      journalReporter.emit("iteration-end", { iteration, ...details });
    };
    const completeIteration = (): void => {
      completeWorkflowIteration({
        get consecutiveErrors() { return consecutiveErrors; },
        set consecutiveErrors(value) { consecutiveErrors = value; },
        get consecutiveCooldowns() { return consecutiveCooldowns; },
        set consecutiveCooldowns(value) { consecutiveCooldowns = value; },
        recentErrorMessages,
      }, {
        emitIterationEnd: () => emitIterationEnd(),
        saveStuckState: () => saveStuckState(s, loopState),
        logIterationComplete: () => debugLog("autoLoop", { phase: "iteration-complete", iteration }),
      });
    };
    let stuckStatePersistedThisIteration = false;
    const finishIncompleteIteration = (details: Record<string, unknown>): void => {
      emitIterationEnd(details);
      saveStuckState(s, loopState);
      stuckStatePersistedThisIteration = true;
    };

    try {
      // ── Blanket try/catch: one bad iteration must not kill the session
      const prefs = deps.loadEffectiveGSDPreferences()?.preferences;
      const uokFlags = resolveUokFlags(prefs);

      // ── Check sidecar queue before deriveState ──
      // NOTE: Sidecar dequeue MUST run before validateWorkflowSessionLock so a
      // queued item is popped (and the `sidecar-dequeue` journal event emitted)
      // even when the session lock invalidates this iteration. Inverting this
      // order silently drops queued items on lock-loss. Refs #5308.
      const sidecarItem = await dequeueSidecarItem({
        queue: s.sidecarQueue,
        executionGraphEnabled: uokFlags.executionGraph,
        scheduleQueue: scheduleSidecarQueue,
        warnSchedulingFailure: message => logWarning("dispatch", `sidecar queue scheduling failed: ${message}`),
        logDequeue: payload => debugLog("autoLoop", { phase: "sidecar-dequeue", ...payload }),
        emitDequeue: payload => journalReporter.emit("sidecar-dequeue", payload),
      });

      const sessionLockOutcome = validateWorkflowSessionLock({
        active: s.active,
        iteration,
        maxIterations: MAX_LOOP_ITERATIONS,
        deps: {
          lockBase: deps.lockBase,
          validateSessionLock: deps.validateSessionLock,
          handleLostSessionLock: lockStatus => deps.handleLostSessionLock(ctx, lockStatus),
          logInvalidSessionLock: details => debugLog("autoLoop", {
            phase: "session-lock-invalid",
            ...details,
          }),
          logSessionLockExit: details => debugLog("autoLoop", {
            phase: "exit",
            ...details,
          }),
        },
      });
      if (sessionLockOutcome.action === "stop" && sessionLockOutcome.reason === "session-lock-lost") {
        finishTurn("stopped", "manual-attention", sessionLockOutcome.reason);
        break;
      }

      const ic: IterationContext = { ctx, pi, s, deps, prefs, iteration, flowId, nextSeq };
      journalReporter.emit("iteration-start", { iteration });
      let iterData: IterationData;

      // ── Custom engine path ──────────────────────────────────────────────
      // When activeEngineId is a non-dev value, bypass runPreDispatch and
      // runDispatch entirely — the custom engine drives its own state via
      // GRAPH.yaml. Shares runGuards and runUnitPhase with the dev path.
      // After unit execution, verifies then reconciles via the engine layer.
      //
      // GSD_ENGINE_BYPASS=1 skips the engine layer entirely — falls through
      // to the dev path below.
      if (shouldUseCustomEnginePath({
        activeEngineId: s.activeEngineId,
        hasSidecarItem: Boolean(sidecarItem),
        engineBypass: process.env.GSD_ENGINE_BYPASS === "1",
      })) {
        debugLog("autoLoop", { phase: "custom-engine-derive", iteration, engineId: s.activeEngineId });

        const { engine, policy } = resolveEngine({
          activeEngineId: s.activeEngineId,
          activeRunDir: s.activeRunDir,
        });

        const engineState = await engine.deriveState(s.canonicalProjectRoot);
        debugLog("autoLoop", {
          phase: "post-derive",
          site: "custom-engine-derive",
          basePath: s.basePath,
          originalBasePath: s.originalBasePath,
          scopeProjectRoot: s.scope?.workspace.projectRoot,
          canonicalProjectRoot: s.canonicalProjectRoot,
          derivedPhase: (engineState as { phase?: string }).phase,
          isComplete: engineState.isComplete,
        });
        if (engineState.isComplete) {
          finishTurn("completed");
          emitIterationEnd({ status: "completed", reason: "custom-engine-complete" });
          await deps.stopAuto(ctx, pi, "Workflow complete");
          break;
        }

        debugLog("autoLoop", { phase: "custom-engine-dispatch", iteration });
        const dispatch = await engine.resolveDispatch(engineState, { basePath: s.basePath });
        const engineDispatchDecision = decideEngineDispatch(dispatch.action === "stop"
          ? { action: "stop", reason: dispatch.reason }
          : { action: dispatch.action });
        const dispatchFlow = await handleCustomEngineDispatchOutcome({
          decision: engineDispatchDecision,
          deps: {
            stopAuto: reason => deps.stopAuto(ctx, pi, reason),
          },
        });
        if (dispatchFlow.action === "break") {
          finishTurn("stopped", "manual-attention", "custom-engine-dispatch-stop");
          finishIncompleteIteration({
            status: "stopped",
            reason: "custom-engine-dispatch-stop",
            failureClass: "manual-attention",
          });
          break;
        }
        if (dispatchFlow.action === "continue") {
          finishTurn("skipped");
          emitIterationEnd({ status: "skipped", reason: "custom-engine-dispatch-skip" });
          continue;
        }

        // dispatch.action === "dispatch"
        if (dispatch.action !== "dispatch") {
          finishTurn("skipped");
          emitIterationEnd({ status: "skipped", reason: "custom-engine-dispatch-mismatch" });
          continue;
        }
        const step = dispatch.step;
        iterData = await buildCustomEngineIterationData({
          step,
          basePath: s.basePath,
          canonicalProjectRoot: s.canonicalProjectRoot,
          currentMilestoneId: s.currentMilestoneId,
          deriveState: deps.deriveState,
          logPostDerive: details => debugLog("autoLoop", {
            phase: "post-derive",
            ...details,
          }),
        });
        observedUnitType = iterData.unitType;
        observedUnitId = iterData.unitId;

        // ── Progress widget (mirrors dev path in runDispatch) ──
        deps.updateProgressWidget(ctx, iterData.unitType, iterData.unitId, iterData.state);

        // ── Guards (shared with dev path) ──
        const guardsResult = await runGuards(ic, s.currentMilestoneId ?? "workflow");
        phaseReporter.report("guard", guardsResult.action, {
          unitType: iterData.unitType,
          unitId: iterData.unitId,
        });
        if (guardsResult.action === "break") {
          finishTurn("stopped", "manual-attention", "guard-break");
          finishIncompleteIteration({
            status: "stopped",
            reason: "guard-break",
            unitType: iterData.unitType,
            unitId: iterData.unitId,
            failureClass: "manual-attention",
          });
          break;
        }

        // ── Unit execution (shared with dev path) ──
        await enforceMinRequestInterval(s, prefs);
        let unitPhaseResult: Awaited<ReturnType<typeof runUnitPhaseViaContract>>;
        try {
          unitPhaseResult = await runUnitPhaseViaContract(
            dispatchContract,
            ic,
            iterData,
            loopState,
            undefined,
            unitDispatchDeps,
          );
        } catch (err) {
          if (err instanceof ModelPolicyDispatchBlockedError) {
            throw err;
          }
          closeOutCrashedUnit(s, iterData, err);
          throw err;
        }
        if (unitPhaseResult.action === "next") {
          const requestTimestamp = resolveUnitRequestTimestamp(unitPhaseResult.data);
          if (requestTimestamp !== undefined) s.lastRequestTimestamp = requestTimestamp;
        }
        phaseReporter.report("unit", unitPhaseResult.action, {
          unitType: iterData.unitType,
          unitId: iterData.unitId,
        });
        if (unitPhaseResult.action === "break") {
          finishIncompleteIteration({
            status: "stopped",
            reason: unitPhaseResult.reason ?? "unit-break",
            unitType: iterData.unitType,
            unitId: iterData.unitId,
            failureClass: "execution",
          });
          finishTurn("stopped", "execution", "unit-break");
          break;
        }

        // ── Verify first, then reconcile (only mark complete on pass) ──
        debugLog("autoLoop", { phase: "custom-engine-verify", iteration, unitId: iterData.unitId });
        const verifyResult = await policy.verify(iterData.unitType, iterData.unitId, { basePath: s.basePath });
        if (verifyResult === "pause") {
          const verifyFlow = await handleCustomEngineVerifyPause({
            unitType: iterData.unitType,
            unitId: iterData.unitId,
            deps: {
              pauseAuto: () => deps.pauseAuto(ctx, pi),
              stopAuto: reason => deps.stopAuto(ctx, pi, reason),
              reportPause: details => phaseReporter.report("custom-engine", "pause", details),
              finishTurn,
            },
          });
          if (verifyFlow.action === "break") {
            finishIncompleteIteration({
              status: "paused",
              reason: "custom-engine-verify-pause",
              unitType: iterData.unitType,
              unitId: iterData.unitId,
              failureClass: "manual-attention",
            });
            break;
          }
        }
        if (verifyResult === "retry") {
          const retryOutcome = await handleCustomEngineVerifyRetry({
            session: s,
            unitType: iterData.unitType,
            unitId: iterData.unitId,
            basePath: s.basePath,
            iteration,
            maxRetries: MAX_CUSTOM_ENGINE_VERIFY_RETRIES,
            deps: {
              hydrateRetryCounts: () => hydrateCustomVerifyRetryCounts(s, {
                logFailure: logCustomVerifyRetryLoadFailure,
              }),
              saveRetryCounts: () => saveCustomVerifyRetryCounts(s, {
                logFailure: logCustomVerifyRetrySaveFailure,
              }),
              recover: (unitType, unitId, options) => policy.recover(unitType, unitId, options),
              logRetry: details => debugLog("autoLoop", {
                phase: "custom-engine-verify-retry",
                ...details,
              }),
              reportRetry: details => phaseReporter.report("custom-engine", "retry", details),
            },
          });
          const retryFlow = await handleCustomEngineVerifyRetryOutcome({
            outcome: retryOutcome,
            deps: {
              pauseAuto: () => deps.pauseAuto(ctx, pi),
              stopAuto: reason => deps.stopAuto(ctx, pi, reason),
              reportPause: details => phaseReporter.report("custom-engine", "pause", details),
              finishTurn,
            },
          });
          if (retryFlow.action === "break") {
            finishIncompleteIteration({
              status: retryOutcome.action === "stop" ? "stopped" : "paused",
              reason: retryOutcome.action === "retry" ? "custom-engine-verify-retry" : retryOutcome.turnError,
              unitType: iterData.unitType,
              unitId: iterData.unitId,
              failureClass: "manual-attention",
            });
            break;
          }
          finishIncompleteIteration({
            status: "retry",
            reason: "custom-engine-verify-retry",
            unitType: iterData.unitType,
            unitId: iterData.unitId,
          });
          continue;
        }

        // Verification passed — mark step complete
        const reconcileOutcome = await handleCustomEngineReconcile({
          session: s,
          engineState,
          iterData,
          iteration,
          deps: {
            saveRetryCounts: () => saveCustomVerifyRetryCounts(s, {
              logFailure: logCustomVerifyRetrySaveFailure,
            }),
            logReconcile: details => debugLog("autoLoop", {
              phase: "custom-engine-reconcile",
              ...details,
            }),
            reconcile: (state, completedStep) => engine.reconcile(state, completedStep),
            now: () => Date.now(),
            clearUnitTimeout: deps.clearUnitTimeout,
            completeIteration,
          },
        });
        const reconcileFlow = await handleCustomEngineReconcileOutcome({
          outcome: reconcileOutcome,
          unitType: iterData.unitType,
          unitId: iterData.unitId,
          deps: {
            stopAuto: reason => deps.stopAuto(ctx, pi, reason),
            pauseAuto: () => deps.pauseAuto(ctx, pi),
            report: (action, details) => phaseReporter.report("custom-engine", action, details),
            finishTurn,
          },
        });
        if (reconcileFlow.action === "break") break;
        continue;
      }

      if (!sidecarItem) {
        const orchestration = s.orchestration;
        if (orchestration) {
          const existingPendingDispatch = s.pendingOrchestrationDispatch;
          const orchestrationResult = existingPendingDispatch
            ? {
                kind: "advanced" as const,
                unit: {
                  unitType: existingPendingDispatch.unitType,
                  unitId: existingPendingDispatch.unitId,
                },
                stateSnapshot: existingPendingDispatch.state,
              }
            : await orchestration.advance();

          if (orchestrationResult.kind === "blocked") {
            s.pendingOrchestrationDispatch = null;
            if (orchestrationResult.action === "pause") {
              await deps.pauseAuto(ctx, pi, {
                message: orchestrationResult.reason,
                category: "unknown",
              });
            } else {
              await deps.stopAuto(ctx, pi, orchestrationResult.reason);
            }
            finishTurn("stopped", "manual-attention", "orchestration-blocked");
            break;
          }

          if (orchestrationResult.kind === "stopped") {
            s.pendingOrchestrationDispatch = null;
            await deps.stopAuto(ctx, pi, orchestrationResult.reason);
            finishTurn("stopped", "manual-attention", "orchestration-stopped");
            break;
          }

          if (orchestrationResult.kind !== "advanced") {
            s.pendingOrchestrationDispatch = null;
            finishTurn("skipped");
            continue;
          }
          const pendingDispatch = s.pendingOrchestrationDispatch;
          iterData = {
            unitType: pendingDispatch?.unitType ?? orchestrationResult.unit.unitType,
            unitId: pendingDispatch?.unitId ?? orchestrationResult.unit.unitId,
            prompt: pendingDispatch?.prompt ?? "",
            finalPrompt: pendingDispatch?.prompt ?? "",
            pauseAfterUatDispatch: pendingDispatch?.pauseAfterUatDispatch ?? false,
            state: pendingDispatch?.state ?? orchestrationResult.stateSnapshot,
            mid: pendingDispatch?.mid ?? s.currentMilestoneId ?? "workflow",
            midTitle: pendingDispatch?.midTitle ?? orchestrationResult.stateSnapshot.activeMilestone?.title ?? "Workflow",
            isRetry: false,
            previousTier: undefined,
          };
          s.pendingOrchestrationDispatch = null;
          phaseReporter.report("dispatch", "next", {
            unitType: iterData.unitType,
            unitId: iterData.unitId,
          });
          observedUnitType = iterData.unitType;
          observedUnitId = iterData.unitId;
        } else {
          const preDispatchResult = await runPreDispatch(ic, loopState);
          phaseReporter.report("pre-dispatch", preDispatchResult.action);
          if (preDispatchResult.action === "break") {
            finishTurn("stopped", "manual-attention", "pre-dispatch-break");
            break;
          }
          if (preDispatchResult.action === "continue") {
            finishTurn("skipped");
            continue;
          }
          const preData = preDispatchResult.data;
          const guardsResult = await runGuards(ic, preData.mid);
          phaseReporter.report("guard", guardsResult.action);
          if (guardsResult.action === "break") {
            finishTurn("stopped", "manual-attention", "guard-break");
            break;
          }
          const dispatchResult = await runDispatch(ic, preData, loopState);
          phaseReporter.report("dispatch", dispatchResult.action);
          if (dispatchResult.action === "break") {
            finishTurn("stopped", "manual-attention", "dispatch-break");
            break;
          }
          if (dispatchResult.action === "continue") {
            finishTurn("skipped");
            continue;
          }
          iterData = dispatchResult.data;
          observedUnitType = iterData.unitType;
          observedUnitId = iterData.unitId;
        }
      } else {
        iterData = await buildSidecarIterationData({
          sidecarItem,
          basePath: s.basePath,
          canonicalProjectRoot: s.canonicalProjectRoot,
          deriveState: deps.deriveState,
          logPostDerive: details => debugLog("autoLoop", {
            phase: "post-derive",
            ...details,
          }),
        });
        observedUnitType = iterData.unitType;
        observedUnitId = iterData.unitId;
        phaseReporter.report("dispatch", "sidecar", {
          unitType: iterData.unitType,
          unitId: iterData.unitId,
          sidecarKind: sidecarItem.kind,
        });
      }

      await enforceMinRequestInterval(s, prefs);

      // Phase B: claim a unit_dispatches row before invoking the unit. The
      // partial unique index idx_unit_dispatches_active_per_unit prevents
      // a second worker from claiming the same unit concurrently. When this
      // process has a worker identity, make the milestone lease explicit before
      // claiming so a step-mode handoff cannot leave us running with a stale
      // in-memory token and no backing lease row.
      const leaseBeforeClaim = ensureDispatchLease(s, iterData.mid, {
        claimMilestoneLease,
        logLeaseRecovered: logDispatchLeaseRecovered,
        logLeaseRecoveryFailed: logDispatchLeaseRecoveryFailed,
      });
      if (leaseBeforeClaim.kind === "blocked" || leaseBeforeClaim.kind === "failed") {
        const msg = `Lost milestone lease for ${iterData.mid ?? "unknown"} before dispatching ${iterData.unitType} ${iterData.unitId}: ${leaseBeforeClaim.reason}`;
        ctx.ui.notify(msg, "error");
        finishTurn("stopped", "execution", msg);
        await deps.stopAuto(ctx, pi, msg);
        break;
      }

      let dispatchClaim = openDispatchClaim(s, flowId, turnId, iterData, {
        getRecentDispatchesForUnit,
        recordDispatchClaim,
        markDispatchRunning,
        logClaimRejected: logDispatchClaimRejected,
        logClaimFailed: logDispatchClaimFailed,
      });
      let dispatchDecision = decideDispatchClaim(
        dispatchClaim.kind === "opened"
          ? { kind: "opened", dispatchId: dispatchClaim.dispatchId }
          : dispatchClaim.kind === "skip"
            ? { kind: "skip", reason: dispatchClaim.reason }
            : { kind: "degraded" },
      );
      if (dispatchDecision.action === "skip" && dispatchDecision.reason === "stale-lease") {
        const leaseRecovery = ensureDispatchLease(s, iterData.mid, {
          claimMilestoneLease,
          logLeaseRecovered: logDispatchLeaseRecovered,
          logLeaseRecoveryFailed: logDispatchLeaseRecoveryFailed,
        }, { forceReclaim: true });
        if (leaseRecovery.kind === "ready") {
          dispatchClaim = openDispatchClaim(s, flowId, turnId, iterData, {
            getRecentDispatchesForUnit,
            recordDispatchClaim,
            markDispatchRunning,
            logClaimRejected: logDispatchClaimRejected,
            logClaimFailed: logDispatchClaimFailed,
          });
          dispatchDecision = decideDispatchClaim(
            dispatchClaim.kind === "opened"
              ? { kind: "opened", dispatchId: dispatchClaim.dispatchId }
              : dispatchClaim.kind === "skip"
                ? { kind: "skip", reason: dispatchClaim.reason }
                : { kind: "degraded" },
          );
        } else {
          const msg = `Lost milestone lease for ${iterData.mid ?? "unknown"} while claiming ${iterData.unitType} ${iterData.unitId}: ${leaseRecovery.reason}`;
          ctx.ui.notify(msg, "error");
          finishTurn("stopped", "execution", msg);
          await deps.stopAuto(ctx, pi, msg);
          break;
        }
      }
      if (dispatchDecision.action === "skip") {
        if (dispatchDecision.reason === "stale-lease") {
          const msg = `Lost milestone lease for ${iterData.mid ?? "unknown"} while claiming ${iterData.unitType} ${iterData.unitId}; dispatch claim still failed after recovery.`;
          ctx.ui.notify(msg, "error");
          finishTurn("stopped", "execution", msg);
          await deps.stopAuto(ctx, pi, msg);
          break;
        }
        finishTurn("skipped", "execution", dispatchDecision.reason);
        continue;
      }
      dispatchId = dispatchDecision.dispatchId;

      let unitPhaseResult: Awaited<ReturnType<typeof runUnitPhaseViaContract>>;
      try {
        unitPhaseResult = await runUnitPhaseViaContract(
          dispatchContract,
          ic,
          iterData,
          loopState,
          sidecarItem,
          unitDispatchDeps,
        );
      } catch (err) {
        if (err instanceof ModelPolicyDispatchBlockedError) {
          throw err;
        }
        closeOutCrashedUnit(s, iterData, err);
        dispatchSettled = settleDispatchFailed(
          dispatchId,
          formatDispatchExceptionSummary({ error: err }),
          {
            markFailed: markDispatchFailed,
            logWriteFailure: logDispatchLedgerWriteFailure,
          },
        ) || dispatchSettled;
        throw err;
      }
      if (unitPhaseResult.action === "next") {
        const requestTimestamp = resolveUnitRequestTimestamp(unitPhaseResult.data);
        if (requestTimestamp !== undefined) s.lastRequestTimestamp = requestTimestamp;
      }
      phaseReporter.report("unit", unitPhaseResult.action, {
        unitType: iterData.unitType,
        unitId: iterData.unitId,
      });
      if (unitPhaseResult.action === "break") {
        dispatchSettled = settleDispatchFailed(dispatchId, "unit-break", {
          markFailed: markDispatchFailed,
          logWriteFailure: logDispatchLedgerWriteFailure,
        }) || dispatchSettled;
        finishIncompleteIteration({
          status: "stopped",
          reason: unitPhaseResult.reason ?? "unit-break",
          unitType: iterData.unitType,
          unitId: iterData.unitId,
          failureClass: "execution",
        });
        finishTurn("stopped", "execution", "unit-break");
        break;
      }

      // ── Phase 5: Finalize ───────────────────────────────────────────────

      let finalizeResult: Awaited<ReturnType<typeof runFinalize>>;
      journalReporter.emit("post-unit-finalize-start", {
        iteration,
        unitType: iterData.unitType,
        unitId: iterData.unitId,
      });
      try {
        finalizeResult = await runFinalize(ic, iterData, loopState, sidecarItem);
      } catch (err) {
        const error = formatDispatchExceptionSummary({ error: err });
        journalReporter.emit("post-unit-finalize-end", {
          iteration,
          unitType: iterData.unitType,
          unitId: iterData.unitId,
          status: "failed",
          error,
        });
        dispatchSettled = settleDispatchFailed(
          dispatchId,
          error,
          {
            markFailed: markDispatchFailed,
            logWriteFailure: logDispatchLedgerWriteFailure,
          },
        ) || dispatchSettled;
        throw err;
      }
      phaseReporter.report("finalize", finalizeResult.action, {
        unitType: iterData.unitType,
        unitId: iterData.unitId,
      });
      const finalizeReason = finalizeResult.action === "break" ? finalizeResult.reason : undefined;
      const finalizeStatus = finalizeReason === "step-wizard"
        ? "completed"
        : finalizeResult.action === "next"
          ? "completed"
          : finalizeResult.action === "continue"
            ? "retry"
            : "stopped";
      journalReporter.emit("post-unit-finalize-end", {
        iteration,
        unitType: iterData.unitType,
        unitId: iterData.unitId,
        status: finalizeStatus,
        action: finalizeResult.action,
        ...(finalizeReason ? { reason: finalizeReason } : {}),
      });
      const finalizeDecision = decideFinalizeResult(
        finalizeResult.action === "break"
          ? { action: "break", reason: finalizeResult.reason }
          : finalizeResult.action === "continue"
            ? { action: "continue" }
            : { action: "next" },
      );
      if (finalizeDecision.action === "stop") {
        dispatchSettled = settleDispatchFailed(dispatchId, finalizeDecision.ledgerErrorSummary, {
          markFailed: markDispatchFailed,
          logWriteFailure: logDispatchLedgerWriteFailure,
        }) || dispatchSettled;
        finishIncompleteIteration({
          status: "stopped",
          reason: finalizeReason ?? "finalize-break",
          unitType: iterData.unitType,
          unitId: iterData.unitId,
          failureClass: finalizeDecision.failureClass,
        });
        finishTurn("stopped", finalizeDecision.failureClass, finalizeDecision.turnError);
        break;
      }
      if (finalizeDecision.action === "retry") {
        dispatchSettled = settleDispatchFailed(dispatchId, finalizeDecision.ledgerErrorSummary, {
          markFailed: markDispatchFailed,
          logWriteFailure: logDispatchLedgerWriteFailure,
        }) || dispatchSettled;
        finishIncompleteIteration({
          status: "retry",
          reason: "finalize-retry",
          retry: true,
          unitType: iterData.unitType,
          unitId: iterData.unitId,
        });
        finishTurn("retry");
        continue;
      }

      dispatchSettled = settleDispatchCompleted(dispatchId, {
        markCompleted: markDispatchCompleted,
        logWriteFailure: logDispatchLedgerWriteFailure,
      }) || dispatchSettled;
      completeIteration();
      stuckStatePersistedThisIteration = true;
      finishTurn("completed");
      if (finalizeDecision.action === "complete-and-break") {
        s.preserveStepSurfaceAfterLoopExit = true;
        break;
      }
    } catch (loopErr) {
      // ── Blanket catch: absorb unexpected exceptions, apply graduated recovery ──
      const msg = loopErr instanceof Error ? loopErr.message : String(loopErr);
      if (dispatchId !== null && !dispatchSettled && !(loopErr instanceof ModelPolicyDispatchBlockedError)) {
        dispatchSettled = settleDispatchFailed(
          dispatchId,
          formatUnhandledDispatchErrorSummary({ error: loopErr }),
          {
            markFailed: markDispatchFailed,
            logWriteFailure: logDispatchLedgerWriteFailure,
          },
        ) || dispatchSettled;
      }

      // ── Pre-send model-policy block: not a retryable error (#4959 / #4850) ──
      // The model-policy gate runs before the prompt is sent.  When every
      // candidate model is denied (cross-provider disabled + flat-rate
      // baseline + tool-policy denial), retrying the same unit produces the
      // same denial — burning the consecutive-error budget toward a 3-strike
      // hard stop and corrupting auto-mode state.  Pause for user attention
      // instead, with the per-model deny reasons surfaced from the typed
      // error.
      if (loopErr instanceof ModelPolicyDispatchBlockedError) {
        const policyDecision = decideModelPolicyBlocked({
          unitType: loopErr.unitType,
          unitId: loopErr.unitId,
          errorMessage: msg,
          reasons: loopErr.reasons,
        });
        debugLog("autoLoop", {
          phase: "model-policy-blocked",
          iteration,
          unitType: loopErr.unitType,
          unitId: loopErr.unitId,
          reasons: loopErr.reasons,
        });
        ctx.ui.notify(policyDecision.notifyMessage, "error");
        journalReporter.emit("unit-end", policyDecision.journalData);
        finishIncompleteIteration({
          status: "blocked",
          reason: "model-policy-dispatch-blocked",
          unitType: loopErr.unitType,
          unitId: loopErr.unitId,
        });
        // Carry the blocked unit identity into the turn-result observer:
        // the throw originated inside dispatch, so observedUnitType/Id were
        // not assigned by the success path at lines 453/631/647 — but the
        // typed error already names the unit (#4959 / CodeRabbit).
        observedUnitType = loopErr.unitType;
        observedUnitId = loopErr.unitId;
        await deps.pauseAuto(ctx, pi);
        finishTurn(policyDecision.turnStatus, policyDecision.failureClass, msg);
        // Do NOT increment consecutiveErrors — the failure is configuration,
        // not a transient runtime fault.
        break;
      }

      // Always emit iteration-end on error so the journal records iteration
      // completion even on failure (#2344). Without this, errors in
      // runFinalize leave the journal incomplete, making diagnosis harder.
      finishIncompleteIteration({ status: "failed", error: msg });

      // ── Infrastructure errors: immediate stop, no retry ──
      // These are unrecoverable (disk full, OOM, etc.). Retrying just burns
      // LLM budget on guaranteed failures.
      const infraCode = isInfrastructureError(loopErr);
      if (infraCode) {
        const infraDecision = decideInfrastructureError({
          code: infraCode,
          errorMessage: msg,
        });
        debugLog("autoLoop", {
          phase: "infrastructure-error",
          iteration,
          code: infraCode,
          error: msg,
        });
        ctx.ui.notify(infraDecision.notifyMessage, "error");
        await deps.stopAuto(ctx, pi, infraDecision.stopMessage);
        finishTurn(infraDecision.turnStatus, infraDecision.failureClass, msg);
        break;
      }

      // ── Credential cooldown: wait and retry with bounded budget ──
      // A 429 triggers a 30s credential backoff in AuthStorage. If the SDK's
      // getApiKey() retries couldn't outlast the window, the error surfaces
      // here. Wait for the cooldown to clear rather than counting it as a
      // consecutive failure — but cap retries so we don't spin for hours
      // on persistent quota exhaustion.
      if (isTransientCooldownError(loopErr)) {
        consecutiveCooldowns++;
        const retryAfterMs = getCooldownRetryAfterMs(loopErr);
        const cooldownDecision = decideCooldownRecovery({
          consecutiveCooldowns,
          maxCooldownRetries: MAX_COOLDOWN_RETRIES,
          retryAfterMs,
          fallbackWaitMs: COOLDOWN_FALLBACK_WAIT_MS,
        });
        debugLog("autoLoop", {
          phase: "cooldown-wait",
          iteration,
          consecutiveCooldowns,
          retryAfterMs,
          error: msg,
        });

        if (cooldownDecision.action === "stop") {
          ctx.ui.notify(cooldownDecision.notifyMessage, "error");
          finishTurn("stopped", "timeout", msg);
          await deps.stopAuto(ctx, pi, cooldownDecision.stopMessage);
          break;
        }

        ctx.ui.notify(cooldownDecision.notifyMessage, "warning");
        await new Promise(resolve => setTimeout(resolve, cooldownDecision.waitMs));
        finishTurn("retry", "timeout", msg);
        continue; // Retry iteration without incrementing consecutiveErrors
      }

      consecutiveErrors++;
      recentErrorMessages.push(msg.length > 120 ? msg.slice(0, 120) + "..." : msg);
      debugLog("autoLoop", {
        phase: "iteration-error",
        iteration,
        consecutiveErrors,
        error: msg,
      });

      const errorDecision = decideIterationErrorRecovery({
        consecutiveErrors,
        recentErrorMessages,
        currentErrorMessage: msg,
      });
      if (errorDecision.action === "stop") {
        ctx.ui.notify(errorDecision.notifyMessage, "error");
        await deps.stopAuto(ctx, pi, errorDecision.stopMessage);
        finishTurn(errorDecision.turnStatus, "execution", msg);
        break;
      }
      if (errorDecision.action === "invalidate-and-retry") {
        ctx.ui.notify(errorDecision.notifyMessage, "warning");
        deps.invalidateAllCaches();
      } else {
        ctx.ui.notify(errorDecision.notifyMessage, "warning");
      }
      finishTurn(errorDecision.turnStatus, "execution", msg);
    } finally {
      if (!stuckStatePersistedThisIteration) {
        saveStuckState(s, loopState);
      }
    }
  }

  _clearCurrentResolve();
  debugLog("autoLoop", { phase: "exit", totalIterations: iteration });
}

export async function runUokKernelLoop(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  s: AutoSession,
  deps: LoopDeps,
): Promise<void> {
  return autoLoop(ctx, pi, s, deps, { dispatchContract: "uok-scheduler" });
}

export async function runLegacyAutoLoop(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  s: AutoSession,
  deps: LoopDeps,
): Promise<void> {
  return autoLoop(ctx, pi, s, deps, { dispatchContract: "legacy-direct" });
}
