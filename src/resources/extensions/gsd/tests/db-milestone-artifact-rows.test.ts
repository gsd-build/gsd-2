// Project/App: GSD-2
// File Purpose: Tests for milestone and artifact database row mappers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { rowToArtifact, rowToMilestone } from "../db-milestone-artifact-rows.ts";

describe("db-milestone-artifact-rows", () => {
  test("rowToMilestone maps JSON planning fields and defaults optional strings", () => {
    const milestone = rowToMilestone({
      id: "M001",
      title: "Refactor DB",
      status: "active",
      depends_on: '["M000"]',
      created_at: "2026-05-04T00:00:00.000Z",
      success_criteria: '["tests pass"]',
      key_risks: '[{"risk":"drift","whyItMatters":"behavior"}]',
      proof_strategy: '[{"riskOrUnknown":"queries","retireIn":"tests","whatWillBeProven":"same rows"}]',
      definition_of_done: '["committed"]',
    });

    assert.deepEqual(milestone.depends_on, ["M000"]);
    assert.deepEqual(milestone.success_criteria, ["tests pass"]);
    assert.deepEqual(milestone.key_risks, [{ risk: "drift", whyItMatters: "behavior" }]);
    assert.deepEqual(milestone.proof_strategy, [
      { riskOrUnknown: "queries", retireIn: "tests", whatWillBeProven: "same rows" },
    ]);
    assert.deepEqual(milestone.definition_of_done, ["committed"]);
    assert.equal(milestone.completed_at, null);
    assert.equal(milestone.vision, "");
    assert.equal(milestone.sequence, 0);
  });

  test("rowToArtifact maps nullable ownership columns", () => {
    const artifact = rowToArtifact({
      path: "docs/report.md",
      artifact_type: "report",
      milestone_id: "M001",
      full_content: "content",
      imported_at: "2026-05-04T00:00:00.000Z",
    });

    assert.deepEqual(artifact, {
      path: "docs/report.md",
      artifact_type: "report",
      milestone_id: "M001",
      slice_id: null,
      task_id: null,
      full_content: "content",
      imported_at: "2026-05-04T00:00:00.000Z",
    });
  });
});
