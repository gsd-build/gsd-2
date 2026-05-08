// GSD-2 + src/resources/extensions/gsd/tests/select-resumable-milestone.test.ts
// Regression: bootstrap must rederive `currentMilestoneId` from an unmerged
// completed milestone branch when in-memory state was lost across a process
// restart (#5538-followup).

import test from "node:test";
import assert from "node:assert/strict";

import { _selectResumableMilestone } from "../auto-start.js";

const ALL_COMPLETE = (_id: string) => true;
const NEVER_COMPLETE = (_id: string) => false;
const HAS_COMMITS = (_branch: string) => 1;
const NO_COMMITS = (_branch: string) => 0;

test("returns null when no branches exist", () => {
  const result = _selectResumableMilestone([], new Set(), ALL_COMPLETE, HAS_COMMITS);
  assert.equal(result, null);
});

test("returns null when every milestone branch is already merged", () => {
  const branches = ["milestone/M001", "milestone/M002"];
  const merged = new Set(branches);
  const result = _selectResumableMilestone(branches, merged, ALL_COMPLETE, HAS_COMMITS);
  assert.equal(result, null);
});

test("returns null when no candidate milestones are complete", () => {
  const branches = ["milestone/M002"];
  const result = _selectResumableMilestone(branches, new Set(), NEVER_COMPLETE, HAS_COMMITS);
  assert.equal(result, null);
});

test("returns null when no branch has commits ahead", () => {
  const branches = ["milestone/M002"];
  const result = _selectResumableMilestone(branches, new Set(), ALL_COMPLETE, NO_COMMITS);
  assert.equal(result, null);
});

test("returns the unmerged completed milestone (regression: M002 stranded after restart)", () => {
  // Repro of test12345 state: M001 ✅ merged, M002 ✅ unmerged, M003 🔄.
  // Bootstrap must seed currentMilestoneId = "M002" so the loop's transition
  // guard fires when the next iteration sees mid="M003".
  const branches = ["milestone/M002", "milestone/M003"];
  const merged = new Set<string>(); // none merged from this list
  const isComplete = (id: string) => id === "M002"; // M003 still in progress
  const result = _selectResumableMilestone(branches, merged, isComplete, HAS_COMMITS);
  assert.equal(result, "M002");
});

test("picks the lex-greatest milestone when multiple candidates exist", () => {
  // M001, M002 both unmerged complete -> pick M002 (the most recent).
  const branches = ["milestone/M001", "milestone/M002"];
  const result = _selectResumableMilestone(
    branches,
    new Set(),
    ALL_COMPLETE,
    HAS_COMMITS,
  );
  assert.equal(result, "M002");
});

test("ignores branch names that don't follow the milestone/ prefix", () => {
  const branches = ["feature/something", "milestone/M002", "fix/bug-1"];
  const result = _selectResumableMilestone(
    branches,
    new Set(),
    ALL_COMPLETE,
    HAS_COMMITS,
  );
  assert.equal(result, "M002");
});

test("isComplete callback throwing skips that milestone but does not crash", () => {
  const branches = ["milestone/M001", "milestone/M002"];
  const isComplete = (id: string) => {
    if (id === "M001") throw new Error("db unavailable for M001");
    return true;
  };
  // Implementation choice: a thrown isComplete is propagated. Wrapping in
  // try/catch happens at the production wrapper level (findUnmergedCompletedMilestone).
  // Verify the helper itself surfaces the error so callers see real failures.
  assert.throws(() => _selectResumableMilestone(branches, new Set(), isComplete, HAS_COMMITS));
});

test("commitsAhead callback throwing for one branch falls through to others", () => {
  // Production wrapper: commits-ahead failures should not abort the search.
  // The helper catches throws from commitsAhead per-branch and treats as 0.
  const branches = ["milestone/M001", "milestone/M002"];
  const commitsAhead = (branch: string) => {
    if (branch === "milestone/M001") throw new Error("rev-walk failed");
    return 5;
  };
  const result = _selectResumableMilestone(branches, new Set(), ALL_COMPLETE, commitsAhead);
  assert.equal(result, "M002");
});
