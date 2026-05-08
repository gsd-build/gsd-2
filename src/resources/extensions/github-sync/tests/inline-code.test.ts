// Project/App: GSD-2
// File Purpose: Tests for the inlineCode markdown helper and its use in PR body templates.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inlineCode, formatSwarmLanePRBody } from "../templates.ts";

describe("inlineCode", () => {
  it("wraps a plain string in single backticks", () => {
    assert.equal(inlineCode("hello"), "`hello`");
  });

  it("uses a double-backtick fence when the input contains a single backtick", () => {
    const out = inlineCode("a`b");
    assert.equal(out, "``a`b``");
  });

  it("uses a 4-backtick fence when the input contains a run of three backticks", () => {
    const out = inlineCode("x```y");
    assert.equal(out, "````x```y````");
  });

  it("pads with a leading space when the input starts with a backtick", () => {
    const out = inlineCode("`leading");
    // longest run = 1 → fence length 2; leading backtick → pad both sides
    assert.equal(out, "`` `leading ``");
  });

  it("pads with a trailing space when the input ends with a backtick", () => {
    const out = inlineCode("trailing`");
    assert.equal(out, "`` trailing` ``");
  });

  it("returns an empty string for empty input", () => {
    // Documented invariant: empty input renders as nothing rather than as
    // a literal pair of backticks (which GFM would render as the characters
    // themselves, not as code).
    assert.equal(inlineCode(""), "");
  });

  it("escapes a branch with embedded backticks inside formatSwarmLanePRBody", () => {
    const malicious = "feature`evil";
    const body = formatSwarmLanePRBody({
      lane: {
        id: "workflow",
        branch: malicious,
      },
      impactArea: "test",
      transitionRisks: [],
      rollbackPlan: [],
    });
    // The branch must appear inside a properly fenced inline-code span,
    // i.e. wrapped in the helper's chosen fence (here a double backtick).
    assert.ok(
      body.includes("``feature`evil``"),
      `expected double-backtick fenced branch, got body:\n${body}`,
    );
    // And there must be no markdown break-out: the substring "evil" should
    // never appear unfenced as a bare word adjacent to a closing single
    // backtick (the unpatched template produced "`feature`evil`").
    assert.ok(
      !body.includes("`feature`evil`\n") && !body.includes("`feature`evil` "),
      `expected no inline-code break-out, got body:\n${body}`,
    );
  });
});
