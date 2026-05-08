// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode unit dispatch contract adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { SidecarItem } from "../auto/session.ts";
import type { IterationContext, IterationData, LoopState } from "../auto/types.ts";
import type { UokGraphNode } from "../uok/contracts.ts";
import {
  runUnitPhaseViaContract,
  type UnitDispatchScheduler,
  type UnitPhaseResult,
} from "../auto/workflow-unit-dispatch.ts";

function makeIterData(overrides?: Partial<IterationData>): IterationData {
  return {
    unitType: "execute-task",
    unitId: "M001/S001/T001",
    prompt: "Run task",
    finalPrompt: "Run task",
    pauseAfterUatDispatch: false,
    state: {} as IterationData["state"],
    mid: "M001",
    midTitle: "Milestone 1",
    isRetry: false,
    previousTier: undefined,
    ...overrides,
  };
}

function makeSidecarItem(kind: SidecarItem["kind"]): SidecarItem {
  return {
    kind,
    unitType: `sidecar/${kind}`,
    unitId: kind,
    prompt: `Run ${kind}`,
  };
}

class FakeScheduler implements UnitDispatchScheduler {
  readonly handlers = new Map<UokGraphNode["kind"], (node: UokGraphNode) => Promise<void>>();
  nodes: UokGraphNode[] = [];
  options: unknown;
  runHandler = true;

  registerHandler(kind: UokGraphNode["kind"], handler: (node: UokGraphNode) => Promise<void>): void {
    this.handlers.set(kind, handler);
  }

  async run(nodes: UokGraphNode[], options: { parallel: false; maxWorkers: 1 }): Promise<void> {
    this.nodes = nodes;
    this.options = options;
    if (this.runHandler) {
      await this.handlers.get(nodes[0]!.kind)?.(nodes[0]!);
    }
  }
}

test("runUnitPhaseViaContract calls legacy runner directly", async () => {
  const result: UnitPhaseResult = { action: "next", data: { unitStartedAt: 1 } };
  const calls: unknown[] = [];
  const sidecarItem = makeSidecarItem("hook");

  const outcome = await runUnitPhaseViaContract(
    "legacy-direct",
    { iteration: 3 } as IterationContext,
    makeIterData(),
    {} as LoopState,
    sidecarItem,
    {
      runUnitPhase: async (...args) => {
        calls.push(args);
        return result;
      },
      createScheduler: () => assert.fail("createScheduler should not be called"),
    },
  );

  assert.equal(outcome, result);
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as unknown[])[3], sidecarItem);
});

test("runUnitPhaseViaContract dispatches through scheduler in uok mode", async () => {
  const scheduler = new FakeScheduler();
  const result: UnitPhaseResult = { action: "next", data: { requestDispatchedAt: 2 } };

  const outcome = await runUnitPhaseViaContract(
    "uok-scheduler",
    { iteration: 4 } as IterationContext,
    makeIterData(),
    {} as LoopState,
    undefined,
    {
      runUnitPhase: async () => result,
      createScheduler: () => scheduler,
    },
  );

  assert.equal(outcome, result);
  assert.deepEqual(Array.from(scheduler.handlers.keys()), [
    "unit",
    "hook",
    "subagent",
    "team-worker",
    "verification",
    "reprocess",
  ]);
  assert.deepEqual(scheduler.nodes, [{
    id: "dispatch:4:execute-task:M001/S001/T001",
    kind: "unit",
    dependsOn: [],
    metadata: {
      unitType: "execute-task",
      unitId: "M001/S001/T001",
    },
  }]);
  assert.deepEqual(scheduler.options, { parallel: false, maxWorkers: 1 });
});

test("runUnitPhaseViaContract maps sidecar kind to scheduler node kind", async () => {
  const scheduler = new FakeScheduler();

  await runUnitPhaseViaContract(
    "uok-scheduler",
    { iteration: 1 } as IterationContext,
    makeIterData({ unitType: "sidecar/triage", unitId: "triage-1" }),
    {} as LoopState,
    makeSidecarItem("triage"),
    {
      runUnitPhase: async () => ({ action: "next", data: {} }),
      createScheduler: () => scheduler,
    },
  );

  assert.equal(scheduler.nodes[0]?.kind, "verification");
});

test("runUnitPhaseViaContract breaks when scheduler never runs a handler", async () => {
  const scheduler = new FakeScheduler();
  scheduler.runHandler = false;

  const outcome = await runUnitPhaseViaContract(
    "uok-scheduler",
    { iteration: 1 } as IterationContext,
    makeIterData(),
    {} as LoopState,
    undefined,
    {
      runUnitPhase: async () => assert.fail("runUnitPhase should not be called"),
      createScheduler: () => scheduler,
    },
  );

  assert.deepEqual(outcome, {
    action: "break",
    reason: "scheduler-dispatch-missing-result",
  });
});
