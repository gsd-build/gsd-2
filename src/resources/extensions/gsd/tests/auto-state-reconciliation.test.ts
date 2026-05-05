import test from "node:test";
import assert from "node:assert/strict";

import { runPreDispatch } from "../auto/phases.js";
import { createStateReconciliationAdapter } from "../auto/state-reconciliation.js";
import type { StateReconciliationDeps } from "../auto/state-reconciliation.js";
import type { IterationContext, LoopState } from "../auto/types.js";
import type { GSDState } from "../types.js";

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    recentDecisions: [],
    blockers: [],
    nextAction: "execute-task",
    registry: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<StateReconciliationDeps> = {}): StateReconciliationDeps & { calls: string[] } {
  const calls: string[] = [];
  const deps: StateReconciliationDeps = {
    invalidateAllCaches: () => {
      calls.push("invalidate");
    },
    deriveState: async (basePath: string) => {
      calls.push(`derive:${basePath}`);
      return makeState();
    },
    refreshOpenDatabaseFromDisk: () => {
      calls.push("refresh");
      return true;
    },
    isDbAvailable: () => false,
    autoHealSketchFlags: (_mid, _hasPlan) => {
      calls.push("healSketch");
      return 0;
    },
    resolveSlicePlanFile: (_basePath, _mid, sid) => `/tmp/${sid}-PLAN.md`,
    existsSync: () => true,
  };
  return { ...deps, ...overrides, calls };
}

test("reconcileBeforeDispatch invalidates caches before derive", async () => {
  const deps = makeDeps();
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({
    basePath: "/tmp/base",
    stateBasePath: "/tmp/canonical",
  });

  assert.equal(result.allow, true);
  assert.deepEqual(deps.calls, ["invalidate", "derive:/tmp/canonical"]);
});

