// Project/App: GSD-2
// File Purpose: Tests for pre-migration database backup helper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { backupDatabaseBeforeMigration } from "../db-migration-backup.ts";
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
  failCheckpoint = false;

  exec(sql: string): void {
    this.execCalls.push(sql);
    if (this.failCheckpoint) throw new Error("checkpoint failed");
  }

  prepare(): DbStatement {
    return new FakeStatement();
  }

  close(): void {}
}

describe("db-migration-backup", () => {
  test("skips missing, memory, and already-backed-up databases", () => {
    const db = new FakeAdapter();
    const copies: Array<[string, string]> = [];
    const warnings: string[] = [];

    backupDatabaseBeforeMigration(db, null, 7, {
      existsSync: () => true,
      copyFileSync: (src, dest) => copies.push([src, dest]),
      logWarning: (_scope, message) => warnings.push(message),
    });
    backupDatabaseBeforeMigration(db, ":memory:", 7, {
      existsSync: () => true,
      copyFileSync: (src, dest) => copies.push([src, dest]),
      logWarning: (_scope, message) => warnings.push(message),
    });
    backupDatabaseBeforeMigration(db, "/tmp/gsd.db", 7, {
      existsSync: (path) => path.endsWith(".backup-v7"),
      copyFileSync: (src, dest) => copies.push([src, dest]),
      logWarning: (_scope, message) => warnings.push(message),
    });

    assert.deepEqual(copies, []);
    assert.deepEqual(warnings, []);
    assert.deepEqual(db.execCalls, []);
  });

  test("checkpoints before copying a file-backed database", () => {
    const db = new FakeAdapter();
    const copies: Array<[string, string]> = [];

    backupDatabaseBeforeMigration(db, "/tmp/gsd.db", 12, {
      existsSync: (path) => path === "/tmp/gsd.db",
      copyFileSync: (src, dest) => copies.push([src, dest]),
      logWarning: () => assert.fail("should not warn"),
    });

    assert.deepEqual(db.execCalls, ["PRAGMA wal_checkpoint(TRUNCATE)"]);
    assert.deepEqual(copies, [["/tmp/gsd.db", "/tmp/gsd.db.backup-v12"]]);
  });

  test("continues copying when checkpoint fails and warns when copy fails", () => {
    const db = new FakeAdapter();
    db.failCheckpoint = true;
    const copies: Array<[string, string]> = [];
    const warnings: string[] = [];

    backupDatabaseBeforeMigration(db, "/tmp/gsd.db", 12, {
      existsSync: (path) => path === "/tmp/gsd.db",
      copyFileSync: (src, dest) => copies.push([src, dest]),
      logWarning: (_scope, message) => warnings.push(message),
    });

    assert.deepEqual(copies, [["/tmp/gsd.db", "/tmp/gsd.db.backup-v12"]]);

    backupDatabaseBeforeMigration(db, "/tmp/fail.db", 13, {
      existsSync: (path) => path === "/tmp/fail.db",
      copyFileSync: () => {
        throw new Error("read only");
      },
      logWarning: (_scope, message) => warnings.push(message),
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Pre-migration backup failed: read only/);
  });
});
