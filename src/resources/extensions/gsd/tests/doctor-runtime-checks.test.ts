import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGSDDoctor } from "../doctor.ts";

function runGit(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function createGitProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-doctor-runtime-checks-"));
  runGit(dir, ["init"]);
  runGit(dir, ["config", "user.email", "test@test.com"]);
  runGit(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "# test\n", "utf-8");
  runGit(dir, ["add", "."]);
  runGit(dir, ["commit", "-m", "init"]);
  return dir;
}

test("doctor fix respects git.manage_gitignore false (#4161)", async (t) => {
  const dir = createGitProject();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(join(dir, ".gsd"), { recursive: true });
  writeFileSync(
    join(dir, ".gsd", "PREFERENCES.md"),
    "---\nversion: 1\ngit:\n  manage_gitignore: false\n---\n",
    "utf-8",
  );
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n", "utf-8");

  const detect = await runGSDDoctor(dir);
  assert.ok(
    detect.issues.some((issue) => issue.code === "gitignore_missing_patterns"),
    "doctor still reports missing runtime ignore patterns so users can decide how to handle them",
  );

  await runGSDDoctor(dir, { fix: true });

  assert.equal(readFileSync(join(dir, ".gitignore"), "utf-8"), "node_modules/\n");
  assert.equal(existsSync(join(dir, ".gsd", "PREFERENCES.md")), true);
});
