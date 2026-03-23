/**
 * Rogue file detection tests — verifies that detectRogueFileWrites()
 * correctly identifies summary files written directly to disk without
 * a corresponding DB completion record.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { detectRogueFileWrites } from "../auto-post-unit.ts";
import { openDatabase, closeDatabase, isDbAvailable, insertMilestone, insertSlice, insertTask, updateSliceStatus } from "../gsd-db.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTmpBase(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "gsd-rogue-test-")));
}

/**
 * Create a minimal .gsd/ directory structure with a task summary file.
 */
function createTaskSummaryOnDisk(basePath: string, mid: string, sid: string, tid: string): string {
  const tasksDir = join(basePath, ".gsd", "milestones", mid, "slices", sid, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  const summaryFile = join(tasksDir, `${tid}-SUMMARY.md`);
  writeFileSync(summaryFile, `---\nid: ${tid}\nparent: ${sid}\nmilestone: ${mid}\n---\n# ${tid}: Test\n`, "utf-8");
  return summaryFile;
}

/**
 * Create a minimal .gsd/ directory structure with a slice summary file.
 */
function createSliceSummaryOnDisk(basePath: string, mid: string, sid: string): string {
  const sliceDir = join(basePath, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(sliceDir, { recursive: true });
  const summaryFile = join(sliceDir, `${sid}-SUMMARY.md`);
  writeFileSync(summaryFile, `---\nid: ${sid}\nmilestone: ${mid}\n---\n# ${sid}: Test Slice\n`, "utf-8");
  return summaryFile;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("rogue detection: task summary on disk, no DB row → detected as rogue", () => {
  const basePath = createTmpBase();
  const dbPath = join(basePath, ".gsd", "gsd.db");
  mkdirSync(join(basePath, ".gsd"), { recursive: true });

  try {
    openDatabase(dbPath);
    assert.ok(isDbAvailable(), "DB should be available");

    const summaryPath = createTaskSummaryOnDisk(basePath, "M001", "S01", "T01");
    assert.ok(existsSync(summaryPath), "Summary file should exist on disk");

    const rogues = detectRogueFileWrites("execute-task", "M001/S01/T01", basePath);
    assert.equal(rogues.length, 1, "Should detect one rogue file");
    assert.equal(rogues[0].path, summaryPath);
    assert.equal(rogues[0].unitType, "execute-task");
    assert.equal(rogues[0].unitId, "M001/S01/T01");
  } finally {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("rogue detection: task summary on disk, DB row with status 'complete' → NOT rogue", () => {
  const basePath = createTmpBase();
  const dbPath = join(basePath, ".gsd", "gsd.db");
  mkdirSync(join(basePath, ".gsd"), { recursive: true });

  try {
    openDatabase(dbPath);

    createTaskSummaryOnDisk(basePath, "M001", "S01", "T01");

    // Insert parent milestone and slice first (foreign key constraints)
    insertMilestone({ id: "M001" });
    insertSlice({ milestoneId: "M001", id: "S01" });

    // Insert a completed task row into the DB (INSERT OR REPLACE)
    insertTask({
      milestoneId: "M001",
      sliceId: "S01",
      id: "T01",
      title: "Test Task",
      status: "complete",
      oneLiner: "Test",
    });

    const rogues = detectRogueFileWrites("execute-task", "M001/S01/T01", basePath);
    assert.equal(rogues.length, 0, "Should NOT detect rogue when DB row is complete");
  } finally {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("rogue detection: no summary file on disk → NOT rogue regardless of DB state", () => {
  const basePath = createTmpBase();
  const dbPath = join(basePath, ".gsd", "gsd.db");
  mkdirSync(join(basePath, ".gsd"), { recursive: true });

  try {
    openDatabase(dbPath);

    // Don't create any summary file on disk
    const rogues = detectRogueFileWrites("execute-task", "M001/S01/T01", basePath);
    assert.equal(rogues.length, 0, "Should NOT detect rogue when no file on disk");
  } finally {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("rogue detection: DB not available → returns empty array (graceful degradation)", () => {
  const basePath = createTmpBase();

  try {
    closeDatabase();
    assert.ok(!isDbAvailable(), "DB should not be available");

    // Create a file on disk even though DB is closed
    createTaskSummaryOnDisk(basePath, "M001", "S01", "T01");

    const rogues = detectRogueFileWrites("execute-task", "M001/S01/T01", basePath);
    assert.equal(rogues.length, 0, "Should return empty array when DB unavailable");
  } finally {
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("rogue detection: slice summary on disk, no DB row → detected as rogue", () => {
  const basePath = createTmpBase();
  const dbPath = join(basePath, ".gsd", "gsd.db");
  mkdirSync(join(basePath, ".gsd"), { recursive: true });

  try {
    openDatabase(dbPath);

    const summaryPath = createSliceSummaryOnDisk(basePath, "M001", "S01");
    assert.ok(existsSync(summaryPath), "Slice summary file should exist on disk");

    const rogues = detectRogueFileWrites("complete-slice", "M001/S01", basePath);
    assert.equal(rogues.length, 1, "Should detect one rogue slice file");
    assert.equal(rogues[0].path, summaryPath);
    assert.equal(rogues[0].unitType, "complete-slice");
    assert.equal(rogues[0].unitId, "M001/S01");
  } finally {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  }
});

test("rogue detection: slice summary on disk, DB row with status 'complete' → NOT rogue", () => {
  const basePath = createTmpBase();
  const dbPath = join(basePath, ".gsd", "gsd.db");
  mkdirSync(join(basePath, ".gsd"), { recursive: true });

  try {
    openDatabase(dbPath);

    createSliceSummaryOnDisk(basePath, "M001", "S01");

    // Insert parent milestone first (foreign key constraint)
    insertMilestone({ id: "M001" });

    // Insert a slice row, then update to complete
    insertSlice({
      milestoneId: "M001",
      id: "S01",
      title: "Test Slice",
      status: "complete",
    });
    updateSliceStatus("M001", "S01", "complete", new Date().toISOString());

    const rogues = detectRogueFileWrites("complete-slice", "M001/S01", basePath);
    assert.equal(rogues.length, 0, "Should NOT detect rogue when slice DB row is complete");
  } finally {
    closeDatabase();
    rmSync(basePath, { recursive: true, force: true });
  }
});
