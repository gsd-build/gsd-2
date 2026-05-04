import test from "node:test";
import assert from "node:assert/strict";

import { _buildAbortedPauseContext } from "../bootstrap/agent-end-recovery.js";
import { _buildCancelledUnitStopReason, _isPauseOriginatedCancellation } from "../auto/phases.js";

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

test("pause-originated cancellations are detected and do not hard-stop", () => {
  assert.equal(_isPauseOriginatedCancellation(true, undefined), true);
  assert.equal(_isPauseOriginatedCancellation(false, undefined), false);
  assert.equal(_isPauseOriginatedCancellation(true, { category: "aborted", message: "x" }), false);
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
