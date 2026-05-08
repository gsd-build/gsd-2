// Project/App: GSD-2
// File Purpose: Unit tests for custom-engine dispatch outcome side-effect adapter.

import assert from "node:assert/strict";
import test from "node:test";

import { handleCustomEngineDispatchOutcome } from "../auto/workflow-custom-engine-dispatch-outcome.ts";

test("handleCustomEngineDispatchOutcome stops auto on stop decision", async () => {
  const calls: unknown[] = [];

  const flow = await handleCustomEngineDispatchOutcome({
    decision: { action: "stop", reason: "done" },
    deps: {
      stopAuto: async reason => {
        calls.push(["stopAuto", reason]);
      },
    },
  });

  assert.deepEqual(flow, { action: "break" });
  assert.deepEqual(calls, [["stopAuto", "done"]]);
});

test("handleCustomEngineDispatchOutcome continues on skip decision", async () => {
  const calls: unknown[] = [];

  const flow = await handleCustomEngineDispatchOutcome({
    decision: { action: "skip" },
    deps: {
      stopAuto: async reason => {
        calls.push(["stopAuto", reason]);
      },
    },
  });

  assert.deepEqual(flow, { action: "continue" });
  assert.deepEqual(calls, []);
});

test("handleCustomEngineDispatchOutcome dispatches without side effects", async () => {
  const calls: unknown[] = [];

  const flow = await handleCustomEngineDispatchOutcome({
    decision: { action: "dispatch" },
    deps: {
      stopAuto: async reason => {
        calls.push(["stopAuto", reason]);
      },
    },
  });

  assert.deepEqual(flow, { action: "dispatch" });
  assert.deepEqual(calls, []);
});
