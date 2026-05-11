// ADR-008 validation criterion #3 — behavior-parity lock-in for gsd_task_complete.
//
// ADR-008 §1 ("One handler layer, multiple transports") is shipped: both
// native (`db-tools.ts`) and MCP (`workflow-tools.ts`) registrations wrap the
// same `executeTaskComplete` from `workflow-tool-executors.ts`. This test
// guards the equivalence so a future executor refactor cannot silently drift
// the two transports apart.
//
// Strategy: run the same completion against two equivalent fresh basePaths,
// one via the native path (direct call to the shared executor — which is
// faithfully what `db-tools.ts:670-674` does after `resolveCtxCwd`) and one
// via the MCP path (`registerWorkflowTools` + tool.handler). Snapshot DB row,
// summary file content, and journal events for each. Assert equivalence
// modulo expected diffs (timestamps).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  closeDatabase,
  getTask,
} from "../../../src/resources/extensions/gsd/gsd-db.ts";
import { executeTaskComplete } from "../../../src/resources/extensions/gsd/tools/workflow-tool-executors.ts";
import { registerWorkflowTools } from "./workflow-tools.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-mcp-parity-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function seedMilestoneAndSlice(base: string): void {
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01"), { recursive: true });
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
    "# S01\n\n- [ ] **T01: Demo** `est:5m`\n",
    "utf-8",
  );
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    // swallow
  }
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    // swallow
  }
}

function makeMockServer() {
  const tools: Array<{
    name: string;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [];
  return {
    tools,
    tool(
      name: string,
      _description: string,
      _params: Record<string, unknown>,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) {
      tools.push({ name, handler });
    },
  };
}

interface SnapshotShape {
  /** SUMMARY.md content, trimmed, with ISO timestamps replaced by a sentinel. */
  summary: string;
  /** Task row, with volatile fields (timestamps, derived ids) elided. */
  taskRow: Record<string, unknown>;
  /** Journal events for this completion, with timestamps and ids normalized. */
  journalEvents: Array<{ cmd: string; params: Record<string, unknown>; actor: string }>;
}

const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

function normalizeTimestamps(text: string): string {
  return text.replace(ISO_TIMESTAMP_RE, "<NORMALIZED-TS>");
}

function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  // Recursively replace ISO timestamps in any string value so the deep-equal
  // doesn't fail on `ts`/`completed_at` style fields nested in the payload.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") {
      out[k] = normalizeTimestamps(v);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === "string"
          ? normalizeTimestamps(item)
          : item && typeof item === "object"
            ? normalizeParams(item as Record<string, unknown>)
            : item,
      );
    } else if (v !== null && typeof v === "object") {
      out[k] = normalizeParams(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function snapshotState(base: string, milestoneId: string, sliceId: string, taskId: string): SnapshotShape {
  const summaryPath = join(base, ".gsd", "milestones", milestoneId, "slices", sliceId, "tasks", `${taskId}-SUMMARY.md`);
  assert.ok(existsSync(summaryPath), `summary file must exist at ${summaryPath}`);
  const summary = normalizeTimestamps(readFileSync(summaryPath, "utf-8").trim());

  const row = getTask(milestoneId, sliceId, taskId);
  assert.ok(row, "task row must exist in DB after completion");
  // Recursively normalize ISO timestamps in the row (the SQLite row uses
  // snake_case `completed_at` and embeds another ISO timestamp inside the
  // string field `full_summary_md`). Recursive normalization is simpler and
  // more robust than maintaining an elision list.
  const taskRow = normalizeParams(row as Record<string, unknown>);
  assert.equal(taskRow.status, "complete", "task status must be 'complete' after completion");

  const journalPath = join(base, ".gsd", "event-log.jsonl");
  const journalEvents: SnapshotShape["journalEvents"] = [];
  if (existsSync(journalPath)) {
    const lines = readFileSync(journalPath, "utf-8")
      .split("\n")
      .filter((l) => l.length > 0);
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as { cmd: string; params: Record<string, unknown>; actor: string };
        if (evt.cmd === "complete-task" || evt.cmd === "complete_task") {
          // Normalize cmd to canonical hyphen form, and elide ISO timestamps
          // in the payload so the wall-clock skew between the two runs doesn't
          // produce a spurious diff.
          journalEvents.push({
            cmd: "complete-task",
            params: normalizeParams(evt.params),
            actor: evt.actor,
          });
        }
      } catch {
        // Skip corrupted lines — non-fatal for parity comparison.
      }
    }
  }

  return { summary, taskRow, journalEvents };
}

