import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(import.meta.dirname, "..", "auto-start.ts");
const source = readFileSync(sourcePath, "utf-8");

test("bootstrapAutoSession blocks on .git/index.lock before git mutations", () => {
  const preflightIdx = source.indexOf('join(base, ".git", "index.lock")');
  const initIdx = source.indexOf("nativeInit(base, mainBranch)");
  const addIdx = source.indexOf("nativeAddAll(base)");
  const commitIdx = source.indexOf('nativeCommit(base, "chore: init gsd")');

  assert.ok(preflightIdx > -1, "bootstrap must check for .git/index.lock");
  assert.ok(initIdx > -1, "bootstrap still initializes git when safe");
  assert.ok(addIdx > -1, "bootstrap still stages bootstrap files when safe");
  assert.ok(commitIdx > -1, "bootstrap still commits bootstrap files when safe");

  assert.ok(preflightIdx < initIdx, "index.lock preflight must run before git init");
  assert.ok(preflightIdx < addIdx, "index.lock preflight must run before git add");
  assert.ok(preflightIdx < commitIdx, "index.lock preflight must run before git commit");
});

test("bootstrapAutoSession never deletes .git/index.lock", () => {
  assert.ok(
    !source.includes("unlinkSync(gitLockFile)") && !source.includes("rmSync(gitLockFile"),
    "bootstrap must not remove .git/index.lock because git lock staleness is not safe to infer",
  );
  assert.ok(
    !source.includes("STALE_GIT_LOCK_THRESHOLD_MS"),
    "bootstrap must not use lock age as a deletion heuristic",
  );
  assert.ok(
    source.includes("return releaseLockAndReturn();"),
    "bootstrap must abort and release the session lock when the git index is locked",
  );
});
