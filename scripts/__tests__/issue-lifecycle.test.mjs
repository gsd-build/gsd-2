// Project/App: GSD-2
// File Purpose: Regression tests for canonical issue lifecycle comments and sweep policy.

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLifecycleComment,
  buildNeedsInfoSweepComment,
  buildNeedsInfoSweepQuery,
  daysAgoIsoDate,
  hasLifecycleComment,
  listNeedsInfoSweepIssues,
  lifecycleMarker,
  parseNeedsInfoMaxDays,
} from "../issue-lifecycle.mjs";

test("buildLifecycleComment returns comments for canonical lifecycle labels", () => {
  const comment = buildLifecycleComment("needs-info");

  assert.match(comment, /needs a bit more information/);
  assert.match(comment, new RegExp(lifecycleMarker("needs-info")));
});

test("buildLifecycleComment ignores non-lifecycle labels", () => {
  assert.equal(buildLifecycleComment("bug"), null);
});

test("hasLifecycleComment prevents repeat lifecycle comments", () => {
  assert.equal(
    hasLifecycleComment([{ body: `${lifecycleMarker("ready-for-agent")}\nready` }], "ready-for-agent"),
    true,
  );
  assert.equal(hasLifecycleComment([{ body: "ordinary comment" }], "ready-for-agent"), false);
});

test("buildNeedsInfoSweepQuery selects stale open needs-info issues", () => {
  const now = new Date("2026-05-17T12:00:00Z");

  assert.equal(daysAgoIsoDate(14, now), "2026-05-03");
  assert.equal(
    buildNeedsInfoSweepQuery("gsd-build", "gsd-2", 14, now),
    "repo:gsd-build/gsd-2 is:issue is:open label:needs-info updated:<2026-05-03",
  );
});

test("buildNeedsInfoSweepComment explains the non-destructive stale issue transition", () => {
  const comment = buildNeedsInfoSweepComment(14);

  assert.match(comment, new RegExp(lifecycleMarker("needs-info-sweep")));
  assert.match(comment, /moving back to maintainer triage/);
});

test("parseNeedsInfoMaxDays validates positive integers", () => {
  assert.equal(parseNeedsInfoMaxDays("14"), 14);
  assert.throws(
    () => parseNeedsInfoMaxDays("zero"),
    /NEEDS_INFO_MAX_DAYS must be a positive integer/,
  );
  assert.throws(
    () => parseNeedsInfoMaxDays("0"),
    /NEEDS_INFO_MAX_DAYS must be a positive integer/,
  );
});

test("listNeedsInfoSweepIssues paginates and excludes pull requests", async () => {
  const calls = [];
  const githubJson = async (path) => {
    calls.push(path);
    if (/[?&]page=1\b/.test(path)) {
      return {
        items: [
          { number: 1, title: "issue 1" },
          ...Array.from({ length: 99 }, (_, i) => ({ number: i + 2, title: `issue ${i + 2}` })),
          { number: 1000, pull_request: {} },
        ],
      };
    }
    return {
      items: [{ number: 200, title: "issue 200" }],
    };
  };

  const issues = await listNeedsInfoSweepIssues(githubJson, "gsd-build", "gsd-2", 14);
  assert.equal(issues.some((issue) => issue.pull_request), false);
  assert.equal(issues.length, 101);
  assert.equal(calls.length, 2);
});
