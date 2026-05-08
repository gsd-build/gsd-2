// Project/App: GSD-2
// File Purpose: Successful auto-mode iteration cleanup helper.

export interface WorkflowIterationRecoveryState {
  consecutiveErrors: number;
  consecutiveCooldowns: number;
  recentErrorMessages: string[];
}

export interface CompleteWorkflowIterationDeps {
  emitIterationEnd: () => void;
  saveStuckState: () => void;
  logIterationComplete: () => void;
}

export function completeWorkflowIteration(
  state: WorkflowIterationRecoveryState,
  deps: CompleteWorkflowIterationDeps,
): void {
  state.consecutiveErrors = 0;
  state.consecutiveCooldowns = 0;
  state.recentErrorMessages.length = 0;
  deps.emitIterationEnd();
  deps.saveStuckState();
  deps.logIterationComplete();
}
