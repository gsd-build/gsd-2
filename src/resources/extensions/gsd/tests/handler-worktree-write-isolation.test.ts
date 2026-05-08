/**
 * Regression: when /gsd handlers run with cwd inside a worktree, writes must
 * land in the worktree's .gsd/, not the parent project's .gsd/.
 *
 * The fix in 01464a97 replaced `process.cwd()` with `projectRoot()` to block
 * $HOME pollution, but `projectRoot()` walks UP from a worktree path to the
 * outer project root — breaking the worktree isolation invariant agents rely
 * on. The corrected pattern: handlers use `currentDirectoryRoot()`, which
 * preserves the active cwd (worktree or project) and still throws when cwd
 * is $HOME.
 */
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import { currentDirectoryRoot, projectRoot, withCommandCwd, GSDNoProjectError } from "../commands/context.ts";

describe("handlers preserve worktree cwd via currentDirectoryRoot()", () => {
  let project: string;
  let worktree: string;

  beforeEach(() => {
    project = realpathSync(mkdtempSync(join(tmpdir(), "gsd-wt-iso-")));
    mkdirSync(join(project, ".gsd"), { recursive: true });
    mkdirSync(join(project, ".git"), { recursive: true });
    worktree = join(project, ".gsd", "worktrees", "M001");
    mkdirSync(join(worktree, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  test("currentDirectoryRoot() returns the worktree path when cwd is the worktree", async () => {
    const resolved = await withCommandCwd(worktree, async () => currentDirectoryRoot());
    assert.equal(resolved, worktree, "must keep worktree path so writes isolate");
  });

  test("projectRoot() walks UP from worktree to the project root (legacy semantics)", async () => {
    const resolved = await withCommandCwd(worktree, async () => projectRoot());
    assert.equal(resolved, project, "projectRoot intentionally returns project, not worktree");
  });

  test("currentDirectoryRoot() throws GSDNoProjectError when cwd is $HOME", async () => {
    await assert.rejects(
      withCommandCwd(homedir(), async () => currentDirectoryRoot()),
      (err: unknown) => err instanceof GSDNoProjectError,
    );
  });

  test("currentDirectoryRoot() returns project root when cwd is project root", async () => {
    const resolved = await withCommandCwd(project, async () => currentDirectoryRoot());
    assert.equal(resolved, project);
  });
});
