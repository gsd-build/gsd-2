// GSD-2 + src/resources/extensions/gsd/tests/session-switch-abort-misclassification.test.ts
// Regression: session-transition aborts must not be classified as user cancellations.

import test from "node:test";
import assert from "node:assert/strict";

import {
  _hasEmptyAgentEndContent,
  _handleSessionSwitchAgentEnd,
  handleAgentEnd,
  isBareClaudeCodeStreamAbortPlaceholder,
  isClaudeCodeSessionSwitchAbortMessage,
} from "../bootstrap/agent-end-recovery.js";
import { _setAutoActiveForTest } from "../auto.js";
import { shouldIgnoreAgentEndForActiveUnit } from "../auto/unit-runner-events.js";
import { _resetPendingResolve, _setCurrentResolve } from "../auto/resolve.js";
import type { ErrorContext } from "../auto/types.js";

test.afterEach(() => {
  _setAutoActiveForTest(false);
  _resetPendingResolve();
});

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

test("Claude Code stream-aborted placeholder during session-switch is dropped", () => {
  let cancelledWith: unknown = null;
  const resolveCancelled = (ctx: ErrorContext) => {
    cancelledWith = ctx;
    return true;
  };

  _handleSessionSwitchAgentEnd(
    {
      stopReason: "aborted",
      content: [{ type: "text", text: "Claude Code stream aborted by caller" }],
    },
    resolveCancelled,
  );

  assert.equal(cancelledWith, null);
});

test("late bare Claude Code stream-aborted placeholder is classified as internal", () => {
  // Reproduces the M003/S04 failure shape from testingapp1: the previous unit
  // completed, the next unit was dispatched, then Claude Code emitted a
  // zero-token stream-aborted placeholder. That marker belongs to session
  // transition cleanup, not the active unit.
  assert.equal(
    isBareClaudeCodeStreamAbortPlaceholder({
      stopReason: "aborted",
      content: [{ type: "text", text: "Claude Code stream aborted by caller" }],
    }),
    true,
  );

  assert.equal(
    isBareClaudeCodeStreamAbortPlaceholder({
      stopReason: "aborted",
      errorMessage: "stream torn down mid-flight",
      content: [{ type: "text", text: "Claude Code stream aborted by caller" }],
    }),
    false,
    "diagnostic aborts must stay on the normal cancelled path",
  );

  assert.equal(
    isBareClaudeCodeStreamAbortPlaceholder({
      stopReason: "aborted",
      content: [{ type: "text", text: "Request aborted by user" }],
    }),
    false,
    "user abort markers outside the session-switch path must not be swallowed",
  );
});

test("mid-unit bare Claude Code stream-aborted placeholder resolves the unit", async () => {
  // A placeholder without an active session-switch grace window belongs to the
  // current unit. Resolving it prevents auto-mode from hanging while still
  // allowing the next unit to run.
  const results: unknown[] = [];
  const warnings: string[] = [];
  _setAutoActiveForTest(true);
  _setCurrentResolve((result) => results.push(result));

  const event = {
    messages: [{
      stopReason: "aborted",
      content: [{ type: "text", text: "Claude Code stream aborted by caller" }],
    }],
  };

  await handleAgentEnd({} as any, event, {
    ui: {
      notify: (message: string, level: string) => {
        if (level === "warning") warnings.push(message);
      },
    },
  } as any);

  assert.deepEqual(results, [{ status: "completed", event }]);
  assert.deepEqual(warnings, ["Claude Code stream aborted mid-unit (no diagnostic). Continuing."]);
});

test("typed session-transition abort events are classified as internal", () => {
  assert.equal(
    shouldIgnoreAgentEndForActiveUnit({
      abortOrigin: "session-transition",
      messages: [{ stopReason: "aborted" }],
    }),
    true,
  );

  assert.equal(
    shouldIgnoreAgentEndForActiveUnit({
      abortOrigin: "session-transition",
      messages: [{ stopReason: "end_turn" }],
    }),
    false,
  );

  assert.equal(
    shouldIgnoreAgentEndForActiveUnit({
      abortOrigin: "user",
      messages: [{ stopReason: "aborted" }],
    }),
    false,
  );

  assert.equal(
    shouldIgnoreAgentEndForActiveUnit({ messages: [] }),
    false,
  );
});

test("Claude Code session-switch abort detection is narrow", () => {
  assert.equal(
    isClaudeCodeSessionSwitchAbortMessage({
      stopReason: "error",
      content: [{ type: "text", text: "Claude Code error: Claude Code process aborted by user" }],
    }),
    false,
  );
  assert.equal(
    isClaudeCodeSessionSwitchAbortMessage({
      stopReason: "aborted",
      content: [{ type: "text", text: "Claude Code stream aborted by caller" }],
    }),
    true,
  );
  assert.equal(
    isClaudeCodeSessionSwitchAbortMessage({
      stopReason: "aborted",
      content: [{ type: "text", text: "partial output before network failure" }],
    }),
    false,
  );
  assert.equal(
    isClaudeCodeSessionSwitchAbortMessage({
      stopReason: "aborted",
      content: [{ type: "text", text: "Request aborted by user\nAPI Error: 529 overloaded" }],
    }),
    false,
  );
  assert.equal(
    isClaudeCodeSessionSwitchAbortMessage({
      stopReason: "error",
      errorMessage: "Request aborted by user",
      content: [{ type: "text", text: "Claude Code process aborted by user" }],
    }),
    true,
  );
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

test("missing agent_end content is classified as empty abort content", () => {
  // Providers may omit content entirely for a late aborted agent_end. That is
  // equivalent to empty content and must not pause/cancel the next unit.
  assert.equal(_hasEmptyAgentEndContent(undefined), true);
  assert.equal(_hasEmptyAgentEndContent(null), true);
  assert.equal(_hasEmptyAgentEndContent([]), true);
  assert.equal(_hasEmptyAgentEndContent([{ type: "text", text: "" }]), true);
  assert.equal(_hasEmptyAgentEndContent([{ type: "text", text: "   " }]), true);
  assert.equal(_hasEmptyAgentEndContent([{ type: "text", text: "partial" }]), false);
});

test("completed assistant content with aborted stopReason during session-switch is ignored", () => {
  // newSession() can abort the just-finished provider stream while the last
  // assistant message still carries the completed unit summary. That is a
  // session-transition artifact, not a cancellation for the next unit.
  let cancelledWith: unknown = null;
  const resolveCancelled = (ctx: ErrorContext) => {
    cancelledWith = ctx;
    return true;
  };

  _handleSessionSwitchAgentEnd(
    {
      stopReason: "aborted",
      content: [{
        type: "text",
        text: "Implemented T01 and verified the slice task is complete.",
      }],
    },
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
