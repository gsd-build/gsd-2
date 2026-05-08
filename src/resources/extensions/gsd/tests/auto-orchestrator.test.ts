import test from "node:test";
import assert from "node:assert/strict";

import { createAutoOrchestrator } from "../auto/orchestrator.js";
import type { AutoOrchestratorDeps } from "../auto/contracts.js";

function makeDeps(overrides: Partial<AutoOrchestratorDeps> = {}): { deps: AutoOrchestratorDeps; calls: string[] } {
  const calls: string[] = [];

  const deps: AutoOrchestratorDeps = {
    dispatch: {
      async decideNextUnit() {
        calls.push("dispatch.decide");
        return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
      },
    },
    recovery: {
      async classifyAndRecover() {
        calls.push("recovery.classify");
        return { action: "stop", reason: "fatal" };
      },
    },
    worktree: {
      async prepareForUnit() { calls.push("worktree.prepare"); },
      async syncAfterUnit() { calls.push("worktree.sync"); },
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
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.resume();

  assert.equal(result.kind, "advanced");
  assert.equal(orchestrator.getStatus().phase, "running");
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
