// Project/App: GSD-2
// File Purpose: Tests for task and slice database row mappers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskArrayColumn, rowToSlice, rowToTask } from "../db-task-slice-rows.ts";

describe("db-task-slice-rows", () => {
  test("parseTaskArrayColumn handles JSON arrays, scalar JSON, raw arrays, and legacy CSV", () => {
    assert.deepEqual(parseTaskArrayColumn('["a.ts","b.ts"]'), ["a.ts", "b.ts"]);
    assert.deepEqual(parseTaskArrayColumn('"single.ts"'), ["single.ts"]);
    assert.deepEqual(parseTaskArrayColumn(["a.ts", 42, "b.ts"]), ["a.ts", "b.ts"]);
    assert.deepEqual(parseTaskArrayColumn(" a.ts, b.ts ,, "), ["a.ts", "b.ts"]);
    assert.deepEqual(parseTaskArrayColumn(""), []);
    assert.deepEqual(parseTaskArrayColumn(null), []);
  });

  test("rowToSlice maps optional DB columns to stable defaults", () => {
    const slice = rowToSlice({
      milestone_id: "M001",
      id: "S01",
      title: "Build the thing",
      status: "active",
      risk: "medium",
      depends: '["S00"]',
      created_at: "2026-05-04T00:00:00.000Z",
    });

    assert.deepEqual(slice, {
      milestone_id: "M001",
      id: "S01",
      title: "Build the thing",
      status: "active",
      risk: "medium",
      depends: ["S00"],
      demo: "",
      created_at: "2026-05-04T00:00:00.000Z",
      completed_at: null,
      full_summary_md: "",
      full_uat_md: "",
      goal: "",
      success_criteria: "",
      proof_level: "",
      integration_closure: "",
      observability_impact: "",
      sequence: 0,
      replan_triggered_at: null,
      is_sketch: 0,
      sketch_scope: "",
    });
  });

  test("rowToTask maps planning and escalation columns", () => {
    const task = rowToTask({
      milestone_id: "M001",
      slice_id: "S01",
      id: "T01",
      title: "Extract row mapper",
      status: "done",
      one_liner: "Mapper extraction",
      narrative: "Moved row shaping",
      verification_result: "passed",
      duration: "5m",
      completed_at: "2026-05-04T00:00:00.000Z",
      blocker_discovered: 1,
      deviations: "",
      known_issues: "",
      key_files: "a.ts,b.ts",
      key_decisions: '["D001"]',
      full_summary_md: "summary",
      description: "description",
      estimate: "small",
      files: '["src/a.ts"]',
      verify: "npm test",
      inputs: '"input.md"',
      expected_output: "result.md,report.md",
      observability_impact: "none",
      full_plan_md: "plan",
      sequence: 3,
      blocker_source: "test",
      escalation_pending: 1,
      escalation_awaiting_review: 0,
      escalation_artifact_path: "/tmp/escalation.md",
      escalation_override_applied_at: "2026-05-04T00:01:00.000Z",
    });

    assert.equal(task.blocker_discovered, true);
    assert.deepEqual(task.key_files, ["a.ts", "b.ts"]);
    assert.deepEqual(task.key_decisions, ["D001"]);
    assert.deepEqual(task.files, ["src/a.ts"]);
    assert.deepEqual(task.inputs, ["input.md"]);
    assert.deepEqual(task.expected_output, ["result.md", "report.md"]);
    assert.equal(task.sequence, 3);
    assert.equal(task.escalation_pending, 1);
    assert.equal(task.escalation_artifact_path, "/tmp/escalation.md");
  });

  test("rowToTask defaults optional planning and escalation fields", () => {
    const task = rowToTask({
      milestone_id: "M001",
      slice_id: "S01",
      id: "T01",
      title: "Pending",
      status: "pending",
      one_liner: "",
      narrative: "",
      verification_result: "",
      duration: "",
      blocker_discovered: 0,
      deviations: "",
      known_issues: "",
      key_files: "",
      key_decisions: "",
      full_summary_md: "",
    });

    assert.equal(task.completed_at, null);
    assert.deepEqual(task.files, []);
    assert.deepEqual(task.inputs, []);
    assert.deepEqual(task.expected_output, []);
    assert.equal(task.sequence, 0);
    assert.equal(task.blocker_source, "");
    assert.equal(task.escalation_pending, 0);
    assert.equal(task.escalation_awaiting_review, 0);
    assert.equal(task.escalation_artifact_path, null);
    assert.equal(task.escalation_override_applied_at, null);
  });
});
