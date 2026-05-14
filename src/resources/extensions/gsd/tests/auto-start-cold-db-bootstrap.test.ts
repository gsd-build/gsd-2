import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openProjectDbIfPresent } from "../auto-start.ts";
import { closeDatabase, getMilestone, insertMilestone, isDbAvailable, openDatabase } from "../gsd-db.ts";
import { writeManifest } from "../workflow-manifest.ts";

test.afterEach(() => {
  if (isDbAvailable()) closeDatabase();
});

test("#2841: cold DB bootstrap opens an existing project database before state derivation", async (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-cold-db-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  const dbPath = join(base, ".gsd", "gsd.db");

  assert.equal(openDatabase(dbPath), true);
  closeDatabase();
  assert.equal(isDbAvailable(), false);

  await openProjectDbIfPresent(base);

  assert.equal(isDbAvailable(), true);
});

test("#5919: cold DB bootstrap restores state from manifest when DB is empty", async (t) => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-cold-db-manifest-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  const dbPath = join(base, ".gsd", "gsd.db");

  assert.equal(openDatabase(dbPath), true);
  insertMilestone({ id: "M001", title: "Manifest milestone" });
  writeManifest(base);
  closeDatabase();

  assert.equal(openDatabase(dbPath), true);
  closeDatabase();
  assert.equal(isDbAvailable(), false);

  await openProjectDbIfPresent(base);

  const milestone = getMilestone("M001");
  assert.ok(milestone, "milestone should be restored from state-manifest.json");
});
