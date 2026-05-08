// Project/App: GSD-2
// File Purpose: Tests for memory FTS5 schema helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isMemoriesFtsAvailableSchema,
  tryCreateMemoriesFtsSchema,
} from "../db-memory-fts-schema.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeStatement implements DbStatement {
  private readonly row: Record<string, unknown> | undefined;

  constructor(row: Record<string, unknown> | undefined) {
    this.row = row;
  }

  run(): unknown {
    return undefined;
  }

  get(): Record<string, unknown> | undefined {
    return this.row;
  }

  all(): Record<string, unknown>[] {
    return [];
  }
}

class FakeAdapter implements DbAdapter {
  readonly execCalls: string[] = [];
  hasFts = false;
  failExec = false;

  exec(sql: string): void {
    this.execCalls.push(sql);
    if (this.failExec) throw new Error("fts unavailable");
  }

  prepare(): DbStatement {
    return new FakeStatement(this.hasFts ? { name: "memories_fts" } : undefined);
  }

  close(): void {}
}

describe("db-memory-fts-schema", () => {
  test("creates memories_fts and insert/delete/update triggers", () => {
    const db = new FakeAdapter();

    const ok = tryCreateMemoriesFtsSchema(db);

    assert.equal(ok, true);
    assert.equal(db.execCalls.length, 4);
    assert.match(db.execCalls[0], /CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts/);
    assert.match(db.execCalls[1], /CREATE TRIGGER IF NOT EXISTS memories_ai/);
    assert.match(db.execCalls[2], /CREATE TRIGGER IF NOT EXISTS memories_ad/);
    assert.match(db.execCalls[3], /CREATE TRIGGER IF NOT EXISTS memories_au/);
  });

  test("reports unavailable FTS5 without throwing", () => {
    const db = new FakeAdapter();
    const messages: string[] = [];
    db.failExec = true;

    const ok = tryCreateMemoriesFtsSchema(db, {
      onUnavailable: (message) => messages.push(message),
    });

    assert.equal(ok, false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /FTS5 unavailable/);
    assert.match(messages[0], /fts unavailable/);
  });

  test("checks whether the memories_fts table exists", () => {
    const db = new FakeAdapter();

    assert.equal(isMemoriesFtsAvailableSchema(db), false);

    db.hasFts = true;
    assert.equal(isMemoriesFtsAvailableSchema(db), true);
  });
});
