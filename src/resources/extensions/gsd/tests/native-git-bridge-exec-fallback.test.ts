// native-git-bridge-exec-fallback.test.ts — regression for #4180
//
// nativeCommit, nativeIsRepo, and nativeResetHard used execSync() (string
// command) in their fallback paths. On Windows, execSync spawns cmd.exe which
// cannot resolve git when Git for Windows is installed via MSYS2/bash but not
// in cmd.exe's PATH. All other fallback paths in this file use execFileSync()
// which invokes the binary directly — these three must do the same.
//
// Static-analysis tests fail before the fix (source still has execSync calls)
// and pass after (replaced with execFileSync). Integration tests verify the
// fallback functions behave correctly on all platforms.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  assertWorktreeMaterialized,
  nativeBranchList,
  nativeBranchDelete,
  nativeCommit,
  nativeGetCurrentBranch,
  nativeIsRepo,
  nativeResetHard,
  nativeWorktreeAdd,
} from "../native-git-bridge.js";
import { GIT_NO_PROMPT_ENV } from "../git-constants.js";

// Note: prior static-analysis tests that scanned native-git-bridge.ts for
// the raw shell-spawn pattern were removed under #4827 — the integration
// tests below already exercise the fallback path end-to-end with the native
// module disabled (GSD_ENABLE_NATIVE_GSD_GIT unset). Any cmd.exe PATH
// regression on Windows surfaces through a real fallback failure, not a
// grep miss in source text.

// ─── Integration tests ────────────────────────────────────────────────────
// Verify correct runtime behaviour through the fallback path (native module
// is disabled by default in tests — GSD_ENABLE_NATIVE_GSD_GIT is not set).

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

