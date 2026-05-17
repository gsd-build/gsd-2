import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractSourceRegion } from "./test-helpers.ts";

const source = readFileSync(
  join(import.meta.dirname, "..", "auto-post-unit.ts"),
  "utf-8",
);

test("postUnitPreVerification blocks on git action failure", () => {
  const failureBlock = extractSourceRegion(source, 'if (gitResult.status === "failed")');
  assert.ok(failureBlock.includes('ctx.ui.notify(failureMsg, opts?.softFailure ? "warning" : "error")'));
  assert.ok(failureBlock.includes("await pauseAuto(ctx, pi)"));
  assert.ok(failureBlock.includes('return "dispatched"'));
  assert.ok(!failureBlock.includes("git-action-failed-nonblocking"));
});

test("buildTaskCommitContextForUnit filters placeholder key_files entries", () => {
  const keyFilesBlock = extractSourceRegion(source, "keyFiles:");
  assert.ok(keyFilesBlock.includes("normalized.length > 0"));
  assert.ok(keyFilesBlock.includes("!normalized.includes(\"{{\")"));
  assert.ok(keyFilesBlock.includes("/^(?:\\(none\\)|none\\.?|n\\/a)$/i.test(normalized)"));
});
