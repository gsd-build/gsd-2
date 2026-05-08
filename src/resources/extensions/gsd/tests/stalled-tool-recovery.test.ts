/**
 * Regression test for #1855: Stalled tool detection crashes with
 * "The path argument must be of type string. Received undefined"
 *
 * When a tool stalls in-flight for 10+ minutes, the idle watchdog fires
 * recoverTimedOutUnit(). In auto/phases.ts, buildRecoveryContext was
 * returning an empty object `{}`, so basePath was undefined. The recovery
 * code passed undefined to readUnitRuntimeRecord → runtimePath → join(),
 * which throws a TypeError. The session is permanently frozen because the
 * error propagates into the idle watchdog catch handler but the unit
 * promise is never resolved.
 *
 * This test calls recoverTimedOutUnit with an empty RecoveryContext (the
 * bug) and verifies it crashes, then calls it with a valid RecoveryContext
 * (the fix) and verifies it does not crash.
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recoverTimedOutUnit, type RecoveryContext } from "../auto-timeout-recovery.ts";
import { closeDatabase, insertMilestone, insertSlice, insertTask, openDatabase } from "../gsd-db.ts";
import { test } from 'node:test';
import assert from 'node:assert/strict';


// Minimal mock for ExtensionContext — only the fields recoverTimedOutUnit touches.
function makeMockCtx() {
  return {
    ui: {
      notify: () => {},
    },
  } as any;
}

// Minimal mock for ExtensionAPI — only sendMessage is called during recovery.
function makeMockPi() {
  return {
    sendMessage: () => {},
  } as any;
}

function makeRecordingPi() {
  const messages: unknown[] = [];
  return {
    messages,
    sendMessage: (message: unknown) => { messages.push(message); },
  } as any;
}

// ═══ #1855: empty RecoveryContext (basePath undefined) crashes ════════════════

{
  console.log("\n=== #1855: recoverTimedOutUnit crashes when basePath is undefined ===");
  const ctx = makeMockCtx();
  const pi = makeMockPi();

  // Simulate the bug: buildRecoveryContext returns {} (empty object).
  // basePath is undefined, which causes join(undefined, ".gsd") to throw.
  const emptyRctx = {} as RecoveryContext;

  let crashed = false;
  try {
    await recoverTimedOutUnit(ctx, pi, "execute-task", "M001/S01/T01", "idle", emptyRctx);
  } catch (err: any) {
    crashed = true;
    assert.ok(
      err.message.includes("path") || err.message.includes("string") || err.code === "ERR_INVALID_ARG_TYPE",
      `should crash with path/type error, got: ${err.message}`,
    );
  }
  assert.ok(crashed, "should crash when basePath is undefined (reproduces #1855)");
}

// ═══ DB-complete execute-task recovery advances without steering ═════════════

{
  console.log("\n=== execute-task timeout recovery trusts closed DB status ===");
  const base = mkdtempSync(join(tmpdir(), "gsd-timeout-db-complete-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

  try {
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone", status: "active" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "in_progress" });
    insertTask({ id: "T01", milestoneId: "M001", sliceId: "S01", title: "Task", status: "complete" });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
      "# S01\n\n## Tasks\n\n- [ ] **T01: Task** `est:10m`\n",
      "utf-8",
    );
    writeFileSync(join(base, ".gsd", "STATE.md"), "## Next Action\nExecute T01 for S01: Task\n", "utf-8");

    const ctx = makeMockCtx();
    const pi = makeRecordingPi();
    const result = await recoverTimedOutUnit(ctx, pi, "execute-task", "M001/S01/T01", "idle", {
      basePath: base,
      verbose: false,
      currentUnitStartedAt: Date.now(),
      unitRecoveryCount: new Map(),
    });

    assert.equal(result, "recovered", "db-complete task should recover immediately");
    assert.equal(pi.messages.length, 0, "db-complete task should not send steering recovery");
    const runtime = JSON.parse(readFileSync(join(base, ".gsd", "runtime", "units", "execute-task-M001-S01-T01.json"), "utf-8"));
    assert.equal(runtime.phase, "finalized", "db-complete task should be finalized");
    assert.equal(runtime.recovery.dbComplete, true, "runtime recovery should record DB completion");
  } finally {
    closeDatabase();
    rmSync(base, { recursive: true, force: true });
  }
}

// ═══ #1855: valid RecoveryContext does not crash ═════════════════════════════

{
  console.log("\n=== #1855: recoverTimedOutUnit succeeds with valid RecoveryContext ===");
  const base = mkdtempSync(join(tmpdir(), "gsd-stalled-tool-test-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  mkdirSync(join(base, ".gsd", "runtime", "units"), { recursive: true });

  try {
    const ctx = makeMockCtx();
    const pi = makeMockPi();

    const validRctx: RecoveryContext = {
      basePath: base,
      verbose: false,
      currentUnitStartedAt: Date.now(),
      unitRecoveryCount: new Map(),
    };

    let crashed = false;
    let result: string | undefined;
    try {
      result = await recoverTimedOutUnit(ctx, pi, "execute-task", "M001/S01/T01", "idle", validRctx);
    } catch (err: any) {
      crashed = true;
      console.error(`  Unexpected crash: ${err.message}`);
    }
    assert.ok(!crashed, "should not crash with valid basePath");
    // With no runtime record on disk and recoveryAttempts=0, the function
    // should attempt steering recovery (sendMessage) and return "recovered".
    assert.ok(result === "recovered", `should return 'recovered', got '${result}'`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
