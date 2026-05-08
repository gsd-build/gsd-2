// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode custom-engine reconcile adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { EngineState, ReconcileResult } from "../engine-types.ts";
import type { IterationData } from "../auto/types.ts";
import {
  handleCustomEngineReconcile,
  type HandleCustomEngineReconcileDeps,
} from "../auto/workflow-custom-engine-reconcile.ts";

function makeIterData(): IterationData {
  return {
    unitType: "execute-task",
    unitId: "T01",
    prompt: "Run task",
    finalPrompt: "Run task",
    pauseAfterUatDispatch: false,
    state: {} as IterationData["state"],
    mid: "M001",
    midTitle: "Milestone 1",
    isRetry: false,
    previousTier: undefined,
  };
}

function makeEngineState(): EngineState {
  return {
    phase: "executing",
    currentMilestoneId: "M001",
    activeSliceId: "S01",
    activeTaskId: "T01",
    isComplete: false,
    raw: {},
  };
}

function makeDeps(reconcileResult: ReconcileResult): {
  deps: HandleCustomEngineReconcileDeps;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const deps: HandleCustomEngineReconcileDeps = {
    saveRetryCounts: () => calls.push(["save"]),
    logReconcile: details => calls.push(["log", details]),
    reconcile: async (state, completedStep) => {
      calls.push(["reconcile", state, completedStep]);
      return reconcileResult;
    },
    now: () => 200,
    clearUnitTimeout: () => calls.push(["clearUnitTimeout"]),
    completeIteration: () => calls.push(["completeIteration"]),
  };
  return { deps, calls };
}

test("handleCustomEngineReconcile clears retry count and reconciles completed step", async () => {
  const retryCounts = new Map([["execute-task/T01", 2]]);
  const { deps, calls } = makeDeps({ outcome: "continue" });
  const engineState = makeEngineState();

  const outcome = await handleCustomEngineReconcile({
    session: {
      currentUnit: { startedAt: 100 },
      verificationRetryCount: retryCounts,
    },
    engineState,
    iterData: makeIterData(),
    iteration: 5,
    deps,
  });

  assert.equal(retryCounts.has("execute-task/T01"), false);
  assert.deepEqual(outcome, {
    decision: { action: "continue" },
    reason: undefined,
  });
  assert.deepEqual(calls, [
    ["save"],
    ["log", { iteration: 5, unitId: "T01" }],
    ["reconcile", engineState, {
      unitType: "execute-task",
      unitId: "T01",
      startedAt: 100,
      finishedAt: 200,
    }],
    ["clearUnitTimeout"],
    ["completeIteration"],
  ]);
});

test("handleCustomEngineReconcile falls back startedAt to finishedAt", async () => {
  const { deps, calls } = makeDeps({ outcome: "pause" });

  const outcome = await handleCustomEngineReconcile({
    session: {},
    engineState: makeEngineState(),
    iterData: makeIterData(),
    iteration: 1,
    deps,
  });

  assert.deepEqual(outcome.decision, { action: "pause" });
  assert.deepEqual((calls[2] as unknown[])[2], {
    unitType: "execute-task",
    unitId: "T01",
    startedAt: 200,
    finishedAt: 200,
  });
});

test("handleCustomEngineReconcile maps stop reason through kernel decision", async () => {
  const { deps } = makeDeps({ outcome: "stop", reason: "blocked" });

  const outcome = await handleCustomEngineReconcile({
    session: { verificationRetryCount: new Map() },
    engineState: makeEngineState(),
    iterData: makeIterData(),
    iteration: 1,
    deps,
  });

  assert.deepEqual(outcome, {
    decision: { action: "stop", reason: "blocked" },
    reason: "blocked",
  });
});

test("handleCustomEngineReconcile maps milestone completion", async () => {
  const { deps } = makeDeps({ outcome: "milestone-complete" });

  const outcome = await handleCustomEngineReconcile({
    session: { verificationRetryCount: new Map() },
    engineState: makeEngineState(),
    iterData: makeIterData(),
    iteration: 1,
    deps,
  });

  assert.deepEqual(outcome.decision, {
    action: "complete-workflow",
    stopReason: "Workflow complete",
  });
});
