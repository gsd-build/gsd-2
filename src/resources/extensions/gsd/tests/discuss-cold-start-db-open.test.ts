/**
 * Behavioural regression test for #5837.
 *
 * /gsd discuss silently exited on cold-start because showDiscuss() derived
 * workflow state before opening the DB. On a cold-start session the DB file
 * exists on disk but is not open in-process, so deriveState() takes the
 * "DB unavailable" branch, reports no active milestone, and showDiscuss()
 * exits as if the project had no milestones.
 *
 * The fix moves `ensureDbOpen(basePath)` ahead of `deriveState()`. This test
 * pins that ordering contract at the behavioural level: with a milestone
 * living only in the DB, deriveState() surfaces nothing until the DB is
 * opened, and surfaces the milestone once ensureDbOpen() has run.
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureDbOpen } from "../bootstrap/dynamic-tools.ts";
import { openDatabase, closeDatabase, isDbAvailable, insertMilestone } from "../gsd-db.ts";
import { deriveState, invalidateStateCache } from "../state.ts";

afterEach(() => {
  if (isDbAvailable()) closeDatabase();
  invalidateStateCache();
});

describe("discuss cold-start DB ordering (#5837)", () => {
  test("deriveState only surfaces a DB-resident milestone after ensureDbOpen runs", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-discuss-cold-")));
    try {
      mkdirSync(join(base, ".gsd"), { recursive: true });

      // Seed a milestone into the DB, then close it — this is the cold-start
      // state: the DB file exists on disk but nothing is open in-process.
      const dbPath = join(base, ".gsd", "gsd.db");
      assert.equal(openDatabase(dbPath), true);
      insertMilestone({ id: "M001", title: "Cold start milestone", status: "active" });
      closeDatabase();
      invalidateStateCache();

      // Before ensureDbOpen(): showDiscuss's pre-fix ordering. The DB is not
      // open, so state derivation cannot see the milestone — the silent exit.
      const coldState = await deriveState(base);
      assert.equal(
        coldState.activeMilestone,
        null,
        "without an open DB, deriveState must not surface the milestone — this is the cold-start silent-exit bug",
      );
      assert.equal(isDbAvailable(), false, "DB must still be closed before ensureDbOpen");

      // The fix: ensureDbOpen(basePath) runs before deriveState.
      assert.equal(await ensureDbOpen(base), true, "ensureDbOpen must open the cold-start DB");
      invalidateStateCache();

      const warmState = await deriveState(base);
      assert.equal(
        warmState.activeMilestone?.id,
        "M001",
        "after ensureDbOpen, deriveState must surface the DB-resident milestone so /gsd discuss does not silently exit",
      );
    } finally {
      if (isDbAvailable()) closeDatabase();
      invalidateStateCache();
      rmSync(base, { recursive: true, force: true });
    }
  });
});
