// Project/App: GSD-2
// File Purpose: Tests for the shared GSD pull request evidence generator.

import test from "node:test";
import assert from "node:assert/strict";

import { buildPrEvidence, type PrChangeType } from "../pr-evidence.ts";

test("pr-evidence: generated body includes contribution-required sections", () => {
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    milestoneTitle: "Authentication",
    linkedIssue: "Closes #123",
    summaries: ["### S01\nImplemented login."],
    roadmapItems: ["- [x] **S01: Login**"],
    metrics: ["**Units executed:** 3"],
    testsRun: ["npm test"],
    rollbackNotes: ["Revert the merge commit."],
  });

  assert.equal(evidence.title, "feat: Authentication");
  for (const section of [
    "## TL;DR",
    "## What",
    "## Why",
    "## How",
    "## Linked Issue",
    "## Tests Run",
    "## Change Type",
    "## Rollback And Compatibility",
    "## AI Assistance Disclosure",
  ]) {
    assert.ok(evidence.body.includes(section), `missing section: ${section}`);
  }
  assert.ok(evidence.body.includes("Closes #123"));
  assert.ok(evidence.body.includes("npm test"));
  assert.ok(evidence.body.includes("This PR was prepared with AI assistance."));
});

test("pr-evidence: every change type selects exactly one checklist row", () => {
  const changeTypes: PrChangeType[] = ["feat", "fix", "refactor", "test", "docs", "chore"];

  for (const changeType of changeTypes) {
    const evidence = buildPrEvidence({ milestoneId: "M001", changeType });
    const checkedRows = evidence.body.split("\n").filter((line) => line.startsWith("- [x] `"));
    assert.deepEqual(checkedRows, [
      `- [x] \`${changeType}\` - ${{
        feat: "New feature or capability",
        fix: "Bug fix",
        refactor: "Code restructuring",
        test: "Adding or updating tests",
        docs: "Documentation only",
        chore: "Build, CI, or tooling changes",
      }[changeType]}`,
    ]);
  }
});

test("pr-evidence: missing issue, tests, and rollback data are explicit", () => {
  const evidence = buildPrEvidence({ milestoneId: "M001", aiAssisted: false });

  assert.ok(evidence.body.includes("Not specified. Add an issue link"));
  assert.ok(evidence.body.includes("Not specified. Add exact verification commands"));
  assert.ok(evidence.body.includes("No behavior-changing rollback notes recorded."));
  assert.ok(!evidence.body.includes("## AI Assistance Disclosure"));
});

test("pr-evidence: subject metadata supports non-milestone PRs", () => {
  const evidence = buildPrEvidence({
    milestoneId: "M001",
    subjectId: "S01",
    subjectKind: "slice",
    milestoneTitle: "Auth Slice",
  });

  assert.equal(evidence.title, "feat: Auth Slice");
  assert.ok(evidence.body.includes("Ship slice S01 - Auth Slice"));
  assert.ok(evidence.body.includes("Slice work is complete and ready for review."));
});
