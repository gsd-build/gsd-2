// Project/App: GSD-2
// File Purpose: Pure workflow-loop decisions for auto-mode before side-effect adapters run.

export type WorkflowLoopAction =
  | { action: "continue" }
  | { action: "stop"; reason: WorkflowStopReason; message: string };

export type WorkflowStopReason =
  | "inactive"
  | "max-iterations"
  | "missing-command-context"
  | "session-lock-lost";

export type DispatchClaimSkipReason = "already-active" | "stale-lease";

export type DispatchClaimInput =
  | { kind: "opened"; dispatchId: number }
  | { kind: "skip"; reason: DispatchClaimSkipReason }
  | { kind: "degraded" };

export type DispatchClaimDecision =
  | { action: "run"; dispatchId: number | null }
  | { action: "skip"; reason: DispatchClaimSkipReason };

export type EngineDispatchInput =
  | { action: "dispatch" }
  | { action: "skip" }
  | { action: "stop"; reason?: string | null };

export type EngineDispatchDecision =
  | { action: "dispatch" }
  | { action: "skip" }
  | { action: "stop"; reason: string };

export type FinalizeInput =
  | { action: "break"; reason?: string }
  | { action: "continue" }
  | { action: "next" };

export type FinalizeDecision =
  | {
      action: "stop";
      failureClass: "git" | "closeout";
      ledgerErrorSummary: string;
      turnError: "finalize-break";
    }
  | {
      action: "retry";
      ledgerErrorSummary: "finalize-retry";
    }
  | { action: "complete" };

export type EngineReconcileInput =
  | { outcome: "milestone-complete" }
  | { outcome: "pause" }
  | { outcome: "stop"; reason?: string | null }
  | { outcome: "continue" };

export type EngineReconcileDecision =
  | { action: "complete-workflow"; stopReason: "Workflow complete" }
  | { action: "pause" }
  | { action: "stop"; reason: string }
  | { action: "continue" };

export interface MemoryPressureInput {
  pressured: boolean;
  heapMB: number;
  limitMB: number;
  pct: number;
  iteration: number;
}

export type MemoryPressureDecision =
  | { action: "continue" }
  | {
      action: "stop";
      warningMessage: string;
      stopMessage: string;
      turnError: "memory-pressure";
    };

export interface MinRequestIntervalInput {
  minIntervalMs: number;
  lastRequestTimestamp: number;
  nowMs: number;
}

export type MinRequestIntervalDecision =
  | { action: "continue" }
  | { action: "wait"; waitMs: number };

export interface CooldownRecoveryInput {
  consecutiveCooldowns: number;
  maxCooldownRetries: number;
  retryAfterMs?: number;
  fallbackWaitMs: number;
}

export type CooldownRecoveryDecision =
  | { action: "stop"; notifyMessage: string; stopMessage: string }
  | { action: "wait"; waitMs: number; notifyMessage: string };

export interface IterationErrorRecoveryInput {
  consecutiveErrors: number;
  recentErrorMessages: string[];
  currentErrorMessage: string;
}

export type IterationErrorRecoveryDecision =
  | { action: "stop"; notifyMessage: string; stopMessage: string; turnStatus: "failed" }
  | { action: "invalidate-and-retry"; notifyMessage: string; turnStatus: "retry" }
  | { action: "retry"; notifyMessage: string; turnStatus: "retry" };

export interface CustomEngineVerifyRetryInput {
  attempts: number;
  maxRetries: number;
}

export type CustomEngineVerifyRetryDecision =
  | { action: "retry" }
  | { action: "recover" };

export interface CustomEnginePathInput {
  activeEngineId: string | null | undefined;
  hasSidecarItem: boolean;
  engineBypass: boolean;
}

export interface UnitRequestTimestampInput {
  requestDispatchedAt?: number;
  unitStartedAt?: number;
}

export interface CustomEngineRecoveryInput {
  outcome: "retry" | "skip" | "stop" | "pause";
  reason?: string;
  unitId: string;
  attempts: number;
}

export type CustomEngineRecoveryDecision =
  | { action: "pause"; turnError: string }
  | {
      action: "stop";
      stopMessage: string;
      turnError: "custom-engine-verify-retry-exhausted";
    };

export interface InfrastructureErrorInput {
  code: string;
  errorMessage: string;
}

export interface InfrastructureErrorDecision {
  notifyMessage: string;
  stopMessage: string;
  turnStatus: "failed";
  failureClass: "execution";
}

export interface ModelPolicyBlockedInput {
  unitType: string;
  unitId: string;
  errorMessage: string;
  reasons: ReadonlyArray<{ provider: string; modelId: string; reason: string }>;
}

export interface ModelPolicyBlockedDecision {
  notifyMessage: string;
  journalData: {
    unitType: string;
    unitId: string;
    status: "blocked";
    reason: "model-policy-dispatch-blocked";
    reasons: ReadonlyArray<{ provider: string; modelId: string; reason: string }>;
  };
  turnStatus: "paused";
  failureClass: "manual-attention";
}

