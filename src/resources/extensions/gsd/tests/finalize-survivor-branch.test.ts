// GSD-2 + src/resources/extensions/gsd/tests/finalize-survivor-branch.test.ts
// Regression: a thrown error from `_mergeBranchMode` (made fail-loud in
// commit 68ef58a3c) must be caught at the survivor-finalize call site so
// bootstrap surfaces an error notify instead of an unhandled exception
// propagating to the slash-command caller (#5549 post-merge audit, R2).

import test from "node:test";
import assert from "node:assert/strict";

import { _finalizeSurvivorBranch } from "../auto-start.js";
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

test("happy path: survivor merge runs, returns merged:true, info notify announces the merge", () => {
  const resolverState: FakeResolverState = { mergeCalls: [] };
  const uiState: FakeUiState = { notifications: [] };
  const result = _finalizeSurvivorBranch(
    fakeResolver(resolverState),
    "M001",
    fakeUi(uiState),
  );

  assert.deepEqual(result, { merged: true });
  assert.deepEqual(resolverState.mergeCalls, [{ milestoneId: "M001" }]);
  assert.equal(uiState.notifications.length, 1);
  assert.equal(uiState.notifications[0].level, "info");
  assert.match(
    uiState.notifications[0].message,
    /Milestone M001 is complete but branch\/worktree was not finalized/,
  );
});

test("regression: thrown error from mergeAndExit (e.g. wrong-branch) is caught and surfaced as error notify", () => {
  // Pre-PR-5549 commit 5: `_mergeBranchMode` returned false silently.
  // Post-commit 5: it throws. Without this fix, the throw at auto-start.ts
  // line ~810 would bubble through `bootstrapAutoSession` to
  // `startAutoDetached`'s top-level .catch as an unhandled-exception log
  // — observable as a stack trace instead of a clean failure notification.
  const boom = new Error("dirty working tree blocks checkout");
  const resolverState: FakeResolverState = { mergeCalls: [], shouldThrow: boom };
  const uiState: FakeUiState = { notifications: [] };

  // Must not throw.
  const result = _finalizeSurvivorBranch(
    fakeResolver(resolverState),
    "M001",
    fakeUi(uiState),
  );

  assert.equal(result.merged, false);
  assert.equal(result.error, boom);

  // Two notifies: info (announce) + error (the failure detail).
  assert.equal(uiState.notifications.length, 2);
  assert.equal(uiState.notifications[0].level, "info");
  assert.equal(uiState.notifications[1].level, "error");
  assert.match(
    uiState.notifications[1].message,
    /Survivor-branch finalization for M001 failed/,
  );
  assert.match(uiState.notifications[1].message, /dirty working tree blocks checkout/);
  assert.match(uiState.notifications[1].message, /Resolve manually/);
});

test("non-Error thrown values are stringified into the user-facing message", () => {
  const resolverState: FakeResolverState = {
    mergeCalls: [],
    shouldThrow: "git lock contention",
  };
  const uiState: FakeUiState = { notifications: [] };

  const result = _finalizeSurvivorBranch(
    fakeResolver(resolverState),
    "M001",
    fakeUi(uiState),
  );

  assert.equal(result.merged, false);
  assert.equal(result.error, resolverState.shouldThrow);
  assert.equal(uiState.notifications[1].level, "error");
  assert.match(uiState.notifications[1].message, /git lock contention/);
});

test("inner notifications from mergeAndExit's NotifyCtx reach the same UI", () => {
  // The resolver's NotifyCtx must be wired to ui.notify so messages emitted
  // inside mergeAndExit (e.g. "Milestone Mxxx merged. Pushed to remote.")
  // appear in the same UI stream as the outer notifies.
  const uiState: FakeUiState = { notifications: [] };
  const ui = fakeUi(uiState);

  const resolver = {
    mergeAndExit: (_milestoneId: string, ctx: { notify: (msg: string, level?: "info" | "warning" | "error" | "success") => void }) => {
      ctx.notify("Milestone M001 merged.", "success");
    },
  } as unknown as WorktreeResolver;

  const result = _finalizeSurvivorBranch(resolver, "M001", ui);

  assert.equal(result.merged, true);
  // 1: outer announce
  // 2: inner success
  assert.equal(uiState.notifications.length, 2);
  assert.equal(uiState.notifications[1].level, "success");
  assert.equal(uiState.notifications[1].message, "Milestone M001 merged.");
});
