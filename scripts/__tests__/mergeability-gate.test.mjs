import test from "node:test";
import assert from "node:assert/strict";

import { shouldSkipHeavyJobs } from "../ci/mergeability-gate.mjs";

test("returns false for non-pull_request events", () => {
  assert.equal(shouldSkipHeavyJobs({ eventName: "push", mergeableState: "dirty" }), false);
});

test("returns true for pull_request with dirty mergeable_state", () => {
  assert.equal(shouldSkipHeavyJobs({ eventName: "pull_request", mergeableState: "dirty" }), true);
});

test("returns false for clean/unknown pull_request states", () => {
  assert.equal(shouldSkipHeavyJobs({ eventName: "pull_request", mergeableState: "clean" }), false);
  assert.equal(shouldSkipHeavyJobs({ eventName: "pull_request", mergeableState: "unknown" }), false);
  assert.equal(shouldSkipHeavyJobs({ eventName: "pull_request", mergeableState: "unstable" }), false);
});
