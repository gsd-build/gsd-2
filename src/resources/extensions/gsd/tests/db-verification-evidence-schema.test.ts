// Project/App: GSD-2
// File Purpose: Tests for verification evidence schema helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeVerificationEvidenceRows,
  ensureVerificationEvidenceDedupIndex,
} from "../db-verification-evidence-schema.ts";
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
  hasDedupIndex = false;

  exec(sql: string): void {
    this.execCalls.push(sql);
  }

  prepare(): DbStatement {
    return new FakeStatement(this.hasDedupIndex ? { present: 1 } : undefined);
  }

  close(): void {}
}

describe("db-verification-evidence-schema", () => {
  test("dedupeVerificationEvidenceRows keeps the first row for each evidence identity", () => {
    const db = new FakeAdapter();

    dedupeVerificationEvidenceRows(db);

    assert.equal(db.execCalls.length, 1);
    assert.match(db.execCalls[0], /DELETE FROM verification_evidence/);
    assert.match(db.execCalls[0], /GROUP BY task_id, slice_id, milestone_id, command, verdict/);
  });

  test("ensureVerificationEvidenceDedupIndex dedupes before creating the unique index", () => {
    const db = new FakeAdapter();

    ensureVerificationEvidenceDedupIndex(db);

    assert.equal(db.execCalls.length, 2);
    assert.match(db.execCalls[0], /DELETE FROM verification_evidence/);
    assert.match(db.execCalls[1], /CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_evidence_dedup/);
  });

  test("ensureVerificationEvidenceDedupIndex no-ops when the index already exists", () => {
    const db = new FakeAdapter();
    db.hasDedupIndex = true;

    ensureVerificationEvidenceDedupIndex(db);

    assert.deepEqual(db.execCalls, []);
  });
});
