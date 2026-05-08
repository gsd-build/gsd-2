// Project/App: GSD-2
// File Purpose: Unit tests for successful auto-mode iteration cleanup.

import assert from "node:assert/strict";
import test from "node:test";

import {
  completeWorkflowIteration,
  type WorkflowIterationRecoveryState,
} from "../auto/workflow-iteration-completion.ts";

test("completeWorkflowIteration resets recovery counters and clears recent errors", () => {
  const state: WorkflowIterationRecoveryState = {
    consecutiveErrors: 2,
    consecutiveCooldowns: 1,
    recentErrorMessages: ["first", "second"],
  };

  completeWorkflowIteration(state, {
    emitIterationEnd: () => {},
    saveStuckState: () => {},
    logIterationComplete: () => {},
  });

  assert.equal(state.consecutiveErrors, 0);
  assert.equal(state.consecutiveCooldowns, 0);
  assert.deepEqual(state.recentErrorMessages, []);
});

test("completeWorkflowIteration runs completion side effects in loop order", () => {
  const calls: string[] = [];

  completeWorkflowIteration({
    consecutiveErrors: 1,
    consecutiveCooldowns: 1,
    recentErrorMessages: ["temporary"],
  }, {
    emitIterationEnd: () => calls.push("emit"),
    saveStuckState: () => calls.push("save"),
    logIterationComplete: () => calls.push("log"),
  });

  assert.deepEqual(calls, ["emit", "save", "log"]);
});
