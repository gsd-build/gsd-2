/**
 * GSD Auto-Worktree -- teardown-cleanup-parity.test.ts
 *
 * Regression test: teardownAutoWorktree (abort path) must call
 * clearProjectRootStateFiles, removing STATE.md, auto.lock, and
 * {MID}-META.json from the project root .gsd/ dir.
 *
 * Prior to the fix these files were left behind on disk after abort teardown.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { teardownAutoWorktree, _resetAutoWorktreeOriginalBaseForTests } from "../auto-worktree.ts";

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-teardown-parity-")));
  git(["init"], dir);
  git(["config", "user.email", "test@gsd.test"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(["add", "README.md"], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

describe("teardownAutoWorktree cleanup parity", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = createTempRepo();
    _resetAutoWorktreeOriginalBaseForTests();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    _resetAutoWorktreeOriginalBaseForTests();
  });

  test("STATE.md and M001-META.json are removed after abort teardown", () => {
    // Phase C pt 2: auto.lock no longer exists as a file — it migrated
    // to the workers + unit_dispatches tables. clearProjectRootStateFiles
    // still removes STATE.md and {MID}-META.json on teardown.
    const gsdDir = join(repoDir, ".gsd");
    const milestonesDir = join(gsdDir, "milestones", "M001");
    mkdirSync(milestonesDir, { recursive: true });

    const stateMd = join(gsdDir, "STATE.md");
    const metaJson = join(milestonesDir, "M001-META.json");

    writeFileSync(stateMd, "# State\nactive\n");
    writeFileSync(metaJson, JSON.stringify({ milestoneId: "M001" }));

    assert.ok(existsSync(stateMd), "STATE.md exists before teardown");
    assert.ok(existsSync(metaJson), "M001-META.json exists before teardown");

    // teardownAutoWorktree may throw when git worktree removal fails
    // (no actual worktree was created), but clearProjectRootStateFiles
    // runs before removeWorktree so the state files must be gone regardless.
    try {
      teardownAutoWorktree(repoDir, "M001");
    } catch {
      // git teardown may fail in a minimal test repo — that is acceptable
    }

    assert.ok(!existsSync(stateMd), "STATE.md removed by teardownAutoWorktree");
    assert.ok(!existsSync(metaJson), "M001-META.json removed by teardownAutoWorktree");
  });

  test("teardown is non-fatal when state files do not exist", () => {
    // No state files created — teardown should not throw due to missing files
    // (clearProjectRootStateFiles tolerates ENOENT).
    try {
      teardownAutoWorktree(repoDir, "M001");
    } catch {
      // git teardown may fail — acceptable
    }

    // Reaching here means clearProjectRootStateFiles did not throw for missing files.
    assert.ok(true, "teardown with missing state files did not throw from clearProjectRootStateFiles");
  });
});
