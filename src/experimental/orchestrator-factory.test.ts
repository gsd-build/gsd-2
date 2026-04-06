/**
 * Comprehensive tests for orchestrator factory, LegacyOrchestrator wrapper and configuration (T03).
 * Covers R004: wrapper delegation, config resolution (env/prefs/fallback), error cases, RunResult.
 * Matches node:test/assert patterns from other tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createOrchestrator, registerOrchestrator, resolveOrchestratorName } from "./orchestrator-factory.js";
import { LegacyOrchestrator } from "./legacy-orchestrator.js";
import type { Orchestrator, RunResult } from "./orchestrator.interface.js";

test("createOrchestrator defaults to legacy orchestrator", async (t) => {
  // Ensure default by clearing env
  const originalEnv = process.env.GSD_ORCHESTRATOR;
  delete process.env.GSD_ORCHESTRATOR;

  try {
    const orch: Orchestrator = await createOrchestrator();
    assert.ok(orch, "returns orchestrator");
    assert.ok(typeof orch.run === "function", "exposes run(session, initialState)");
    assert.ok(orch.run.length >= 2, "run accepts at least 2 args");
  } finally {
    if (originalEnv !== undefined) {
      process.env.GSD_ORCHESTRATOR = originalEnv;
    }
  }
});

test("factory respects GSD_ORCHESTRATOR=legacy explicitly", async () => {
  const originalEnv = process.env.GSD_ORCHESTRATOR;
  process.env.GSD_ORCHESTRATOR = "legacy";

  try {
    const orch = await createOrchestrator();
    assert.ok(typeof orch.run === "function");
  } finally {
    if (originalEnv !== undefined) process.env.GSD_ORCHESTRATOR = originalEnv;
    else delete process.env.GSD_ORCHESTRATOR;
  }
});

test("registerOrchestrator is exported", () => {
  assert.ok(typeof registerOrchestrator === "function");
});

test("createOrchestrator accepts initialState", async () => {
  const initial = { test: "value", ctx: {}, pi: {} };
  const orch = await createOrchestrator(initial);
  assert.ok(orch);
});

test("resolveOrchestratorName prioritizes GSD_ORCHESTRATOR env var", () => {
  const originalEnv = process.env.GSD_ORCHESTRATOR;
  process.env.GSD_ORCHESTRATOR = "custom";

  try {
    const name = resolveOrchestratorName({});
    assert.equal(name, "custom");
  } finally {
    if (originalEnv !== undefined) {
      process.env.GSD_ORCHESTRATOR = originalEnv;
    } else {
      delete process.env.GSD_ORCHESTRATOR;
    }
  }
});

test("resolveOrchestratorName falls back to prefs.orchestrator", () => {
  const prefs = {
    preferences: {
      orchestrator: "pref-based"
    }
  };
  const name = resolveOrchestratorName(prefs);
  assert.equal(name, "pref-based");
});

test("resolveOrchestratorName supports nested experimental.orchestrator", () => {
  const prefs = {
    preferences: {
      experimental: {
        orchestrator: "experimental"
      }
    }
  };
  const name = resolveOrchestratorName(prefs);
  assert.equal(name, "experimental");
});

test("resolveOrchestratorName defaults to legacy", () => {
  const name = resolveOrchestratorName({});
  assert.equal(name, "legacy");
});

test("LegacyOrchestrator constructor stores prefs and logs", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    const prefs = { preferences: { orchestrator: "legacy" } };
    const orch = new LegacyOrchestrator(prefs);
    assert.ok(orch);
    assert.ok(logs.some((l: string) => l.includes("[legacy-orchestrator]")));
    // @ts-ignore - test private
    assert.deepEqual(orch.prefs, prefs);
  } finally {
    console.log = originalLog;
  }
});

test("createOrchestrator falls back to legacy on unknown name", async () => {
  const originalEnv = process.env.GSD_ORCHESTRATOR;
  process.env.GSD_ORCHESTRATOR = "unknown-orchestrator";

  try {
    const orch = await createOrchestrator();
    assert.ok(orch);
    assert.ok(typeof orch.run === "function");
  } finally {
    if (originalEnv !== undefined) process.env.GSD_ORCHESTRATOR = originalEnv;
    else delete process.env.GSD_ORCHESTRATOR;
  }
});

test("LegacyOrchestrator.run() with mocks for session, ctx, pi, deps verifies delegation, error handling, RunResult", async (t) => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(String(msg));

  try {
    const mockCtx = {
      ui: {
        notify: t.mock.fn((...args: any[]) => {}),
      } as any,
    };
    const mockPi = {} as any;
    const mockSession = {
      active: false,
      unitDispatchCount: new Map<string, number>(),
      toJSON: () => ({ mocked: true }),
      cmdCtx: mockCtx,
    } as any;

    const orch = new LegacyOrchestrator({ preferences: { orchestrator: "legacy" } });
    const initialState = {
      ctx: mockCtx,
      pi: mockPi,
    };

    const result: RunResult = await orch.run(mockSession, initialState);

    assert.ok(result, "returns result");
    assert.equal(result.success, true, "success path");
    assert.equal(result.reason, "completed");
    assert.ok(typeof result.iterations === "number", "has iterations");
    assert.deepEqual(result.finalState, { mocked: true }, "finalState from session.toJSON");
    assert.ok(logs.some((l) => l.includes("[legacy-orchestrator]")), "logs initialization");

    // Test error handling path
    const errorSession = { ...mockSession, cmdCtx: undefined } as any;
    await assert.rejects(
      orch.run(errorSession, { pi: mockPi }),
      (err: any) => err.message.includes("requires ExtensionContext"),
      "properly throws and handles missing ctx"
    );
  } finally {
    console.log = originalLog;
  }
});
