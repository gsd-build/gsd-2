// Project/App: GSD-2
// File Purpose: Tests for runtime_kv schema helper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRuntimeKvTableV25 } from "../db-runtime-kv-schema.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeAdapter implements DbAdapter {
  readonly execCalls: string[] = [];

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(): DbStatement {
    throw new Error("prepare is not used by runtime_kv schema tests");
  }

  close(): void {}
}

describe("db-runtime-kv-schema", () => {
  test("creates the runtime_kv table with soft-state scope key columns", () => {
    const db = new FakeAdapter();

    createRuntimeKvTableV25(db);

    assert.equal(db.execCalls.length, 1);
    assert.match(db.execCalls[0], /CREATE TABLE IF NOT EXISTS runtime_kv/);
    assert.match(db.execCalls[0], /scope TEXT NOT NULL/);
    assert.match(db.execCalls[0], /scope_id TEXT NOT NULL DEFAULT ''/);
    assert.match(db.execCalls[0], /key TEXT NOT NULL/);
    assert.match(db.execCalls[0], /value_json TEXT NOT NULL/);
    assert.match(db.execCalls[0], /PRIMARY KEY \(scope, scope_id, key\)/);
  });
});
