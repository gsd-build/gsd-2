// native-git-bridge-commit-stderr.test.ts — regression for #1
//
// Before the fix, `nativeCommit` rethrew the raw error from `execFileSync`
// whose `.message` is "Command failed: git commit -F -" — the actual reason
// (hook stderr, signer failure, …) lived only on `err.stderr`. Downstream
// consumers (`handleTurnGitActionError`, auto-mode's `ui.notify`) propagated
// `err.message` and left users staring at a useless one-liner.
//
// The fix folds stderr into the thrown error's `.message` while preserving
// `.stderr` / `.stdout` for structured consumers. This test installs a
// commit-msg hook that rejects with a recognisable token and asserts the
// thrown error carries that token in both `.message` and `.stderr`.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { nativeCommit } from "../native-git-bridge.js";

function git(args: string[], cwd: string): string {
  // -c core.hooksPath=/dev/null neutralises the developer's global hookspath
  // (e.g. a strict commit-msg validator) which would otherwise reject the
  // sentinel "init" commit used to seed the test repo.
  return execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

describe("nativeCommit surfaces hook stderr on failure", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "ngb-commit-stderr-"));
    git(["init"], repo);
    // Pin the hooks path to the repo's own .git/hooks so a developer's global
    // core.hooksPath (e.g. a strict commit-msg validator) can't interfere with
    // either the seed commit or the deliberately-rejecting hook installed below.
    git(["config", "core.hooksPath", join(repo, ".git", "hooks")], repo);
    git(["config", "user.email", "test@test.com"], repo);
    git(["config", "user.name", "Test"], repo);
    writeFileSync(join(repo, "file.txt"), "initial\n");
    git(["add", "."], repo);
    git(["commit", "-m", "init"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("rejecting commit-msg hook stderr is surfaced on the thrown error", () => {
    const REJECT_TOKEN = "GSD_TEST_HOOK_REJECTED_COMMIT_42";
    const hookPath = join(repo, ".git", "hooks", "commit-msg");
    writeFileSync(
      hookPath,
      `#!/bin/sh\necho "${REJECT_TOKEN}" 1>&2\nexit 1\n`,
      "utf-8",
    );
    chmodSync(hookPath, 0o755);

    writeFileSync(join(repo, "file.txt"), "modified\n");
    git(["add", "."], repo);

    let captured: unknown = null;
    try {
      nativeCommit(repo, "test: hook should reject");
    } catch (e) {
      captured = e;
    }

    assert.ok(captured instanceof Error, "nativeCommit should throw an Error");
    const err = captured as Error & { stderr?: string; stdout?: string };
    assert.ok(
      err.message.includes(REJECT_TOKEN),
      `error.message must include hook stderr; got: ${err.message}`,
    );
    assert.ok(
      typeof err.stderr === "string" && err.stderr.includes(REJECT_TOKEN),
      `error.stderr must be preserved; got: ${String(err.stderr)}`,
    );
  });
});