export type DispatchNodeKind =
  | "unit"
  | "hook"
  | "subagent"
  | "team-worker"
  | "verification"
  | "reprocess";

export type DispatchSidecarKind = "hook" | "triage" | "quick-task" | string;

export interface DispatchLedgerErrorInput {
  error: unknown;
}

export interface WorkflowLoopInput {
  active: boolean;
  iteration: number;
  maxIterations: number;
  hasCommandContext: boolean;
  sessionLockValid: boolean;
  sessionLockReason?: string | null;
}

export function decideWorkflowLoop(input: WorkflowLoopInput): WorkflowLoopAction {
  if (!input.active) {
    return {
      action: "stop",
      reason: "inactive",
      message: "Auto-mode is not active.",
    };
  }

  if (input.iteration > input.maxIterations) {
    return {
      action: "stop",
      reason: "max-iterations",
      message: `Safety: loop exceeded ${input.maxIterations} iterations.`,
    };
  }

  if (!input.hasCommandContext) {
    return {
      action: "stop",
      reason: "missing-command-context",
      message: "Auto-mode has no command context for dispatch.",
    };
  }

  if (!input.sessionLockValid) {
    return {
      action: "stop",
      reason: "session-lock-lost",
      message: input.sessionLockReason
        ? `Session lock lost: ${input.sessionLockReason}.`
        : "Session lock lost.",
    };
  }

  return { action: "continue" };
}

export function decideDispatchClaim(input: DispatchClaimInput): DispatchClaimDecision {
  if (input.kind === "skip") {
    return {
      action: "skip",
      reason: input.reason,
    };
  }

  if (input.kind === "opened") {
    return {
      action: "run",
      dispatchId: input.dispatchId,
    };
  }

  return {
    action: "run",
    dispatchId: null,
  };
}

export function decideEngineDispatch(input: EngineDispatchInput): EngineDispatchDecision {
  if (input.action === "stop") {
    return {
      action: "stop",
      reason: input.reason ?? "Engine stopped",
    };
  }

  if (input.action === "skip") {
    return { action: "skip" };
  }

  return { action: "dispatch" };
}

export function decideFinalizeResult(input: FinalizeInput): FinalizeDecision {
  if (input.action === "break") {
    const reason = input.reason ?? "unknown";
    return {
      action: "stop",
      failureClass: reason === "git-closeout-failure" ? "git" : "closeout",
      ledgerErrorSummary: `finalize-break:${reason}`,
      turnError: "finalize-break",
    };
  }

  if (input.action === "continue") {
    return {
      action: "retry",
      ledgerErrorSummary: "finalize-retry",
    };
  }

  return { action: "complete" };
}

export function decideEngineReconcile(input: EngineReconcileInput): EngineReconcileDecision {
  if (input.outcome === "milestone-complete") {
    return {
      action: "complete-workflow",
      stopReason: "Workflow complete",
    };
  }

  if (input.outcome === "pause") {
    return { action: "pause" };
  }

  if (input.outcome === "stop") {
    return {
      action: "stop",
      reason: input.reason ?? "Engine stopped",
    };
  }

  return { action: "continue" };
}

export function decideMemoryPressure(input: MemoryPressureInput): MemoryPressureDecision {
  if (!input.pressured) {
    return { action: "continue" };
  }

  const pct = Math.round(input.pct * 100);
  return {
    action: "stop",
    warningMessage:
      `Memory pressure: ${input.heapMB}MB / ${input.limitMB}MB (${pct}%) — stopping auto-mode to prevent OOM kill`,
    stopMessage:
      `Memory pressure: heap at ${input.heapMB}MB / ${input.limitMB}MB (${pct}%). ` +
      `Stopping gracefully to prevent OOM kill after ${input.iteration} iterations. ` +
      "Resume with /gsd auto to continue from where you left off.",
    turnError: "memory-pressure",
  };
}

export function decideMinRequestInterval(input: MinRequestIntervalInput): MinRequestIntervalDecision {
  if (input.minIntervalMs <= 0 || input.lastRequestTimestamp <= 0) {
    return { action: "continue" };
  }

  const elapsedMs = input.nowMs - input.lastRequestTimestamp;
  if (elapsedMs >= input.minIntervalMs) {
    return { action: "continue" };
  }

  return {
    action: "wait",
    waitMs: input.minIntervalMs - elapsedMs,
  };
}

export function decideCooldownRecovery(input: CooldownRecoveryInput): CooldownRecoveryDecision {
  if (input.consecutiveCooldowns > input.maxCooldownRetries) {
    return {
      action: "stop",
      notifyMessage:
        `Auto-mode stopped: ${input.consecutiveCooldowns} consecutive credential cooldowns — ` +
        "rate limit or quota may be persistently exhausted.",
      stopMessage:
        `${input.consecutiveCooldowns} consecutive credential cooldowns exceeded retry budget`,
    };
  }

  const waitMs = input.retryAfterMs !== undefined && input.retryAfterMs > 0 && input.retryAfterMs <= 60_000
    ? input.retryAfterMs + 500
    : input.fallbackWaitMs;
  return {
    action: "wait",
    waitMs,
    notifyMessage:
      `Credentials in cooldown (${input.consecutiveCooldowns}/${input.maxCooldownRetries}) — ` +
      `waiting ${Math.round(waitMs / 1000)}s before retrying.`,
  };
}

