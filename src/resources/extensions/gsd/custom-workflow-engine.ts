/**
 * custom-workflow-engine.ts — WorkflowEngine implementation for custom workflows.
 *
 * Drives the auto-loop using GRAPH.yaml step state from a run directory.
 * Each iteration: deriveState reads the graph, resolveDispatch picks the
 * next eligible step, reconcile marks it complete and persists.
 *
 * Observability:
 * - All state reads/writes go through graph.ts YAML I/O — inspectable on disk.
 * - `resolveDispatch` returns unitType "custom-step" with unitId "<name>/<stepId>".
 * - `getDisplayMetadata` provides step N/M progress for dashboard rendering.
 * - Phase transitions are derivable from GRAPH.yaml step statuses.
 */

import type { WorkflowEngine } from "./workflow-engine.ts";
import type {
  EngineState,
  EngineDispatchAction,
  CompletedStep,
  ReconcileResult,
  DisplayMetadata,
} from "./engine-types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  readGraph,
  writeGraph,
  getNextPendingStep,
  markStepComplete,
  expandIteration,
  type WorkflowGraph,
} from "./graph.ts";
import { injectContext } from "./context-injector.ts";
import type { WorkflowDefinition, StepDefinition } from "./definition-loader.ts";

export class CustomWorkflowEngine implements WorkflowEngine {
  readonly engineId = "custom";
  private readonly runDir: string;

  constructor(runDir: string) {
    this.runDir = runDir;
  }

  /**
   * Derive engine state from GRAPH.yaml on disk.
   *
   * Phase is "complete" when all steps are complete or expanded,
   * "running" otherwise (any pending or active steps remain).
   */
  async deriveState(_basePath: string): Promise<EngineState> {
    const graph = readGraph(this.runDir);
    const allDone = graph.steps.every(
      (s) => s.status === "complete" || s.status === "expanded",
    );
    const phase = allDone ? "complete" : "running";

    return {
      phase,
      currentMilestoneId: null,
      activeSliceId: null,
      activeTaskId: null,
      isComplete: allDone,
      raw: graph,
    };
  }

  /**
   * Resolve the next dispatch action from graph state.
   *
   * Uses getNextPendingStep to find the first step whose dependencies
   * are all satisfied. If the step has an `iterate` config in the frozen
   * DEFINITION.yaml, expands it into instance steps before dispatching.
   *
   * Returns a dispatch with unitType "custom-step" and unitId in
   * "<workflowName>/<stepId>" format.
   *
   * Observability:
   * - Iterate expansion is logged to stderr with item count and parent step ID.
   * - Missing source artifacts throw with the full resolved path for diagnosis.
   * - Zero-match expansions return a stop action with level "info".
   * - Expanded GRAPH.yaml is written to disk before dispatch — inspectable on disk.
   */
  async resolveDispatch(
    state: EngineState,
    _context: { basePath: string },
  ): Promise<EngineDispatchAction> {
    let graph = state.raw as WorkflowGraph;
    let next = getNextPendingStep(graph);

    if (!next) {
      return {
        action: "stop",
        reason: "All steps complete",
        level: "info",
      };
    }

    // Check frozen DEFINITION.yaml for iterate config on this step
    const defPath = join(this.runDir, "DEFINITION.yaml");
    const defRaw = readFileSync(defPath, "utf-8");
    const def = parse(defRaw) as WorkflowDefinition;
    const stepDef = def.steps.find((s: StepDefinition) => s.id === next!.id);

    if (stepDef?.iterate) {
      const iterate = stepDef.iterate;

      // Read source artifact
      const sourcePath = join(this.runDir, iterate.source);
      let sourceContent: string;
      try {
        sourceContent = readFileSync(sourcePath, "utf-8");
      } catch {
        throw new Error(
          `Iterate source artifact not found: ${sourcePath} (step "${next.id}", source: "${iterate.source}")`,
        );
      }

      // Extract items via regex with global+multiline flags
      const items = [...sourceContent.matchAll(new RegExp(iterate.pattern, "gm"))].map(
        (m) => m[1],
      );

      // Expand the graph
      const expandedGraph = expandIteration(graph, next.id, items, next.prompt);
      writeGraph(this.runDir, expandedGraph);
      graph = expandedGraph;

      // Re-query for first instance step
      next = getNextPendingStep(expandedGraph);

      if (!next) {
        return {
          action: "stop",
          reason: "Iterate expansion produced no instances",
          level: "info",
        };
      }
    }

    // Enrich prompt with context from prior step artifacts
    const enrichedPrompt = injectContext(this.runDir, next.id, next.prompt);

    return {
      action: "dispatch",
      step: {
        unitType: "custom-step",
        unitId: `${graph.metadata.name}/${next.id}`,
        prompt: enrichedPrompt,
      },
    };
  }

  /**
   * Reconcile state after a step completes.
   *
   * Extracts the stepId from the completedStep's unitId (last segment after `/`),
   * marks it complete in the graph, and writes the updated GRAPH.yaml to disk.
   *
   * Returns "milestone-complete" when all steps are now done, "continue" otherwise.
   */
  async reconcile(
    state: EngineState,
    completedStep: CompletedStep,
  ): Promise<ReconcileResult> {
    const graph = state.raw as WorkflowGraph;

    // Extract stepId from "<workflowName>/<stepId>"
    const parts = completedStep.unitId.split("/");
    const stepId = parts[parts.length - 1];

    const updatedGraph = markStepComplete(graph, stepId);
    writeGraph(this.runDir, updatedGraph);

    const allDone = updatedGraph.steps.every(
      (s) => s.status === "complete" || s.status === "expanded",
    );

    return {
      outcome: allDone ? "milestone-complete" : "continue",
    };
  }

  /**
   * Return UI-facing metadata for progress display.
   *
   * Shows "Step N/M" progress where N = completed count and M = total.
   */
  getDisplayMetadata(state: EngineState): DisplayMetadata {
    const graph = state.raw as WorkflowGraph;
    const total = graph.steps.length;
    const completed = graph.steps.filter((s) => s.status === "complete").length;

    return {
      engineLabel: "WORKFLOW",
      currentPhase: state.phase,
      progressSummary: `Step ${completed}/${total}`,
      stepCount: { completed, total },
    };
  }
}
