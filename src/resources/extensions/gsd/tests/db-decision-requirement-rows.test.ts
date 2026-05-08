// Project/App: GSD-2
// File Purpose: Tests for decision and requirement database row mappers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  rowToActiveDecision,
  rowToActiveRequirement,
  rowToDecision,
  rowToRequirement,
  rowsToRequirementCounts,
} from "../db-decision-requirement-rows.ts";

describe("db-decision-requirement-rows", () => {
  test("maps persisted decision rows with defaults", () => {
    const decision = rowToDecision({
      seq: 7,
      id: "D007",
      when_context: "during planning",
      scope: "M001/S01",
      decision: "keep SQL writes in gsd-db",
      choice: "facade wrappers",
      rationale: "preserve the single-writer invariant",
      revisable: "after repository split",
      superseded_by: "D008",
    });

    assert.deepEqual(decision, {
      seq: 7,
      id: "D007",
      when_context: "during planning",
      scope: "M001/S01",
      decision: "keep SQL writes in gsd-db",
      choice: "facade wrappers",
      rationale: "preserve the single-writer invariant",
      revisable: "after repository split",
      made_by: "agent",
      source: "discussion",
      superseded_by: "D008",
    });
  });

  test("maps active decision rows as non-superseded", () => {
    const decision = rowToActiveDecision({
      seq: 1,
      id: "D001",
      when_context: "now",
      scope: "global",
      decision: "active only",
      choice: "view row",
      rationale: "view filters superseded rows",
      revisable: "yes",
      made_by: "human",
      source: "planning",
      superseded_by: "ignored",
    });

    assert.equal(decision.made_by, "human");
    assert.equal(decision.source, "planning");
    assert.equal(decision.superseded_by, null);
  });

  test("maps persisted requirement rows", () => {
    const requirement = rowToRequirement({
      id: "R001",
      class: "functional",
      status: "active",
      description: "Persist requirements",
      why: "planning needs durable context",
      source: "roadmap",
      primary_owner: "S01",
      supporting_slices: "S02",
      validation: "roundtrip",
      notes: "important",
      full_content: "Full requirement text",
      superseded_by: "R002",
    });

    assert.deepEqual(requirement, {
      id: "R001",
      class: "functional",
      status: "active",
      description: "Persist requirements",
      why: "planning needs durable context",
      source: "roadmap",
      primary_owner: "S01",
      supporting_slices: "S02",
      validation: "roundtrip",
      notes: "important",
      full_content: "Full requirement text",
      superseded_by: "R002",
    });
  });

  test("maps active requirement rows as non-superseded", () => {
    const requirement = rowToActiveRequirement({
      id: "R001",
      class: "functional",
      status: "validated",
      description: "Validated requirement",
      why: "done",
      source: "roadmap",
      primary_owner: "S01",
      supporting_slices: "",
      validation: "tests",
      notes: "",
      full_content: "Full requirement text",
      superseded_by: "ignored",
    });

    assert.equal(requirement.status, "validated");
    assert.equal(requirement.superseded_by, null);
  });

  test("reduces requirement status rows into stable counts", () => {
    const counts = rowsToRequirementCounts([
      { status: "active", count: 2 },
      { status: "validated", count: 3 },
      { status: "deferred", count: 5 },
      { status: "out-of-scope", count: 7 },
      { status: "out_of_scope", count: 11 },
      { status: "blocked", count: 13 },
      { status: "unknown", count: 17 },
    ]);

    assert.deepEqual(counts, {
      active: 2,
      validated: 3,
      deferred: 5,
      outOfScope: 18,
      blocked: 13,
      total: 58,
    });
  });
});
