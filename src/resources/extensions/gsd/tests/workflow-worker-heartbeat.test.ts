// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode worker heartbeat adapter.

import assert from "node:assert/strict";
import test from "node:test";

import {
  maintainWorkerHeartbeat,
  type MaintainWorkerHeartbeatDeps,
  type WorkerHeartbeatSession,
} from "../auto/workflow-worker-heartbeat.ts";

function makeDeps(overrides?: Partial<MaintainWorkerHeartbeatDeps>): {
  deps: MaintainWorkerHeartbeatDeps;
  calls: unknown[];
  errors: unknown[];
} {
  const calls: unknown[] = [];
  const errors: unknown[] = [];
  const deps: MaintainWorkerHeartbeatDeps = {
    heartbeatAutoWorker: workerId => calls.push(["heartbeat", workerId]),
    refreshMilestoneLease: (workerId, milestoneId, token) => {
      calls.push(["refresh", workerId, milestoneId, token]);
      return true;
    },
    logHeartbeatFailure: err => errors.push(err),
    ...overrides,
  };
  return { deps, calls, errors };
}

test("maintainWorkerHeartbeat no-ops without a worker id", () => {
  const { deps, calls, errors } = makeDeps();

  maintainWorkerHeartbeat({}, deps);

  assert.deepEqual(calls, []);
  assert.deepEqual(errors, []);
});

test("maintainWorkerHeartbeat refreshes worker heartbeat without active lease", () => {
  const { deps, calls, errors } = makeDeps();

  maintainWorkerHeartbeat({ workerId: "worker-1" }, deps);

  assert.deepEqual(calls, [["heartbeat", "worker-1"]]);
  assert.deepEqual(errors, []);
});

test("maintainWorkerHeartbeat refreshes active milestone lease when token exists", () => {
  const { deps, calls, errors } = makeDeps();
  const session: WorkerHeartbeatSession = {
    workerId: "worker-1",
    currentMilestoneId: "M001",
    milestoneLeaseToken: 7,
  };

  maintainWorkerHeartbeat(session, deps);

  assert.deepEqual(calls, [
    ["heartbeat", "worker-1"],
    ["refresh", "worker-1", "M001", 7],
  ]);
  assert.deepEqual(errors, []);
});

test("maintainWorkerHeartbeat skips lease refresh when token is null", () => {
  const { deps, calls, errors } = makeDeps();

  maintainWorkerHeartbeat({
    workerId: "worker-1",
    currentMilestoneId: "M001",
    milestoneLeaseToken: null,
  }, deps);

  assert.deepEqual(calls, [["heartbeat", "worker-1"]]);
  assert.deepEqual(errors, []);
});

test("maintainWorkerHeartbeat logs and suppresses heartbeat failures", () => {
  const failure = new Error("db unavailable");
  const { deps, calls, errors } = makeDeps({
    heartbeatAutoWorker: workerId => {
      calls.push(["heartbeat", workerId]);
      throw failure;
    },
  });

  assert.doesNotThrow(() => {
    maintainWorkerHeartbeat({
      workerId: "worker-1",
      currentMilestoneId: "M001",
      milestoneLeaseToken: 7,
    }, deps);
  });

  assert.deepEqual(calls, [["heartbeat", "worker-1"]]);
  assert.deepEqual(errors, [failure]);
});

test("maintainWorkerHeartbeat logs and suppresses lease refresh failures", () => {
  const failure = new Error("lease stale");
  const { deps, calls, errors } = makeDeps({
    refreshMilestoneLease: (workerId, milestoneId, token) => {
      calls.push(["refresh", workerId, milestoneId, token]);
      throw failure;
    },
  });

  assert.doesNotThrow(() => {
    maintainWorkerHeartbeat({
      workerId: "worker-1",
      currentMilestoneId: "M001",
      milestoneLeaseToken: 7,
    }, deps);
  });

  assert.deepEqual(calls, [
    ["heartbeat", "worker-1"],
    ["refresh", "worker-1", "M001", 7],
  ]);
  assert.deepEqual(errors, [failure]);
});
