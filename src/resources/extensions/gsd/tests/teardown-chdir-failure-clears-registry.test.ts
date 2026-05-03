// GSD-2 + Regression test: teardownAutoWorktree clears activeWorkspace even when process.chdir throws

/**
 * Regression (H3 broadened scope): `teardownAutoWorktree` must clear `activeWorkspace`
 * (and therefore `getAutoWorktreeOriginalBase()` / `getActiveAutoWorktreeContext()`)
 * unconditionally — regardless of where in the function body an error occurs.
 *
 * The original H3 fix (d1276b021) wrapped only `removeWorktree(...)` in a
 * try/finally. But `process.chdir(originalBasePath)` at the top of the function
 * can throw a GSDError if the target directory no longer exists. In that case
 * execution exits the function before ever reaching the inner try/finally, leaving
 * `activeWorkspace` stale.
 *
 * The fix: a single outer try/finally wraps the entire teardown body so
 * `setActiveWorkspace(null)` runs regardless of which step throws.
 *
 * Test strategy:
 *   1. Populate the registry via `createAutoWorktree` on a real temp git repo.
 *   2. Delete the repo directory so `process.chdir(originalBasePath)` throws.
 *   3. Assert `teardownAutoWorktree` re-throws (chdir failure still propagates).
 *   4. Assert `getActiveWorkspace()` is null — the broadened finally caught it.
 *   5. Regression: success path still clears activeWorkspace (same guarantee).
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  createAutoWorktree,
  teardownAutoWorktree,
  getAutoWorktreeOriginalBase,
  getActiveAutoWorktreeContext,
  _resetAutoWorktreeOriginalBaseForTests,
} from "../auto-worktree.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-chdir-fail-")));
  git(["init"], dir);
  git(["config", "user.email", "test@gsd.test"], dir);
  git(["config", "user.name", "Test"], dir);
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

function seedMilestone(repoDir: string, milestoneId: string): void {
  const msDir = join(repoDir, ".gsd", "milestones", milestoneId);
  mkdirSync(msDir, { recursive: true });
  writeFileSync(join(msDir, "CONTEXT.md"), `# ${milestoneId} Context\n`);
  git(["add", "."], repoDir);
  git(["commit", "-m", `add ${milestoneId}`], repoDir);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("teardown chdir failure clears registry", () => {
  const savedCwd = process.cwd();
  let repoDir: string;

  beforeEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
    process.chdir(savedCwd);
    repoDir = "";
  });

  afterEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
    process.chdir(savedCwd);
    if (repoDir && existsSync(repoDir)) {
      rmSync(repoDir, { recursive: true, force: true });
    }
    repoDir = "";
  });

  // ── chdir failure path (the new coverage) ──────────────────────────────────

  test("registry is null after teardown throws due to chdir failure (H3 broadened scope)", () => {
    repoDir = createTempRepo();
    seedMilestone(repoDir, "M001");

    // Populate the registry by entering the worktree
    createAutoWorktree(repoDir, "M001");

    assert.strictEqual(
      getAutoWorktreeOriginalBase(),
      repoDir,
      "registry is populated after createAutoWorktree",
    );
    assert.notStrictEqual(
      getActiveAutoWorktreeContext(),
      null,
      "context is non-null after createAutoWorktree",
    );

    // Move back to a safe cwd so we can delete the repo dir
    process.chdir(savedCwd);

    // Delete the repo directory — process.chdir(repoDir) inside teardown will throw
    const capturedRepoDir = repoDir;
    rmSync(repoDir, { recursive: true, force: true });
    repoDir = ""; // afterEach cleanup no longer needed

    // teardownAutoWorktree must throw (chdir to deleted dir fails)
    assert.throws(
      () => teardownAutoWorktree(capturedRepoDir, "M001"),
      "teardownAutoWorktree should throw when originalBasePath does not exist",
    );

    // The broadened outer finally must have cleared the registry despite the throw
    assert.strictEqual(
      getAutoWorktreeOriginalBase(),
      null,
      "getAutoWorktreeOriginalBase() is null after chdir-failure teardown (H3)",
    );
    assert.strictEqual(
      getActiveAutoWorktreeContext(),
      null,
      "getActiveAutoWorktreeContext() is null after chdir-failure teardown (H3)",
    );
  });

  // ── Success path (regression guard) ───────────────────────────────────────

  test("registry is null after successful teardown (success path regression)", () => {
    repoDir = createTempRepo();
    seedMilestone(repoDir, "M002");

    // Confirm baseline
    assert.strictEqual(getAutoWorktreeOriginalBase(), null, "registry null before entering worktree");

    createAutoWorktree(repoDir, "M002");

    assert.strictEqual(getAutoWorktreeOriginalBase(), repoDir, "registry set after createAutoWorktree");
    assert.notStrictEqual(getActiveAutoWorktreeContext(), null, "context non-null after createAutoWorktree");

    // Normal teardown — finally block must still clear registry
    teardownAutoWorktree(repoDir, "M002");

    assert.strictEqual(getAutoWorktreeOriginalBase(), null, "registry null after successful teardown");
    assert.strictEqual(getActiveAutoWorktreeContext(), null, "context null after successful teardown");
  });
});
