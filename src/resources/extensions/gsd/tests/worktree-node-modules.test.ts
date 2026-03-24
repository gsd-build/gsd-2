/**
 * worktree-node-modules.test.ts — Regression test for #2378.
 *
 * Git worktrees don't include node_modules (it's .gitignored), so UAT
 * commands and dev servers fail when run from inside a worktree. The
 * project root has node_modules but the worktree doesn't.
 *
 * Fix: createWorktree should symlink node_modules from the project root
 * into the worktree so that tools, UAT, and dev servers work.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  lstatSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  createWorktree,
  removeWorktree,
  worktreePath,
} from "../worktree-manager.ts";

function run(command: string, cwd: string): string {
  const [cmd, ...args] = command.split(" ");
  return execFileSync(cmd!, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function gitInit(cwd: string): void {
  execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd, stdio: "ignore" });
}

function gitAddCommit(cwd: string, message: string): void {
  execFileSync("git", ["add", "."], { cwd, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", message], { cwd, stdio: "ignore" });
}

function makeBaseRepo(): string {
  const base = mkdtempSync(join(realpathSync(tmpdir()), "gsd-wt-nm-test-"));
  gitInit(base);
  writeFileSync(join(base, "README.md"), "# Test\n", "utf-8");
  // Simulate a real project's node_modules with a sentinel package
  mkdirSync(join(base, "node_modules", "vitest"), { recursive: true });
  writeFileSync(
    join(base, "node_modules", "vitest", "index.js"),
    "module.exports = {};",
    "utf-8",
  );
  // Ensure node_modules is gitignored (as in any real project)
  writeFileSync(join(base, ".gitignore"), "node_modules/\n", "utf-8");
  gitAddCommit(base, "chore: init");
  return base;
}

// ─── node_modules symlink in worktrees ──────────────────────────────────────

describe("createWorktree — node_modules symlink (#2378)", () => {
  let base: string;
  beforeEach(() => {
    base = makeBaseRepo();
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("worktree has node_modules accessible after creation", () => {
    const info = createWorktree(base, "feature-x");

    // node_modules must be accessible inside the worktree
    const wtNodeModules = join(info.path, "node_modules");
    assert.ok(
      existsSync(wtNodeModules),
      "node_modules should exist in the worktree",
    );

    // It should be a symlink, not a copy
    const stat = lstatSync(wtNodeModules);
    assert.ok(stat.isSymbolicLink(), "node_modules should be a symlink");

    // The symlink should resolve to the project root's node_modules
    const resolvedTarget = realpathSync(wtNodeModules);
    const expectedTarget = realpathSync(join(base, "node_modules"));
    assert.strictEqual(
      resolvedTarget,
      expectedTarget,
      "symlink should resolve to the project root node_modules",
    );
  });

  test("packages inside node_modules are accessible from worktree", () => {
    const info = createWorktree(base, "feature-y");

    // The sentinel package we created should be reachable
    const vitest = join(info.path, "node_modules", "vitest", "index.js");
    assert.ok(
      existsSync(vitest),
      "should be able to reach packages through the symlink",
    );
  });

  test("no symlink created when project root has no node_modules", () => {
    // Remove node_modules from the project root
    rmSync(join(base, "node_modules"), { recursive: true, force: true });

    const info = createWorktree(base, "feature-z");

    const wtNodeModules = join(info.path, "node_modules");
    assert.ok(
      !existsSync(wtNodeModules),
      "node_modules should not exist when project root has none",
    );
  });

  test("removeWorktree cleans up symlink without error", () => {
    const info = createWorktree(base, "cleanup-test");
    assert.ok(
      existsSync(join(info.path, "node_modules")),
      "node_modules symlink should exist before removal",
    );

    // Removal should not throw even though node_modules is a symlink
    removeWorktree(base, "cleanup-test");
    assert.ok(
      !existsSync(info.path),
      "worktree directory should be removed",
    );
  });
});
