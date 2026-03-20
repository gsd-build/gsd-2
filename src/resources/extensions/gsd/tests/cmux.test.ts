import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCmuxProgress,
  buildCmuxStatusLabel,
  detectCmuxEnvironment,
  markCmuxPromptShown,
  resetCmuxPromptState,
  resolveCmuxConfig,
  shouldPromptToEnableCmux,
} from "../../cmux/index.ts";
import type { GSDState } from "../types.ts";

test("detectCmuxEnvironment requires workspace, surface, and socket", () => {
  const detected = detectCmuxEnvironment(
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    (path) => path === "/tmp/cmux.sock",
    () => true,
  );
  assert.equal(detected.available, true);
  assert.equal(detected.cliAvailable, true);
});

test("resolveCmuxConfig enables only when preference and environment are both active", () => {
  const config = resolveCmuxConfig(
    { cmux: { enabled: true, notifications: true, sidebar: true, splits: true } },
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    () => true,
    () => true,
  );
  assert.equal(config.enabled, true);
  assert.equal(config.notifications, true);
  assert.equal(config.sidebar, true);
  assert.equal(config.splits, true);
});

test("shouldPromptToEnableCmux only prompts once per session", () => {
  resetCmuxPromptState();
  assert.equal(shouldPromptToEnableCmux({}, {}, () => false, () => true), false);

  assert.equal(
    shouldPromptToEnableCmux(
      {},
      {
        CMUX_WORKSPACE_ID: "workspace:1",
        CMUX_SURFACE_ID: "surface:2",
        CMUX_SOCKET_PATH: "/tmp/cmux.sock",
      },
      () => true,
      () => true,
    ),
    true,
  );
  markCmuxPromptShown();
  assert.equal(
    shouldPromptToEnableCmux(
      {},
      {
        CMUX_WORKSPACE_ID: "workspace:1",
        CMUX_SURFACE_ID: "surface:2",
        CMUX_SOCKET_PATH: "/tmp/cmux.sock",
      },
      () => true,
      () => true,
    ),
    false,
  );
  resetCmuxPromptState();
});

test("buildCmuxStatusLabel and progress prefer deepest active unit", () => {
  const state: GSDState = {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: { id: "S02", title: "Slice" },
    activeTask: { id: "T03", title: "Task" },
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "Keep going",
    registry: [],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 3 },
      tasks: { done: 2, total: 5 },
    },
  };

  assert.equal(buildCmuxStatusLabel(state), "M001 S02/T03 · executing");
  assert.deepEqual(buildCmuxProgress(state), { value: 0.4, label: "2/5 tasks" });
});
