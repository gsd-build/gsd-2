// Project/App: GSD-2
// File Purpose: Hardening tests for buildPrEvidence — HTML-comment stripping, fake commit-trailer removal, and per-item length capping.

import test from "node:test";
import assert from "node:assert/strict";

import { buildPrEvidence, type PrEvidenceInput } from "../pr-evidence.ts";

test("pr-evidence hardening: strips HTML comments from summaries", () => {
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    summaries: ["visible<!-- hidden secret -->tail"],
  });
  assert.ok(!evidence.body.includes("<!--"), "raw <!-- must not appear");
  assert.ok(!evidence.body.includes("hidden secret"), "comment contents must be stripped");
  assert.ok(evidence.body.includes("visibletail"), "non-comment text must remain");
});

test("pr-evidence hardening: removes Co-Authored-By trailer from why", () => {
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    why: "Real reason here.\nCo-Authored-By: Evil <e@evil.com>\nMore reason.",
  });
  assert.ok(!evidence.body.includes("Evil <e@evil.com>"));
  assert.ok(!/Co-Authored-By:/i.test(evidence.body));
  assert.ok(evidence.body.includes("Real reason here."));
  assert.ok(evidence.body.includes("More reason."));
});

test("pr-evidence hardening: removes Signed-off-by trailer from how", () => {
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    how: "Step one.\nSigned-off-by: Forged <f@x.com>\nStep two.",
  });
  assert.ok(!evidence.body.includes("Forged <f@x.com>"));
  assert.ok(!/Signed-off-by:/i.test(evidence.body));
  assert.ok(evidence.body.includes("Step one."));
  assert.ok(evidence.body.includes("Step two."));
});

test("pr-evidence hardening: trailer-name match is case-insensitive", () => {
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    why: "ok\nco-authored-by: lower <l@l.com>\nSIGNED-OFF-BY: upper <u@u.com>\nend",
  });
  assert.ok(!evidence.body.includes("lower <l@l.com>"));
  assert.ok(!evidence.body.includes("upper <u@u.com>"));
  assert.ok(evidence.body.includes("ok"));
  assert.ok(evidence.body.includes("end"));
});

test("pr-evidence hardening: caps oversize summaries item with truncation suffix", () => {
  const big = "A".repeat(5 * 1024); // 5 KB
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    summaries: [big],
  });
  // Find the truncated A-block in the body and assert it is bounded.
  const lines = evidence.body.split("\n");
  const longLine = lines.find((l) => l.startsWith("AAAA"));
  assert.ok(longLine, "expected truncated A-line in body");
  assert.ok(longLine!.endsWith(" … [truncated]"), "must end with truncation suffix");
  assert.ok(
    Buffer.byteLength(longLine!, "utf8") <= 2048,
    `truncated item must be within 2 KB cap, got ${Buffer.byteLength(longLine!, "utf8")}`,
  );
});

test("pr-evidence hardening: HTML comment split across summary items is preserved literally", () => {
  // Documented behavior: each item is sanitized independently. A comment
  // that begins in one item and closes in the next is NOT joined, so the
  // open/close markers remain as literal text. This is intentional — joining
  // items before sanitizing would let an attacker straddle items to inject
  // an aligned comment that hides the second item from rendered view.
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    summaries: ["first item ends <!--", "--> second item begins"],
  });
  // The literal markers survive because each item was sanitized alone.
  assert.ok(evidence.body.includes("<!--"), "open marker preserved as literal");
  assert.ok(evidence.body.includes("-->"), "close marker preserved as literal");
  assert.ok(evidence.body.includes("first item ends"));
  assert.ok(evidence.body.includes("second item begins"));
});

test("pr-evidence hardening: clean input is byte-identical to pre-hardening output", () => {
  // This test is the contract that protects the golden fixtures: the
  // sanitizer must be a true no-op for well-formed input. If this fails,
  // there is a bug in the sanitizer (not in the goldens).
  const cleanInput: PrEvidenceInput = {
    milestoneId: "M001",
    milestoneTitle: "Authentication",
    changeType: "feat",
    linkedIssue: "Closes #123",
    summaries: ["### S01\nImplemented login flow."],
    blockers: ["Awaiting design review"],
    roadmapItems: ["- [x] **S01: Login**"],
    metrics: ["**Units executed:** 3"],
    testsRun: ["npm test", "npm run typecheck:extensions"],
    why: "Users need to authenticate before accessing protected resources.",
    how: "Added password hash check and session token issuance.",
    rollbackNotes: ["Revert the merge commit."],
  };

  const expected = [
    "## TL;DR",
    "",
    "**What:** Ship milestone M001 - Authentication",
    "**Why:** Users need to authenticate before accessing protected resources.",
    "**How:** Added password hash check and session token issuance.",
    "",
    "## What",
    "",
    "### S01\nImplemented login flow.",
    "",
    "## Blockers",
    "",
    "- Awaiting design review",
    "",
    "## Why",
    "",
    "Users need to authenticate before accessing protected resources.",
    "",
    "## How",
    "",
    "Added password hash check and session token issuance.",
    "",
    "## Linked Issue",
    "",
    "Closes #123",
    "",
    "## Roadmap",
    "",
    "- [x] **S01: Login**",
    "",
    "## Metrics",
    "",
    "- **Units executed:** 3",
    "",
    "## Tests Run",
    "",
    "- npm test",
    "- npm run typecheck:extensions",
    "",
    "## Change Type",
    "",
    "- [x] `feat` - New feature or capability",
    "- [ ] `fix` - Bug fix",
    "- [ ] `refactor` - Code restructuring",
    "- [ ] `test` - Adding or updating tests",
    "- [ ] `docs` - Documentation only",
    "- [ ] `chore` - Build, CI, or tooling changes",
    "",
    "## Rollback And Compatibility",
    "",
    "- Revert the merge commit.",
    "",
    "## AI Assistance Disclosure",
    "",
    "This PR was prepared with AI assistance.",
  ].join("\n");

  const actual = buildPrEvidence(cleanInput).body;
  assert.equal(actual, expected, "clean input must produce byte-identical output (sanitizer is no-op)");
});
