import test from "node:test";
import assert from "node:assert/strict";

import { _buildAbortedPauseContext, isUserInitiatedAbortMessage } from "../bootstrap/agent-end-recovery.js";
import { _buildCancelledUnitStopReason } from "../auto/phases.js";

test("aborted agent_end maps errorMessage into structured aborted pause context", () => {
  const withMessage = _buildAbortedPauseContext({ errorMessage: "provider aborted request" });
  assert.deepEqual(withMessage, {
    message: "provider aborted request",
    category: "aborted",
    isTransient: true,
  });

  const withoutMessage = _buildAbortedPauseContext({});
  assert.deepEqual(withoutMessage, {
    message: "Operation aborted",
    category: "aborted",
    isTransient: true,
  });
});

test("cancelled non-session failures are labeled as unit aborts (not session-creation failures)", () => {
  const cancelled = _buildCancelledUnitStopReason("execute-task", "M001-S001-T001", {
    category: "aborted",
    message: "tool invocation cancelled",
  });

  assert.match(cancelled.notifyMessage, /aborted after dispatch/);
  assert.equal(cancelled.stopReason, "Unit aborted: tool invocation cancelled");
  assert.equal(cancelled.loopReason, "unit-aborted");
});

test("provider user-abort errors are recognized as cancellations, not provider outages", () => {
  assert.equal(isUserInitiatedAbortMessage("Claude Code process aborted by user"), true);
  assert.equal(isUserInitiatedAbortMessage("Request aborted by user"), true);
  assert.equal(isUserInitiatedAbortMessage("HTTP 503 Service Unavailable"), false);
});
