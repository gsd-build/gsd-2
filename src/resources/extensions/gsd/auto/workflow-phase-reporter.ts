// Project/App: GSD-2
// File Purpose: Thin adapter for auto-mode UOK phase-result reporting.

import type { TurnPhase, UokTurnObserver } from "../uok/contracts.js";

export interface WorkflowPhaseReporterInput {
  observer?: UokTurnObserver;
}

export interface WorkflowPhaseReporter {
  report(phase: TurnPhase, action: string, data?: Record<string, unknown>): void;
}

export function createWorkflowPhaseReporter(
  input: WorkflowPhaseReporterInput,
): WorkflowPhaseReporter {
  return {
    report(phase: TurnPhase, action: string, data?: Record<string, unknown>): void {
      input.observer?.onPhaseResult(phase, action, data);
    },
  };
}
