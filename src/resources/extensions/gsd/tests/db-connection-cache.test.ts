// Project/App: GSD-2
// File Purpose: Tests for workspace database connection cache lifecycle helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDbConnectionCache, type DbConnectionCacheEntry } from "../db-connection-cache.ts";
import type { DbAdapter, DbStatement } from "../db-adapter.ts";

class FakeAdapter implements DbAdapter {
  readonly calls: string[] = [];

  exec(sql: string): void {
    this.calls.push(`exec:${sql}`);
  }

  prepare(): DbStatement {
    throw new Error("prepare is not used by DbConnectionCache tests");
  }

  close(): void {
    this.calls.push("close");
  }
}

function entry(path: string, db = new FakeAdapter()): DbConnectionCacheEntry {
  return { dbPath: path, db };
}

describe("db-connection-cache", () => {
  test("stores entries and exposes a readonly cache view", () => {
    const cache = createDbConnectionCache();
    const cached = entry("/tmp/a.db");

    cache.set("workspace-a", cached);

    assert.equal(cache.get("workspace-a"), cached);
    assert.equal(cache.has("workspace-a"), true);
    assert.equal(cache.asReadonlyMap().size, 1);
  });

  test("closeNonActive closes and removes only inactive entries", () => {
    const cache = createDbConnectionCache();
    const activeDb = new FakeAdapter();
    const inactiveDb = new FakeAdapter();
    cache.set("active", entry("/tmp/active.db", activeDb));
    cache.set("inactive", entry("/tmp/inactive.db", inactiveDb));
    const closed: string[] = [];

    cache.closeNonActive(activeDb, (cached) => {
      closed.push(cached.dbPath);
      cached.db.close();
    });

    assert.deepEqual(closed, ["/tmp/inactive.db"]);
    assert.equal(cache.has("active"), true);
    assert.equal(cache.has("inactive"), false);
    assert.deepEqual(activeDb.calls, []);
    assert.deepEqual(inactiveDb.calls, ["close"]);
  });
});