describe("native-git-bridge #4180: fallback runtime behaviour", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "ngb4180-"));
    git(["init"], repo);
    git(["config", "user.email", "test@test.com"], repo);
    git(["config", "user.name", "Test"], repo);
    writeFileSync(join(repo, "file.txt"), "initial\n");
    git(["add", "."], repo);
    git(["commit", "-m", "init"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("nativeIsRepo returns true for a valid git repository", () => {
    assert.equal(nativeIsRepo(repo), true);
  });

  test("nativeIsRepo returns false for a plain directory", (t) => {
    const dir = mkdtempSync(join(tmpdir(), "ngb4180-notrepo-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    assert.equal(nativeIsRepo(dir), false);
  });

  test("nativeCommit commits staged changes and returns non-null output", () => {
    writeFileSync(join(repo, "file.txt"), "modified\n");
    git(["add", "."], repo);

    const result = nativeCommit(repo, "test: regression commit #4180");
    assert.ok(result !== null, "should return output string for a successful commit");

    const subject = git(["log", "-1", "--format=%s"], repo);
    assert.equal(subject, "test: regression commit #4180");
  });

  test("nativeCommit retries once after transient ENOBUFS from git", (t) => {
    const bin = mkdtempSync(join(tmpdir(), "ngb-enobufs-bin-"));
    t.after(() => rmSync(bin, { recursive: true, force: true }));

    const realGit = execFileSync("git", ["--exec-path"], { encoding: "utf-8" }).trim();
    const attempts = join(bin, "attempts.txt");
    const fakeGit = join(bin, "fake-git.cjs");
    writeFileSync(fakeGit, `
const { appendFileSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const attempts = ${JSON.stringify(attempts)};
const realGit = ${JSON.stringify(join(realGit, process.platform === "win32" ? "git.exe" : "git"))};
appendFileSync(attempts, "1");
if (process.argv[2] === "commit" && readFileSync(attempts, "utf-8").length === 1) {
  console.error("spawnSync git ENOBUFS");
  process.exit(1);
}
const result = spawnSync(realGit, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
`, "utf-8");

    if (process.platform === "win32") {
      writeFileSync(join(bin, "git.cmd"), `@echo off\r\nnode "${fakeGit}" %*\r\n`, "utf-8");
    } else {
      const shim = join(bin, "git");
      writeFileSync(shim, `#!/bin/sh\nexec node "${fakeGit}" "$@"\n`, "utf-8");
      chmodSync(shim, 0o755);
    }

    writeFileSync(join(repo, "file.txt"), "retry commit\n");
    git(["add", "."], repo);

    const originalPath = process.env.PATH ?? "";
    const gitEnv = GIT_NO_PROMPT_ENV as NodeJS.ProcessEnv;
    const originalGitEnvPath = gitEnv.PATH;
    try {
      process.env.PATH = `${bin}${delimiter}${originalPath}`;
      gitEnv.PATH = process.env.PATH;
      const result = nativeCommit(repo, "test: retry ENOBUFS commit");
      assert.ok(result !== null, "commit should succeed after retry");
    } finally {
      process.env.PATH = originalPath;
      gitEnv.PATH = originalGitEnvPath;
    }

    assert.equal(readFileSync(attempts, "utf-8").length, 2);
    assert.equal(git(["log", "-1", "--format=%s"], repo), "test: retry ENOBUFS commit");
  });

  test("nativeCommit runs commit hooks", () => {
    const hookPath = join(repo, ".git", "hooks", "commit-msg");
    const marker = join(repo, "hook-ran.txt");
    writeFileSync(hookPath, `#!/bin/sh\nprintf ran > "${marker}"\n`, "utf-8");
    chmodSync(hookPath, 0o755);

    writeFileSync(join(repo, "file.txt"), "hooked\n");
    git(["add", "."], repo);
    nativeCommit(repo, "test: hook execution");

    assert.equal(readFileSync(marker, "utf-8"), "ran");
  });

  test("nativeCommit returns null when nothing is staged", () => {
    const result = nativeCommit(repo, "test: nothing staged");
    assert.equal(result, null);
  });

  test("nativeCommit respects the allowEmpty option", () => {
    const result = nativeCommit(repo, "test: empty commit #4180", { allowEmpty: true });
    assert.ok(result !== null, "allow-empty commit should return output");

    const subject = git(["log", "-1", "--format=%s"], repo);
    assert.equal(subject, "test: empty commit #4180");
  });

  test("nativeResetHard discards unstaged working tree changes", () => {
    writeFileSync(join(repo, "file.txt"), "dirty content\n");

    const statusBefore = git(["status", "--short"], repo);
    assert.ok(statusBefore.length > 0, "repo should be dirty before reset");

    nativeResetHard(repo);

    const content = readFileSync(join(repo, "file.txt"), "utf-8");
    assert.equal(content, "initial\n", "file should be restored to HEAD content after hard reset");
  });

  test("nativeBranchDelete throws when git cannot delete the branch", () => {
    assert.throws(
      () => nativeBranchDelete(repo, "does-not-exist"),
      /git branch -D does-not-exist failed[\s\S]*does-not-exist/,
    );
  });

  test("nativeGetCurrentBranch preserves git stderr in fallback errors", (t) => {
    const dir = mkdtempSync(join(tmpdir(), "ngb-stderr-notrepo-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));

    assert.throws(
      () => nativeGetCurrentBranch(dir),
      /git branch --show-current failed[\s\S]*(not a git repository|not a git repo|fatal:)/,
    );
  });

  test("assertWorktreeMaterialized rejects directories without a .git file", (t) => {
    const dir = mkdtempSync(join(tmpdir(), "ngb-worktree-missing-git-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));

    assert.throws(
      () => assertWorktreeMaterialized(dir),
      /missing \.git file/,
    );
  });

  test("nativeWorktreeAdd materializes a valid .git marker", (t) => {
    const wtPath = join(repo, ".gsd", "worktrees", "M001");
    t.after(() => {
      try { git(["worktree", "remove", "--force", wtPath], repo); } catch { /* noop */ }
    });

    nativeWorktreeAdd(repo, wtPath, "milestone/M001", true, "HEAD");

    assert.equal(
      existsSync(join(wtPath, ".git")),
      true,
      "created worktree must have the .git file required by later health checks",
    );
  });

  test("nativeBranchList strips linked-worktree '+' marker from fallback output", (t) => {
    const wtPath = join(repo, ".gsd", "worktrees", "M001");
    t.after(() => {
      try { git(["worktree", "remove", "--force", wtPath], repo); } catch { /* noop */ }
    });

    git(["branch", "milestone/M001"], repo);
    git(["worktree", "add", wtPath, "milestone/M001"], repo);

    const listed = nativeBranchList(repo, "milestone/*");
    assert.ok(
      listed.includes("milestone/M001"),
      `expected clean milestone branch name, got: ${JSON.stringify(listed)}`,
    );
  });
});
