// Project/App: GSD-2
// File Purpose: Tests for base GSD database schema DDL helper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createBaseSchemaObjects } from "../db-base-schema.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeStatement implements DbStatement {
  run(): unknown {
    return undefined;
  }

  get(): Record<string, unknown> | undefined {
    return undefined;
  }

  all(): Record<string, unknown>[] {
    return [];
  }
}

class FakeAdapter implements DbAdapter {
  readonly execCalls: string[] = [];

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(): DbStatement {
    return new FakeStatement();
  }

  close(): void {}
}

describe("db-base-schema", () => {
  test("creates current base schema tables, indexes, and active views", () => {
    const db = new FakeAdapter();
    let ftsCalls = 0;
    let dedupCalls = 0;

    createBaseSchemaObjects(db, {
      tryCreateMemoriesFts: () => {
        ftsCalls += 1;
        return true;
      },
      ensureVerificationEvidenceDedupIndex: () => {
        dedupCalls += 1;
      },
    });

    assert.equal(ftsCalls, 1);
    assert.equal(dedupCalls, 1);
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS schema_version")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS tasks")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS quality_gates")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE INDEX IF NOT EXISTS idx_tasks_active")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE VIEW IF NOT EXISTS active_decisions")));
    assert.ok(db.execCalls.some((sql) => sql.includes("CREATE VIEW IF NOT EXISTS active_memories")));
  });
});
