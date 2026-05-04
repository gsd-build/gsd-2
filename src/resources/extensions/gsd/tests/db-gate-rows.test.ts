// Project/App: GSD-2
// File Purpose: Tests for quality gate database row mapper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { rowToGate } from "../db-gate-rows.ts";

describe("db-gate-rows", () => {
  test("rowToGate clears verdict for pending gates", () => {
    const gate = rowToGate({
      milestone_id: "M001",
      slice_id: "S01",
      gate_id: "Q3",
      scope: "slice",
      status: "pending",
      verdict: "pass",
    });

    assert.equal(gate.task_id, "");
    assert.equal(gate.verdict, null);
    assert.equal(gate.rationale, "");
    assert.equal(gate.findings, "");
    assert.equal(gate.evaluated_at, null);
  });

  test("rowToGate preserves completed gate verdict and details", () => {
    const gate = rowToGate({
      milestone_id: "M001",
      slice_id: "S01",
      gate_id: "Q4",
      scope: "task",
      task_id: "T01",
      status: "complete",
      verdict: "flag",
      rationale: "needs review",
      findings: "minor risk",
      evaluated_at: "2026-05-04T00:00:00.000Z",
    });

    assert.deepEqual(gate, {
      milestone_id: "M001",
      slice_id: "S01",
      gate_id: "Q4",
      scope: "task",
      task_id: "T01",
      status: "complete",
      verdict: "flag",
      rationale: "needs review",
      findings: "minor risk",
      evaluated_at: "2026-05-04T00:00:00.000Z",
    });
  });
});
