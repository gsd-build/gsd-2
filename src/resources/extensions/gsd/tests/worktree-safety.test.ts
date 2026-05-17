// Project/App: GSD-2
// File Purpose: Unit tests for the Worktree Safety module contract.

import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { createWorktreeSafetyModule } from "../worktree-safety.ts";
import { createWorktree, worktreePath } from "../worktree-manager.ts";

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function makeBaseRepo(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-wt-safety-repo-"));
  runGit(["init", "-b", "main"], base);
  runGit(["config", "user.name", "Test User"], base);
  runGit(["config", "user.email", "test@example.com"], base);
  writeFileSync(join(base, "README.md"), "# Test Project\n", "utf-8");
  runGit(["add", "."], base);
  runGit(["commit", "-m", "chore: init"], base);
  return base;
}

describe("Worktree Safety module", () => {
  let root: string;
  let projectRoot: string;
  let unitRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gsd-worktree-safety-"));
    projectRoot = join(root, "project");
    unitRoot = join(projectRoot, ".gsd", "worktrees", "M001");
    mkdirSync(unitRoot, { recursive: true });
    writeFileSync(join(unitRoot, ".git"), "gitdir: ../../../.git/worktrees/M001\n", "utf-8");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("allows planning-only Units without requiring a source worktree", () => {
    const safety = createWorktreeSafetyModule();

    const result = safety.validateUnitRoot({
      unitType: "plan-milestone",
      unitId: "M001",
      writeScope: "planning-only",
      projectRoot,
      unitRoot: projectRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "not-required");
  });

  test("accepts a source-writing Unit with a registered worktree and expected branch", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: unitRoot, branch: "milestone/M001" }],
      getCurrentBranch: () => "milestone/M001",
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
      expectedBranch: "milestone/M001",
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "safe");
    assert.equal(result.milestoneId, "M001");
    assert.equal(result.branch, "milestone/M001");
  });

  test("rejects a source-writing Unit when the worktree root is missing", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: (path) => path !== unitRoot,
      lstatSync: () => ({ isFile: () => true }),
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-missing");
    assert.match(result.remediation, /Create or recover/);
  });

  test("rejects a source-writing Unit outside the expected milestone worktree root", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
    });

    const outsideRoot = join(projectRoot, "src");
    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot: outsideRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "invalid-root");
    assert.equal(result.details?.unitRoot, outsideRoot);
    assert.equal(result.details?.expectedRoot, unitRoot);
  });

  test("accepts project root for source-writing Unit when isolation mode is none", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: projectRoot, branch: "main" }],
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot: projectRoot,
      milestoneId: "M001",
      isolationMode: "none",
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "safe");
  });

  test("rejects non-project root for source-writing Unit when isolation mode is none", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: unitRoot, branch: "main" }],
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
      isolationMode: "none",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "invalid-root");
    assert.equal(result.details?.expectedRoot, projectRoot);
    assert.equal(result.details?.unitRoot, unitRoot);
  });

  test("rejects a standalone repository masquerading as a worktree", () => {
    unlinkSync(join(unitRoot, ".git"));
    mkdirSync(join(unitRoot, ".git"), { recursive: true });
    const safety = createWorktreeSafetyModule();

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-git-marker-not-file");
  });

  test("converts .git marker stat failures into typed failures", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => {
        throw new Error("marker disappeared");
      },
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-git-probe-failed");
    assert.equal(result.details?.error, "marker disappeared");
  });

  test("rejects an unregistered worktree path", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [],
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-unregistered");
  });

  test("attempts prune recovery once for unregistered worktrees and tracks failed roots", () => {
    let pruneCalls = 0;
    let listCalls = 0;
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      pruneRegisteredWorktrees: () => {
        pruneCalls += 1;
      },
      listRegisteredWorktrees: () => {
        listCalls += 1;
        return [];
      },
    });

    const first = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });
    assert.equal(first.ok, false);
    assert.equal(first.kind, "worktree-unregistered");
    assert.equal(first.details?.attemptedPrune, true);
    assert.equal(first.details?.trackedAsFailed, true);
    assert.equal(pruneCalls, 1);
    assert.equal(listCalls, 2);

    const second = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });
    assert.equal(second.ok, false);
    assert.equal(second.kind, "worktree-unregistered");
    assert.equal(second.details?.attemptedPrune, false);
    assert.equal(second.details?.trackedAsFailed, true);
    assert.equal(pruneCalls, 1);
    assert.equal(listCalls, 3);
  });

  test("converts registered worktree list failures into typed failures", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => {
        throw new Error("worktree list unreadable");
      },
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-git-probe-failed");
    assert.equal(result.details?.error, "worktree list unreadable");
  });

  test("rejects a branch mismatch with a typed failure", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: unitRoot, branch: "milestone/M001" }],
      getCurrentBranch: () => "feature/unexpected",
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
      expectedBranch: "milestone/M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "branch-mismatch");
    assert.equal(result.details?.branch, "feature/unexpected");
  });

  test("converts branch resolution failures into typed failures", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: unitRoot, branch: "milestone/M001" }],
      getCurrentBranch: () => {
        throw new Error("branch unreadable");
      },
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
      expectedBranch: "milestone/M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-git-probe-failed");
    assert.equal(result.details?.expectedBranch, "milestone/M001");
    assert.equal(result.details?.error, "branch unreadable");
  });

  test("fails closed when branch verification lacks a branch probe", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: unitRoot, branch: "milestone/M001" }],
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
      expectedBranch: "milestone/M001",
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "worktree-git-probe-failed");
    assert.equal(result.details?.error, "getCurrentBranch dep not provided");
  });

  test("rejects an empty worktree when the project root has content", () => {
    const safety = createWorktreeSafetyModule({
      existsSync: () => true,
      lstatSync: () => ({ isFile: () => true }),
      listRegisteredWorktrees: () => [{ path: unitRoot, branch: "milestone/M001" }],
    });

    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot,
      unitRoot,
      milestoneId: "M001",
      emptyWorktreeWithProjectContent: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.kind, "empty-worktree-with-project-content");
  });

  test("default adapter proves registered worktree and current branch", (t) => {
    const base = makeBaseRepo();
    t.after(() => rmSync(base, { recursive: true, force: true }));
    createWorktree(base, "M001", { branch: "milestone/M001" });

    const safety = createWorktreeSafetyModule();
    const result = safety.validateUnitRoot({
      unitType: "execute-task",
      unitId: "M001/S01/T01",
      writeScope: "source-writing",
      projectRoot: base,
      unitRoot: worktreePath(base, "M001"),
      milestoneId: "M001",
      expectedBranch: "milestone/M001",
    });

    assert.equal(result.ok, true);
    assert.equal(result.kind, "safe");
    assert.equal(result.branch, "milestone/M001");
  });
});
