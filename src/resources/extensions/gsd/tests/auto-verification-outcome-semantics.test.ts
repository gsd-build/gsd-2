import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evaluateVerificationOutcomeSemantics } from "../auto-verification.ts";

describe("auto-verification outcome semantics", () => {
  test("explicit no-commands outcome fails closed even when checks exist", () => {
    const decision = evaluateVerificationOutcomeSemantics({
      passed: false,
      checks: [{ exitCode: 1 }],
      discoverySource: "task-plan",
      outcome: "no-commands",
    });

    assert.equal(decision.pause, true);
    assert.match(decision.reason ?? "", /no-command/i);
  });

  test("implicit no-command outcome fails closed when no checks are discovered", () => {
    const decision = evaluateVerificationOutcomeSemantics({
      passed: false,
      checks: [],
      discoverySource: "none",
      outcome: null,
    });

    assert.equal(decision.pause, true);
    assert.match(decision.reason ?? "", /no-command/i);
  });

  test("passed outcome does not pause", () => {
    const decision = evaluateVerificationOutcomeSemantics({
      passed: true,
      checks: [],
      discoverySource: "task-plan",
      outcome: "passed",
    });

    assert.equal(decision.pause, false);
  });
});
