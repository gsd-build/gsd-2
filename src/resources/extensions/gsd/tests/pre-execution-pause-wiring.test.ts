// Project/App: GSD-2
// File Purpose: Integration tests for pre-execution check pause wiring.
/**
 * pre-execution-pause-wiring.test.ts — Integration tests for pre-execution check → pauseAuto wiring.
 *
 * Tests that verify the control flow from pre-execution checks through to pauseAuto:
 *   1. When runPreExecutionChecks returns status: "fail" with blocking: true, pauseAuto is called
 *   2. When enhanced_verification_strict: true and status: "warn", pauseAuto is also called
 *
 * These are integration-level tests that exercise the actual postUnitPostVerification function
 * with controlled mocks for external dependencies.
 */

import { describe, test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import { postUnitPostVerification, type PostUnitContext } from "../auto-post-unit.ts";
import { AutoSession } from "../auto/session.ts";
import { openDatabase, closeDatabase, insertMilestone, insertSlice, insertTask, _getAdapter, insertReplanHistory } from "../gsd-db.ts";
import { invalidateAllCaches } from "../cache.ts";
import { _clearGsdRootCache } from "../paths.ts";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

let tempDir: string;
let dbPath: string;
let originalCwd: string;

function resetAllCaches(): void {
  invalidateAllCaches();
  _clearGsdRootCache();
}

/**
 * Create a minimal mock ExtensionContext.
 */
function makeMockCtx() {
  return {
    ui: {
      notify: mock.fn(),
      setStatus: () => {},
      setWidget: () => {},
      setFooter: () => {},
    },
    model: { id: "test-model" },
  } as any;
}

/**
 * Create a minimal mock ExtensionAPI.
 */
function makeMockPi() {
  return {
    sendMessage: mock.fn(),
    setModel: mock.fn(async () => true),
  } as any;
}

/**
 * Create a minimal AutoSession for testing.
 */
function makeMockSession(basePath: string, currentUnit?: { type: string; id: string }): AutoSession {
  const s = new AutoSession();
  s.basePath = basePath;
  s.active = true;
  if (currentUnit) {
    s.currentUnit = {
      type: currentUnit.type,
      id: currentUnit.id,
      startedAt: Date.now(),
    };
  }
  return s;
}

/**
 * Create a PostUnitContext with a mockable pauseAuto.
 */
function makePostUnitContext(
  s: AutoSession,
  ctx: ReturnType<typeof makeMockCtx>,
  pi: ReturnType<typeof makeMockPi>,
  pauseAutoMock: ReturnType<typeof mock.fn>,
): PostUnitContext {
  return {
    s,
    ctx,
    pi,
    buildSnapshotOpts: () => ({}),
    lockBase: () => tempDir,
    stopAuto: mock.fn(async () => {}) as unknown as PostUnitContext["stopAuto"],
    pauseAuto: pauseAutoMock as unknown as PostUnitContext["pauseAuto"],
    updateProgressWidget: () => {},
  };
}

/**
 * Set up a temp directory with GSD structure and DB.
 * Also changes cwd so preferences loading finds the right PREFERENCES.md.
 */
function setupTestEnvironment(): void {
  // Save original cwd so we can restore it
  originalCwd = process.cwd();
  
  tempDir = join(tmpdir(), `pre-exec-pause-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  
  // Create .gsd directory structure
  const gsdDir = join(tempDir, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  
  // Create milestones directory structure
  const milestonesDir = join(gsdDir, "milestones", "M001", "slices", "S01", "tasks");
  mkdirSync(milestonesDir, { recursive: true });
  
  // Change cwd so loadEffectiveGSDPreferences finds our PREFERENCES.md
  process.chdir(tempDir);
  
  // Clear caches so it finds the new .gsd directory and preferences.
  resetAllCaches();
  
  // Initialize DB
  dbPath = join(gsdDir, "gsd.db");
  openDatabase(dbPath);
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment(): void {
  // Restore original cwd before cleanup
  try {
    process.chdir(originalCwd);
  } catch {
    // Ignore if original cwd doesn't exist
  }
  
  try {
    closeDatabase();
  } catch {
    // Ignore close errors
  }
  resetAllCaches();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a PREFERENCES.md file with specified preferences.
 * Uses YAML frontmatter format (---\nkey: value\n---).
 * Also invalidates caches so the preferences are re-read.
 */
function writePreferences(prefs: Record<string, unknown>): void {
  const yamlLines = Object.entries(prefs).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  const prefsContent = `---
${yamlLines.join("\n")}
---

# GSD Preferences
`;
  writeFileSync(join(tempDir, ".gsd", "PREFERENCES.md"), prefsContent);
  // Invalidate caches so the new preferences file is found
  resetAllCaches();
}

/**
 * Create tasks in DB that will cause pre-execution checks to fail.
 * A task that references a non-existent file will produce a blocking failure.
 */
function createFailingTasks(): void {
  // Insert milestone first
  insertMilestone({ id: "M001" });

  // Insert slice
  insertSlice({
    id: "S01",
    milestoneId: "M001",
    title: "Test Slice",
    risk: "low",
  });

  // Create a task that references a file that doesn't exist
  // This will cause checkFilePathConsistency to produce a blocking failure
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: "M001",
    title: "Task with missing file",
    status: "pending",
    planning: {
      description: "This task references a non-existent file",
      estimate: "1h",
      files: [],
      verify: "npm test",
      inputs: [
        "nonexistent-file-that-does-not-exist.ts",
        "missing-second-file.ts",
        "missing-third-file.ts",
        "missing-fourth-file.ts",
      ],
      expectedOutput: [],
      observabilityImpact: "",
    },
    sequence: 0,
  });
}

/**
 * Create tasks in DB that will produce only warnings (non-blocking issues).
 * Interface contract mismatches produce warnings, not blocking failures.
 */
function createWarningOnlyTasks(): void {
  // Insert milestone first
  insertMilestone({ id: "M001" });

  // Insert slice
  insertSlice({
    id: "S01",
    milestoneId: "M001",
    title: "Test Slice",
    risk: "low",
  });

  // Create tasks with interface contract mismatch (produces warn, not fail)
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: "M001",
    title: "Task 1 with function signature",
    status: "pending",
    planning: {
      description: `
\`\`\`typescript
function processData(input: string): boolean
\`\`\`
      `.trim(),
      estimate: "1h",
      files: [],
      verify: "npm test",
      inputs: [],
      expectedOutput: [],
      observabilityImpact: "",
    },
    sequence: 0,
  });

  insertTask({
    id: "T02",
    sliceId: "S01",
    milestoneId: "M001",
    title: "Task 2 with mismatched signature",
    status: "pending",
    planning: {
      description: `
\`\`\`typescript
function processData(input: number): string
\`\`\`
      `.trim(),
      estimate: "1h",
      files: [],
      verify: "npm test",
      inputs: [],
      expectedOutput: [],
      observabilityImpact: "",
    },
    sequence: 1,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Pre-execution checks → pauseAuto wiring", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestEnvironment();
  });

  test("first pre-execution blocking failure triggers replan and does not pause", async () => {
    // Set up tasks that will cause a blocking failure
    createFailingTasks();

    // Create mocks
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "plan-slice", id: "M001/S01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    // Call postUnitPostVerification
    const result = await postUnitPostVerification(pctx);

    // Verify pauseAuto was NOT called on first failure (should replan instead)
    assert.equal(
      pauseAutoMock.mock.callCount(),
      0,
      "pauseAuto should not be called on first pre-execution failure"
    );

    // Verify return value is "continue" (dispatch loop should pick up replanning-slice)
    assert.equal(
      result,
      "continue",
      "postUnitPostVerification should return 'continue' on first pre-execution failure"
    );

    // Verify UI was notified that replan was triggered
    const notifyCalls = ctx.ui.notify.mock.calls;
    const warnNotify = notifyCalls.find(
      (call: { arguments: unknown[] }) =>
        call.arguments[1] === "warning" &&
        String(call.arguments[0]).includes("triggering replan")
    );
    assert.ok(warnNotify, "Should show warning notification that pre-exec failure triggered replan");

    const triggerPath = join(
      tempDir, ".gsd", "milestones", "M001", "slices", "S01", "S01-REPLAN-TRIGGER.md",
    );
    assert.ok(existsSync(triggerPath), "replan trigger file should be written on first pre-execution failure");
  });

  test("first pre-execution blocking failure writes replan trigger to canonicalProjectRoot, not worktree basePath", async () => {
    createFailingTasks();

    const worktreeDir = join(tempDir, "worktree");
    mkdirSync(worktreeDir, { recursive: true });

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(worktreeDir, { type: "plan-slice", id: "M001/S01" });
    Object.defineProperty(s, "canonicalProjectRoot", { get: () => tempDir });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    const result = await postUnitPostVerification(pctx);
    assert.equal(result, "continue");
    assert.equal(pauseAutoMock.mock.callCount(), 0);

    const canonicalTriggerPath = join(
      tempDir, ".gsd", "milestones", "M001", "slices", "S01", "S01-REPLAN-TRIGGER.md",
    );
    const worktreeTriggerPath = join(
      worktreeDir, ".gsd", "milestones", "M001", "slices", "S01", "S01-REPLAN-TRIGGER.md",
    );
    assert.ok(
      existsSync(canonicalTriggerPath),
      "replan trigger file should be written to canonicalProjectRoot",
    );
    assert.equal(
      existsSync(worktreeTriggerPath),
      false,
      "replan trigger file should not be written to worktree basePath",
    );
  });

  test("pre-execution blocking failure after prior replan pauses auto", async () => {
    createFailingTasks();
    insertReplanHistory({
      milestoneId: "M001",
      sliceId: "S01",
      summary: "prior replan already attempted",
    });

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "plan-slice", id: "M001/S01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    const result = await postUnitPostVerification(pctx);

    assert.equal(pauseAutoMock.mock.callCount(), 1, "pauseAuto should be called after a prior replan attempt");
    assert.equal(result, "stopped", "postUnitPostVerification should stop when pre-exec fails after replan");

    const notifyCalls = ctx.ui.notify.mock.calls;
    const errorNotify = notifyCalls.find(
      (call: { arguments: unknown[] }) =>
        call.arguments[1] === "error" &&
        String(call.arguments[0]).includes("failed after replan"),
    );
    assert.ok(errorNotify, "Should show escalation error notification when failure persists after replan");
  });

  test("pauseAuto is called when enhanced_verification_strict: true and pre-execution returns warn", async () => {
    // Write preferences with strict mode enabled
    writePreferences({
      enhanced_verification: true,
      enhanced_verification_pre: true,
      enhanced_verification_strict: true,
    });

    // Set up tasks that will produce only warnings (interface contract mismatch)
    createWarningOnlyTasks();

    // Create mocks
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "plan-slice", id: "M001/S01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    // Call postUnitPostVerification
    const result = await postUnitPostVerification(pctx);

    // Verify pauseAuto was called (strict mode promotes warnings to blocking)
    assert.equal(
      pauseAutoMock.mock.callCount(),
      1,
      "pauseAuto should be called when strict mode is enabled and pre-execution returns warn"
    );

    // Verify return value is "stopped"
    assert.equal(
      result,
      "stopped",
      "postUnitPostVerification should return 'stopped' when strict mode treats warnings as blocking"
    );

    // Verify UI was notified of the warning
    const notifyCalls = ctx.ui.notify.mock.calls;
    const warnNotify = notifyCalls.find(
      (call: { arguments: unknown[] }) =>
        call.arguments[1] === "warning" &&
        String(call.arguments[0]).includes("Pre-execution checks passed with warnings")
    );
    assert.ok(warnNotify, "Should show warning notification about pre-execution check warnings");
  });

  test("pauseAuto is NOT called when enhanced_verification_strict: false and pre-execution returns warn", async () => {
    // Write preferences with strict mode disabled (default behavior)
    writePreferences({
      enhanced_verification: true,
      enhanced_verification_pre: true,
      enhanced_verification_strict: false,
    });

    // Set up tasks that will produce only warnings
    createWarningOnlyTasks();

    // Create mocks
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "plan-slice", id: "M001/S01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    // Call postUnitPostVerification
    const result = await postUnitPostVerification(pctx);

    // Verify pauseAuto was NOT called (warnings don't block in non-strict mode)
    assert.equal(
      pauseAutoMock.mock.callCount(),
      0,
      "pauseAuto should NOT be called when strict mode is disabled and only warnings exist"
    );

    // Verify return value is "continue" (not "stopped")
    assert.equal(
      result,
      "continue",
      "postUnitPostVerification should return 'continue' when warnings don't block in non-strict mode"
    );
  });

  test("pre-execution checks are skipped when unit type is not plan-slice", async () => {
    // Set up tasks that would fail if checked
    createFailingTasks();

    // Create mocks with execute-task unit (not plan-slice)
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "execute-task", id: "M001/S01/T01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    // Call postUnitPostVerification
    const result = await postUnitPostVerification(pctx);

    // Verify pauseAuto was NOT called (pre-execution checks only run for plan-slice)
    assert.equal(
      pauseAutoMock.mock.callCount(),
      0,
      "pauseAuto should NOT be called for non-plan-slice unit types"
    );

    // Verify return value is "continue"
    assert.equal(
      result,
      "continue",
      "postUnitPostVerification should return 'continue' for non-plan-slice unit types"
    );
  });

  test("pre-execution checks are skipped when enhanced_verification_pre: false", async () => {
    // Write preferences with pre-execution checks disabled
    writePreferences({
      enhanced_verification: true,
      enhanced_verification_pre: false,
    });

    // Set up tasks that would fail if checked
    createFailingTasks();

    // Create mocks
    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "plan-slice", id: "M001/S01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    // Call postUnitPostVerification
    const result = await postUnitPostVerification(pctx);

    // Verify pauseAuto was NOT called (pre-execution checks disabled)
    assert.equal(
      pauseAutoMock.mock.callCount(),
      0,
      "pauseAuto should NOT be called when enhanced_verification_pre is disabled"
    );

    // Verify return value is "continue"
    assert.equal(
      result,
      "continue",
      "postUnitPostVerification should return 'continue' when pre-execution checks are disabled"
    );
  });

  test("files present in s.basePath (worktree) but absent from canonicalProjectRoot do not block", async () => {
    writePreferences({
      enhanced_verification: true,
      enhanced_verification_pre: true,
      enhanced_verification_strict: false,
    });

    // Regression: pre-exec checks used canonicalProjectRoot (project root), so
    // files that a prior slice created in the worktree were falsely flagged as
    // missing because they hadn't merged to main yet. Fix: use s.basePath.

    // Create a separate "worktree" directory with the referenced files present.
    const worktreeDir = join(tempDir, "worktree");
    mkdirSync(join(worktreeDir, "lib"), { recursive: true });
    mkdirSync(join(worktreeDir, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
    writeFileSync(join(worktreeDir, "lib", "types.ts"), "export type Habit = { id: string; name: string; };");
    writeFileSync(join(worktreeDir, "lib", "useLocalStorage.ts"), "export function useLocalStorage() {}");

    // The DB lives under tempDir (the "project root"). Insert slice + tasks.
    insertMilestone({ id: "M001" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Test Slice", risk: "low" });
    insertTask({
      id: "T01",
      sliceId: "S01",
      milestoneId: "M001",
      title: "Task that reads prior-slice files",
      status: "pending",
      planning: {
        description: "Reads lib/types.ts and lib/useLocalStorage.ts from prior slice",
        estimate: "1h",
        files: [],
        verify: "npm test",
        inputs: ["lib/types.ts", "lib/useLocalStorage.ts"],
        expectedOutput: ["lib/utils.ts"],
        observabilityImpact: "",
      },
      sequence: 0,
    });

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});

    // s.basePath = worktreeDir (files exist here)
    // Override canonicalProjectRoot → tempDir (files do NOT exist there)
    const s = makeMockSession(worktreeDir, { type: "plan-slice", id: "M001/S01" });
    Object.defineProperty(s, "canonicalProjectRoot", { get: () => tempDir });

    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);
    const result = await postUnitPostVerification(pctx);

    assert.equal(
      pauseAutoMock.mock.callCount(),
      0,
      "pauseAuto should NOT be called when referenced files exist in s.basePath (worktree)",
    );
    assert.equal(
      result,
      "continue",
      "postUnitPostVerification should return 'continue' when worktree files satisfy pre-exec inputs",
    );
  });

  test("files absent from s.basePath but present in canonicalProjectRoot do not block", async () => {
    writePreferences({
      enhanced_verification: true,
      enhanced_verification_pre: true,
      enhanced_verification_strict: false,
    });

    const worktreeDir = join(tempDir, "worktree-missing-src");
    mkdirSync(join(worktreeDir, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });

    mkdirSync(join(tempDir, "src", "engine"), { recursive: true });
    writeFileSync(join(tempDir, "src", "engine", "bus.ts"), "export const bus = {};");

    insertMilestone({ id: "M001" });
    insertSlice({ id: "S01", milestoneId: "M001", title: "Test Slice", risk: "low" });
    insertTask({
      id: "T01",
      sliceId: "S01",
      milestoneId: "M001",
      title: "Task that reads canonical-root source files",
      status: "pending",
      planning: {
        description: "Reads src/engine/bus.ts from canonical root",
        estimate: "1h",
        files: [],
        verify: "npm test",
        inputs: ["`src/engine/bus.ts` — lifecycle helper subscription API"],
        expectedOutput: ["src/engine/helper.ts"],
        observabilityImpact: "",
      },
      sequence: 0,
    });

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(worktreeDir, { type: "plan-slice", id: "M001/S01" });
    Object.defineProperty(s, "canonicalProjectRoot", { get: () => tempDir });

    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);
    const result = await postUnitPostVerification(pctx);

    assert.equal(
      pauseAutoMock.mock.callCount(),
      0,
      "pauseAuto should NOT be called when referenced files exist in canonicalProjectRoot",
    );
    assert.equal(
      result,
      "continue",
      "postUnitPostVerification should return 'continue' when canonical root files satisfy pre-exec inputs",
    );
  });

  test("uok gate runner persists pre-execution gate outcomes when enabled", async () => {
    writePreferences({
      enhanced_verification: true,
      enhanced_verification_pre: true,
      enhanced_verification_strict: true,
      uok: {
        enabled: true,
        gates: { enabled: true },
      },
    });

    createFailingTasks();

    const ctx = makeMockCtx();
    const pi = makeMockPi();
    const pauseAutoMock = mock.fn(async () => {});
    const s = makeMockSession(tempDir, { type: "plan-slice", id: "M001/S01" });
    const pctx = makePostUnitContext(s, ctx, pi, pauseAutoMock);

    const result = await postUnitPostVerification(pctx);
    assert.equal(result, "continue");

    const adapter = _getAdapter();
    const row = adapter
      ?.prepare(
        `SELECT gate_id, outcome, failure_class
         FROM gate_runs
         WHERE gate_id = 'pre-execution-checks'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { gate_id: string; outcome: string; failure_class: string } | undefined;

    assert.ok(row, "pre-execution gate run should be persisted when uok.gates is enabled");
    assert.equal(row?.gate_id, "pre-execution-checks");
    assert.equal(row?.outcome, "fail");
    assert.equal(row?.failure_class, "input");
  });
});
