// Project/App: GSD-2
// File Purpose: Unit tests for the normalized SQLite adapter wrapper.

import assert from "node:assert/strict";
import test from "node:test";

import {
  createDbAdapter,
  normalizeDbRow,
  normalizeDbRows,
} from "../db-adapter.ts";

test("normalizeDbRow returns undefined for missing rows", () => {
  assert.equal(normalizeDbRow(null), undefined);
  assert.equal(normalizeDbRow(undefined), undefined);
});

test("normalizeDbRow converts null-prototype rows to plain objects", () => {
  const raw = Object.create(null) as Record<string, unknown>;
  raw.id = "M001";

  const normalized = normalizeDbRow(raw);

  assert.deepEqual(normalized, { id: "M001" });
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
});

test("normalizeDbRows normalizes every row", () => {
  const first = Object.create(null) as Record<string, unknown>;
  first.id = "S01";
  const second = { id: "S02" };

  assert.deepEqual(normalizeDbRows([first, second]), [{ id: "S01" }, { id: "S02" }]);
});

test("createDbAdapter caches prepared statements and clears cache on close", () => {
  const calls: unknown[] = [];
  const rawStatement = {
    run: (...params: unknown[]) => {
      calls.push(["run", params]);
      return { changes: 1 };
    },
    get: (...params: unknown[]) => {
      calls.push(["get", params]);
      const row = Object.create(null) as Record<string, unknown>;
      row.id = "T01";
      return row;
    },
    all: (...params: unknown[]) => {
      calls.push(["all", params]);
      const row = Object.create(null) as Record<string, unknown>;
      row.id = "T02";
      return [row];
    },
  };
  let prepareCount = 0;
  const rawDb = {
    exec: (sql: string) => calls.push(["exec", sql]),
    prepare: (sql: string) => {
      prepareCount += 1;
      calls.push(["prepare", sql]);
      return rawStatement;
    },
    close: () => calls.push(["close"]),
  };
  const adapter = createDbAdapter(rawDb);

  const first = adapter.prepare("SELECT * FROM tasks WHERE id = ?");
  const second = adapter.prepare("SELECT * FROM tasks WHERE id = ?");

  assert.equal(first, second);
  assert.equal(prepareCount, 1);
  assert.deepEqual(first.get("T01"), { id: "T01" });
  assert.deepEqual(first.all("T02"), [{ id: "T02" }]);
  assert.deepEqual(first.run("T01"), { changes: 1 });

  adapter.close();
  const third = adapter.prepare("SELECT * FROM tasks WHERE id = ?");

  assert.notEqual(third, first);
  assert.equal(prepareCount, 2);
});
