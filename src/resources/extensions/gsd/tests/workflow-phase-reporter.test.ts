// Project/App: GSD-2
// File Purpose: Unit tests for workflow phase-result reporting adapter.

import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowPhaseReporter } from "../auto/workflow-phase-reporter.ts";

test("workflow phase reporter forwards phase results to observer", () => {
  const phases: unknown[] = [];
  const reporter = createWorkflowPhaseReporter({
    observer: {
      onTurnStart: () => {},
      onPhaseResult: (phase, action, data) => phases.push({ phase, action, data }),
      onTurnResult: () => {},
    },
  });

  reporter.report("dispatch", "sidecar", {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    sidecarKind: "quick-task",
  });

  assert.deepEqual(phases, [{
    phase: "dispatch",
    action: "sidecar",
    data: {
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      sidecarKind: "quick-task",
    },
  }]);
});

test("workflow phase reporter tolerates missing observer", () => {
  const reporter = createWorkflowPhaseReporter({});

  assert.doesNotThrow(() => reporter.report("finalize", "next"));
});
