import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildQuickCommitInstruction } from "../quick.ts";

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("quick task commit instruction does not ask agents to stage external .gsd quick files", { skip: process.platform === "win32" }, () => {
  const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "gsd-quick-ext-")));
  const repo = join(tempRoot, "repo");
  const externalGsd = join(tempRoot, "state");
  mkdirSync(repo);
  mkdirSync(externalGsd);

  const previousCwd = process.cwd();
  try {
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    writeFileSync(join(repo, "README.md"), "# Test\n", "utf-8");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "init"]);
    symlinkSync(externalGsd, join(repo, ".gsd"), "dir");

    const instruction = buildQuickCommitInstruction(repo, join(repo, ".gsd"));

    assert.match(instruction, /do not stage or commit `\.gsd\/quick\/\.\.\.`/);
    assert.match(instruction, /nothing in the project repo to commit/);
    assert.match(instruction, /Write the quick summary file directly/);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
