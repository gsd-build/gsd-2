// Project/App: GSD-2
// File Purpose: Tests for lightweight DB query row mappers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyTaskStatusCounts,
  rowToActiveTaskSummary,
  rowToIdStatusSummary,
  rowToTaskStatusCounts,
  rowsToStringColumn,
} from "../db-lightweight-query-rows.ts";

describe("db-lightweight-query-rows", () => {
  test("maps id and status summaries", () => {
    assert.deepEqual(rowToIdStatusSummary({ id: "M001", status: "active" }), {
      id: "M001",
      status: "active",
    });
  });

  test("maps active task summaries", () => {
    assert.deepEqual(rowToActiveTaskSummary({ id: "T01", status: "pending", title: "Plan task" }), {
      id: "T01",
      status: "pending",
      title: "Plan task",
    });
  });

  test("maps task status counts with stable empty defaults", () => {
    assert.deepEqual(rowToTaskStatusCounts({ total: 3, done: 1, pending: 2 }), {
      total: 3,
      done: 1,
      pending: 2,
    });
    assert.deepEqual(rowToTaskStatusCounts(undefined), emptyTaskStatusCounts());
  });

  test("extracts string columns from rows", () => {
    assert.deepEqual(rowsToStringColumn([{ slice_id: "S01" }, { slice_id: "S02" }], "slice_id"), [
      "S01",
      "S02",
    ]);
  });
});
