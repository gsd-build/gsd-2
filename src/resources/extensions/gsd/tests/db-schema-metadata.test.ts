// Project/App: GSD-2
// File Purpose: Tests for SQLite schema metadata helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { columnExists, ensureColumn, indexExists } from "../db-schema-metadata.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeStatement implements DbStatement {
  private readonly getResult: Record<string, unknown> | undefined;
  private readonly allResult: Record<string, unknown>[];

  constructor(
    getResult: Record<string, unknown> | undefined,
    allResult: Record<string, unknown>[],
  ) {
    this.getResult = getResult;
    this.allResult = allResult;
  }

  run(): unknown {
    return undefined;
  }

  get(): Record<string, unknown> | undefined {
    return this.getResult;
  }

  all(): Record<string, unknown>[] {
    return this.allResult;
  }
}

class FakeAdapter implements DbAdapter {
  readonly execCalls: string[] = [];
  readonly preparedSql: string[] = [];
  indexNames = new Set<string>();
  tableColumns = new Map<string, string[]>();

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(sql: string): DbStatement {
    this.preparedSql.push(sql);
    if (sql.includes("sqlite_master")) {
      return new FakeStatement(this.indexNames.size > 0 ? { present: 1 } : undefined, []);
    }
    const tableMatch = /^PRAGMA table_info\(([^)]+)\)$/.exec(sql);
    if (tableMatch) {
      const columns = this.tableColumns.get(tableMatch[1]) ?? [];
      return new FakeStatement(undefined, columns.map((name) => ({ name })));
    }
    return new FakeStatement(undefined, []);
  }

  close(): void {}
}

describe("db-schema-metadata", () => {
  test("indexExists returns true when sqlite_master has a row", () => {
    const db = new FakeAdapter();
    db.indexNames.add("idx_present");

    assert.equal(indexExists(db, "idx_present"), true);
  });

  test("columnExists reads table_info rows", () => {
    const db = new FakeAdapter();
    db.tableColumns.set("tasks", ["id", "status"]);

    assert.equal(columnExists(db, "tasks", "status"), true);
    assert.equal(columnExists(db, "tasks", "missing"), false);
  });

  test("ensureColumn executes ddl only when the column is missing", () => {
    const db = new FakeAdapter();
    db.tableColumns.set("tasks", ["id"]);

    ensureColumn(db, "tasks", "status", "ALTER TABLE tasks ADD COLUMN status TEXT");
    ensureColumn(db, "tasks", "id", "ALTER TABLE tasks ADD COLUMN id TEXT");

    assert.deepEqual(db.execCalls, ["ALTER TABLE tasks ADD COLUMN status TEXT"]);
  });
});
