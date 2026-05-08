// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode session-lock validation adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { SessionLockStatus } from "../session-lock.ts";
import {
  validateWorkflowSessionLock,
  type WorkflowSessionLockDeps,
} from "../auto/workflow-session-lock.ts";

function makeDeps(overrides?: Partial<WorkflowSessionLockDeps>): {
  deps: WorkflowSessionLockDeps;
  calls: string[];
  invalidDetails: unknown[];
  exitDetails: unknown[];
  handledStatuses: SessionLockStatus[];
} {
  const calls: string[] = [];
  const invalidDetails: unknown[] = [];
  const exitDetails: unknown[] = [];
  const handledStatuses: SessionLockStatus[] = [];
  const deps: WorkflowSessionLockDeps = {
    lockBase: () => "/tmp/gsd-lock",
    validateSessionLock: () => ({ valid: true }),
    handleLostSessionLock: status => {
      calls.push("handleLostSessionLock");
      handledStatuses.push(status);
    },
    logInvalidSessionLock: details => {
      calls.push("logInvalidSessionLock");
      invalidDetails.push(details);
    },
    logSessionLockExit: details => {
      calls.push("logSessionLockExit");
      exitDetails.push(details);
    },
    ...overrides,
  };
  return { deps, calls, invalidDetails, exitDetails, handledStatuses };
}

test("validateWorkflowSessionLock skips validation when no lock base exists", () => {
  const { deps, calls } = makeDeps({
    lockBase: () => "",
    validateSessionLock: () => assert.fail("validateSessionLock should not be called"),
  });

  const outcome = validateWorkflowSessionLock({
    active: true,
    iteration: 1,
    maxIterations: 10,
    deps,
  });

  assert.deepEqual(outcome, { action: "continue" });
  assert.deepEqual(calls, []);
});

test("validateWorkflowSessionLock continues when the current lock is valid", () => {
  const { deps, calls } = makeDeps({
    validateSessionLock: () => ({ valid: true }),
  });

  const outcome = validateWorkflowSessionLock({
    active: true,
    iteration: 1,
    maxIterations: 10,
    deps,
  });

  assert.deepEqual(outcome, { action: "continue" });
  assert.deepEqual(calls, []);
});

test("validateWorkflowSessionLock handles lost lock with structured details", () => {
  const status: SessionLockStatus = {
    valid: false,
    failureReason: "compromised",
    existingPid: 123,
    expectedPid: 456,
  };
  const { deps, calls, invalidDetails, exitDetails, handledStatuses } = makeDeps({
    validateSessionLock: () => status,
  });

  const outcome = validateWorkflowSessionLock({
    active: true,
    iteration: 1,
    maxIterations: 10,
    deps,
  });

  assert.deepEqual(outcome, { action: "stop", reason: "session-lock-lost" });
  assert.deepEqual(calls, [
    "logInvalidSessionLock",
    "handleLostSessionLock",
    "logSessionLockExit",
  ]);
  assert.deepEqual(invalidDetails, [{
    reason: "compromised",
    existingPid: 123,
    expectedPid: 456,
  }]);
  assert.deepEqual(handledStatuses, [status]);
  assert.deepEqual(exitDetails, [{
    reason: "session-lock-lost",
    detail: "compromised",
  }]);
});

test("validateWorkflowSessionLock uses unknown detail for invalid lock without reason", () => {
  const { deps, invalidDetails, exitDetails } = makeDeps({
    validateSessionLock: () => ({ valid: false }),
  });

  const outcome = validateWorkflowSessionLock({
    active: true,
    iteration: 1,
    maxIterations: 10,
    deps,
  });

  assert.deepEqual(outcome, { action: "stop", reason: "session-lock-lost" });
  assert.deepEqual(invalidDetails, [{
    reason: "unknown",
    existingPid: undefined,
    expectedPid: undefined,
  }]);
  assert.deepEqual(exitDetails, [{
    reason: "session-lock-lost",
    detail: "unknown",
  }]);
});
