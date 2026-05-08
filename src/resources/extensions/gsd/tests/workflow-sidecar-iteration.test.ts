// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode sidecar iteration-data adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { GSDState } from "../types.ts";
import type { SidecarItem } from "../auto/session.ts";
import { buildSidecarIterationData } from "../auto/workflow-sidecar-iteration.ts";

function makeSidecarItem(overrides?: Partial<SidecarItem>): SidecarItem {
  return {
    kind: "hook",
    unitType: "sidecar/hook",
    unitId: "hook-1",
    prompt: "Run hook",
    ...overrides,
  };
}

test("buildSidecarIterationData derives state from canonical project root", async () => {
  const roots: string[] = [];
  const state = {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Milestone 1" },
    activeSlice: { id: "S01" },
    activeTask: { id: "T01" },
  } as GSDState;

  await buildSidecarIterationData({
    sidecarItem: makeSidecarItem(),
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    deriveState: async root => {
      roots.push(root);
      return state;
    },
    logPostDerive: () => {},
  });

  assert.deepEqual(roots, ["/project"]);
});

test("buildSidecarIterationData maps sidecar item and milestone state into iteration data", async () => {
  const state = {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Milestone 1" },
  } as GSDState;

  const iterData = await buildSidecarIterationData({
    sidecarItem: makeSidecarItem({
      unitType: "sidecar/quick-task",
      unitId: "capture-1",
      prompt: "Do captured task",
    }),
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    deriveState: async () => state,
    logPostDerive: () => {},
  });

  assert.equal(iterData.unitType, "sidecar/quick-task");
  assert.equal(iterData.unitId, "capture-1");
  assert.equal(iterData.prompt, "Do captured task");
  assert.equal(iterData.finalPrompt, "Do captured task");
  assert.equal(iterData.pauseAfterUatDispatch, false);
  assert.equal(iterData.state, state);
  assert.equal(iterData.mid, "M001");
  assert.equal(iterData.midTitle, "Milestone 1");
  assert.equal(iterData.isRetry, false);
  assert.equal(iterData.previousTier, undefined);
});

test("buildSidecarIterationData logs task, slice, or milestone active unit", async () => {
  const logs: unknown[] = [];

  await buildSidecarIterationData({
    sidecarItem: makeSidecarItem(),
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    deriveState: async () => ({
      phase: "planning",
      activeMilestone: { id: "M001", title: "Milestone 1" },
      activeSlice: { id: "S01" },
      activeTask: { id: "T01" },
    }) as GSDState,
    logPostDerive: details => logs.push(details),
  });

  assert.deepEqual(logs, [{
    site: "sidecar",
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    derivedPhase: "planning",
    activeUnit: "T01",
  }]);
});

test("buildSidecarIterationData handles missing active milestone", async () => {
  const iterData = await buildSidecarIterationData({
    sidecarItem: makeSidecarItem(),
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    deriveState: async () => ({ phase: "blocked" }) as GSDState,
    logPostDerive: () => {},
  });

  assert.equal(iterData.mid, undefined);
  assert.equal(iterData.midTitle, undefined);
});
