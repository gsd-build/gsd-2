// Project/App: GSD-2
// File Purpose: Unit tests for pure auto-mode workflow kernel decisions.

import assert from "node:assert/strict";
import test from "node:test";

import {
  decideDispatchClaim,
  decideEngineDispatch,
  decideFinalizeResult,
  decideWorkflowLoop,
} from "../auto/workflow-kernel.ts";

test("decideWorkflowLoop continues when dispatch preconditions are valid", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    { action: "continue" },
  );
});

test("decideWorkflowLoop stops inactive sessions before dispatch", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: false,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "inactive",
      message: "Auto-mode is not active.",
    },
  );
});

test("decideWorkflowLoop stops runaway loops with a stable reason", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 501,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "max-iterations",
      message: "Safety: loop exceeded 500 iterations.",
    },
  );
});

test("decideWorkflowLoop stops when dispatch cannot create a command session", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: false,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "missing-command-context",
      message: "Auto-mode has no command context for dispatch.",
    },
  );
});

test("decideWorkflowLoop preserves session lock loss detail", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: false,
      sessionLockReason: "pid mismatch",
    }),
    {
      action: "stop",
      reason: "session-lock-lost",
      message: "Session lock lost: pid mismatch.",
    },
  );
});

test("decideDispatchClaim runs with an opened dispatch id", () => {
  assert.deepEqual(
    decideDispatchClaim({ kind: "opened", dispatchId: 42 }),
    { action: "run", dispatchId: 42 },
  );
});

test("decideDispatchClaim runs degraded dispatches without a ledger id", () => {
  assert.deepEqual(
    decideDispatchClaim({ kind: "degraded" }),
    { action: "run", dispatchId: null },
  );
});

test("decideDispatchClaim skips claimed units with a stable reason", () => {
  assert.deepEqual(
    decideDispatchClaim({ kind: "skip", reason: "already-active" }),
    { action: "skip", reason: "already-active" },
  );
});

test("decideEngineDispatch preserves stop reasons and defaults missing ones", () => {
  assert.deepEqual(
    decideEngineDispatch({ action: "stop", reason: "done" }),
    { action: "stop", reason: "done" },
  );
  assert.deepEqual(
    decideEngineDispatch({ action: "stop" }),
    { action: "stop", reason: "Engine stopped" },
  );
});

test("decideEngineDispatch passes through skip and dispatch actions", () => {
  assert.deepEqual(decideEngineDispatch({ action: "skip" }), { action: "skip" });
  assert.deepEqual(decideEngineDispatch({ action: "dispatch" }), { action: "dispatch" });
});

test("decideFinalizeResult maps break results to stop decisions", () => {
  assert.deepEqual(
    decideFinalizeResult({ action: "break", reason: "git-closeout-failure" }),
    {
      action: "stop",
      failureClass: "git",
      ledgerErrorSummary: "finalize-break:git-closeout-failure",
      turnError: "finalize-break",
    },
  );
  assert.deepEqual(
    decideFinalizeResult({ action: "break" }),
    {
      action: "stop",
      failureClass: "closeout",
      ledgerErrorSummary: "finalize-break:unknown",
      turnError: "finalize-break",
    },
  );
});

test("decideFinalizeResult maps continue and next results", () => {
  assert.deepEqual(
    decideFinalizeResult({ action: "continue" }),
    { action: "retry", ledgerErrorSummary: "finalize-retry" },
  );
  assert.deepEqual(decideFinalizeResult({ action: "next" }), { action: "complete" });
});
