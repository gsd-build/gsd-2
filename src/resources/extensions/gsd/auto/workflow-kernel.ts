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
