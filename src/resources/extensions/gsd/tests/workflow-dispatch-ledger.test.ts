// Project/App: GSD-2
// File Purpose: Unit tests for best-effort auto-mode dispatch ledger helpers.

import assert from "node:assert/strict";
import test from "node:test";

import {
  settleDispatchCompleted,
  settleDispatchFailed,
} from "../auto/workflow-dispatch-ledger.ts";

test("settleDispatchFailed writes failures and reports settled state", () => {
  const calls: Array<{ dispatchId: number; errorSummary: string }> = [];

  const settled = settleDispatchFailed(42, "unit-break", {
    markFailed: (dispatchId, details) => calls.push({ dispatchId, ...details }),
    logWriteFailure: () => assert.fail("logWriteFailure should not be called"),
  });

  assert.equal(settled, true);
  assert.deepEqual(calls, [{ dispatchId: 42, errorSummary: "unit-break" }]);
});

test("settleDispatchFailed skips null dispatch ids", () => {
  const settled = settleDispatchFailed(null, "unit-break", {
    markFailed: () => assert.fail("markFailed should not be called"),
    logWriteFailure: () => assert.fail("logWriteFailure should not be called"),
  });

  assert.equal(settled, false);
});

test("settleDispatchFailed logs failed ledger writes without throwing", () => {
  const logged: unknown[] = [];
  const writeError = new Error("db locked");

  const settled = settleDispatchFailed(42, "unit-break", {
    markFailed: () => {
      throw writeError;
    },
    logWriteFailure: err => logged.push(err),
  });

  assert.equal(settled, false);
  assert.deepEqual(logged, [writeError]);
});

test("settleDispatchCompleted writes completion and reports settled state", () => {
  const calls: number[] = [];

  const settled = settleDispatchCompleted(42, {
    markCompleted: dispatchId => calls.push(dispatchId),
    logWriteFailure: () => assert.fail("logWriteFailure should not be called"),
  });

  assert.equal(settled, true);
  assert.deepEqual(calls, [42]);
});

test("settleDispatchCompleted skips null dispatch ids", () => {
  const settled = settleDispatchCompleted(null, {
    markCompleted: () => assert.fail("markCompleted should not be called"),
    logWriteFailure: () => assert.fail("logWriteFailure should not be called"),
  });

  assert.equal(settled, false);
});

test("settleDispatchCompleted logs failed ledger writes without throwing", () => {
  const logged: unknown[] = [];
  const writeError = new Error("db locked");

  const settled = settleDispatchCompleted(42, {
    markCompleted: () => {
      throw writeError;
    },
    logWriteFailure: err => logged.push(err),
  });

  assert.equal(settled, false);
  assert.deepEqual(logged, [writeError]);
});
