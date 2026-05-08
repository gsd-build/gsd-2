// Project/App: GSD-2
// File Purpose: Thin adapter for workflow turn observer reporting.

import type {
  FailureClass,
  TurnStatus,
  UokTurnObserver,
} from "../uok/contracts.js";

export interface WorkflowTurnReporterInput {
  observer?: UokTurnObserver;
  traceId: string;
  turnId: string;
  iteration: number;
  basePath: string;
  startedAt: string;
  clearCurrentTurn: () => void;
  now?: () => string;
}

export interface WorkflowTurnFinishInput {
  status: TurnStatus;
  failureClass?: FailureClass;
  error?: string;
  unitType?: string;
  unitId?: string;
}

export interface WorkflowTurnReporter {
  start(): void;
  finish(input: WorkflowTurnFinishInput): void;
}

export function createWorkflowTurnReporter(input: WorkflowTurnReporterInput): WorkflowTurnReporter {
  let finished = false;
  const now = input.now ?? (() => new Date().toISOString());

  return {
    start(): void {
      input.observer?.onTurnStart({
        traceId: input.traceId,
        turnId: input.turnId,
        iteration: input.iteration,
        basePath: input.basePath,
        startedAt: input.startedAt,
      });
    },

    finish(finishInput: WorkflowTurnFinishInput): void {
      if (finished) return;
      finished = true;
      input.observer?.onTurnResult({
        traceId: input.traceId,
        turnId: input.turnId,
        iteration: input.iteration,
        unitType: finishInput.unitType,
        unitId: finishInput.unitId,
        status: finishInput.status,
        failureClass: finishInput.failureClass ?? "none",
        phaseResults: [],
        error: finishInput.error,
        startedAt: input.startedAt,
        finishedAt: now(),
      });
      input.clearCurrentTurn();
    },
  };
}
