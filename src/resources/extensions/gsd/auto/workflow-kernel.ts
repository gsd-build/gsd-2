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
