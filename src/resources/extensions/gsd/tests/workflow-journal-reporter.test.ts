// Project/App: GSD-2
// File Purpose: Unit tests for workflow journal event emission adapter.

import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowJournalReporter } from "../auto/workflow-journal-reporter.ts";

test("workflow journal reporter emits timestamped sequenced journal entries", () => {
  const entries: unknown[] = [];
  let seq = 0;
  const reporter = createWorkflowJournalReporter({
    emitJournalEvent: entry => entries.push(entry),
    flowId: "flow-1",
    nextSeq: () => {
      seq += 1;
      return seq;
    },
    now: () => "2026-05-04T00:00:00.000Z",
  });

  reporter.emit("iteration-start", { iteration: 1 });
  reporter.emit("unit-end", {
    unitType: "execute-task",
    unitId: "M001/S01/T01",
    status: "blocked",
  });

  assert.deepEqual(entries, [
    {
      ts: "2026-05-04T00:00:00.000Z",
      flowId: "flow-1",
      seq: 1,
      eventType: "iteration-start",
      data: { iteration: 1 },
    },
    {
      ts: "2026-05-04T00:00:00.000Z",
      flowId: "flow-1",
      seq: 2,
      eventType: "unit-end",
      data: {
        unitType: "execute-task",
        unitId: "M001/S01/T01",
        status: "blocked",
      },
    },
  ]);
});
