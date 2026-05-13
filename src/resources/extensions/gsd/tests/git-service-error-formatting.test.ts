// git-service-error-formatting.test.ts — regression for #1
//
// `handleTurnGitActionError` used to call `getErrorMessage(err)` which only
// reads `.message`. When `nativeCommit` failed under a rejecting hook, the
// real reason lived on `err.stderr` and was dropped. Now the handler combines
// `.message` with `.stderr` / `.stdout` so auto-mode's `runTurnGitAction`
// result carries the user-actionable detail.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { handleTurnGitActionError } from "../git-service.js";

describe("handleTurnGitActionError surfaces stderr", () => {
  test("combines err.message with err.stderr when both are present", () => {
    const err = new Error("Command failed: git commit -F -") as Error & {
      stderr?: string;
      stdout?: string;
    };
    err.stderr = "hook rejected: subject must start with feat|fix|…";
    const result = handleTurnGitActionError("commit", err);
    assert.equal(result.status, "failed");
    assert.equal(result.action, "commit");
    assert.ok(
      result.error?.includes("Command failed: git commit -F -"),
      `error should preserve original message; got: ${result.error}`,
    );
    assert.ok(
      result.error?.includes("hook rejected: subject must start with feat|fix|…"),
      `error should include stderr; got: ${result.error}`,
    );
  });

  test("does not duplicate stderr already folded into message", () => {
    const err = new Error(
      "Command failed: git commit -F -\nhook rejected: bad subject",
    ) as Error & { stderr?: string };
    err.stderr = "hook rejected: bad subject";
    const result = handleTurnGitActionError("commit", err);
    const matches = result.error?.match(/hook rejected: bad subject/g) ?? [];
    assert.equal(matches.length, 1, `stderr should not be duplicated; got: ${result.error}`);
  });

  test("falls back to plain message when no stderr/stdout present", () => {
    const result = handleTurnGitActionError("commit", new Error("boom"));
    assert.equal(result.status, "failed");
    assert.equal(result.error, "boom");
  });
});
