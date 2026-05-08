// Project/App: GSD-2
// File Purpose: Tests for auto-mode coordination schema helper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createCoordinationTablesV24 } from "../db-coordination-schema.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeAdapter implements DbAdapter {
  readonly execCalls: string[] = [];

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(): DbStatement {
    throw new Error("prepare is not used by coordination schema tests");
  }

  close(): void {}
}

describe("db-coordination-schema", () => {
  test("creates coordination tables and claim indexes", () => {
    const db = new FakeAdapter();

    createCoordinationTablesV24(db);

    assert.equal(db.execCalls.length, 9);
    assert.match(db.execCalls[0], /CREATE TABLE IF NOT EXISTS workers/);
    assert.match(db.execCalls[1], /CREATE TABLE IF NOT EXISTS milestone_leases/);
    assert.match(db.execCalls[2], /CREATE TABLE IF NOT EXISTS unit_dispatches/);
    assert.match(db.execCalls[3], /CREATE TABLE IF NOT EXISTS cancellation_requests/);
    assert.match(db.execCalls[4], /CREATE TABLE IF NOT EXISTS command_queue/);
    assert.ok(db.execCalls.some((sql) => sql.includes("idx_unit_dispatches_active_per_unit")));
    assert.ok(db.execCalls.some((sql) => sql.includes("WHERE status IN ('claimed','running')")));
    assert.ok(db.execCalls.some((sql) => sql.includes("idx_command_queue_pending")));
  });
});
