// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode custom-engine verification retry adapter.

import assert from "node:assert/strict";
import test from "node:test";

import {
  handleCustomEngineVerifyRetry,
  type CustomEngineRecoverResult,
  type HandleCustomEngineVerifyRetryDeps,
} from "../auto/workflow-custom-engine-retry.ts";

function makeHarness(options?: {
  initialAttempts?: number;
  recoverResult?: CustomEngineRecoverResult;
}): {
  session: { verificationRetryCount: Map<string, number> };
  deps: HandleCustomEngineVerifyRetryDeps;
  calls: unknown[];
} {
  const retryCounts = new Map<string, number>();
  if (options?.initialAttempts !== undefined) {
    retryCounts.set("execute-task/T01", options.initialAttempts);
  }
  const session = { verificationRetryCount: retryCounts };
  const calls: unknown[] = [];
  const deps: HandleCustomEngineVerifyRetryDeps = {
    hydrateRetryCounts: () => {
      calls.push(["hydrate"]);
      return retryCounts;
    },
    saveRetryCounts: () => calls.push(["save"]),
    recover: async (unitType, unitId, recoverOptions) => {
      calls.push(["recover", unitType, unitId, recoverOptions]);
      return options?.recoverResult ?? { outcome: "pause", reason: "needs human" };
    },
    logRetry: details => calls.push(["log", details]),
    reportRetry: details => calls.push(["report", details]),
  };
  return { session, deps, calls };
}

test("handleCustomEngineVerifyRetry increments and persists retry attempts", async () => {
  const { session, deps, calls } = makeHarness();

  const outcome = await handleCustomEngineVerifyRetry({
    session,
    unitType: "execute-task",
    unitId: "T01",
    basePath: "/project",
    iteration: 2,
    maxRetries: 3,
    deps,
  });

  assert.deepEqual(outcome, { action: "retry", attempts: 1 });
  assert.equal(session.verificationRetryCount.get("execute-task/T01"), 1);
  assert.deepEqual(calls, [
    ["hydrate"],
    ["save"],
    ["log", { iteration: 2, unitId: "T01", attempts: 1 }],
    ["report", { unitType: "execute-task", unitId: "T01", attempts: 1 }],
  ]);
});

test("handleCustomEngineVerifyRetry requests recovery after retry budget is exceeded", async () => {
  const { deps, calls } = makeHarness({
    initialAttempts: 3,
    recoverResult: { outcome: "pause", reason: "manual review" },
  });

  const outcome = await handleCustomEngineVerifyRetry({
    session: { verificationRetryCount: new Map([["execute-task/T01", 3]]) },
    unitType: "execute-task",
    unitId: "T01",
    basePath: "/project",
    iteration: 4,
    maxRetries: 3,
    deps,
  });

  assert.deepEqual(outcome, {
    action: "pause",
    attempts: 4,
    turnError: "manual review",
  });
  assert.deepEqual(calls.at(-1), ["recover", "execute-task", "T01", { basePath: "/project" }]);
});

test("handleCustomEngineVerifyRetry maps stop recovery to stop outcome", async () => {
  const { session, deps } = makeHarness({
    initialAttempts: 3,
    recoverResult: { outcome: "stop", reason: "engine stopped" },
  });

  const outcome = await handleCustomEngineVerifyRetry({
    session,
    unitType: "execute-task",
    unitId: "T01",
    basePath: "/project",
    iteration: 4,
    maxRetries: 3,
    deps,
  });

  assert.deepEqual(outcome, {
    action: "stop",
    attempts: 4,
    stopMessage: "engine stopped",
    turnError: "custom-engine-verify-retry-exhausted",
  });
});

test("handleCustomEngineVerifyRetry maps skip recovery to incompatible skip stop", async () => {
  const { session, deps } = makeHarness({
    initialAttempts: 3,
    recoverResult: { outcome: "skip" },
  });

  const outcome = await handleCustomEngineVerifyRetry({
    session,
    unitType: "execute-task",
    unitId: "T01",
    basePath: "/project",
    iteration: 4,
    maxRetries: 3,
    deps,
  });

  assert.equal(outcome.action, "stop");
  assert.equal(outcome.attempts, 4);
  assert.match(
    outcome.action === "stop" ? outcome.stopMessage : "",
    /cannot reconcile skipped steps/,
  );
});
