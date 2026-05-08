// GSD-2 + src/resources/extensions/gsd/tests/session-switch-abort-misclassification.test.ts
// Regression: session-transition aborts must not be classified as user cancellations.

import test from "node:test";
import assert from "node:assert/strict";

import { _handleSessionSwitchAgentEnd } from "../bootstrap/agent-end-recovery.js";
import type { ErrorContext } from "../auto/types.js";

test("user-abort message during session-switch is dropped (not propagated as cancellation)", () => {
  // The Anthropic SDK emits this exact string when newSession() aborts an
  // in-flight stream during a unit-to-unit session transition. Before the fix
  // this was misclassified as a user cancellation and killed auto-mode with
  // "Auto-mode stopped — Unit aborted: Claude Code process aborted by user".
  let cancelledWith: ErrorContext | null = null;
  const resolveCancelled = (ctx: ErrorContext) => {
    cancelledWith = ctx;
    return true;
  };

  _handleSessionSwitchAgentEnd(
    { stopReason: "error", errorMessage: "Claude Code process aborted by user" },
    resolveCancelled,
  );
  assert.equal(cancelledWith, null, "SDK user-abort during session-switch must not propagate cancellation");

  _handleSessionSwitchAgentEnd(
    { stopReason: "error", errorMessage: "Request aborted by user" },
    resolveCancelled,
  );
  assert.equal(cancelledWith, null, "proxy user-abort during session-switch must not propagate cancellation");
});

test("genuine stopReason='aborted' with errorMessage during session-switch still propagates", () => {
  // Regression guard for prior behavior: genuine aborts with diagnostic content
  // continue to surface as cancellations so transient-pause recovery can run.
  let cancelledWith: { message: string; category: string; isTransient?: boolean } | null = null;
  const resolveCancelled = (ctx: ErrorContext) => {
    cancelledWith = ctx;
    return true;
  };

  _handleSessionSwitchAgentEnd(
    {
      stopReason: "aborted",
      errorMessage: "stream torn down mid-flight",
      content: [{ type: "text", text: "partial output" }],
    },
    resolveCancelled,
  );

  assert.deepEqual(cancelledWith, {
    message: "stream torn down mid-flight",
    category: "aborted",
    isTransient: true,
  });
});

test("empty-content aborted during session-switch is silently ignored", () => {
  // Empty-content aborted is a non-fatal LLM stop; we must not pause/cancel.
  let cancelledWith: unknown = null;
  const resolveCancelled = (ctx: ErrorContext) => {
    cancelledWith = ctx;
    return true;
  };

  _handleSessionSwitchAgentEnd(
    { stopReason: "aborted", content: [] },
    resolveCancelled,
  );

  assert.equal(cancelledWith, null);
});

test("non-abort errors during session-switch are not propagated through this helper", () => {
  // Real provider errors (rate-limit, network, unsupported-model) are handled
  // by the post-switch retry pipeline — not by the in-flight switch handler.
  let cancelledWith: unknown = null;
  const resolveCancelled = (ctx: ErrorContext) => {
    cancelledWith = ctx;
    return true;
  };

  _handleSessionSwitchAgentEnd(
    { stopReason: "error", errorMessage: "rate limit exceeded" },
    resolveCancelled,
  );

  assert.equal(cancelledWith, null);
});

test("malformed lastMsg is rejected gracefully", () => {
  let calls = 0;
  const resolveCancelled = (_ctx: unknown) => {
    calls += 1;
    return true;
  };

  _handleSessionSwitchAgentEnd(undefined, resolveCancelled as never);
  _handleSessionSwitchAgentEnd(null, resolveCancelled as never);
  _handleSessionSwitchAgentEnd("not an object", resolveCancelled as never);
  _handleSessionSwitchAgentEnd({}, resolveCancelled as never);
  _handleSessionSwitchAgentEnd({ stopReason: "completed" }, resolveCancelled as never);

  assert.equal(calls, 0, "malformed or non-abort lastMsg must not invoke cancellation");
});
