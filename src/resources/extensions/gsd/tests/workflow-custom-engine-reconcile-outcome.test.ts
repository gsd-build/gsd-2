// Project/App: GSD-2
// File Purpose: Unit tests for custom-engine reconcile outcome side-effect adapter.

import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCustomEngineReconcileOutcome,
  type HandleCustomEngineReconcileOutcomeDeps,
} from "../auto/workflow-custom-engine-reconcile-outcome.ts";

function makeDeps(): {
  deps: HandleCustomEngineReconcileOutcomeDeps;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const deps: HandleCustomEngineReconcileOutcomeDeps = {
    stopAuto: async reason => {
      calls.push(["stopAuto", reason]);
    },
    pauseAuto: async () => {
      calls.push(["pauseAuto"]);
    },
    report: (action, details) => calls.push(["report", action, details]),
    finishTurn: (status, failureClass, error) => calls.push(["finishTurn", status, failureClass, error]),
  };
  return { deps, calls };
}

test("handleCustomEngineReconcileOutcome stops completed workflow", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineReconcileOutcome({
    outcome: {
      decision: { action: "complete-workflow", stopReason: "Workflow complete" },
    },
    unitType: "execute-task",
    unitId: "T01",
    deps,
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [
    ["stopAuto", "Workflow complete"],
    ["report", "milestone-complete", { unitType: "execute-task", unitId: "T01" }],
    ["finishTurn", "completed", undefined, undefined],
  ]);
});

test("handleCustomEngineReconcileOutcome pauses for manual attention", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineReconcileOutcome({
    outcome: {
      decision: { action: "pause" },
    },
    unitType: "verify-slice",
    unitId: "S01",
    deps,
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [
    ["pauseAuto"],
    ["report", "pause", { unitType: "verify-slice", unitId: "S01" }],
    ["finishTurn", "paused", "manual-attention", undefined],
  ]);
});

test("handleCustomEngineReconcileOutcome stops with reconcile reason", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineReconcileOutcome({
    outcome: {
      decision: { action: "stop", reason: "blocked" },
      reason: "blocked",
    },
    unitType: "complete-slice",
    unitId: "S01",
    deps,
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [
    ["stopAuto", "blocked"],
    ["report", "stop", { unitType: "complete-slice", unitId: "S01", reason: "blocked" }],
    ["finishTurn", "stopped", "manual-attention", "blocked"],
  ]);
});

test("handleCustomEngineReconcileOutcome continues after completed unit", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineReconcileOutcome({
    outcome: {
      decision: { action: "continue" },
    },
    unitType: "research-slice",
    unitId: "S01",
    deps,
  });

  assert.deepEqual(flow, { action: "continue" });
  assert.deepEqual(calls, [
    ["report", "continue", { unitType: "research-slice", unitId: "S01" }],
    ["finishTurn", "completed", undefined, undefined],
  ]);
});
