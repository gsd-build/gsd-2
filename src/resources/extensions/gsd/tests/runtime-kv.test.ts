// gsd-2 + runtime_kv non-correctness-critical key-value storage tests (Phase C)

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import {
  setRuntimeKv,
  getRuntimeKv,
  deleteRuntimeKv,
  listRuntimeKv,
} from "../db/runtime-kv.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-runtime-kv-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
}

test("set + get round-trip preserves the value", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  setRuntimeKv("global", "", "ui_cursor", { row: 5, col: 10 });
  const got = getRuntimeKv<{ row: number; col: number }>("global", "", "ui_cursor");
  assert.deepEqual(got, { row: 5, col: 10 });
});

test("get returns null for missing keys", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  assert.equal(getRuntimeKv("global", "", "missing"), null);
});

test("set on existing key updates the value (idempotent upsert)", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  setRuntimeKv("worker", "w1", "counter", 1);
  setRuntimeKv("worker", "w1", "counter", 42);
  assert.equal(getRuntimeKv("worker", "w1", "counter"), 42);
});

test("scope partitioning: same key under different scopes is independent", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  setRuntimeKv("global", "", "k", "global-value");
  setRuntimeKv("worker", "w1", "k", "worker-value");
  setRuntimeKv("milestone", "M001", "k", "milestone-value");

  assert.equal(getRuntimeKv("global", "", "k"), "global-value");
  assert.equal(getRuntimeKv("worker", "w1", "k"), "worker-value");
  assert.equal(getRuntimeKv("milestone", "M001", "k"), "milestone-value");
});

test("scope_id partitioning: same scope+key under different scope_ids is independent", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  setRuntimeKv("worker", "w1", "k", "v1");
  setRuntimeKv("worker", "w2", "k", "v2");
  assert.equal(getRuntimeKv("worker", "w1", "k"), "v1");
  assert.equal(getRuntimeKv("worker", "w2", "k"), "v2");
});

test("delete removes the row; subsequent get returns null", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  setRuntimeKv("worker", "w1", "k", "value");
  deleteRuntimeKv("worker", "w1", "k");
  assert.equal(getRuntimeKv("worker", "w1", "k"), null);
});

test("list returns all rows for a scope+scope_id, ordered by key", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  setRuntimeKv("milestone", "M001", "alpha", 1);
  setRuntimeKv("milestone", "M001", "gamma", 3);
  setRuntimeKv("milestone", "M001", "beta", 2);
  setRuntimeKv("milestone", "M002", "ignored", "different-scope");

  const rows = listRuntimeKv("milestone", "M001");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.key), ["alpha", "beta", "gamma"]);
});

test("malformed JSON in storage returns null without throwing", (t) => {
  const base = makeBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, ".gsd", "gsd.db"));

  // Inject a malformed value directly (bypassing setRuntimeKv's JSON.stringify).
  setRuntimeKv("global", "", "k", "valid");
  // Then poison the row via raw SQL.
  const db = _getAdapter()!;
  db.prepare(
    `UPDATE runtime_kv SET value_json = '{not json' WHERE scope = 'global' AND scope_id = '' AND key = 'k'`,
  ).run();

  assert.equal(getRuntimeKv("global", "", "k"), null);
});
