// Project/App: GSD-2
// File Purpose: Tests for DB transaction depth and rollback helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createDbTransactionRunner, type DbTransactionControls } from "../db-transaction.ts";

class FakeTransactionControls implements DbTransactionControls {
  readonly calls: string[] = [];
  failCall = new Set<string>();

  begin(): void {
    this.record("BEGIN");
  }

  beginRead(): void {
    this.record("BEGIN DEFERRED");
  }

  commit(): void {
    this.record("COMMIT");
  }

  rollback(): void {
    this.record("ROLLBACK");
  }

  private record(call: string): void {
    this.calls.push(call);
    if (this.failCall.has(call)) throw new Error(`failed ${call}`);
  }
}

describe("db-transaction", () => {
  test("commits successful write transactions", () => {
    const runner = createDbTransactionRunner();
    const controls = new FakeTransactionControls();

    const result = runner.transaction(controls, () => {
      assert.equal(runner.isInTransaction(), true);
      return "ok";
    });

    assert.equal(result, "ok");
    assert.equal(runner.isInTransaction(), false);
    assert.deepEqual(controls.calls, ["BEGIN", "COMMIT"]);
  });

  test("rolls back failed write transactions and clears depth", () => {
    const runner = createDbTransactionRunner();
    const controls = new FakeTransactionControls();

    assert.throws(
      () => runner.transaction(controls, () => {
        throw new Error("boom");
      }),
      /boom/,
    );

    assert.equal(runner.isInTransaction(), false);
    assert.deepEqual(controls.calls, ["BEGIN", "ROLLBACK"]);
  });

  test("nested transactions do not issue nested BEGIN or COMMIT", () => {
    const runner = createDbTransactionRunner();
    const controls = new FakeTransactionControls();

    runner.transaction(controls, () => {
      runner.transaction(controls, () => {
        assert.equal(runner.isInTransaction(), true);
      });
    });

    assert.deepEqual(controls.calls, ["BEGIN", "COMMIT"]);
  });

  test("failed BEGIN does not mark transaction depth active", () => {
    const runner = createDbTransactionRunner();
    const controls = new FakeTransactionControls();
    controls.failCall.add("BEGIN");

    assert.throws(() => runner.transaction(controls, () => undefined), /failed BEGIN/);

    assert.equal(runner.isInTransaction(), false);
    assert.deepEqual(controls.calls, ["BEGIN"]);
  });

  test("read transactions log rollback failures and clear depth", () => {
    const runner = createDbTransactionRunner();
    const controls = new FakeTransactionControls();
    const rollbackErrors: Error[] = [];
    controls.failCall.add("ROLLBACK");

    assert.throws(
      () => runner.readTransaction(
        controls,
        () => {
          throw new Error("read failed");
        },
        (error) => rollbackErrors.push(error),
      ),
      /read failed/,
    );

    assert.equal(runner.isInTransaction(), false);
    assert.deepEqual(controls.calls, ["BEGIN DEFERRED", "ROLLBACK"]);
    assert.equal(rollbackErrors.length, 1);
    assert.match(rollbackErrors[0].message, /failed ROLLBACK/);
  });
});
