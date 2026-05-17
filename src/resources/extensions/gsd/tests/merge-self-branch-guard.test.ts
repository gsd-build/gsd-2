// gsd-2 / merge-self-branch-guard.test.ts — regressions for #5024 and #6250
//
// mergeMilestoneToMain() must recover from stale/corrupt integration metadata
// that points at milestone branches (integrationBranch recorded as
// "milestone/<MID>"). #6250 requires this to fall back to a safe integration
// target (configured/detected main branch) instead of failing forever.

import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { mergeMilestoneToMain } from "../auto-worktree.ts";
import { _resetServiceCache } from "../worktree.ts";
import { _clearGsdRootCache } from "../paths.ts";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "merge-self-guard-")));
  git(["init"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

function assertSelfMergeRefRecoversToMain(recordedIntegrationBranch: string): void {
  const savedCwd = process.cwd();
  let tempDir = "";

  // Isolate from user's global preferences so prefs.main_branch can't
  // override the corrupt-metadata path under test.
  const originalHome = process.env.HOME;
  const fakeHome = realpathSync(mkdtempSync(join(tmpdir(), "gsd-fake-home-")));
  process.env.HOME = fakeHome;
  _clearGsdRootCache();
  _resetServiceCache();

  try {
    tempDir = createTempRepo();

    // Plant corrupt integration metadata: integrationBranch points at the
    // milestone branch itself. Commit it so mergeMilestoneToMain's
    // autoCommitDirtyState pre-step has nothing to capture and the
    // postcondition (no new commits) cleanly reflects the guard.
    const msDir = join(tempDir, ".gsd", "milestones", "M001");
    mkdirSync(msDir, { recursive: true });
    writeFileSync(
      join(msDir, "M001-META.json"),
      JSON.stringify({ integrationBranch: recordedIntegrationBranch }),
    );
    git(["add", "."], tempDir);
    git(["commit", "-m", "chore: plant corrupt M001 meta"], tempDir);

    // Create milestone branch with a unique commit so successful merge-back
    // to main can be observed.
    git(["checkout", "-b", "milestone/M001"], tempDir);
    writeFileSync(join(tempDir, "feature.txt"), "feature work\n");
    git(["add", "feature.txt"], tempDir);
    git(["commit", "-m", "feat: milestone work"], tempDir);
    git(["checkout", "main"], tempDir);

    const mainHeadBefore = git(["rev-parse", "main"], tempDir);
    process.chdir(tempDir);

    mergeMilestoneToMain(tempDir, "M001", "");

    // Postcondition: merge-back lands on main.
    const mainHeadAfter = git(["rev-parse", "main"], tempDir);
    assert.notEqual(mainHeadAfter, mainHeadBefore, "main must advance via merge-back");
    assert.equal(git(["rev-parse", "HEAD"], tempDir), mainHeadAfter, "repo remains on main after merge-back");
  } finally {
    process.chdir(savedCwd);
    process.env.HOME = originalHome;
    _clearGsdRootCache();
    _resetServiceCache();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    rmSync(fakeHome, { recursive: true, force: true });
  }
}

test("mergeMilestoneToMain recovers from exact milestone self-ref integration metadata (#6250)", () => {
  assertSelfMergeRefRecoversToMain("milestone/M001");
});

test("mergeMilestoneToMain recovers from refs/heads milestone self-ref integration metadata (#6250)", () => {
  assertSelfMergeRefRecoversToMain("refs/heads/milestone/M001");
});
