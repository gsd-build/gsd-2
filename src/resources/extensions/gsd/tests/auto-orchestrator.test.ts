// Project/App: GSD-2
// File Purpose: Auto Orchestration module contract and ADR-015 invariant sequence tests.

import test from "node:test";
import assert from "node:assert/strict";

import { createAutoOrchestrator, STUCK_WINDOW_SIZE } from "../auto/orchestrator.js";
import type { AutoOrchestratorDeps } from "../auto/contracts.js";
import type { GSDState } from "../types.js";
import { createWiredDispatchAdapter } from "../auto.js";
import { resolveDispatch, type DispatchContext } from "../auto-dispatch.js";
import { RuleRegistry, setRegistry, resetRegistry } from "../rule-registry.js";
import type { UnifiedRule } from "../rule-types.js";
import { supportsStructuredQuestions } from "../workflow-mcp.js";

function assertBlockedResult(
  result: Awaited<ReturnType<ReturnType<typeof createAutoOrchestrator>["advance"]>>,
): asserts result is Extract<typeof result, { kind: "blocked" }> {
  assert.equal(result.kind, "blocked");
}

function makeState(): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "Execute task",
    registry: [],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: { milestones: { done: 0, total: 1 } },
  };
}

function makeDeps(overrides: Partial<AutoOrchestratorDeps> = {}): { deps: AutoOrchestratorDeps; calls: string[] } {
  const calls: string[] = [];
  const stateSnapshot = makeState();

  const deps: AutoOrchestratorDeps = {
    stateReconciliation: {
      async reconcileBeforeDispatch() {
        calls.push("state.reconcile");
        return { ok: true, stateSnapshot };
      },
    },
    dispatch: {
      async decideNextUnit(input) {
        calls.push("dispatch.decide");
        assert.equal(input.stateSnapshot, stateSnapshot);
        return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
      },
    },
    toolContract: {
      async compileUnitToolContract() {
        calls.push("tool.compile");
        return { ok: true };
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
        return { ok: true };
      },
      async syncAfterUnit() { calls.push("worktree.sync"); },
      async cleanupOnStop() { calls.push("worktree.cleanup"); },
    },
    health: {
      checkResourcesStale() {
        calls.push("health.stale");
        return null;
      },
      async preAdvanceGate() {
        calls.push("health.pre");
        return { kind: "pass" };
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
    uokGate: {
      async emit(input) { calls.push(`gate:${input.gateId}:${input.outcome}`); },
    },
  };

  return { deps: { ...deps, ...overrides }, calls };
}

test("start() enters running phase without dispatching", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.equal(result.kind, "started");
  const status = orchestrator.getStatus();
  assert.equal(status.phase, "running");
  assert.equal(status.activeUnit, undefined);
  assert.ok(calls.includes("journal:start"));
  assert.ok(!calls.includes("journal:advance"));
});

test("advance() returns blocked when health gate denies", async () => {
  const { deps, calls } = makeDeps({
    health: {
      checkResourcesStale: () => null,
      async preAdvanceGate() { return { kind: "fail", reason: "doctor-block" }; },
      async postAdvanceRecord() {},
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assertBlockedResult(result);
  assert.equal(result.reason, "doctor-block");
  assert.equal(result.action, "pause");
  assert.ok(calls.includes("gate:pre-dispatch-health-gate:manual-attention"));
});

test("advance() returns blocked pause when resources are stale", async () => {
  const { deps, calls } = makeDeps({
    health: {
      checkResourcesStale: () => "resources changed since session start",
      async preAdvanceGate() { return { kind: "pass" }; },
      async postAdvanceRecord() {},
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assertBlockedResult(result);
  assert.equal(result.reason, "resources changed since session start");
  assert.equal(result.action, "pause");
  assert.ok(calls.includes("gate:resource-version-guard:fail"));
  assert.ok(!calls.includes("health.pre"));
  assert.ok(!calls.includes("state.reconcile"));
});

test("advance() pre-dispatch parity: gate emissions and control-flow action match legacy branches", async () => {
  type Scenario = {
    name: string;
    staleMsg: string | null;
    gateResult: Awaited<ReturnType<AutoOrchestratorDeps["health"]["preAdvanceGate"]>>;
    expectedKind: "advanced" | "blocked";
    expectedAction?: "pause" | "stop";
    expectedReason?: string;
    expectedGates: string[];
  };
  const scenarios: Scenario[] = [
    {
      name: "pass",
      staleMsg: null,
      gateResult: { kind: "pass" },
      expectedKind: "advanced",
      expectedGates: [
        "resource-version-guard:policy:pass:none:resource version guard passed:",
        "pre-dispatch-health-gate:execution:pass:none:pre-dispatch health gate passed:",
      ],
    },
    {
      name: "resource-stale",
      staleMsg: "resources changed since session start",
      gateResult: { kind: "pass" },
      expectedKind: "blocked",
      expectedAction: "pause",
      expectedReason: "resources changed since session start",
      expectedGates: [
        "resource-version-guard:policy:fail:policy:resource version guard blocked dispatch:resources changed since session start",
      ],
    },
    {
      name: "health-gate-fail",
      staleMsg: null,
      gateResult: { kind: "fail", reason: "doctor-block" },
      expectedKind: "blocked",
      expectedAction: "pause",
      expectedReason: "doctor-block",
      expectedGates: [
        "resource-version-guard:policy:pass:none:resource version guard passed:",
        "pre-dispatch-health-gate:execution:manual-attention:manual-attention:pre-dispatch health gate blocked dispatch:doctor-block",
      ],
    },
  ];

  for (const scenario of scenarios) {
    const gateEvents: string[] = [];
    const { deps } = makeDeps({
      health: {
        checkResourcesStale: () => scenario.staleMsg,
        async preAdvanceGate() { return scenario.gateResult; },
        async postAdvanceRecord() {},
      },
      uokGate: {
        async emit(input) {
          gateEvents.push(
            `${input.gateId}:${input.gateType}:${input.outcome}:${input.failureClass}:${input.rationale}:${input.findings ?? ""}`,
          );
        },
      },
    });
    const orchestrator = createAutoOrchestrator(deps);
    const result = await orchestrator.advance();

    assert.equal(result.kind, scenario.expectedKind, `${scenario.name} result kind`);
    if (scenario.expectedKind === "blocked") {
      assertBlockedResult(result);
      assert.equal(result.action, scenario.expectedAction, `${scenario.name} blocked action`);
      assert.equal(result.reason, scenario.expectedReason, `${scenario.name} blocked reason`);
    }
    assert.deepEqual(gateEvents, scenario.expectedGates, `${scenario.name} gate parity`);
  }
});

test("advance() continues past pre-dispatch health gate when it throws", async () => {
  const { deps, calls } = makeDeps({
    health: {
      checkResourcesStale: () => null,
      async preAdvanceGate() { return { kind: "threw", error: new Error("boom") }; },
      async postAdvanceRecord() {},
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "advanced");
  assert.ok(calls.includes("gate:pre-dispatch-health-gate:manual-attention"));
  assert.ok(calls.includes("state.reconcile"));
  assert.ok(calls.includes("dispatch.decide"));
});

test("advance() forwards fixesApplied into pre-dispatch-health-gate pass findings", async () => {
  let observed = "";
  const { deps } = makeDeps({
    health: {
      checkResourcesStale: () => null,
      async preAdvanceGate() { return { kind: "pass", fixesApplied: ["fix-a", "fix-b"] }; },
      async postAdvanceRecord() {},
    },
    uokGate: {
      async emit(input) {
        if (input.gateId === "pre-dispatch-health-gate" && input.outcome === "pass") {
          observed = input.findings ?? "";
        }
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();

  assert.equal(observed, "fix-a, fix-b");
});

test("advance() follows the ADR-015 invariant sequence before journaling advance", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "advanced");
  assert.deepEqual(result.unit, { unitType: "execute-task", unitId: "T01" });
  assert.deepEqual(calls, [
    "runtime.lock",
    "health.stale",
    "gate:resource-version-guard:pass",
    "health.pre",
    "gate:pre-dispatch-health-gate:pass",
    "state.reconcile",
    "dispatch.decide",
    "tool.compile",
    "worktree.prepare",
    "journal:advance",
    "worktree.sync",
    "health.post",
  ]);
});

test("advance() blocks before dispatch when State Reconciliation blocks", async () => {
  const { deps, calls } = makeDeps({
    stateReconciliation: {
      async reconcileBeforeDispatch() {
        calls.push("state.reconcile");
        return { ok: false, reason: "state drift blocked", stateSnapshot: makeState() };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assertBlockedResult(result);
  assert.equal(result.reason, "state drift blocked");
  assert.equal(result.action, "pause");
  assert.ok(!calls.includes("dispatch.decide"));
  assert.ok(calls.includes("journal:advance-blocked"));
});

test("advance() blocks before Runtime persistence when Tool Contract fails", async () => {
  const { deps, calls } = makeDeps({
    toolContract: {
      async compileUnitToolContract() {
        calls.push("tool.compile");
        return { ok: false, reason: "unknown Unit" };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assertBlockedResult(result);
  assert.equal(result.reason, "unknown Unit");
  assert.equal(result.action, "pause");
  assert.ok(!calls.includes("worktree.prepare"));
  assert.ok(!calls.includes("journal:advance"));
  assert.ok(calls.includes("journal:advance-blocked"));
});

test("advance() blocks before Runtime persistence when Worktree Safety fails", async () => {
  const { deps, calls } = makeDeps({
    worktree: {
      async prepareForUnit() {
        calls.push("worktree.prepare");
        return { ok: false, reason: "worktree invalid" };
      },
      async syncAfterUnit() { calls.push("worktree.sync"); },
      async cleanupOnStop() { calls.push("worktree.cleanup"); },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assertBlockedResult(result);
  assert.equal(result.reason, "worktree invalid");
  assert.equal(result.action, "pause");
  assert.ok(!calls.includes("journal:advance"));
  assert.ok(!calls.includes("worktree.sync"));
  assert.ok(calls.includes("journal:advance-blocked"));
});

test("advance() allows non-worktree isolation prepare result", async () => {
  const { deps, calls } = makeDeps({
    worktree: {
      async prepareForUnit() {
        calls.push("worktree.prepare");
        return { ok: true, reason: "isolation-not-worktree" };
      },
      async syncAfterUnit() { calls.push("worktree.sync"); },
      async cleanupOnStop() { calls.push("worktree.cleanup"); },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "advanced");
  assert.ok(calls.includes("journal:advance"));
  assert.ok(calls.includes("worktree.sync"));
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

test("advance() surfaces dispatch blocker reason instead of generic no remaining units", async () => {
  const { deps, calls } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        return {
          kind: "blocked",
          reason: "Milestone M001 validation verdict is needs-remediation but all slices are complete.",
          action: "pause",
        };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  if (result.kind !== "blocked") return;
  assert.equal(result.reason, "Milestone M001 validation verdict is needs-remediation but all slices are complete.");
  assert.equal(result.action, "pause");
  assert.ok(calls.includes("journal:advance-blocked"));
  assert.ok(!calls.includes("journal:advance-stopped"));
});

test("resume() enters running phase without dispatching", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.resume();

  assert.equal(result.kind, "resumed");
  assert.equal(orchestrator.getStatus().phase, "running");
  assert.ok(!calls.includes("journal:advance"));
  assert.ok(!calls.includes("dispatch.decide"));
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
  assert.deepEqual(first.unit, { unitType: "execute-task", unitId: "T01" });
  assert.equal(second.kind, "blocked");
  assert.equal(second.reason, "idempotent advance: unit already active");
  assert.equal(second.action, "pause");

  const prepareCalls = calls.filter((c) => c === "worktree.prepare").length;
  assert.equal(prepareCalls, 1);
});

test("resume() re-enters running phase", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.resume();

  assert.equal(result.kind, "resumed");
  assert.equal(orchestrator.getStatus().phase, "running");
});

test("resume() clears idempotent lock and allows re-advance", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const resumed = await orchestrator.resume();
  const next = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(blocked.kind, "blocked");
  assert.equal(resumed.kind, "resumed");
  assert.equal(next.kind, "advanced");
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
  const next = await orchestrator.advance();

  assert.equal(blocked.kind, "blocked");
  assert.equal(restarted.kind, "started");
  assert.equal(next.kind, "advanced");
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

// ────────────────────────────────────────────────────────────────────────
// Stuck-loop ring buffer (issue #5787)
// ────────────────────────────────────────────────────────────────────────

test("STUCK_WINDOW_SIZE matches the legacy auto/phases.ts constant", () => {
  assert.equal(STUCK_WINDOW_SIZE, 6);
});

test("stuck-loop: empty ring on a freshly constructed orchestrator advances normally", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "advanced");
});

test("stuck-loop: partial fill of mixed units does not block", async () => {
  // Alternate A/B for STUCK_WINDOW_SIZE rounds. No single key saturates the
  // window, so neither idempotency nor stuck-loop should fire.
  let i = 0;
  const sequence = ["A", "B", "A", "B", "A", "B"];
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        const id = sequence[i++ % sequence.length];
        return { unitType: "execute-task", unitId: id, reason: "ready", preconditions: [] };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  for (let round = 0; round < STUCK_WINDOW_SIZE; round++) {
    const result = await orchestrator.advance();
    assert.equal(result.kind, "advanced", `round ${round} should advance, got ${result.kind}`);
  }
});

test("stuck-loop: ring saturated with same unit blocks with action 'stop' and stuck-loop reason", async () => {
  // Dispatch picks the same unit every time. The first advance succeeds.
  // Calls 2..STUCK_WINDOW_SIZE-1 are idempotency-blocked while the ring fills.
  // The STUCK_WINDOW_SIZE'th call sees a saturated ring and returns stuck-loop.
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const results: Awaited<ReturnType<typeof orchestrator.advance>>[] = [];
  for (let i = 0; i < STUCK_WINDOW_SIZE; i++) {
    results.push(await orchestrator.advance());
  }

  // First call advances.
  assert.equal(results[0].kind, "advanced");

  // Intermediate calls are blocked by idempotency (not stuck-loop yet).
  for (let i = 1; i < STUCK_WINDOW_SIZE - 1; i++) {
    const r = results[i];
    assert.equal(r.kind, "blocked", `round ${i} should be blocked`);
    if (r.kind !== "blocked") return;
    assert.equal(r.reason, "idempotent advance: unit already active");
    assert.equal(r.action, "pause");
  }

  // The final call (ring now holds STUCK_WINDOW_SIZE copies) returns stuck-loop.
  const last = results[STUCK_WINDOW_SIZE - 1];
  assert.equal(last.kind, "blocked");
  if (last.kind !== "blocked") return;
  assert.equal(last.action, "stop");
  assert.equal(last.reason, `stuck-loop: execute-task:T01 picked ${STUCK_WINDOW_SIZE} times`);
});

test("stuck-loop: idempotency block continues to fire with its own reason before saturation", async () => {
  // Two identical calls should produce idempotent (not stuck-loop). Ensures the
  // existing idempotency block is not absorbed by the new check.
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const second = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(second.kind, "blocked");
  assert.equal(second.reason, "idempotent advance: unit already active");
  assert.equal(second.action, "pause");
});

test("stuck-loop: start() resets the ring so a fresh saturation cycle is required", async () => {
  // Fill the ring to one short of saturation, then start() — the ring should
  // be cleared, and the next advance must succeed instead of going stuck.
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE - 1; i++) {
    await orchestrator.advance();
  }

  const restarted = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });
  assert.equal(restarted.kind, "started");

  // Immediately after start(), the next advance should succeed because start()
  // no longer pre-dispatches and the ring was reset.
  const next = await orchestrator.advance();
  assert.equal(next.kind, "advanced");
});

test("stuck-loop: resume() resets the ring", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE - 1; i++) {
    await orchestrator.advance();
  }

  const resumed = await orchestrator.resume();
  assert.equal(resumed.kind, "resumed");

  const next = await orchestrator.advance();
  assert.equal(next.kind, "advanced");
});

test("stuck-loop: stop() resets the ring", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE - 1; i++) {
    await orchestrator.advance();
  }

  const stopped = await orchestrator.stop("user-request");
  assert.equal(stopped.kind, "stopped");

  // Ring is cleared by stop(). A subsequent advance is a fresh first-touch.
  const next = await orchestrator.advance();
  assert.equal(next.kind, "advanced");
});

test("stuck-loop: journal records the stuck-loop reason on advance-blocked", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE; i++) {
    await orchestrator.advance();
  }

  assert.ok(calls.includes("journal:advance-blocked"));
});

// ─── #5789 parity: wired dispatch adapter mirrors runDispatch's resolveDispatch call ───

test("wired DispatchAdapter forwards session-derived dispatch inputs identically to runDispatch", async () => {
  const stateSnapshot = makeState();

  // Install a capturing registry so we observe the DispatchContext both code paths
  // build, and force a deterministic dispatch action so the parity assertion is
  // about *inputs*, not rule evaluation.
  const captured: DispatchContext[] = [];
  const captureRule: UnifiedRule = {
    name: "test-capture",
    when: "dispatch",
    evaluation: "first-match",
    where: async (ctx: DispatchContext) => {
      captured.push(ctx);
      return {
        action: "dispatch" as const,
        unitType: "execute-task",
        unitId: "T01",
        prompt: "parity-fixture",
      };
    },
    then: (r: unknown) => r,
  };
  setRegistry(new RuleRegistry([captureRule]));

  try {
    // Mock ExtensionContext + ExtensionAPI with the surface the wired adapter touches.
    const fakeModelRegistry = {
      getAll: () => [],
      getProviderAuthMode: (_provider: string) => "apiKey" as const,
    };
    const ctx = {
      model: {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        contextWindow: 200_000,
      },
      modelRegistry: fakeModelRegistry,
    } as any;
    const pi = {
      getActiveTools: () => ["read_file", "write_file"],
    } as any;
    const basePath = "/tmp/parity-fixture";

    // Path A — wired adapter (what createWiredAutoOrchestrationModule uses).
    const adapter = createWiredDispatchAdapter(ctx, pi, basePath);
    const adapterResult = await adapter.decideNextUnit({ stateSnapshot });

    // Path B — direct resolveDispatch call mirroring phases.ts:runDispatch.
    // Inline the same derivations runDispatch uses so any drift here is a parity break.
    const prefs = undefined; // loadEffectiveGSDPreferences returns null for /tmp/parity-fixture.
    const provider = ctx.model?.provider;
    const authMode = provider && typeof ctx.modelRegistry?.getProviderAuthMode === "function"
      ? ctx.modelRegistry.getProviderAuthMode(provider)
      : undefined;
    const activeTools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
    const structuredQuestionsAvailable: "true" | "false" =
      prefs !== undefined && (prefs as { planning_depth?: string }).planning_depth === "deep"
        ? "false"
        : supportsStructuredQuestions(activeTools, {
            authMode,
            baseUrl: ctx.model?.baseUrl,
          })
          ? "true"
          : "false";

    const builtDirectCtx: DispatchContext = {
      basePath,
      mid: stateSnapshot.activeMilestone!.id,
      midTitle: stateSnapshot.activeMilestone!.title,
      state: stateSnapshot,
      prefs,
      structuredQuestionsAvailable,
      sessionContextWindow: ctx.model?.contextWindow,
      sessionProvider: ctx.model?.provider,
      modelRegistry: ctx.modelRegistry,
    };
    const directAction = await resolveDispatch(builtDirectCtx);

    // Two contexts captured: one per resolveDispatch call.
    assert.equal(captured.length, 2, "expected two captured dispatch contexts");
    const [adapterCtx, directCtx] = captured;

    // Parity assertion: session-derived fields are identical.
    assert.equal(adapterCtx.structuredQuestionsAvailable, directCtx.structuredQuestionsAvailable);
    assert.equal(adapterCtx.sessionContextWindow, directCtx.sessionContextWindow);
    assert.equal(adapterCtx.sessionProvider, directCtx.sessionProvider);
    assert.equal(adapterCtx.modelRegistry, directCtx.modelRegistry);
    assert.equal(adapterCtx.basePath, directCtx.basePath);
    assert.equal(adapterCtx.mid, directCtx.mid);
    assert.equal(adapterCtx.midTitle, directCtx.midTitle);

    // Dispatch action equality: both flows reach the same dispatch decision.
    if (!adapterResult || !("unitType" in adapterResult)) {
      assert.fail("expected adapter result to be a dispatch decision");
    }
    assert.equal(adapterResult.unitType, "execute-task");
    assert.equal(adapterResult.unitId, "T01");
    assert.equal(adapterResult.reason, "test-capture");
    assert.equal(directAction.action, "dispatch");
    if (directAction.action === "dispatch") {
      assert.equal(directAction.unitType, adapterResult.unitType);
      assert.equal(directAction.unitId, adapterResult.unitId);
      assert.equal(directAction.matchedRule, adapterResult.reason);
    }
  } finally {
    resetRegistry();
  }
});

test("wired DispatchAdapter prefers caller-supplied dispatch inputs over ctx-derived values", async () => {
  const stateSnapshot = makeState();
  const captured: DispatchContext[] = [];
  const captureRule: UnifiedRule = {
    name: "test-capture-overrides",
    when: "dispatch",
    evaluation: "first-match",
    where: async (ctx: DispatchContext) => {
      captured.push(ctx);
      return {
        action: "dispatch" as const,
        unitType: "execute-task",
        unitId: "T01",
        prompt: "override-fixture",
      };
    },
    then: (r: unknown) => r,
  };
  setRegistry(new RuleRegistry([captureRule]));

  try {
    const ctxModelRegistry = {
      getAll: () => [],
      getProviderAuthMode: (_provider: string) => "apiKey" as const,
    };
    const overrideModelRegistry = {
      getAll: () => [],
      getProviderAuthMode: (_provider: string) => "oauth" as const,
    };
    const ctx = {
      model: {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        contextWindow: 200_000,
      },
      modelRegistry: ctxModelRegistry,
    } as any;
    const pi = {
      getActiveTools: () => [],
    } as any;
    const adapter = createWiredDispatchAdapter(ctx, pi, "/tmp/parity-fixture");
    const session = { basePath: "/tmp/session-fixture" } as any;

    const result = await adapter.decideNextUnit({
      stateSnapshot,
      session,
      structuredQuestionsAvailable: "true",
      sessionContextWindow: 500_000,
      sessionProvider: "openai",
      modelRegistry: overrideModelRegistry,
    });

    assert.ok(result);
    assert.equal(captured.length, 1, "expected one captured dispatch context");
    assert.equal(captured[0].structuredQuestionsAvailable, "true");
    assert.equal(captured[0].sessionContextWindow, 500_000);
    assert.equal(captured[0].sessionProvider, "openai");
    assert.equal(captured[0].modelRegistry, overrideModelRegistry);
    assert.equal(captured[0].session, session);
    assert.equal(captured[0].basePath, "/tmp/session-fixture");
  } finally {
    resetRegistry();
  }
});

test("wired DispatchAdapter forwards constructor session when advance input omits session", async () => {
  const stateSnapshot = makeState();
  const captured: DispatchContext[] = [];
  const captureRule: UnifiedRule = {
    name: "test-session-fallback",
    when: "dispatch",
    evaluation: "first-match",
    where: async (ctx: DispatchContext) => {
      captured.push(ctx);
      return {
        action: "dispatch" as const,
        unitType: "execute-task",
        unitId: "T01",
        prompt: "session-fallback-fixture",
      };
    },
    then: (r: unknown) => r,
  };
  setRegistry(new RuleRegistry([captureRule]));

  try {
    const ctx = { model: {}, modelRegistry: { getAll: () => [] } } as any;
    const pi = { getActiveTools: () => [] } as any;
    const session = {
      basePath: "/tmp/worktree-fixture",
      originalBasePath: "/tmp/project-fixture",
      currentMilestoneId: "M001",
    } as any;
    const adapter = createWiredDispatchAdapter(ctx, pi, "/tmp/project-fixture", session);

    const result = await adapter.decideNextUnit({ stateSnapshot });

    assert.ok(result);
    assert.equal(captured.length, 1, "expected one captured dispatch context");
    assert.equal(captured[0].session, session);
    assert.equal(captured[0].basePath, "/tmp/worktree-fixture");
  } finally {
    resetRegistry();
  }
});

test("wired DispatchAdapter preserves stop reason as a blocked decision", async () => {
  const stateSnapshot = makeState();
  const stopRule: UnifiedRule = {
    name: "test-stop",
    when: "dispatch",
    evaluation: "first-match",
    where: async () => ({
      action: "stop" as const,
      reason: "remediation blocker",
      level: "warning" as const,
    }),
    then: (r: unknown) => r,
  };
  setRegistry(new RuleRegistry([stopRule]));

  try {
    const ctx = { model: {}, modelRegistry: { getAll: () => [] } } as any;
    const pi = { getActiveTools: () => [] } as any;
    const adapter = createWiredDispatchAdapter(ctx, pi, "/tmp/parity-fixture");

    const result = await adapter.decideNextUnit({ stateSnapshot });

    assert.deepEqual(result, {
      kind: "blocked",
      reason: "remediation blocker",
      action: "pause",
    });
  } finally {
    resetRegistry();
  }
});
