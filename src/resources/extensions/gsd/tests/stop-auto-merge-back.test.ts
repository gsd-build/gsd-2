// Project/App: GSD-2
// File Purpose: Stop-auto worktree exit strategy regression tests.
/**
 * stop-auto-merge-back.test.ts — Regression test for #5576.
 *
 * When auto-mode stops after a milestone is complete, stopAuto should trigger
 * merge-back (mergeAndExit) instead of just exiting the worktree with
 * preserveBranch: true. Otherwise milestone code stays stranded on the
 * worktree branch and never reaches main.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { _resolveStopAutoMilestoneId, _selectStopAutoWorktreeExit } from "../auto.ts";

test("#5576: stopAuto should check milestone completion status before choosing exit strategy", () => {
  assert.equal(
    _selectStopAutoWorktreeExit({
      currentMilestoneId: "M001",
      milestoneComplete: true,
      milestoneMergedInPhases: false,
    }),
    "merge",
  );
});

test("#5576: stopAuto still preserves branch for incomplete milestones", () => {
  assert.equal(
    _selectStopAutoWorktreeExit({
      currentMilestoneId: "M001",
      milestoneComplete: false,
      milestoneMergedInPhases: false,
    }),
    "preserve",
  );
});

test("#5576: stopAuto does not merge a milestone already merged in phases", () => {
  assert.equal(
    _selectStopAutoWorktreeExit({
      currentMilestoneId: "M001",
      milestoneComplete: true,
      milestoneMergedInPhases: true,
    }),
    "none",
  );
});

test("#5576: stopAuto skips worktree teardown when no milestone is active", () => {
  assert.equal(
    _selectStopAutoWorktreeExit({
      currentMilestoneId: null,
      milestoneComplete: true,
      milestoneMergedInPhases: false,
    }),
    "none",
  );
});

test("#5576: stopAuto returns none when phases are already merged even if milestone is not flagged complete", () => {
  assert.equal(
    _selectStopAutoWorktreeExit({
      currentMilestoneId: "M001",
      milestoneComplete: false,
      milestoneMergedInPhases: true,
    }),
    "none",
  );
});

test("#6273: stopAuto infers milestone id from milestone worktree path when session milestone id is missing", () => {
  assert.equal(
    _resolveStopAutoMilestoneId(null, "/repo/.gsd/worktrees/M001"),
    "M001",
  );
});

test("#6273: stopAuto does not infer non-milestone worktree names", () => {
  assert.equal(
    _resolveStopAutoMilestoneId(null, "/repo/.gsd/worktrees/feature-x"),
    null,
  );
});
