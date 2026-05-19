// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode dispatch claim adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { AutoSession } from "../auto/session.ts";
import type { IterationData } from "../auto/types.ts";
import {
  ensureDispatchLease,
  openDispatchClaim,
  type EnsureDispatchLeaseDeps,
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

function makeLeaseDeps(overrides?: Partial<EnsureDispatchLeaseDeps>): {
  deps: EnsureDispatchLeaseDeps;
  calls: unknown[];
  failures: unknown[];
} {
  const calls: unknown[] = [];
  const failures: unknown[] = [];
  const deps: EnsureDispatchLeaseDeps = {
    claimMilestoneLease: (workerId, milestoneId) => {
      calls.push(["claim", workerId, milestoneId]);
      return { ok: true, token: 8, expiresAt: "2030-01-01T00:00:00.000Z" };
    },
    logLeaseRecovered: details => calls.push(["recovered", details]),
    logLeaseRecoveryFailed: details => failures.push(details),
    ...overrides,
  };
  return { deps, calls, failures };
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

test("ensureDispatchLease degrades without worker identity or milestone id", () => {
  const { deps, calls } = makeLeaseDeps({
    claimMilestoneLease: () => assert.fail("claimMilestoneLease should not be called"),
  });

  assert.deepEqual(
    ensureDispatchLease(makeSession({ workerId: null }), "M001", deps),
    { kind: "degraded", reason: "missing-worker" },
  );
  assert.deepEqual(
    ensureDispatchLease(makeSession(), undefined, deps),
    { kind: "degraded", reason: "missing-milestone" },
  );
  assert.deepEqual(calls, []);
});

test("ensureDispatchLease degrades for virtual milestone ids", () => {
  const { deps, calls } = makeLeaseDeps({
    claimMilestoneLease: () => assert.fail("claimMilestoneLease should not be called"),
  });

  assert.deepEqual(
    ensureDispatchLease(makeSession(), "PROJECT", deps),
    { kind: "degraded", reason: "virtual-milestone" },
  );
  assert.deepEqual(calls, []);
});

test("ensureDispatchLease reuses an existing numeric token", () => {
  const { deps, calls } = makeLeaseDeps({
    claimMilestoneLease: () => assert.fail("claimMilestoneLease should not be called"),
  });

  const session = makeSession({ milestoneLeaseToken: 7 });
  const outcome = ensureDispatchLease(session, "M001", deps);

  assert.deepEqual(outcome, { kind: "ready", token: 7, recovered: false });
  assert.equal(session.milestoneLeaseToken, 7);
  assert.deepEqual(calls, []);
});

test("ensureDispatchLease claims a lease when the session has no token", () => {
  const { deps, calls, failures } = makeLeaseDeps();
  const session = makeSession({
    currentMilestoneId: "M001",
    milestoneLeaseToken: null,
  });

  const outcome = ensureDispatchLease(session, "M001", deps);

  assert.deepEqual(outcome, { kind: "ready", token: 8, recovered: false });
  assert.equal(session.currentMilestoneId, "M001");
  assert.equal(session.milestoneLeaseToken, 8);
  assert.deepEqual(calls, [
    ["claim", "worker-1", "M001"],
    ["recovered", {
      milestoneId: "M001",
      workerId: "worker-1",
      token: 8,
      recovered: false,
    }],
  ]);
  assert.deepEqual(failures, []);
});

test("ensureDispatchLease force-reclaims after a stale dispatch claim", () => {
  const { deps, calls } = makeLeaseDeps({
    claimMilestoneLease: (workerId, milestoneId) => {
      calls.push(["claim", workerId, milestoneId]);
      return { ok: true, token: 9, expiresAt: "2030-01-01T00:00:00.000Z" };
    },
  });
  const session = makeSession({ milestoneLeaseToken: 7 });

  const outcome = ensureDispatchLease(session, "M001", deps, { forceReclaim: true });

  assert.deepEqual(outcome, { kind: "ready", token: 9, recovered: true });
  assert.equal(session.milestoneLeaseToken, 9);
  assert.deepEqual(calls, [
    ["claim", "worker-1", "M001"],
    ["recovered", {
      milestoneId: "M001",
      workerId: "worker-1",
      token: 9,
      recovered: true,
    }],
  ]);
});

test("ensureDispatchLease blocks when another worker holds the lease", () => {
  const { deps, failures } = makeLeaseDeps({
    claimMilestoneLease: () => ({
      ok: false,
      error: "held_by",
      byWorker: "worker-2",
      expiresAt: "2030-01-01T00:00:00.000Z",
    }),
  });
  const session = makeSession({ milestoneLeaseToken: null });

  const outcome = ensureDispatchLease(session, "M001", deps);

  assert.deepEqual(outcome, {
    kind: "blocked",
    reason: "Milestone M001 is held by worker worker-2 until 2030-01-01T00:00:00.000Z.",
    holderWorkerId: "worker-2",
  });
  assert.equal(session.milestoneLeaseToken, null);
  assert.deepEqual(failures, [{
    milestoneId: "M001",
    workerId: "worker-1",
    reason: "Milestone M001 is held by worker worker-2 until 2030-01-01T00:00:00.000Z.",
  }]);
});

test("ensureDispatchLease fails closed on claim errors", () => {
  const { deps, failures } = makeLeaseDeps({
    claimMilestoneLease: () => {
      throw new Error("db unavailable");
    },
  });
  const session = makeSession({ milestoneLeaseToken: null });

  const outcome = ensureDispatchLease(session, "M001", deps);

  assert.deepEqual(outcome, { kind: "failed", reason: "db unavailable" });
  assert.equal(session.milestoneLeaseToken, null);
  assert.deepEqual(failures, [{
    milestoneId: "M001",
    workerId: "worker-1",
    reason: "db unavailable",
  }]);
});
