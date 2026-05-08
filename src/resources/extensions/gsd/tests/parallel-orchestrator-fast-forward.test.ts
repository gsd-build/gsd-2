// GSD-2 + src/resources/extensions/gsd/tests/parallel-orchestrator-fast-forward.test.ts
// Regression: parallel-orchestrator's `_createMilestoneWorktree` must
// fast-forward a reused milestone branch onto integration before creating
// the worktree, matching the behavior added to the auto-mode path in
// commit 8996cb68e (#5549 post-merge audit, R3).

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _createMilestoneWorktree } from "../parallel-orchestrator.js";

const NO_PROMPT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: NO_PROMPT_ENV,
  });
}

function rev(cwd: string, ref: string): string {
  return git(cwd, "rev-parse", ref).trim();
}

describe("_createMilestoneWorktree fast-forwards reused milestone branches (#5549 R3)", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "parallel-orch-ff-"));
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git(repo, "add", "seed.txt");
    git(repo, "commit", "-q", "-m", "initial");
    // Minimal .gsd/ structure so syncGsdStateToWorktree doesn't crash on a
    // bare repo. We don't care if it copies anything — only that the FF ran.
    mkdirSync(join(repo, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("reused milestone branch behind main is fast-forwarded before worktree creation", () => {
    // Worker N drained M001 in a previous run, leaving milestone/M001 forked
    // from old main. Worker N+1 picks up M002 — but the milestone/M002 branch
    // was created from old main in a sibling run, so it's now N commits behind.
    git(repo, "branch", "milestone/M002");
    const m002Initial = rev(repo, "milestone/M002");

    writeFileSync(join(repo, "seed.txt"), "main moved forward\n");
    git(repo, "add", "seed.txt");
    git(repo, "commit", "-q", "-m", "main advanced");
    const mainTip = rev(repo, "main");

    assert.notEqual(m002Initial, mainTip, "main must be ahead before the test");

    // _createMilestoneWorktree may throw inside createWorktree/syncGsdStateToWorktree
    // (e.g. if the worktree-manager has stricter requirements than this minimal
    // repo provides). The fast-forward runs BEFORE those calls, so the branch
    // ref should have moved regardless. Catch and assert on observable state.
    try {
      _createMilestoneWorktree(repo, "M002");
    } catch {
      // Fine — we only care that FF executed.
    }

    assert.equal(
      rev(repo, "milestone/M002"),
      mainTip,
      "milestone/M002 must be fast-forwarded to main's tip before worktree is built",
    );
  });

  test("diverged milestone branch is NOT touched (would lose work)", () => {
    git(repo, "checkout", "-q", "-b", "milestone/M002");
    writeFileSync(join(repo, "wip.txt"), "milestone-only work\n");
    git(repo, "add", "wip.txt");
    git(repo, "commit", "-q", "-m", "M002 work");
    const m002Tip = rev(repo, "milestone/M002");

    git(repo, "checkout", "-q", "main");
    writeFileSync(join(repo, "seed.txt"), "main moved forward\n");
    git(repo, "add", "seed.txt");
    git(repo, "commit", "-q", "-m", "main advanced");

    try {
      _createMilestoneWorktree(repo, "M002");
    } catch {
      // ignored
    }

    assert.equal(
      rev(repo, "milestone/M002"),
      m002Tip,
      "diverged milestone branch must NOT be touched — would lose committed work",
    );
  });
});
