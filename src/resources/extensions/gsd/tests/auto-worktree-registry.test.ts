// GSD-2 + Unit tests for the workspace registry that replaced the originalBase singleton

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  getAutoWorktreeOriginalBase,
  getActiveAutoWorktreeContext,
  _resetAutoWorktreeOriginalBaseForTests,
  createAutoWorktree,
  enterAutoWorktree,
  teardownAutoWorktree,
} from "../auto-worktree.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Safe: all inputs below are hardcoded test strings, not user input.
function git(subArgs: string[], cwd: string): void {
  execFileSync("git", subArgs, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function createTempRepo(t: { after: (fn: () => void) => void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "awreg-test-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(["init"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("auto-worktree workspace registry", () => {
  const savedCwd = process.cwd();

  beforeEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
    process.chdir(savedCwd);
  });

  test("getAutoWorktreeOriginalBase() is null at baseline", () => {
    assert.strictEqual(getAutoWorktreeOriginalBase(), null);
  });

  test("getActiveAutoWorktreeContext() is null at baseline", () => {
    assert.strictEqual(getActiveAutoWorktreeContext(), null);
  });

  test("_resetAutoWorktreeOriginalBaseForTests() clears the registry — idempotent", () => {
    _resetAutoWorktreeOriginalBaseForTests();
    assert.strictEqual(getAutoWorktreeOriginalBase(), null);
    _resetAutoWorktreeOriginalBaseForTests();
    assert.strictEqual(getAutoWorktreeOriginalBase(), null);
  });

  test("behavioral equivalence: createAutoWorktree populates registry; teardown clears it", (t) => {
    const tempDir = createTempRepo(t);
    const msDir = join(tempDir, ".gsd", "milestones", "M001");
    mkdirSync(msDir, { recursive: true });
    writeFileSync(join(msDir, "CONTEXT.md"), "# M001 Context\n");
    git(["add", "."], tempDir);
    git(["commit", "-m", "add milestone"], tempDir);

    // Before entering: registry must be empty
    assert.strictEqual(getAutoWorktreeOriginalBase(), null,
      "originalBase is null before entering worktree");

    createAutoWorktree(tempDir, "M001");

    // After enter: getAutoWorktreeOriginalBase must equal tempDir
    assert.strictEqual(
      getAutoWorktreeOriginalBase(),
      tempDir,
      "getAutoWorktreeOriginalBase() returns projectRoot after createAutoWorktree",
    );

    // getActiveAutoWorktreeContext must return the correct shape
    const ctx = getActiveAutoWorktreeContext();
    assert.ok(ctx !== null, "context is non-null inside worktree");
    assert.strictEqual(ctx.originalBase, tempDir, "context.originalBase matches tempDir");
    assert.strictEqual(ctx.worktreeName, "M001", "context.worktreeName is M001");
    assert.strictEqual(ctx.branch, "milestone/M001", "context.branch is milestone/M001");

    // Teardown: registry must be cleared
    teardownAutoWorktree(tempDir, "M001");

    assert.strictEqual(getAutoWorktreeOriginalBase(), null,
      "getAutoWorktreeOriginalBase() is null after teardown");
    assert.strictEqual(getActiveAutoWorktreeContext(), null,
      "getActiveAutoWorktreeContext() is null after teardown");

    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });

  test("behavioral equivalence: enterAutoWorktree also populates registry", (t) => {
    const tempDir = createTempRepo(t);
    const msDir = join(tempDir, ".gsd", "milestones", "M002");
    mkdirSync(msDir, { recursive: true });
    writeFileSync(join(msDir, "CONTEXT.md"), "# M002 Context\n");
    git(["add", "."], tempDir);
    git(["commit", "-m", "add milestone"], tempDir);

    createAutoWorktree(tempDir, "M002");

    // Simulate leaving the worktree (crash/pause)
    _resetAutoWorktreeOriginalBaseForTests();
    process.chdir(tempDir);

    assert.strictEqual(getAutoWorktreeOriginalBase(), null,
      "registry is empty after manual reset");

    // Re-enter via enterAutoWorktree
    enterAutoWorktree(tempDir, "M002");

    assert.strictEqual(
      getAutoWorktreeOriginalBase(),
      tempDir,
      "getAutoWorktreeOriginalBase() returns projectRoot after enterAutoWorktree",
    );
    const ctx = getActiveAutoWorktreeContext();
    assert.ok(ctx !== null, "context is non-null after re-entry");
    assert.strictEqual(ctx.originalBase, tempDir);
    assert.strictEqual(ctx.worktreeName, "M002");
    assert.strictEqual(ctx.branch, "milestone/M002");

    teardownAutoWorktree(tempDir, "M002");
    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });

  test("single-occupancy: entering a new workspace replaces the previous one", (t) => {
    const dir1 = createTempRepo(t);
    const dir2 = createTempRepo(t);

    // Set up milestone in dir1
    const ms1Dir = join(dir1, ".gsd", "milestones", "M010");
    mkdirSync(ms1Dir, { recursive: true });
    writeFileSync(join(ms1Dir, "CONTEXT.md"), "# M010\n");
    git(["add", "."], dir1);
    git(["commit", "-m", "add milestone"], dir1);

    // Set up milestone in dir2
    const ms2Dir = join(dir2, ".gsd", "milestones", "M020");
    mkdirSync(ms2Dir, { recursive: true });
    writeFileSync(join(ms2Dir, "CONTEXT.md"), "# M020\n");
    git(["add", "."], dir2);
    git(["commit", "-m", "add milestone"], dir2);

    // Enter dir1/M010
    createAutoWorktree(dir1, "M010");
    assert.strictEqual(getAutoWorktreeOriginalBase(), dir1,
      "registry holds dir1 after entering M010");

    // Tear down dir1 cleanly
    teardownAutoWorktree(dir1, "M010");
    assert.strictEqual(getAutoWorktreeOriginalBase(), null, "registry cleared after M010 teardown");

    // Enter dir2/M020 — registry should now hold dir2 only
    createAutoWorktree(dir2, "M020");
    assert.strictEqual(getAutoWorktreeOriginalBase(), dir2,
      "registry holds dir2 after entering M020 (single-occupancy preserved)");
    assert.notStrictEqual(getAutoWorktreeOriginalBase(), dir1,
      "dir1 is no longer in the registry");

    teardownAutoWorktree(dir2, "M020");
    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });
});
