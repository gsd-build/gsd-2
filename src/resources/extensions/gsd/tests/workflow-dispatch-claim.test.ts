// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode dispatch claim adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { AutoSession } from "../auto/session.ts";
import type { IterationData } from "../auto/types.ts";
import {
  openDispatchClaim,
  type OpenDispatchClaimDeps,
} from "../auto/workflow-dispatch-claim.ts";

function makeSession(overrides?: Partial<AutoSession>): AutoSession {
  return {
    workerId: "worker-1",
    milestoneLeaseToken: 7,
    ...overrides,
  } as AutoSession;
}

function makeIterationData(overrides?: Partial<IterationData>): IterationData {
  return {
    unitType: "execute-task",
    unitId: "M001/S001/T001",
    prompt: "Run task",
    finalPrompt: "Run task",
    pauseAfterUatDispatch: false,
    mid: "M001",
    midTitle: "Milestone",
    isRetry: false,
    previousTier: undefined,
    state: {
      activeSlice: { id: "S001" },
      activeTask: { id: "T001" },
    },
    ...overrides,
  } as IterationData;
}

function makeDeps(overrides?: Partial<OpenDispatchClaimDeps>): OpenDispatchClaimDeps {
  return {
    getRecentDispatchesForUnit: () => [],
    recordDispatchClaim: () => ({ ok: true, dispatchId: 42 }),
    markDispatchRunning: () => {},
    logClaimRejected: () => {},
    logClaimFailed: () => {},
    ...overrides,
  };
}

test("openDispatchClaim degrades when worker identity or lease token is missing", () => {
  assert.deepEqual(
    openDispatchClaim(makeSession({ workerId: null }), "flow", "turn", makeIterationData(), makeDeps({
      recordDispatchClaim: () => assert.fail("recordDispatchClaim should not be called"),
    })),
    { kind: "degraded" },
  );

  assert.deepEqual(
    openDispatchClaim(makeSession({ milestoneLeaseToken: null }), "flow", "turn", makeIterationData(), makeDeps({
      recordDispatchClaim: () => assert.fail("recordDispatchClaim should not be called"),
    })),
    { kind: "degraded" },
  );
});

test("openDispatchClaim degrades when iteration has no milestone id", () => {
  assert.deepEqual(
    openDispatchClaim(makeSession(), "flow", "turn", makeIterationData({ mid: undefined }), makeDeps({
      recordDispatchClaim: () => assert.fail("recordDispatchClaim should not be called"),
    })),
    { kind: "degraded" },
  );
});

test("openDispatchClaim records attempts and marks successful claims running", () => {
  const running: number[] = [];
  const claimInputs: unknown[] = [];

  const outcome = openDispatchClaim(makeSession(), "flow-1", "turn-1", makeIterationData(), makeDeps({
    getRecentDispatchesForUnit: (unitId, limit) => {
      assert.equal(unitId, "M001/S001/T001");
      assert.equal(limit, 1);
      return [{ attempt_n: 2 }];
    },
    recordDispatchClaim: input => {
      claimInputs.push(input);
      return { ok: true, dispatchId: 99 };
    },
    markDispatchRunning: dispatchId => running.push(dispatchId),
  }));

  assert.deepEqual(outcome, { kind: "opened", dispatchId: 99 });
  assert.deepEqual(running, [99]);
  assert.deepEqual(claimInputs, [{
    traceId: "flow-1",
    turnId: "turn-1",
    workerId: "worker-1",
    milestoneLeaseToken: 7,
    milestoneId: "M001",
    sliceId: "S001",
    taskId: "T001",
    unitType: "execute-task",
    unitId: "M001/S001/T001",
    attemptN: 3,
  }]);
});

test("openDispatchClaim skips already-active claims with existing dispatch details", () => {
  const rejected: unknown[] = [];

  const outcome = openDispatchClaim(makeSession(), "flow", "turn", makeIterationData(), makeDeps({
    recordDispatchClaim: () => ({
      ok: false,
      error: "already_active",
      existingId: 12,
      existingWorker: "worker-2",
    }),
    logClaimRejected: details => rejected.push(details),
  }));

  assert.deepEqual(outcome, {
    kind: "skip",
    reason: "already-active",
    existingId: 12,
    existingWorker: "worker-2",
  });
  assert.deepEqual(rejected, [{
    unitId: "M001/S001/T001",
    reason: "already_active",
    existingId: 12,
    existingWorker: "worker-2",
  }]);
});

test("openDispatchClaim maps non-active claim rejections to stale lease skips", () => {
  const outcome = openDispatchClaim(makeSession(), "flow", "turn", makeIterationData(), makeDeps({
    recordDispatchClaim: () => ({ ok: false, error: "stale_lease" }),
  }));

  assert.deepEqual(outcome, { kind: "skip", reason: "stale-lease" });
});

test("openDispatchClaim degrades on claim write failures", () => {
  const writeError = new Error("db unavailable");
  const logged: unknown[] = [];

  const outcome = openDispatchClaim(makeSession(), "flow", "turn", makeIterationData(), makeDeps({
    recordDispatchClaim: () => {
      throw writeError;
    },
    logClaimFailed: err => logged.push(err),
  }));

  assert.deepEqual(outcome, { kind: "degraded" });
  assert.deepEqual(logged, [writeError]);
});
