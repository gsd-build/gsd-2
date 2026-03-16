// Tests for GSD visualizer view renderers.
// Tests the pure view functions with mock data — no file I/O.

import {
  renderProgressView,
  renderDepsView,
  renderMetricsView,
  renderTimelineView,
} from "../visualizer-views.js";
import type { VisualizerData } from "../visualizer-data.js";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

// ─── Mock theme ─────────────────────────────────────────────────────────────

const mockTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as any;

// ─── Test data factories ────────────────────────────────────────────────────

function makeVisualizerData(overrides: Partial<VisualizerData> = {}): VisualizerData {
  return {
    milestones: [],
    phase: "executing",
    totals: null,
    byPhase: [],
    bySlice: [],
    byModel: [],
    units: [],
    ...overrides,
  };
}

// ─── renderProgressView ─────────────────────────────────────────────────────

console.log("\n=== renderProgressView ===");

{
  const data = makeVisualizerData({
    milestones: [
      {
        id: "M001",
        title: "First Milestone",
        status: "active",
        dependsOn: [],
        slices: [
          {
            id: "S01",
            title: "Core Types",
            done: true,
            active: false,
            risk: "low",
            depends: [],
            tasks: [],
          },
          {
            id: "S02",
            title: "State Engine",
            done: false,
            active: true,
            risk: "high",
            depends: ["S01"],
            tasks: [
              { id: "T01", title: "Dispatch Loop", done: false, active: true },
              { id: "T02", title: "Session Mgmt", done: true, active: false },
            ],
          },
          {
            id: "S03",
            title: "Dashboard",
            done: false,
            active: false,
            risk: "medium",
            depends: ["S02"],
            tasks: [],
          },
        ],
      },
      {
        id: "M002",
        title: "Plugin Arch",
        status: "pending",
        dependsOn: ["M001"],
        slices: [],
      },
    ],
  });

  const lines = renderProgressView(data, mockTheme, 80);
  assertTrue(lines.length > 0, "progress view produces output");
  assertTrue(lines.some(l => l.includes("M001")), "shows milestone M001");
  assertTrue(lines.some(l => l.includes("S01")), "shows slice S01");
  assertTrue(lines.some(l => l.includes("T01")), "shows task T01 for active slice");
  assertTrue(lines.some(l => l.includes("M002")), "shows milestone M002");
  assertTrue(lines.some(l => l.includes("depends on M001")), "shows dependency note");
}

{
  const data = makeVisualizerData({ milestones: [] });
  const lines = renderProgressView(data, mockTheme, 80);
  assertEq(lines.length, 0, "empty milestones produce no lines");
}

// ─── renderDepsView ─────────────────────────────────────────────────────────

console.log("\n=== renderDepsView ===");

{
  const data = makeVisualizerData({
    milestones: [
      {
        id: "M001",
        title: "First",
        status: "active",
        dependsOn: [],
        slices: [
          { id: "S01", title: "A", done: false, active: true, risk: "low", depends: [], tasks: [] },
          { id: "S02", title: "B", done: false, active: false, risk: "low", depends: ["S01"], tasks: [] },
        ],
      },
      {
        id: "M002",
        title: "Second",
        status: "pending",
        dependsOn: ["M001"],
        slices: [],
      },
    ],
  });

  const lines = renderDepsView(data, mockTheme, 80);
  assertTrue(lines.length > 0, "deps view produces output");
  assertTrue(lines.some(l => l.includes("M001") && l.includes("M002")), "shows milestone dep edge");
  assertTrue(lines.some(l => l.includes("S01") && l.includes("S02")), "shows slice dep edge");
}

{
  const data = makeVisualizerData({
    milestones: [
      { id: "M001", title: "Only", status: "active", dependsOn: [], slices: [] },
    ],
  });

  const lines = renderDepsView(data, mockTheme, 80);
  assertTrue(lines.some(l => l.includes("No milestone dependencies")), "shows no-deps message");
}

// ─── renderMetricsView ──────────────────────────────────────────────────────

console.log("\n=== renderMetricsView ===");

{
  const data = makeVisualizerData({
    totals: {
      units: 5,
      tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 },
      cost: 2.50,
      duration: 60000,
      toolCalls: 15,
      assistantMessages: 10,
      userMessages: 5,
    },
    byPhase: [
      {
        phase: "execution",
        units: 3,
        tokens: { input: 600, output: 300, cacheRead: 100, cacheWrite: 50, total: 1050 },
        cost: 1.50,
        duration: 40000,
      },
      {
        phase: "planning",
        units: 2,
        tokens: { input: 400, output: 200, cacheRead: 100, cacheWrite: 50, total: 750 },
        cost: 1.00,
        duration: 20000,
      },
    ],
    byModel: [
      {
        model: "claude-opus-4-6",
        units: 5,
        tokens: { input: 1000, output: 500, cacheRead: 200, cacheWrite: 100, total: 1800 },
        cost: 2.50,
      },
    ],
  });

  const lines = renderMetricsView(data, mockTheme, 80);
  assertTrue(lines.length > 0, "metrics view produces output");
  assertTrue(lines.some(l => l.includes("$2.50")), "shows total cost");
  assertTrue(lines.some(l => l.includes("execution")), "shows phase name");
  assertTrue(lines.some(l => l.includes("claude-opus-4-6")), "shows model name");
}

{
  const data = makeVisualizerData({ totals: null });
  const lines = renderMetricsView(data, mockTheme, 80);
  assertTrue(lines.some(l => l.includes("No metrics data")), "shows no-data message");
}

// ─── renderTimelineView ─────────────────────────────────────────────────────

console.log("\n=== renderTimelineView ===");

{
  const now = Date.now();
  const data = makeVisualizerData({
    units: [
      {
        type: "execute-task",
        id: "M001/S01/T01",
        model: "claude-opus-4-6",
        startedAt: now - 120000,
        finishedAt: now - 60000,
        tokens: { input: 500, output: 200, cacheRead: 100, cacheWrite: 50, total: 850 },
        cost: 0.42,
        toolCalls: 5,
        assistantMessages: 3,
        userMessages: 1,
      },
      {
        type: "plan-slice",
        id: "M001/S02",
        model: "claude-opus-4-6",
        startedAt: now - 60000,
        finishedAt: now - 30000,
        tokens: { input: 300, output: 150, cacheRead: 50, cacheWrite: 25, total: 525 },
        cost: 0.18,
        toolCalls: 2,
        assistantMessages: 2,
        userMessages: 1,
      },
    ],
  });

  const lines = renderTimelineView(data, mockTheme, 80);
  assertTrue(lines.length >= 2, "timeline view produces lines for each unit");
  assertTrue(lines.some(l => l.includes("execute-task")), "shows unit type");
  assertTrue(lines.some(l => l.includes("M001/S01/T01")), "shows unit id");
  assertTrue(lines.some(l => l.includes("$0.42")), "shows unit cost");
}

{
  const data = makeVisualizerData({ units: [] });
  const lines = renderTimelineView(data, mockTheme, 80);
  assertTrue(lines.some(l => l.includes("No execution history")), "shows empty message");
}

// ─── Report ─────────────────────────────────────────────────────────────────

report();