export function decideIterationErrorRecovery(
  input: IterationErrorRecoveryInput,
): IterationErrorRecoveryDecision {
  if (input.consecutiveErrors >= 3) {
    const errorHistory = input.recentErrorMessages
      .map((message, index) => `  ${index + 1}. ${message}`)
      .join("\n");
    return {
      action: "stop",
      notifyMessage:
        `Auto-mode stopped: ${input.consecutiveErrors} consecutive iteration failures:\n${errorHistory}`,
      stopMessage: `${input.consecutiveErrors} consecutive iteration failures`,
      turnStatus: "failed",
    };
  }

  if (input.consecutiveErrors === 2) {
    return {
      action: "invalidate-and-retry",
      notifyMessage:
        `Iteration error (attempt ${input.consecutiveErrors}): ` +
        `${input.currentErrorMessage}. Invalidating caches and retrying.`,
      turnStatus: "retry",
    };
  }

  return {
    action: "retry",
    notifyMessage: `Iteration error: ${input.currentErrorMessage}. Retrying.`,
    turnStatus: "retry",
  };
}

export function decideCustomEngineVerifyRetry(
  input: CustomEngineVerifyRetryInput,
): CustomEngineVerifyRetryDecision {
  return input.attempts > input.maxRetries
    ? { action: "recover" }
    : { action: "retry" };
}

export function shouldUseCustomEnginePath(input: CustomEnginePathInput): boolean {
  return input.activeEngineId != null
    && input.activeEngineId !== "dev"
    && !input.hasSidecarItem
    && !input.engineBypass;
}

export function resolveUnitRequestTimestamp(input: UnitRequestTimestampInput): number | undefined {
  const requestTimestamp = input.requestDispatchedAt ?? input.unitStartedAt;
  return typeof requestTimestamp === "number" ? requestTimestamp : undefined;
}

export function decideCustomEngineRecovery(
  input: CustomEngineRecoveryInput,
): CustomEngineRecoveryDecision {
  const exhaustedTurnError = "custom-engine-verify-retry-exhausted";

  if (input.outcome === "pause") {
    return {
      action: "pause",
      turnError: input.reason ?? exhaustedTurnError,
    };
  }

  if (input.outcome === "skip") {
    return {
      action: "stop",
      stopMessage:
        input.reason ??
        `Custom workflow verification for ${input.unitId} requested skip after retry exhaustion, but the custom engine cannot reconcile skipped steps.`,
      turnError: exhaustedTurnError,
    };
  }

  const exhaustedReason =
    `Custom workflow verification for ${input.unitId} requested retry ${input.attempts} times without passing.`;
  return {
    action: "stop",
    stopMessage: input.outcome === "stop" && input.reason ? input.reason : exhaustedReason,
    turnError: exhaustedTurnError,
  };
}

export function decideInfrastructureError(input: InfrastructureErrorInput): InfrastructureErrorDecision {
  return {
    notifyMessage: `Auto-mode stopped: infrastructure error ${input.code} — ${input.errorMessage}`,
    stopMessage: `Infrastructure error (${input.code}): not recoverable by retry`,
    turnStatus: "failed",
    failureClass: "execution",
  };
}

export function decideModelPolicyBlocked(input: ModelPolicyBlockedInput): ModelPolicyBlockedDecision {
  return {
    notifyMessage:
      `Auto-mode paused: model-policy denied dispatch for ${input.unitType}/${input.unitId}. ${input.errorMessage}`,
    journalData: {
      unitType: input.unitType,
      unitId: input.unitId,
      status: "blocked",
      reason: "model-policy-dispatch-blocked",
      reasons: input.reasons,
    },
    turnStatus: "paused",
    failureClass: "manual-attention",
  };
}

export function decideDispatchNodeKind(
  unitType: string,
  sidecarKind?: DispatchSidecarKind,
): DispatchNodeKind {
  if (sidecarKind === "hook") return "hook";
  if (sidecarKind === "triage") return "verification";
  if (sidecarKind === "quick-task") return "team-worker";

  if (unitType.startsWith("hook/")) return "hook";
  if (unitType === "reactive-execute") return "subagent";
  if (
    unitType === "gate-evaluate"
    || unitType === "validate-milestone"
    || unitType === "run-uat"
    || unitType === "complete-slice"
  ) {
    return "verification";
  }
  if (unitType === "replan-slice" || unitType === "reassess-roadmap") {
    return "reprocess";
  }
  return "unit";
}

export function formatDispatchExceptionSummary(input: DispatchLedgerErrorInput): string {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return `exception:${message}`;
}

export function formatUnhandledDispatchErrorSummary(input: DispatchLedgerErrorInput): string {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return `unhandled-error:${message.slice(0, 200)}`;
}
