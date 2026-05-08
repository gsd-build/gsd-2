// Project/App: GSD-2
// File Purpose: Unit tests for custom-engine verification outcome side-effect adapter.

import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCustomEngineVerifyPause,
  handleCustomEngineVerifyRetryOutcome,
  type HandleCustomEngineVerifyOutcomeDeps,
} from "../auto/workflow-custom-engine-verify-outcome.ts";

function makeDeps(): {
  deps: HandleCustomEngineVerifyOutcomeDeps;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const deps: HandleCustomEngineVerifyOutcomeDeps = {
    pauseAuto: async () => {
      calls.push(["pauseAuto"]);
    },
    stopAuto: async reason => {
      calls.push(["stopAuto", reason]);
    },
    reportPause: details => calls.push(["reportPause", details]),
    finishTurn: (status, failureClass, error) => calls.push(["finishTurn", status, failureClass, error]),
  };
  return { deps, calls };
}

test("handleCustomEngineVerifyPause pauses and reports unit details", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineVerifyPause({
    unitType: "execute-task",
    unitId: "T01",
    deps,
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [
    ["pauseAuto"],
    ["reportPause", { unitType: "execute-task", unitId: "T01" }],
    ["finishTurn", "paused", "manual-attention", "custom-engine-verify-pause"],
  ]);
});

test("handleCustomEngineVerifyRetryOutcome pauses after recovery pause", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineVerifyRetryOutcome({
    outcome: { action: "pause", attempts: 4, turnError: "recovery-pause" },
    deps,
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [
    ["pauseAuto"],
    ["finishTurn", "paused", "manual-attention", "recovery-pause"],
  ]);
});

test("handleCustomEngineVerifyRetryOutcome stops after recovery stop", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineVerifyRetryOutcome({
    outcome: {
      action: "stop",
      attempts: 4,
      stopMessage: "Recovery failed",
      turnError: "recovery-stop",
    },
    deps,
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [
    ["stopAuto", "Recovery failed"],
    ["finishTurn", "stopped", "manual-attention", "recovery-stop"],
  ]);
});

test("handleCustomEngineVerifyRetryOutcome continues for retry", async () => {
  const { deps, calls } = makeDeps();

  const flow = await handleCustomEngineVerifyRetryOutcome({
    outcome: { action: "retry", attempts: 1 },
    deps,
  });

  assert.deepEqual(flow, { action: "continue" });
  assert.deepEqual(calls, [
    ["finishTurn", "retry", undefined, undefined],
  ]);
});
