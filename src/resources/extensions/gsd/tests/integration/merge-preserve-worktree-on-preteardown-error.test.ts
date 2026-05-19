import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GSDError } from "../../errors.js";
import { mergeMilestoneToMain } from "../../auto-worktree.ts";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function roadmap(mid: string): string {
  return `# ${mid}: Preserve worktree\n\n## Slices\n- [x] **S01: Merge safety**\n`;
}

let repo = "";
let savedCwd = "";

beforeEach(() => {
  savedCwd = process.cwd();
  repo = realpathSync(mkdtempSync(join(tmpdir(), "merge-preserve-worktree-")));
  run("git init -b main", repo);
  run("git config user.email test@test.com", repo);
  run("git config user.name Test", repo);
  writeFileSync(join(repo, "README.md"), "# test\n");
  writeFileSync(join(repo, ".gitignore"), ".gsd/worktrees/\n");
  mkdirSync(join(repo, ".gsd"), { recursive: true });
  run("git add .", repo);
  run("git commit -m init", repo);
});

afterEach(() => {
  process.chdir(savedCwd);
  rmSync(repo, { recursive: true, force: true });
});

test("mergeMilestoneToMain preserves milestone worktree when pre-teardown dirty guard trips", () => {
  const milestoneId = "M001";
  const milestoneBranch = `milestone/${milestoneId}`;
  const worktreePath = join(repo, ".gsd", "worktrees", milestoneId);

  run(`git checkout -b ${milestoneBranch}`, repo);
  writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
  run("git add feature.ts", repo);
  run("git commit -m 'feat: milestone work'", repo);
  run("git checkout main", repo);

  mkdirSync(join(repo, ".gsd", "milestones", milestoneId), { recursive: true });
  writeFileSync(join(repo, ".gsd", "milestones", milestoneId, `${milestoneId}-ROADMAP.md`), roadmap(milestoneId));
  run(`git worktree add ${worktreePath} ${milestoneBranch}`, repo);

  mkdirSync(join(worktreePath, ".gsd", "activity"), { recursive: true });
  writeFileSync(join(worktreePath, ".gsd", "activity", "runtime.jsonl"), '{"runtime":true}\n');

  process.chdir(worktreePath);

  let caught: unknown = null;
  try {
    mergeMilestoneToMain(repo, milestoneId, roadmap(milestoneId));
  } catch (err) {
    caught = err;
  }

  assert.ok(caught instanceof GSDError, "expected dirty pre-teardown guard to throw GSDError");
  assert.match(String((caught as Error).message), /still has uncommitted changes after squash merge/i);
  assert.equal(existsSync(worktreePath), true, "worktree directory should be preserved on pre-teardown failure");

  const branchStillExists = run(`git show-ref --verify --quiet refs/heads/${milestoneBranch}; echo $?`, repo);
  assert.equal(branchStillExists, "0", "milestone branch should remain for manual recovery");
});
