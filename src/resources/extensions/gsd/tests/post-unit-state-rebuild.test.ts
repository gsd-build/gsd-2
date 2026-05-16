/**
 * Regression test for #3869: normal post-unit flow should rebuild STATE.md
 * before syncing worktree state back to the project root.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { AutoSession } from "../auto/session.ts";
import { postUnitPreVerification } from "../auto-post-unit.ts";
import {
  _getAdapter,
  closeDatabase,
  getTask,
  insertMilestone,
  insertSlice,
  insertTask,
  openDatabase,
} from "../gsd-db.ts";

const _require = createRequire(import.meta.url);

function openRawSqliteForTest(dbPath: string): { exec(sql: string): void; close(): void } {
  try {
    const mod = _require("node:sqlite") as { DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void } };
    return new mod.DatabaseSync(dbPath);
  } catch {
    type SqliteCtor = new (path: string) => { exec(sql: string): void; close(): void };
    const mod = _require("better-sqlite3") as SqliteCtor | { default: SqliteCtor };
    const DatabaseCtor: SqliteCtor = typeof mod === "function" ? mod : mod.default;
    return new DatabaseCtor(dbPath);
  }
}

test("postUnitPreVerification rebuilds STATE.md after a completed unit", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-state-"));
  try {
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    mkdirSync(sliceDir, { recursive: true });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# Roadmap\n\n## Slices\n\n- [ ] **S01: Discussed slice** `risk:low` `depends:[]`\n",
    );
    writeFileSync(join(sliceDir, "S01-CONTEXT.md"), "# Slice Context\n\nReady.\n");

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "discuss-slice", id: "M001/S01", startedAt: Date.now() };

    const result = await postUnitPreVerification({
      s,
      ctx: { ui: { notify() {} } } as any,
      pi: {} as any,
      buildSnapshotOpts: () => ({}),
      lockBase: () => base,
      stopAuto: async () => {},
      pauseAuto: async () => {},
      updateProgressWidget: () => {},
    }, { skipSettleDelay: true, skipWorktreeSync: true });

    assert.equal(result, "continue");
    const statePath = join(base, ".gsd", "STATE.md");
    assert.equal(existsSync(statePath), true);
    assert.ok(readFileSync(statePath, "utf-8").includes("M001"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification refreshes DB before checking execute-task completion", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-db-refresh-"));
  try {
    const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
    const tasksDir = join(sliceDir, "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
      "# Roadmap\n\n## Slices\n\n- [ ] **S01: Slice** `risk:low` `depends:[]`\n",
    );
    writeFileSync(
      join(sliceDir, "S01-PLAN.md"),
      "# S01: Slice\n\n## Tasks\n\n- [ ] **T01: Do work** `est:30m`\n",
    );
    writeFileSync(
      join(tasksDir, "T01-SUMMARY.md"),
      "---\nid: T01\nparent: S01\nmilestone: M001\n---\n# T01\nDone.\n",
    );

    const dbPath = join(base, ".gsd", "gsd.db");
    openDatabase(dbPath);
    insertMilestone({ id: "M001", title: "Milestone", status: "active" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "pending" });
    insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "Do work", status: "pending" });
    const adapterBefore = _getAdapter();

    const externalDb = openRawSqliteForTest(dbPath);
    try {
      externalDb.exec("UPDATE tasks SET status = 'complete', completed_at = '2026-05-14T00:00:00.000Z' WHERE milestone_id = 'M001' AND slice_id = 'S01' AND id = 'T01'");
    } finally {
      externalDb.close();
    }

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "execute-task", id: "M001/S01/T01", startedAt: Date.now() };

    const result = await postUnitPreVerification({
      s,
      ctx: { ui: { notify() {} } } as any,
      pi: {} as any,
      buildSnapshotOpts: () => ({}),
      lockBase: () => base,
      stopAuto: async () => {},
      pauseAuto: async () => {},
      updateProgressWidget: () => {},
    }, { skipSettleDelay: true, skipWorktreeSync: true });

    assert.equal(result, "continue");
    assert.notEqual(_getAdapter(), adapterBefore, "post-unit flow must reopen the DB before deriving state");
    assert.equal(getTask("M001", "S01", "T01")?.status, "complete");
    assert.equal(s.pendingVerificationRetry, null);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});

test("postUnitPreVerification pauses instead of retrying when closeout failure marker exists", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-post-unit-failure-marker-"));
  try {
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    openDatabase(join(base, ".gsd", "gsd.db"));
    writeFileSync(
      join(milestoneDir, "M001-VERIFICATION-FAILED.md"),
      "# Verification Failed\n\nverdict: needs-attention\n",
    );

    const s = new AutoSession();
    s.basePath = base;
    s.originalBasePath = base;
    s.currentMilestoneId = "M001";
    s.currentUnit = { type: "complete-milestone", id: "M001", startedAt: Date.now() };
    const retryKey = `${s.currentUnit.type}:${s.currentUnit.id}`;
    s.pendingVerificationRetry = {
      unitId: s.currentUnit.id,
      failureContext: "seeded failure context",
      attempt: 2,
    };
    s.verificationRetryCount.set(retryKey, 2);
    s.verificationRetryFailureHashes.set(retryKey, "seeded-hash");

    let pauseCalls = 0;
    const notifyPayloads: unknown[] = [];
    const result = await postUnitPreVerification({
      s,
      ctx: { ui: { notify(payload: unknown) { notifyPayloads.push(payload); } } } as any,
      pi: {} as any,
      buildSnapshotOpts: () => ({}),
      lockBase: () => base,
      stopAuto: async () => {},
      pauseAuto: async () => { pauseCalls += 1; },
      updateProgressWidget: () => {},
    }, { skipSettleDelay: true, skipWorktreeSync: true });

    assert.equal(result, "dispatched");
    assert.equal(pauseCalls, 1);
    assert.ok(
      notifyPayloads.some((payload) => JSON.stringify(payload).includes("M001-VERIFICATION-FAILED.md")),
      "should notify marker-path closeout failure to UI",
    );
    assert.equal(s.pendingVerificationRetry, null);
    assert.equal(s.verificationRetryCount.size, 0);
    assert.equal(s.verificationRetryFailureHashes.size, 0);
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
});