test("reconcileBeforeDispatch attempts db refresh and treats false as non-fatal", async () => {
  let refreshAttempted = false;
  const deps = makeDeps({
    isDbAvailable: () => true,
    refreshOpenDatabaseFromDisk: () => {
      refreshAttempted = true;
      return false;
    },
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({
    basePath: "/tmp/base",
  });

  assert.equal(result.allow, true);
  assert.equal(refreshAttempted, true);
  const refreshRepair = result.repairs.find((repair) => repair.kind === "db-refresh");
  assert.equal(refreshRepair?.status, "skipped");
});

test("reconcileBeforeDispatch fails closed when deriveState throws", async () => {
  const deps = makeDeps({
    deriveState: async () => {
      throw new Error("derive exploded");
    },
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({
    basePath: "/tmp/base",
    stateBasePath: "/tmp/canonical",
  });

  assert.equal(result.allow, false);
  assert.match(result.reason ?? "", /state derivation failed/);
  assert.equal(result.blockers[0]?.kind, "state-derive-failed");
});

test("reconcileBeforeDispatch re-derives after db-affecting sketch repair", async () => {
  const first = makeState({ blockers: ["pending"] });
  const second = makeState({ blockers: [] });
  let deriveCount = 0;
  const deps = makeDeps({
    isDbAvailable: () => true,
    autoHealSketchFlags: () => 1,
    deriveState: async () => {
      deriveCount += 1;
      return deriveCount === 1 ? first : second;
    },
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({
    basePath: "/tmp/base",
  });

  assert.equal(result.allow, true);
  assert.equal(deriveCount, 2);
  assert.deepEqual(result.stateSnapshot?.blockers ?? [], []);
});

test("reconcileBeforeDispatch skips sketch re-derive when no flags changed", async () => {
  let deriveCount = 0;
  const deps = makeDeps({
    isDbAvailable: () => true,
    deriveState: async () => {
      deriveCount += 1;
      return makeState();
    },
    autoHealSketchFlags: () => 0,
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({ basePath: "/tmp/base" });

  assert.equal(result.allow, true);
  assert.equal(deriveCount, 1);
  const sketchRepair = result.repairs.find((repair) => repair.kind === "stale-sketch-flag");
  assert.equal(sketchRepair?.status, "skipped");
});

test("reconcileBeforeDispatch fails closed for db-unavailable derived blockers", async () => {
  const deps = makeDeps({
    deriveState: async () => makeState({
      blockers: ["DB unavailable — runtime markdown state derivation is disabled"],
    }),
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({ basePath: "/tmp/base" });

  assert.equal(result.allow, false);
  assert.equal(result.blockers[0]?.kind, "db-unavailable");
  assert.equal(result.blockers[0]?.fatal, true);
});

test("reconcileBeforeDispatch reports injected projection repair diagnostics", async () => {
  const deps = makeDeps({
    isDbAvailable: () => true,
    repairDbProjections: (basePath) => {
      deps.calls.push(`repairProjection:${basePath}`);
      return 2;
    },
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({
    basePath: "/tmp/base",
    stateBasePath: "/tmp/canonical",
    projectionBasePath: "/tmp/projection",
  });

  assert.equal(result.allow, true);
  assert.ok(deps.calls.includes("repairProjection:/tmp/projection"));
  const projectionRepair = result.repairs.find((repair) => repair.kind === "db-projection-repair");
  assert.equal(projectionRepair?.status, "applied");
});

test("reconcileBeforeDispatch keeps markdown->db promotion disabled in this slice", async () => {
  const deps = makeDeps({
    isDbAvailable: () => true,
  });
  const adapter = createStateReconciliationAdapter(deps);

  const result = await adapter.reconcileBeforeDispatch({ basePath: "/tmp/base" });
  const projectionRepair = result.repairs.find((repair) => repair.kind === "db-projection-repair");
  assert.equal(projectionRepair?.status, "skipped");
  assert.match(projectionRepair?.reason ?? "", /not configured/i);
});

test("legacy pre-dispatch path routes through the reconciliation seam", async () => {
  const calls: string[] = [];
  let reconciliationInput: unknown;
  const ctx = {
    ui: {
      notify(message: string, level: string) {
        calls.push(`notify:${level}:${message}`);
      },
    },
  };
  const deps = {
    checkResourcesStale: () => null,
    invalidateAllCaches: () => {
      calls.push("invalidate");
    },
    preDispatchHealthGate: async () => ({ proceed: true, fixesApplied: [] }),
    reconcileBeforeDispatch: async (input: unknown) => {
      reconciliationInput = input;
      return {
        allow: false,
        reason: "DB unavailable — runtime markdown state derivation is disabled",
        repairs: [],
        blockers: [{
          kind: "db-unavailable",
          reason: "DB unavailable — runtime markdown state derivation is disabled",
          fatal: true,
        }],
      };
    },
    pauseAuto: async () => {
      calls.push("pause");
    },
  };
  const ic = {
    ctx,
    pi: {},
    s: {
      basePath: "/tmp/worktree",
      canonicalProjectRoot: "/tmp/project",
      originalBasePath: "/tmp/project",
      resourceVersionOnStart: null,
      currentMilestoneId: null,
    },
    deps,
    prefs: undefined,
    iteration: 1,
    flowId: "flow-1",
    nextSeq: () => 1,
  } as unknown as IterationContext;
  const loopState: LoopState = {
    recentUnits: [],
    stuckRecoveryAttempts: 0,
    consecutiveFinalizeTimeouts: 0,
  };

  const result = await runPreDispatch(ic, loopState);

  assert.deepEqual(reconciliationInput, {
    basePath: "/tmp/worktree",
    stateBasePath: "/tmp/project",
    projectionBasePath: "/tmp/project",
    reason: "legacy-pre-dispatch",
  });
  assert.deepEqual(result, { action: "break", reason: "state-reconciliation-blocked" });
  assert.ok(calls.some((call) => call.startsWith("notify:error:DB unavailable")));
  assert.ok(calls.includes("pause"));
});
