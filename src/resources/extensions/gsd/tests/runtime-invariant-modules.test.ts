// Project/App: GSD-2
// File Purpose: ADR-015 runtime invariant module contract tests.

import test from "node:test";
import assert from "node:assert/strict";

import { classifyFailure } from "../recovery-classification.js";
import { reconcileBeforeDispatch } from "../state-reconciliation.js";
import { compileUnitToolContract } from "../tool-contract.js";
import type { GSDState } from "../types.js";

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "Plan milestone",
    registry: [],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: { milestones: { done: 0, total: 1 } },
    ...overrides,
  };
}

test("State Reconciliation invalidates cache and returns reconciled state", async () => {
  const calls: string[] = [];
  const state = makeState();

  const result = await reconcileBeforeDispatch("/project", {
    invalidateStateCache() { calls.push("invalidate"); },
    async deriveState(basePath) {
      calls.push(`derive:${basePath}`);
      return state;
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["invalidate", "derive:/project"]);
  assert.equal(result.ok && result.stateSnapshot, state);
});

test("State Reconciliation surfaces terminal blockers in result (ADR-017)", async () => {
  // Under ADR-017, blockers are terminal but do not throw — they ride along
  // in the result so the orchestrator adapter can map them to ok=false.
  const result = await reconcileBeforeDispatch("/project", {
    invalidateStateCache() {},
    async deriveState() {
      return makeState({ phase: "blocked", blockers: ["slice lock missing"] });
    },
    registry: [],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, ["slice lock missing"]);
});

test("Tool Contract compiles known Unit prompt and tool policy", () => {
  const result = compileUnitToolContract("execute-task");

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.contract.unitType, "execute-task");
  assert.deepEqual(result.ok && result.contract.requiredWorkflowTools, ["gsd_task_complete"]);
  assert.equal(result.ok && result.contract.toolsPolicy.mode, "all");
  assert.ok(result.ok && result.contract.validationRules.includes("closeout-tool-present"));
});

test("Tool Contract fails closed for unknown Units", () => {
  const result = compileUnitToolContract("custom-step");

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "unknown-unit-type");
});

test("Recovery Classification covers ADR-015 failure families", () => {
  const cases = [
    ["invalid tool schema enum", "tool-schema", "stop"],
    ["deterministic policy rejection", "deterministic-policy", "stop"],
    ["stale worker lease", "stale-worker", "stop"],
    ["worktree root missing .git", "worktree-invalid", "stop"],
    ["verification drift in state snapshot", "verification-drift", "escalate"],
    ["rate limit 429", "provider", "retry"],
    ["unexpected invariant", "runtime-unknown", "escalate"],
  ] as const;

  for (const [message, failureKind, action] of cases) {
    const result = classifyFailure({ error: new Error(message), unitType: "execute-task", unitId: "T01" });

    assert.equal(result.failureKind, failureKind);
    assert.equal(result.action, action);
  }
});