const COMPLETION_ARGS = {
  taskId: "T01",
  sliceId: "S01",
  milestoneId: "M001",
  oneLiner: "Completed the demo task",
  narrative: "Did the work described in the plan. Verified by running the test suite.",
  verification: "npm test — all passing",
  deviations: "None.",
  knownIssues: "None.",
  keyFiles: ["src/demo.ts"],
  keyDecisions: ["Used Option A from the plan."],
};

describe("ADR-008 parity: gsd_task_complete native vs MCP", () => {
  it("native and MCP produce equivalent DB row, summary, and journal event", async () => {
    let baseNative = "";
    let baseMcp = "";
    try {
      // ─── Native path ─────────────────────────────────────────────────
      // The native wrapper in db-tools.ts:670-674 is:
      //   const taskCompleteExecute = async (_tcid, params, ...) => {
      //     const { executeTaskComplete } = await loadWorkflowExecutors();
      //     return executeTaskComplete(params, resolveCtxCwd(_ctx));
      //   };
      // Calling executeTaskComplete directly with a basePath is the same
      // post-resolution call shape.
      baseNative = makeTmpBase();
      seedMilestoneAndSlice(baseNative);
      const nativeResult = await executeTaskComplete(COMPLETION_ARGS, baseNative);
      assert.ok(!nativeResult.isError, "native completion must succeed");

      const snapshotNative = snapshotState(baseNative, "M001", "S01", "T01");
      closeDatabase();

      // ─── MCP path ────────────────────────────────────────────────────
      baseMcp = makeTmpBase();
      seedMilestoneAndSlice(baseMcp);

      const server = makeMockServer();
      registerWorkflowTools(server as Parameters<typeof registerWorkflowTools>[0]);
      const taskTool = server.tools.find((t) => t.name === "gsd_task_complete");
      assert.ok(taskTool, "gsd_task_complete must be registered on the MCP surface");

      const mcpResult = await taskTool.handler({ projectDir: baseMcp, ...COMPLETION_ARGS });
      assert.ok(!mcpResult.isError, "mcp completion must succeed");

      const snapshotMcp = snapshotState(baseMcp, "M001", "S01", "T01");

      // ─── Compare ─────────────────────────────────────────────────────
      assert.equal(
        snapshotNative.summary,
        snapshotMcp.summary,
        "SUMMARY.md content must be byte-equal between native and MCP completions",
      );

      assert.deepEqual(
        snapshotNative.taskRow,
        snapshotMcp.taskRow,
        "tasks DB row (modulo volatile timestamps and ids) must be equal",
      );

      // Journal event count must match (1 complete-task event per completion).
      assert.equal(
        snapshotNative.journalEvents.length,
        snapshotMcp.journalEvents.length,
        "both transports must emit the same number of complete-task journal events",
      );

      // Each journal event's params must match (these encode the completion
      // payload; cmd is normalized and actor must align).
      for (let i = 0; i < snapshotNative.journalEvents.length; i++) {
        assert.equal(
          snapshotNative.journalEvents[i].actor,
          snapshotMcp.journalEvents[i].actor,
          `journal event #${i} actor must match between native and MCP`,
        );
        assert.deepEqual(
          snapshotNative.journalEvents[i].params,
          snapshotMcp.journalEvents[i].params,
          `journal event #${i} params must match between native and MCP`,
        );
      }
    } finally {
      if (baseNative) cleanup(baseNative);
      if (baseMcp) cleanup(baseMcp);
    }
  });
});
