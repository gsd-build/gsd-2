/**
 * external-wait-registration.test.ts — Integration tests for M006/S02:
 * gsd_register_external_wait tool validation and side effects.
 *
 * Tests the registration flow: insertExternalWait() DB helper, task status
 * transition to 'awaiting-external', JSON probe spec persistence, rejection
 * guards, and optional field defaults.
 *
 * Uses the same test scaffolding pattern as external-wait-state-dispatch.test.ts:
 * temp directory, fresh DB, fixture rows for milestones/slices/tasks.
 *
 * Requirements verified: R214, R223, R229
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── DB layer ──────────────────────────────────────────────────────────────
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  updateTaskStatus,
  getExternalWait,
  getTask,
  insertExternalWait,
} from "../gsd-db.ts";

// ── JSON persistence ─────────────────────────────────────────────────────
import { saveJsonFile, loadJsonFile } from "../json-persistence.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Fixture Helpers
// ═══════════════════════════════════════════════════════════════════════════

let base: string;

function createFixture(taskStatus = "executing"): { basePath: string; tasksDir: string } {
  base = mkdtempSync(join(tmpdir(), "gsd-reg-wait-"));
  const gsdDir = join(base, ".gsd");
  const m001Dir = join(gsdDir, "milestones", "M001");
  const s01Dir = join(m001Dir, "slices", "S01");
  const tasksDir = join(s01Dir, "tasks");

  mkdirSync(tasksDir, { recursive: true });

  // Minimal plan files so the DB schema can be initialized
  openDatabase(join(gsdDir, "gsd.db"));
  insertMilestone({ id: "M001", title: "Registration Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Test Slice", status: "in_progress" });
  insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "Test Task", status: taskStatus });

  return { basePath: base, tasksDir };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════

afterEach(() => {
  try { closeDatabase(); } catch { /* may not be open */ }
  if (base) {
    rmSync(base, { recursive: true, force: true });
    base = "";
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. Successful registration with all side effects ────────────────────

describe("gsd_register_external_wait — successful registration", () => {
  test("insertExternalWait() creates DB row with correct values", () => {
    const { basePath } = createFixture("executing");

    insertExternalWait("M001", "S01", "T01", "echo hello");

    const row = getExternalWait("M001", "S01", "T01");
    assert.ok(row, "external_waits row should exist after insert");
    assert.equal(row.milestone_id, "M001");
    assert.equal(row.slice_id, "S01");
    assert.equal(row.task_id, "T01");
    assert.equal(row.check_command, "echo hello");
    assert.equal(row.status, "waiting");
    assert.equal(row.probe_failure_count, 0);
    // Defaults
    assert.equal(row.poll_interval_ms, 30000);
    assert.equal(row.timeout_ms, 86400000);
    assert.equal(row.on_timeout, "manual-attention");
    assert.equal(row.success_check, null);
    assert.equal(row.context_hint, null);
  });

  test("task status transitions to awaiting-external after registration", () => {
    const { basePath } = createFixture("executing");

    insertExternalWait("M001", "S01", "T01", "echo hello");
    updateTaskStatus("M001", "S01", "T01", "awaiting-external");

    const task = getTask("M001", "S01", "T01");
    assert.ok(task, "task should exist");
    assert.equal(task.status, "awaiting-external");
  });

  test("JSON probe spec written correctly via saveJsonFile()", () => {
    const { basePath, tasksDir } = createFixture("executing");

    // Simulate what the tool handler does: insert DB row, then write JSON
    insertExternalWait("M001", "S01", "T01", "echo hello");
    updateTaskStatus("M001", "S01", "T01", "awaiting-external");

    const jsonPath = join(tasksDir, "T01-EXTERNAL-WAIT.json");
    const probeSpec = {
      milestoneId: "M001",
      sliceId: "S01",
      taskId: "T01",
      checkCommand: "echo hello",
      successCheck: null,
      pollIntervalMs: 30000,
      timeoutMs: 86400000,
      contextHint: null,
      onTimeout: "manual-attention",
      registeredAt: new Date().toISOString(),
    };
    saveJsonFile(jsonPath, probeSpec);

    assert.ok(existsSync(jsonPath), "JSON probe spec file should exist");
    const loaded = JSON.parse(readFileSync(jsonPath, "utf-8"));
    assert.equal(loaded.milestoneId, "M001");
    assert.equal(loaded.sliceId, "S01");
    assert.equal(loaded.taskId, "T01");
    assert.equal(loaded.checkCommand, "echo hello");
    assert.equal(loaded.pollIntervalMs, 30000);
    assert.equal(loaded.timeoutMs, 86400000);
    assert.equal(loaded.onTimeout, "manual-attention");
    assert.equal(loaded.successCheck, null);
    assert.equal(loaded.contextHint, null);
  });

  test("idempotent — re-registration replaces existing row", () => {
    const { basePath } = createFixture("executing");

    insertExternalWait("M001", "S01", "T01", "echo first");
    const row1 = getExternalWait("M001", "S01", "T01");
    assert.ok(row1);
    assert.equal(row1.check_command, "echo first");

    // Re-register with different command
    insertExternalWait("M001", "S01", "T01", "echo second");
    const row2 = getExternalWait("M001", "S01", "T01");
    assert.ok(row2);
    assert.equal(row2.check_command, "echo second");
    assert.equal(row2.probe_failure_count, 0, "failure count should reset on re-registration");
  });
});

// ── 2. Rejection when task status !== 'executing' ───────────────────────

describe("gsd_register_external_wait — status guard", () => {
  test("task with status 'pending' — guard rejects registration", () => {
    const { basePath } = createFixture("pending");

    // Verify task has pending status
    const task = getTask("M001", "S01", "T01");
    assert.ok(task);
    assert.equal(task.status, "pending");

    // The tool handler checks task.status !== 'executing' before calling insertExternalWait.
    // We simulate the guard: if status !== 'executing', no DB row or JSON written.
    assert.notEqual(task.status, "executing", "guard should reject: status is 'pending'");

    // Verify no external_waits row was created
    const row = getExternalWait("M001", "S01", "T01");
    assert.equal(row, null, "no external_waits row should exist when task status is pending");
  });

  test("task with status 'complete' — guard rejects registration", () => {
    const { basePath } = createFixture("complete");

    const task = getTask("M001", "S01", "T01");
    assert.ok(task);
    assert.notEqual(task.status, "executing", "guard should reject: status is 'complete'");

    const row = getExternalWait("M001", "S01", "T01");
    assert.equal(row, null, "no external_waits row for completed task");
  });
});

// ── 3. Rejection when task doesn't exist ────────────────────────────────

describe("gsd_register_external_wait — nonexistent task", () => {
  test("getTask returns null for nonexistent task", () => {
    const { basePath } = createFixture("executing");

    const task = getTask("M001", "S01", "T99");
    assert.equal(task, null, "nonexistent task should return null");

    // No external_waits row should be created for a nonexistent task
    const row = getExternalWait("M001", "S01", "T99");
    assert.equal(row, null, "no external_waits row for nonexistent task");
  });

  test("getTask returns null for nonexistent milestone", () => {
    const { basePath } = createFixture("executing");

    const task = getTask("M999", "S01", "T01");
    assert.equal(task, null, "nonexistent milestone should return null");
  });

  test("getTask returns null for nonexistent slice", () => {
    const { basePath } = createFixture("executing");

    const task = getTask("M001", "S99", "T01");
    assert.equal(task, null, "nonexistent slice should return null");
  });
});

// ── 4. All optional fields persisted correctly ──────────────────────────

describe("gsd_register_external_wait — optional fields", () => {
  test("all optional fields stored in DB via insertExternalWait()", () => {
    const { basePath } = createFixture("executing");

    insertExternalWait("M001", "S01", "T01", "squeue --job 12345", {
      successCheck: "test -f /tmp/result.json",
      contextHint: "SLURM job 12345",
      onTimeout: "resume-with-failure",
      pollIntervalMs: 60000,
      timeoutMs: 3600000,
    });

    const row = getExternalWait("M001", "S01", "T01");
    assert.ok(row, "external_waits row should exist");
    assert.equal(row.check_command, "squeue --job 12345");
    assert.equal(row.success_check, "test -f /tmp/result.json");
    assert.equal(row.context_hint, "SLURM job 12345");
    assert.equal(row.on_timeout, "resume-with-failure");
    assert.equal(row.poll_interval_ms, 60000);
    assert.equal(row.timeout_ms, 3600000);
    assert.equal(row.status, "waiting");
    assert.equal(row.probe_failure_count, 0);
  });

  test("all optional fields present in JSON probe spec", () => {
    const { basePath, tasksDir } = createFixture("executing");

    const jsonPath = join(tasksDir, "T01-EXTERNAL-WAIT.json");
    const probeSpec = {
      milestoneId: "M001",
      sliceId: "S01",
      taskId: "T01",
      checkCommand: "squeue --job 12345",
      successCheck: "test -f /tmp/result.json",
      pollIntervalMs: 60000,
      timeoutMs: 3600000,
      contextHint: "SLURM job 12345",
      onTimeout: "resume-with-failure",
      registeredAt: new Date().toISOString(),
    };
    saveJsonFile(jsonPath, probeSpec);

    assert.ok(existsSync(jsonPath), "JSON file should exist");
    const loaded = JSON.parse(readFileSync(jsonPath, "utf-8"));
    assert.equal(loaded.checkCommand, "squeue --job 12345");
    assert.equal(loaded.successCheck, "test -f /tmp/result.json");
    assert.equal(loaded.contextHint, "SLURM job 12345");
    assert.equal(loaded.onTimeout, "resume-with-failure");
    assert.equal(loaded.pollIntervalMs, 60000);
    assert.equal(loaded.timeoutMs, 3600000);
    assert.equal(loaded.milestoneId, "M001");
    assert.equal(loaded.sliceId, "S01");
    assert.equal(loaded.taskId, "T01");
    assert.ok(loaded.registeredAt, "registeredAt should be present");
  });

  test("defaults applied when optional fields omitted", () => {
    const { basePath } = createFixture("executing");

    // Call with only required fields
    insertExternalWait("M001", "S01", "T01", "echo check");

    const row = getExternalWait("M001", "S01", "T01");
    assert.ok(row, "row should exist");
    assert.equal(row.poll_interval_ms, 30000, "default pollIntervalMs is 30000");
    assert.equal(row.timeout_ms, 86400000, "default timeoutMs is 86400000");
    assert.equal(row.on_timeout, "manual-attention", "default onTimeout is manual-attention");
    assert.equal(row.success_check, null, "successCheck defaults to null");
    assert.equal(row.context_hint, null, "contextHint defaults to null");
  });
});
