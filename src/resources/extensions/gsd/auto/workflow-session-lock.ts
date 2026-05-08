// Project/App: GSD-2
// File Purpose: Session-lock validation adapter for auto-mode loop.

import type { SessionLockStatus } from "../session-lock.js";
import {
  decideWorkflowLoop,
  type WorkflowStopReason,
} from "./workflow-kernel.js";

export type WorkflowSessionLockOutcome =
  | { action: "continue" }
  | { action: "stop"; reason: WorkflowStopReason };

export interface WorkflowSessionLockDeps {
  lockBase: () => string;
  validateSessionLock: (basePath: string) => SessionLockStatus;
  handleLostSessionLock: (lockStatus: SessionLockStatus) => void;
  logInvalidSessionLock: (details: {
    reason: string;
    existingPid?: number;
    expectedPid?: number;
  }) => void;
  logSessionLockExit: (details: {
    reason: WorkflowStopReason;
    detail: string;
  }) => void;
}

export function validateWorkflowSessionLock(input: {
  active: boolean;
  iteration: number;
  maxIterations: number;
  deps: WorkflowSessionLockDeps;
}): WorkflowSessionLockOutcome {
  const sessionLockBase = input.deps.lockBase();
  if (!sessionLockBase) return { action: "continue" };

  const lockStatus = input.deps.validateSessionLock(sessionLockBase);
  const detail = lockStatus.failureReason ?? "unknown";
  const lockDecision = decideWorkflowLoop({
    active: input.active,
    iteration: input.iteration,
    maxIterations: input.maxIterations,
    hasCommandContext: true,
    sessionLockValid: lockStatus.valid,
    sessionLockReason: detail,
  });

  if (lockDecision.action !== "stop" || lockDecision.reason !== "session-lock-lost") {
    return { action: "continue" };
  }

  input.deps.logInvalidSessionLock({
    reason: detail,
    existingPid: lockStatus.existingPid,
    expectedPid: lockStatus.expectedPid,
  });
  input.deps.handleLostSessionLock(lockStatus);
  input.deps.logSessionLockExit({
    reason: lockDecision.reason,
    detail,
  });

  return {
    action: "stop",
    reason: lockDecision.reason,
  };
}
