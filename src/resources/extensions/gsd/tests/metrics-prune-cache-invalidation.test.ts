// GSD-2 + metrics prune cache invalidation: pruned units must not reappear after snapshotUnitMetricsByScope

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  initMetricsByScope,
  resetMetricsByScope,
  snapshotUnitMetricsByScope,
  pruneMetricsLedger,
  type MetricsLedger,
} from "../metrics.js";
import { createWorkspace, scopeMilestone } from "../workspace.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-metrics-prune-"));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

function metricsPath(base: string): string {
  return join(base, ".gsd", "metrics.json");
}

function makeUnit(id: string, startedAt: number): any {
  return {
    type: "execute-task",
    id,
    model: "test-model",
    startedAt,
    finishedAt: startedAt + 1000,
    tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
    cost: 0.001,
    toolCalls: 1,
    assistantMessages: 1,
    userMessages: 1,
  };
}

function makeProjectLedger(units: any[]): MetricsLedger {
  return { version: 1, projectStartedAt: 1000, units } as MetricsLedger;
}

function assistantCtx(): any {
  const entries = [
    {
      type: "message",
      id: "e0",
      parentId: null,
      timestamp: new Date().toISOString(),
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        usage: {
          input: 100,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 150,
          cost: 0.001,
        },
      },
    },
  ];
  return { sessionManager: { getEntries: () => entries } };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("pruneMetricsLedger: invalidates scoped ledger cache", () => {
  let tmpDir: string;
  let ws: ReturnType<typeof createWorkspace>;
  let scope: ReturnType<typeof scopeMilestone>;

  beforeEach(() => {
    tmpDir = makeProjectDir();
    mkdirSync(join(tmpDir, ".gsd", "milestones"), { recursive: true });
    ws = createWorkspace(tmpDir);
    scope = scopeMilestone(ws, "M001");
  });

  afterEach(() => {
    resetMetricsByScope(scope);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("pruned units do not reappear in subsequent snapshotUnitMetricsByScope call", () => {
    // 1. Write a ledger with 5 units to disk.
    const oldUnits = [
      makeUnit("M001/S01/T01", 1000),
      makeUnit("M001/S01/T02", 2000),
      makeUnit("M001/S01/T03", 3000),
      makeUnit("M001/S01/T04", 4000),
      makeUnit("M001/S01/T05", 5000),
    ];
    writeFileSync(metricsPath(tmpDir), JSON.stringify(makeProjectLedger(oldUnits), null, 2));

    // 2. Load the scoped cache — this populates scopedLedgers with all 5 units.
    initMetricsByScope(scope);

    // 3. Prune to keepCount=2 — should evict 3 old units from disk AND clear scopedLedgers.
    const removed = pruneMetricsLedger(tmpDir, 2);
    assert.equal(removed, 3, "pruneMetricsLedger should report 3 removed units");

    // 4. Snapshot a new unit via scope. This exercises the lazy-reload path
    //    (scopedLedgers was cleared by prune) and writes the result to disk.
    const ctx = assistantCtx();
    const newUnit = snapshotUnitMetricsByScope(
      scope,
      ctx,
      "execute-task",
      "M001/S02/T01",
      Date.now(),
      "test-model",
    );
    assert.ok(newUnit !== null, "snapshotUnitMetricsByScope should return a unit");

    // 5. Read the on-disk result and verify pruned units did NOT reappear.
    const raw = readFileSync(metricsPath(tmpDir), "utf-8");
    const ledger: MetricsLedger = JSON.parse(raw);

    const unitIds = ledger.units.map((u) => u.id);

    // The pruned units must not be in the output.
    const prunedIds = ["M001/S01/T01", "M001/S01/T02", "M001/S01/T03"];
    for (const id of prunedIds) {
      assert.ok(
        !unitIds.includes(id),
        `pruned unit "${id}" must not reappear after prune + snapshot`,
      );
    }

    // The 2 kept units and the new snapshot unit must be present.
    assert.ok(unitIds.includes("M001/S01/T04"), "kept unit T04 should still be present");
    assert.ok(unitIds.includes("M001/S01/T05"), "kept unit T05 should still be present");
    assert.ok(unitIds.includes("M001/S02/T01"), "new snapshot unit should be present");
  });
});
