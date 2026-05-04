import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { handleWorktreeFlag } from "../worktree-cli.ts";
import { createWorktree, worktreePath } from "../resources/extensions/gsd/worktree-manager.ts";

let cleanupPaths: string[] = [];
let originalCwd = process.cwd();

function run(command: string, cwd: string): string {
  return execSync(command, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function makeRepo(): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-worktree-cli-root-")));
  cleanupPaths.push(base);
  run("git init -b main", base);
  run('git config user.name "GSD Test"', base);
  run('git config user.email "gsd@example.com"', base);
  writeFileSync(join(base, "README.md"), "init\n", "utf-8");
  run("git add -A && git commit -m init", base);
  return base;
}

afterEach(() => {
  process.chdir(originalCwd);
  delete process.env.GSD_CLI_WORKTREE;
  delete process.env.GSD_CLI_WORKTREE_BASE;
  for (const p of cleanupPaths.splice(0)) {
    rmSync(p, { recursive: true, force: true });
  }
});

test("gsd -w from inside a worktree creates the next worktree at the project root", async () => {
  const base = makeRepo();
  const alpha = createWorktree(base, "alpha");
  process.chdir(alpha.path);

  await handleWorktreeFlag("beta");

  const expected = worktreePath(base, "beta");
  const nested = join(alpha.path, ".gsd", "worktrees", "beta");
  assert.equal(process.env.GSD_CLI_WORKTREE_BASE, base);
  assert.equal(process.env.GSD_CLI_WORKTREE, "beta");
  assert.equal(process.cwd(), expected);
  assert.equal(existsSync(expected), true);
  assert.equal(existsSync(nested), false);
});
