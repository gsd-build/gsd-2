// Project/App: GSD-2
// File Purpose: Tests for SQLite schema metadata helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { columnExists, ensureColumn, getCurrentSchemaVersion, indexExists, recordSchemaVersion } from "../db-schema-metadata.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeStatement implements DbStatement {
  private readonly getResult: Record<string, unknown> | undefined;
  private readonly allResult: Record<string, unknown>[];
  private readonly onRun: ((params: unknown[]) => void) | undefined;

  constructor(
    getResult: Record<string, unknown> | undefined,
    allResult: Record<string, unknown>[],
    onRun?: (params: unknown[]) => void,
  ) {
    this.getResult = getResult;
    this.allResult = allResult;
    this.onRun = onRun;
  }

  run(...params: unknown[]): unknown {
    this.onRun?.(params);
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
  readonly runCalls: unknown[][] = [];
  readonly preparedSql: string[] = [];
  indexNames = new Set<string>();
  tableColumns = new Map<string, string[]>();
  currentVersion: number | undefined = undefined;

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(sql: string): DbStatement {
    this.preparedSql.push(sql);
    if (sql.includes("sqlite_master")) {
      return new FakeStatement(this.indexNames.size > 0 ? { present: 1 } : undefined, []);
    }
    if (sql.includes("SELECT MAX(version)")) {
      return new FakeStatement(this.currentVersion === undefined ? undefined : { v: this.currentVersion }, []);
    }
    if (sql.includes("INSERT INTO schema_version")) {
      return new FakeStatement(undefined, [], (params) => {
        this.runCalls.push(params);
      });
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

  test("getCurrentSchemaVersion returns zero when no version row exists", () => {
    const db = new FakeAdapter();

    assert.equal(getCurrentSchemaVersion(db), 0);
  });

  test("records schema version rows with timestamps", () => {
    const db = new FakeAdapter();

    recordSchemaVersion(db, 26);

    assert.equal(db.runCalls.length, 1);
    assert.equal((db.runCalls[0][0] as Record<string, unknown>)[":version"], 26);
    assert.equal(typeof (db.runCalls[0][0] as Record<string, unknown>)[":applied_at"], "string");
  });
});
