// Project/App: GSD-2
// File Purpose: Regression tests for duplicate issue suggestion policy.

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEDUPE_MARKER,
  buildDuplicateComment,
  buildSearchQuery,
  findDuplicateCandidates,
  hasExistingDedupeCommentInIssue,
  hasExistingDedupeComment,
  scoreTitleSimilarity,
  tokenizeTitle,
} from "../issue-dedupe.mjs";

test("tokenizeTitle removes low-signal words from issue titles", () => {
  assert.deepEqual(tokenizeTitle("How do we fix auto mode on merge?"), [
    "fix",
    "auto",
    "mode",
    "merge",
  ]);
});

test("scoreTitleSimilarity gives related titles a stronger score", () => {
  const related = scoreTitleSimilarity(
    "Auto mode fails after merge conflict",
    "Auto mode pauses after merge conflicts",
  );
  const unrelated = scoreTitleSimilarity(
    "Auto mode fails after merge conflict",
    "Add dark theme to dashboard",
  );

  assert.ok(related > unrelated);
  assert.ok(related >= 0.58);
});

test("findDuplicateCandidates excludes the current issue and pull requests", () => {
  const candidates = findDuplicateCandidates(
    { number: 10, title: "Auto mode fails after merge conflict" },
    [
      { number: 10, title: "Auto mode fails after merge conflict", html_url: "self" },
      { number: 11, title: "Auto mode pauses after merge conflicts", html_url: "match" },
      {
        number: 12,
        title: "Auto mode fails after merge conflict",
        html_url: "pr",
        pull_request: {},
      },
    ],
  );

  assert.deepEqual(candidates.map((candidate) => candidate.number), [11]);
});

test("buildDuplicateComment includes the idempotency marker and candidate list", () => {
  const comment = buildDuplicateComment([
    {
      number: 11,
      title: "Auto mode pauses after merge conflicts",
      html_url: "https://example.test/issues/11",
      score: 0.75,
    },
  ]);

  assert.match(comment, new RegExp(DEDUPE_MARKER));
  assert.match(comment, /#11: Auto mode pauses after merge conflicts/);
});

test("hasExistingDedupeComment detects prior dedupe suggestions", () => {
  assert.equal(hasExistingDedupeComment([{ body: `${DEDUPE_MARKER}\nold` }]), true);
  assert.equal(hasExistingDedupeComment([{ body: "ordinary comment" }]), false);
});

test("buildSearchQuery scopes duplicate search to this repository", () => {
  assert.equal(
    buildSearchQuery("gsd-build", "gsd-2", {
      title: "Auto mode fails after merge conflict",
    }),
    "repo:gsd-build/gsd-2 is:issue in:title auto mode fails after merge conflict",
  );
});

test("hasExistingDedupeCommentInIssue paginates until marker is found", async () => {
  const calls = [];
  const githubJson = async (path) => {
    calls.push(path);
    if (/[?&]page=1\b/.test(path)) {
      return Array.from({ length: 100 }, () => ({ body: "ordinary comment" }));
    }
    return [{ body: `${DEDUPE_MARKER}\nold` }];
  };

  const found = await hasExistingDedupeCommentInIssue(githubJson, "gsd-build", "gsd-2", 42);
  assert.equal(found, true);
  assert.equal(calls.length, 2);
});

test("hasExistingDedupeCommentInIssue stops when final page is exhausted", async () => {
  let calls = 0;
  const githubJson = async () => {
    calls += 1;
    return [{ body: "ordinary comment" }];
  };

  const found = await hasExistingDedupeCommentInIssue(githubJson, "gsd-build", "gsd-2", 42);
  assert.equal(found, false);
  assert.equal(calls, 1);
});
