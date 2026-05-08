// Project/App: GSD-2
// File Purpose: Unit tests for auto-mode custom-engine iteration-data adapter.

import assert from "node:assert/strict";
import test from "node:test";

import type { GSDState } from "../types.ts";
import { buildCustomEngineIterationData } from "../auto/workflow-custom-engine-iteration.ts";

test("buildCustomEngineIterationData derives state from canonical project root", async () => {
  const roots: string[] = [];

  await buildCustomEngineIterationData({
    step: { unitType: "engine-task", unitId: "E001", prompt: "Run engine task" },
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    currentMilestoneId: "M001",
    deriveState: async root => {
      roots.push(root);
      return { phase: "executing" } as GSDState;
    },
    logPostDerive: () => {},
  });

  assert.deepEqual(roots, ["/project"]);
});

test("buildCustomEngineIterationData maps engine step into iteration data", async () => {
  const state = {
    phase: "executing",
    activeMilestone: { id: "M001", title: "Milestone 1" },
  } as GSDState;

  const iterData = await buildCustomEngineIterationData({
    step: { unitType: "engine-task", unitId: "E001", prompt: "Run engine task" },
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    currentMilestoneId: "M001",
    deriveState: async () => state,
    logPostDerive: () => {},
  });

  assert.equal(iterData.unitType, "engine-task");
  assert.equal(iterData.unitId, "E001");
  assert.equal(iterData.prompt, "Run engine task");
  assert.equal(iterData.finalPrompt, "Run engine task");
  assert.equal(iterData.pauseAfterUatDispatch, false);
  assert.equal(iterData.state, state);
  assert.equal(iterData.mid, "M001");
  assert.equal(iterData.midTitle, "Workflow");
  assert.equal(iterData.isRetry, false);
  assert.equal(iterData.previousTier, undefined);
});

test("buildCustomEngineIterationData defaults milestone id to workflow", async () => {
  const iterData = await buildCustomEngineIterationData({
    step: { unitType: "engine-task", unitId: "E001", prompt: "Run engine task" },
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    currentMilestoneId: null,
    deriveState: async () => ({ phase: "executing" }) as GSDState,
    logPostDerive: () => {},
  });

  assert.equal(iterData.mid, "workflow");
  assert.equal(iterData.midTitle, "Workflow");
});

test("buildCustomEngineIterationData logs active unit details", async () => {
  const logs: unknown[] = [];

  await buildCustomEngineIterationData({
    step: { unitType: "engine-task", unitId: "E001", prompt: "Run engine task" },
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    currentMilestoneId: "M001",
    deriveState: async () => ({
      phase: "planning",
      activeMilestone: { id: "M001", title: "Milestone 1" },
      activeSlice: { id: "S01" },
      activeTask: { id: "T01" },
    }) as GSDState,
    logPostDerive: details => logs.push(details),
  });

  assert.deepEqual(logs, [{
    site: "custom-engine-gsd-state",
    basePath: "/worktree",
    canonicalProjectRoot: "/project",
    derivedPhase: "planning",
    activeUnit: "T01",
  }]);
});
