// Project/App: GSD-2
// File Purpose: Unit tests for workflow turn observer reporting adapter.

import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowTurnReporter } from "../auto/workflow-turn-reporter.ts";

test("workflow turn reporter emits start and finish contracts", () => {
  const starts: unknown[] = [];
  const results: unknown[] = [];
  let clearCount = 0;
  const reporter = createWorkflowTurnReporter({
    observer: {
      onTurnStart: contract => starts.push(contract),
      onPhaseResult: () => {},
      onTurnResult: result => results.push(result),
    },
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 3,
    basePath: "/repo",
    startedAt: "2026-05-04T00:00:00.000Z",
    clearCurrentTurn: () => {
      clearCount += 1;
    },
    now: () => "2026-05-04T00:00:01.000Z",
  });

  reporter.start();
  reporter.finish({
    status: "stopped",
    failureClass: "manual-attention",
    error: "blocked",
    unitType: "execute-task",
    unitId: "M001/S01/T01",
  });

  assert.deepEqual(starts, [{
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 3,
    basePath: "/repo",
    startedAt: "2026-05-04T00:00:00.000Z",
  }]);
  assert.deepEqual(results, [{
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 3,
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    status: "stopped",
    failureClass: "manual-attention",
    phaseResults: [],
    error: "blocked",
    startedAt: "2026-05-04T00:00:00.000Z",
    finishedAt: "2026-05-04T00:00:01.000Z",
  }]);
  assert.equal(clearCount, 1);
});

test("workflow turn reporter finishes only once", () => {
  const results: unknown[] = [];
  let clearCount = 0;
  const reporter = createWorkflowTurnReporter({
    observer: {
      onTurnStart: () => {},
      onPhaseResult: () => {},
      onTurnResult: result => results.push(result),
    },
    traceId: "trace-1",
    turnId: "turn-1",
    iteration: 1,
    basePath: "/repo",
    startedAt: "start",
    clearCurrentTurn: () => {
      clearCount += 1;
    },
    now: () => "done",
  });

  reporter.finish({ status: "retry" });
  reporter.finish({ status: "completed" });

  assert.equal(results.length, 1);
  assert.equal(clearCount, 1);
});
