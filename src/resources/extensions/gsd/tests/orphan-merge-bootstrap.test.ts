// GSD-2 + src/resources/extensions/gsd/tests/orphan-merge-bootstrap.test.ts
// Regression: bootstrap must actively merge orphan completed-but-unmerged
// milestones, not just seed `s.currentMilestoneId` (the seed approach was
// silently overwritten at auto-start.ts:948 — caught in audit of PR #5549).

import test from "node:test";
import assert from "node:assert/strict";

import { _mergeOrphanCompletedMilestone } from "../auto-start.js";
import type { WorktreeResolver } from "../worktree-resolver.js";

interface FakeResolverState {
  mergeCalls: Array<{ milestoneId: string }>;
  shouldThrow?: unknown;
}

function fakeResolver(state: FakeResolverState): WorktreeResolver {
  return {
    mergeAndExit: (milestoneId: string) => {
      state.mergeCalls.push({ milestoneId });
      if (state.shouldThrow) throw state.shouldThrow;
    },
  } as unknown as WorktreeResolver;
}

interface FakeUiState {
  notifications: Array<{ message: string; level: string }>;
}

function fakeUi(state: FakeUiState): {
  notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void;
} {
  return {
    notify: (message: string, level?: "info" | "warning" | "error" | "success") => {
      state.notifications.push({ message, level: level ?? "info" });
    },
  };
}

test("happy path: orphan merge runs, returns merged:true, emits info notify", () => {
  const resolverState: FakeResolverState = { mergeCalls: [] };
  const uiState: FakeUiState = { notifications: [] };
  const result = _mergeOrphanCompletedMilestone(
    fakeResolver(resolverState),
    "M002",
    fakeUi(uiState),
  );

  assert.deepEqual(result, { merged: true });
  assert.deepEqual(resolverState.mergeCalls, [{ milestoneId: "M002" }]);
  assert.equal(uiState.notifications.length, 1);
  assert.deepEqual(uiState.notifications[0], {
    message: "Detected unmerged completed milestone M002. Merging now.",
    level: "info",
  });
});

test("regression: mergeAndExit throwing (e.g. wrong-branch from PR #5549 commit 5) does not bubble out", () => {
  // Commit 5 (68ef58a3c) made `_mergeBranchMode` throw on wrong branch
  // instead of silently returning false. If `_mergeOrphanCompletedMilestone`
  // didn't catch the throw, bootstrap would surface an unhandled exception
  // to the slash-command caller — the exact regression risk that motivated
  // wrapping in try/catch.
  const boom = new Error("dirty working tree blocks checkout");
  const resolverState: FakeResolverState = { mergeCalls: [], shouldThrow: boom };
  const uiState: FakeUiState = { notifications: [] };

  const result = _mergeOrphanCompletedMilestone(
    fakeResolver(resolverState),
    "M002",
    fakeUi(uiState),
  );

  assert.equal(result.merged, false);
  assert.equal(result.error, boom);

  // First notify announces the merge attempt; second notify reports the failure.
  assert.equal(uiState.notifications.length, 2);
  assert.equal(uiState.notifications[0].level, "info");
  assert.equal(uiState.notifications[1].level, "warning");
  assert.match(
    uiState.notifications[1].message,
    /Could not merge orphan milestone M002/,
  );
  assert.match(uiState.notifications[1].message, /dirty working tree blocks checkout/);
  assert.match(uiState.notifications[1].message, /Resolve manually/);
});

test("non-Error thrown values are still captured and notified", () => {
  // Defensive: thrown strings, numbers, etc. must not crash the formatter.
  const resolverState: FakeResolverState = {
    mergeCalls: [],
    // mimic a thrown non-Error value
    shouldThrow: "git lock held",
  };
  const uiState: FakeUiState = { notifications: [] };

  const result = _mergeOrphanCompletedMilestone(
    fakeResolver(resolverState),
    "M002",
    fakeUi(uiState),
  );

  assert.equal(result.merged, false);
  assert.equal(result.error, resolverState.shouldThrow);
  assert.equal(uiState.notifications[1].level, "warning");
  assert.match(uiState.notifications[1].message, /git lock held/);
});

test("the mergeAndExit call receives a notify-bound NotifyCtx the resolver can invoke", () => {
  // The resolver's NotifyCtx must be wired to ui.notify so user-facing
  // messages from inside mergeAndExit (e.g. "Milestone Mxxx merged") still
  // reach the UI. Verify by having the fake resolver invoke the ctx.notify.
  const uiState: FakeUiState = { notifications: [] };
  const ui = fakeUi(uiState);

  const resolver = {
    mergeAndExit: (_milestoneId: string, ctx: { notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void }) => {
      ctx.notify("inner success message", "success");
    },
  } as unknown as WorktreeResolver;

  const result = _mergeOrphanCompletedMilestone(resolver, "M002", ui);

  assert.equal(result.merged, true);
  // 1: outer "Detected unmerged completed milestone..."
  // 2: inner "inner success message" emitted via the bound ctx.notify
  assert.equal(uiState.notifications.length, 2);
  assert.deepEqual(uiState.notifications[1], {
    message: "inner success message",
    level: "success",
  });
});
