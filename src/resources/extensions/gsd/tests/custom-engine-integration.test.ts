/**
 * Integration tests for CustomWorkflowEngine and graph.ts.
 *
 * Proves the 3-step dispatch cycle works end-to-end through the engine
 * interface: deriveState → resolveDispatch → reconcile in a loop until
 * all steps reach "complete" status in GRAPH.yaml.
 *
 * Also covers graph.ts data operations, resolver routing, display metadata,
 * and GSDState stub compatibility.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readGraph,
  writeGraph,
  getNextPendingStep,
  markStepComplete,
} from "../graph.ts";
import type { WorkflowGraph } from "../graph.ts";
import { CustomWorkflowEngine } from "../custom-workflow-engine.ts";
import { CustomExecutionPolicy } from "../custom-execution-policy.ts";
import { resolveEngine } from "../engine-resolver.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-test-"));
}

function make3StepGraph(): WorkflowGraph {
  return {
    steps: [
      { id: "step-1", title: "First step", status: "pending", prompt: "Do step 1", dependsOn: [] },
      { id: "step-2", title: "Second step", status: "pending", prompt: "Do step 2", dependsOn: [] },
      { id: "step-3", title: "Third step", status: "pending", prompt: "Do step 3", dependsOn: [] },
    ],
    metadata: {
      name: "test-workflow",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

// ─── graph.ts data operations ────────────────────────────────────────────

test("writeGraph/readGraph roundtrip preserves 3-step structure", () => {
  const dir = makeTmpDir();
  try {
    const graph = make3StepGraph();
    writeGraph(dir, graph);

    const read = readGraph(dir);
    assert.equal(read.steps.length, 3);
    assert.equal(read.steps[0].id, "step-1");
    assert.equal(read.steps[1].id, "step-2");
    assert.equal(read.steps[2].id, "step-3");
    assert.equal(read.steps[0].status, "pending");
    assert.equal(read.steps[0].prompt, "Do step 1");
    assert.deepEqual(read.steps[0].dependsOn, []);
    assert.equal(read.metadata.name, "test-workflow");
    assert.equal(read.metadata.createdAt, "2026-01-01T00:00:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getNextPendingStep returns first pending step", () => {
  const graph = make3StepGraph();
  const next = getNextPendingStep(graph);
  assert.ok(next);
  assert.equal(next.id, "step-1");
});

test("getNextPendingStep returns null when all steps are complete", () => {
  const graph: WorkflowGraph = {
    ...make3StepGraph(),
    steps: make3StepGraph().steps.map((s) => ({ ...s, status: "complete" as const })),
  };
  const next = getNextPendingStep(graph);
  assert.equal(next, null);
});

test("markStepComplete transitions step from pending to complete", () => {
  const graph = make3StepGraph();
  const updated = markStepComplete(graph, "step-1");

  // Original is not mutated
  assert.equal(graph.steps[0].status, "pending");
  // Updated has step-1 complete
  assert.equal(updated.steps[0].status, "complete");
  // Others unchanged
  assert.equal(updated.steps[1].status, "pending");
  assert.equal(updated.steps[2].status, "pending");
});

// ─── Resolver routing ────────────────────────────────────────────────────

test("resolveEngine with 'custom:/tmp/test' returns CustomWorkflowEngine", () => {
  const { engine, policy } = resolveEngine({ activeEngineId: "custom:/tmp/test" });
  assert.equal(engine.engineId, "custom");
  assert.ok(engine instanceof CustomWorkflowEngine);
  assert.ok(policy instanceof CustomExecutionPolicy);
});

test("resolveEngine with bare 'custom' (no colon-path) throws", () => {
  assert.throws(
    () => resolveEngine({ activeEngineId: "custom" }),
    { message: "Unknown engine: custom" },
  );
});

test("resolveEngine with 'bogus' throws", () => {
  assert.throws(
    () => resolveEngine({ activeEngineId: "bogus" }),
    { message: "Unknown engine: bogus" },
  );
});

// ─── Full 3-step dispatch cycle ──────────────────────────────────────────

test("3-step dispatch cycle: deriveState → resolveDispatch → reconcile loop completes all steps", async () => {
  const dir = makeTmpDir();
  try {
    writeGraph(dir, make3StepGraph());
    const engine = new CustomWorkflowEngine(dir);
    const expectedStepIds = ["step-1", "step-2", "step-3"];

    for (let i = 0; i < 3; i++) {
      // deriveState
      const state = await engine.deriveState(dir);
      assert.equal(state.phase, "executing");
      assert.equal(state.currentMilestoneId, "custom-workflow");
      assert.equal(state.isComplete, false);

      // GSDState stub compatibility
      const raw = state.raw as Record<string, unknown>;
      assert.ok(raw.activeMilestone, "activeMilestone must be non-null");
      assert.equal(
        (raw.activeMilestone as { id: string }).id,
        "custom-workflow",
      );
      assert.equal(raw.phase, "executing");
      assert.deepEqual(raw.recentDecisions, []);
      assert.deepEqual(raw.blockers, []);
      assert.ok(Array.isArray(raw.registry));

      // resolveDispatch
      const dispatch = await engine.resolveDispatch(state, { basePath: dir });
      assert.equal(dispatch.action, "dispatch");
      if (dispatch.action === "dispatch") {
        assert.equal(dispatch.step.unitType, "custom-step");
        assert.equal(dispatch.step.unitId, expectedStepIds[i]);
      }

      // reconcile
      const result = await engine.reconcile(state, {
        unitType: "custom-step",
        unitId: expectedStepIds[i],
        startedAt: Date.now() - 1000,
        finishedAt: Date.now(),
      });
      if (i < 2) {
        assert.equal(result.outcome, "continue");
      } else {
        // Final step — engine signals stop since no remaining work
        assert.equal(result.outcome, "stop");
      }

      // Verify step marked complete on disk
      const graphAfter = readGraph(dir);
      assert.equal(graphAfter.steps[i].status, "complete");
    }

    // After 3 iterations, resolveDispatch returns stop
    const finalState = await engine.deriveState(dir);
    assert.equal(finalState.isComplete, true);
    assert.equal(finalState.phase, "complete");

    const finalDispatch = await engine.resolveDispatch(finalState, { basePath: dir });
    assert.equal(finalDispatch.action, "stop");
    if (finalDispatch.action === "stop") {
      assert.equal(finalDispatch.reason, "All steps complete");
    }

    // Verify all 3 steps are complete in GRAPH.yaml
    const finalGraph = readGraph(dir);
    for (const step of finalGraph.steps) {
      assert.equal(step.status, "complete", `${step.id} should be complete`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reconcile returns 'stop' on final step", async () => {
  const dir = makeTmpDir();
  try {
    // Graph with only 1 step
    const graph: WorkflowGraph = {
      steps: [
        { id: "only-step", title: "The only step", status: "pending", prompt: "Do it", dependsOn: [] },
      ],
      metadata: { name: "single-step", createdAt: "2026-01-01T00:00:00.000Z" },
    };
    writeGraph(dir, graph);
    const engine = new CustomWorkflowEngine(dir);

    const state = await engine.deriveState(dir);
    const result = await engine.reconcile(state, {
      unitType: "custom-step",
      unitId: "only-step",
      startedAt: Date.now() - 1000,
      finishedAt: Date.now(),
    });
    assert.equal(result.outcome, "stop");
    assert.equal(result.reason, "All steps complete");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── Display metadata ────────────────────────────────────────────────────

test("getDisplayMetadata returns correct counts mid-cycle", async () => {
  const dir = makeTmpDir();
  try {
    writeGraph(dir, make3StepGraph());
    const engine = new CustomWorkflowEngine(dir);

    // Complete step-1
    const state1 = await engine.deriveState(dir);
    await engine.reconcile(state1, {
      unitType: "custom-step",
      unitId: "step-1",
      startedAt: Date.now() - 1000,
      finishedAt: Date.now(),
    });

    // Derive state after 1 completion
    const state2 = await engine.deriveState(dir);
    const meta = engine.getDisplayMetadata(state2);

    assert.equal(meta.engineLabel, "Custom Pipeline");
    assert.equal(meta.currentPhase, "executing");
    assert.ok(meta.stepCount);
    assert.equal(meta.stepCount.completed, 1);
    assert.equal(meta.stepCount.total, 3);
    assert.equal(meta.progressSummary, "Step 2 of 3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getDisplayMetadata shows completion state when all done", async () => {
  const dir = makeTmpDir();
  try {
    const graph = make3StepGraph();
    graph.steps = graph.steps.map((s) => ({ ...s, status: "complete" as const }));
    writeGraph(dir, graph);
    const engine = new CustomWorkflowEngine(dir);

    const state = await engine.deriveState(dir);
    const meta = engine.getDisplayMetadata(state);

    assert.equal(meta.currentPhase, "complete");
    assert.ok(meta.stepCount);
    assert.equal(meta.stepCount.completed, 3);
    assert.equal(meta.stepCount.total, 3);
    assert.equal(meta.progressSummary, "All steps complete");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
