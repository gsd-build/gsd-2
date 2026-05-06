import test from "node:test";
import assert from "node:assert/strict";

import { createAutoOrchestrator } from "../auto/orchestrator.js";
import type { AutoOrchestratorDeps } from "../auto/contracts.js";
import type { GSDState } from "../types.js";

function makeState(): GSDState {
  return {
    activeMilestone: { id: "M01", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "execute-task",
    registry: [],
  };
}

function makeDeps(overrides: Partial<AutoOrchestratorDeps> = {}): { deps: AutoOrchestratorDeps; calls: string[] } {
  const calls: string[] = [];

  const deps: AutoOrchestratorDeps = {
    stateReconciliation: {
      async reconcileBeforeDispatch(input) {
        calls.push(`state.reconcile:${input.basePath ?? "none"}`);
        return { allow: true, stateSnapshot: makeState(), repairs: [], blockers: [] };
      },
    },
    dispatch: {
      async decideNextUnit(input) {
        calls.push("dispatch.decide");
        assert.equal(input.stateSnapshot?.activeMilestone?.id, "M01");
        return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: ["repo-clean"] };
      },
    },
    toolContract: {
      async compileUnitToolContract(input) {
        calls.push("toolContract.compile");
        assert.equal(input.unitType, "execute-task");
        assert.equal(input.unitId, "T01");
        assert.ok(Array.isArray(input.preconditions));
        return { allow: true };
      },
    },
    recovery: {
      async classifyAndRecover() {
        calls.push("recovery.classify");
        return { action: "stop", reason: "fatal" };
      },
    },
    worktree: {
      async prepareForUnit() {
        calls.push("worktree.prepare");
        return { allow: true, warnings: [] };
      },
      async cleanupOnStop() { calls.push("worktree.cleanup"); },
    },
    health: {
      async preAdvanceGate() {
        calls.push("health.pre");
        return { allow: true };
      },
      async postAdvanceRecord() { calls.push("health.post"); },
    },
    runtime: {
      async ensureLockOwnership() { calls.push("runtime.lock"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    notifications: {
      async notifyLifecycle(event) { calls.push(`notify:${event.name}`); },
    },
  };

  return { deps: { ...deps, ...overrides }, calls };
}

test("advance() runs the explicit invariant pipeline before journaling transition", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.equal(result.kind, "advanced");
  assert.deepEqual(calls, [
    "journal:start",
    "notify:start",
    "runtime.lock",
    "health.pre",
    "state.reconcile:/tmp/project",
    "dispatch.decide",
    "toolContract.compile",
    "worktree.prepare",
    "journal:advance",
    "health.post",
  ]);
});

test("start() advances and records active unit", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.equal(result.kind, "advanced");
  const status = orchestrator.getStatus();
  assert.equal(status.phase, "running");
  assert.deepEqual(status.activeUnit, { unitType: "execute-task", unitId: "T01" });
  assert.ok(calls.includes("journal:start"));
  assert.ok(calls.includes("journal:advance"));
});

test("advance() returns blocked when health gate denies", async () => {
  const { deps } = makeDeps({
    health: {
      async preAdvanceGate() { return { allow: false, reason: "doctor-block" }; },
      async postAdvanceRecord() {},
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "doctor-block");
});

test("advance() stops when dispatch has no next unit", async () => {
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() { return null; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "stopped");
  assert.equal(orchestrator.getStatus().phase, "stopped");
});

test("advance() blocks before dispatch when state reconciliation denies progress", async () => {
  const { deps, calls } = makeDeps({
    stateReconciliation: {
      async reconcileBeforeDispatch() {
        calls.push("state.reconcile");
        return {
          allow: false,
          reason: "db-disk-drift",
          stateSnapshot: makeState(),
          repairs: [],
          blockers: [{ kind: "state-derived-blocker", reason: "db-disk-drift", fatal: true }],
        };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "db-disk-drift");
  assert.deepEqual(result.stateSnapshot, makeState());
  assert.ok(!calls.includes("dispatch.decide"));
  assert.ok(!calls.includes("toolContract.compile"));
  assert.ok(!calls.includes("worktree.prepare"));
});

test("advance() blocks before worktree preparation when tool contract rejects unit", async () => {
  const { deps, calls } = makeDeps({
    toolContract: {
      async compileUnitToolContract() {
        calls.push("toolContract.compile");
        return { allow: false, reason: "tool-policy-drift" };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "tool-policy-drift");
  assert.equal(orchestrator.getStatus().activeUnit, undefined);
  assert.ok(!calls.includes("worktree.prepare"));
});

test("advance() uses recovery on error", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("lock lost"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "escalate", reason: "needs manual" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "error");
  assert.equal(result.reason, "needs manual");
  assert.equal(orchestrator.getStatus().phase, "error");
  assert.ok(calls.includes("journal:advance-error"));
});

test("advance() blocks when worktree safety rejects the selected unit", async () => {
  let recoveryCalled = false;
  const { deps, calls } = makeDeps({
    worktree: {
      async prepareForUnit() { return { allow: false, reason: "missing .git", warnings: [] }; },
      async cleanupOnStop() {},
    },
    recovery: {
      async classifyAndRecover() {
        recoveryCalled = true;
        return { action: "escalate", reason: "worktree-invalid" };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "missing .git");
  assert.equal(recoveryCalled, false);
  assert.equal(orchestrator.getStatus().activeUnit, undefined);
  assert.ok(calls.includes("journal:advance-blocked"));
  assert.ok(!calls.includes("journal:advance"));
});

test("advance() is idempotent for the same active unit", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const second = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(second.kind, "blocked");
  assert.equal(second.reason, "idempotent advance: unit already active");

  const prepareCalls = calls.filter((c) => c === "worktree.prepare").length;
  assert.equal(prepareCalls, 1);
});

test("resume() re-enters running flow via advance", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.resume({ basePath: "/tmp/resume-project", trigger: "resume" });

  assert.equal(result.kind, "advanced");
  assert.equal(orchestrator.getStatus().phase, "running");
  assert.ok(calls.includes("state.reconcile:/tmp/resume-project"));
});

test("resume() clears idempotent lock and allows re-advance", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const resumed = await orchestrator.resume();

  assert.equal(first.kind, "advanced");
  assert.equal(blocked.kind, "blocked");
  assert.equal(resumed.kind, "advanced");
});

test("transitionCount increases across lifecycle transitions", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const before = orchestrator.getStatus().transitionCount;
  await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });
  const afterStart = orchestrator.getStatus().transitionCount;
  await orchestrator.stop("done");
  const afterStop = orchestrator.getStatus().transitionCount;

  assert.ok(afterStart > before);
  assert.ok(afterStop > afterStart);
});

test("stop() clears idempotent unit lock so advance can run again", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const stopped = await orchestrator.stop("reset");
  const second = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(blocked.kind, "blocked");
  assert.equal(stopped.kind, "stopped");
  assert.equal(second.kind, "advanced");
});

test("advance() stopped clears previous activeUnit", async () => {
  let first = true;
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        if (first) {
          first = false;
          return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
        }
        return null;
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  const stopped = await orchestrator.advance();

  assert.equal(stopped.kind, "stopped");
  assert.equal(orchestrator.getStatus().activeUnit, undefined);
});

test("recovery stop clears activeUnit", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("boom"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "stop", reason: "fatal" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "stopped");
  assert.equal(orchestrator.getStatus().activeUnit, undefined);
  assert.ok(calls.includes("journal:advance-stopped"));
  assert.ok(calls.includes("notify:stopped"));
  assert.ok(!calls.includes("notify:error"));
});

test("recovery retry maps to paused result", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("boom"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "retry", reason: "transient" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "paused");
  assert.equal(result.reason, "transient");
  assert.equal(orchestrator.getStatus().phase, "paused");
  assert.ok(calls.includes("journal:advance-paused"));
  assert.ok(calls.includes("notify:pause"));
});

test("getStatus() returns defensive copy of activeUnit", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  const snap1 = orchestrator.getStatus();
  if (snap1.activeUnit) snap1.activeUnit.unitId = "MUTATED";
  const snap2 = orchestrator.getStatus();

  assert.equal(snap2.activeUnit?.unitId, "T01");
});

test("start() clears prior idempotent lock", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const restarted = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.equal(blocked.kind, "blocked");
  assert.equal(restarted.kind, "advanced");
});

test("error path emits error notification", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("boom"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "escalate", reason: "needs manual" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();

  assert.ok(calls.includes("notify:error"));
});

test("blocked path journals advance-blocked", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  await orchestrator.advance();

  assert.ok(calls.includes("journal:advance-blocked"));
});

test("health post hook runs on blocked result", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  await orchestrator.advance();

  assert.ok(calls.includes("health.post"));
});

test("start() emits start notification", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.ok(calls.includes("notify:start"));
});

test("resume() emits resume notification", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.resume();

  assert.ok(calls.includes("notify:resume"));
});

test("stopped with no remaining units clears idempotent lock for next advance", async () => {
  let callCount = 0;
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        callCount += 1;
        if (callCount === 2) return null;
        return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const stopped = await orchestrator.advance();
  const after = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(stopped.kind, "stopped");
  assert.equal(after.kind, "advanced");
});

test("stop() cleans up worktree and transitions to stopped", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.stop("user-request");

  assert.equal(result.kind, "stopped");
  assert.equal(orchestrator.getStatus().phase, "stopped");
  assert.ok(calls.includes("worktree.cleanup"));
  assert.ok(calls.includes("journal:stop"));
  assert.ok(calls.includes("notify:stop"));
});
