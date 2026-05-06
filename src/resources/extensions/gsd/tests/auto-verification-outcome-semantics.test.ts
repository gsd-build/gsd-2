import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evaluateVerificationOutcomeSemantics } from "../auto-verification.ts";

describe("auto-verification outcome semantics", () => {
  test("manual-attention outcome fails closed", () => {
    const decision = evaluateVerificationOutcomeSemantics({
      passed: false,
      checks: [],
      discoverySource: "none",
      outcome: "manual-attention",
    });

    assert.equal(decision.pause, true);
    assert.match(decision.reason ?? "", /manual-attention/i);
  });

  test("no-command outcome fails closed", () => {
    const decision = evaluateVerificationOutcomeSemantics({
      passed: false,
      checks: [],
      discoverySource: "none",
      outcome: "no-command",
    });

    assert.equal(decision.pause, true);
    assert.match(decision.reason ?? "", /no-command/i);
  });
});
