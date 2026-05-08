// GSD-2 worktree-isolation write gate (#5199).
//
// Regression coverage for shouldBlockWorktreeWrite — the helper that prevents
// the LLM from authoring code at the project root when `git.isolation: worktree`
// is configured but auto-mode (and its post-unit commit pipeline) hasn't run.
// Without this gate, writes silently orphan outside git history.
//
// Test setup creates a fresh temp project for each isolation case, writes a
// `.gsd/PREFERENCES.md` with `isolation: "worktree"`, and exercises the helper
// against the 9 scenarios listed in the issue. No source-grep tests — every
// assertion exercises the real predicate.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { shouldBlockWorktreeWrite } from "../bootstrap/write-gate.js";
import { invalidateAllCaches } from "../cache.js";

function makeProject(isolation: "none" | "worktree" | "branch" | null): string {
  const root = mkdtempSync(join(tmpdir(), "wt-write-gate-"));
  if (isolation !== null) {
    mkdirSync(join(root, ".gsd"), { recursive: true });
    writeFileSync(
      join(root, ".gsd", "PREFERENCES.md"),
      `---\ngit:\n  isolation: "${isolation}"\n---\n`,
    );
  }
  invalidateAllCaches();
  return root;
}

const PLANNING_WRITE_TOOLS = ["write", "edit", "multi_edit", "notebook_edit"];

describe("shouldBlockWorktreeWrite (#5199)", () => {
  let projectRoot: string;
  let prevDisableEnv: string | undefined;

  beforeEach(() => {
    prevDisableEnv = process.env.GSD_DISABLE_WORKTREE_WRITE_GUARD;
    delete process.env.GSD_DISABLE_WORKTREE_WRITE_GUARD;
  });

  afterEach(() => {
    if (projectRoot) {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    if (prevDisableEnv === undefined) {
      delete process.env.GSD_DISABLE_WORKTREE_WRITE_GUARD;
    } else {
      process.env.GSD_DISABLE_WORKTREE_WRITE_GUARD = prevDisableEnv;
    }
    invalidateAllCaches();
  });

  test("Case 1: every PLANNING_WRITE_TOOLS variant writing to <root>/app.js is blocked", () => {
    projectRoot = makeProject("worktree");
    for (const tool of PLANNING_WRITE_TOOLS) {
      const result = shouldBlockWorktreeWrite(
        tool,
        join(projectRoot, "app.js"),
        projectRoot,
        /* isAutoLive */ false,
        /* unitType */ null,
      );
      assert.equal(result.block, true, `tool ${tool} should be blocked`);
      assert.match(result.reason ?? "", /HARD BLOCK/);
    }
  });

  test("Case 2: write to <root>/.gsd/PROJECT.md is allowed", () => {
    projectRoot = makeProject("worktree");
    const result = shouldBlockWorktreeWrite(
      "write",
      join(projectRoot, ".gsd", "PROJECT.md"),
      projectRoot,
      false,
      null,
    );
    assert.equal(result.block, false);
  });

  test("Case 3: write inside <root>/.gsd/worktrees/M001/ is allowed", () => {
    projectRoot = makeProject("worktree");
    const target = join(projectRoot, ".gsd", "worktrees", "M001", "src", "app.js");
    const result = shouldBlockWorktreeWrite("edit", target, projectRoot, false, null);
    assert.equal(result.block, false);
  });

  test("Case 4: write to <root>/.gsd/worktrees-extra/M001/app.js (prefix trick) is blocked", () => {
    projectRoot = makeProject("worktree");
    const target = join(projectRoot, ".gsd", "worktrees-extra", "M001", "app.js");
    const result = shouldBlockWorktreeWrite("write", target, projectRoot, false, null);
    assert.equal(result.block, true);
    assert.match(result.reason ?? "", /HARD BLOCK/);
  });

  test("Case 5: isolation=none → allow", () => {
    projectRoot = makeProject("none");
    const result = shouldBlockWorktreeWrite(
      "write",
      join(projectRoot, "app.js"),
      projectRoot,
      false,
      null,
    );
    assert.equal(result.block, false);
  });

  test("Case 6: isolation=worktree, auto active, effectiveBasePath inside worktree → allow", () => {
    projectRoot = makeProject("worktree");
    const inside = join(projectRoot, ".gsd", "worktrees", "M001");
    mkdirSync(inside, { recursive: true });
    const result = shouldBlockWorktreeWrite(
      "write",
      join(inside, "src", "app.js"),
      inside,
      /* isAutoLive */ true,
      null,
    );
    assert.equal(result.block, false);
  });

  test("Case 7: isolation=worktree, auto active, effectiveBasePath is project root (cwd never flipped) → block", () => {
    projectRoot = makeProject("worktree");
    const result = shouldBlockWorktreeWrite(
      "write",
      join(projectRoot, "app.js"),
      projectRoot,
      /* isAutoLive */ true,
      null,
    );
    assert.equal(result.block, true);
    assert.match(result.reason ?? "", /HARD BLOCK/);
  });

  test("Case 8: bootstrap unit type active → allow", () => {
    projectRoot = makeProject("worktree");
    for (const unitType of ["discuss-milestone", "plan-milestone", "init"]) {
      const result = shouldBlockWorktreeWrite(
        "write",
        join(projectRoot, "app.js"),
        projectRoot,
        false,
        unitType,
      );
      assert.equal(result.block, false, `unit ${unitType} should bypass the guard`);
    }
  });

  test("Case 9: GSD_DISABLE_WORKTREE_WRITE_GUARD=1 → allow", () => {
    projectRoot = makeProject("worktree");
    process.env.GSD_DISABLE_WORKTREE_WRITE_GUARD = "1";
    const result = shouldBlockWorktreeWrite(
      "write",
      join(projectRoot, "app.js"),
      projectRoot,
      false,
      null,
    );
    assert.equal(result.block, false);
  });

  test("non-planning tools (read/grep/bash) pass through unconditionally", () => {
    projectRoot = makeProject("worktree");
    for (const tool of ["read", "grep", "bash", "ls"]) {
      const result = shouldBlockWorktreeWrite(
        tool,
        join(projectRoot, "app.js"),
        projectRoot,
        false,
        null,
      );
      assert.equal(result.block, false, `tool ${tool} must not be gated`);
    }
  });
});
