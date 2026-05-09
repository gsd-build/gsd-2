// GSD-2 + src/resources/extensions/gsd/tests/milestone-merge-stash-restore.test.ts
// Regression: postflight stash pop must run even when mergeAndExit throws.

import test from "node:test";
import assert from "node:assert/strict";

import { _runMilestoneMergeWithStashRestore } from "../auto/phases.js";
import type { IterationContext } from "../auto/types.js";
import { MergeConflictError } from "../git-service.js";
import type {
  PostflightResult,
  PreflightResult,
} from "../clean-root-preflight.js";

interface CallLog {
  preflightCalls: number;
  mergeCalls: number;
  postflightCalls: number;
  stopAutoCalls: Array<string | undefined>;
  notifyCalls: Array<{ message: string; level: string }>;
  milestoneMergedInPhases: boolean;
}

function buildIc(opts: {
  preflightResult: PreflightResult;
  mergeBehavior: "succeed" | (() => never);
  postflightResult: PostflightResult;
}): { ic: IterationContext; log: CallLog } {
  const log: CallLog = {
    preflightCalls: 0,
    mergeCalls: 0,
    postflightCalls: 0,
    stopAutoCalls: [],
    notifyCalls: [],
    milestoneMergedInPhases: false,
  };

  const session = {
    basePath: "/tmp/proj",
    originalBasePath: "/tmp/proj",
    get milestoneMergedInPhases() {
      return log.milestoneMergedInPhases;
    },
    set milestoneMergedInPhases(v: boolean) {
      log.milestoneMergedInPhases = v;
    },
  };

  const ctx = {
    ui: {
      notify: (message: string, level: string) => {
        log.notifyCalls.push({ message, level });
      },
    },
  };

  const deps = {
    preflightCleanRoot: () => {
      log.preflightCalls += 1;
      return opts.preflightResult;
    },
    postflightPopStash: () => {
      log.postflightCalls += 1;
      return opts.postflightResult;
    },
    resolver: {
      mergeAndExit: () => {
        log.mergeCalls += 1;
        if (opts.mergeBehavior !== "succeed") {
          opts.mergeBehavior();
        }
      },
    },
    lifecycle: {
      exitMilestone: (_mid: string, exitOpts: { merge: boolean }) => {
        log.mergeCalls += 1;
        if (opts.mergeBehavior === "succeed") {
          return { ok: true, merged: exitOpts.merge, codeFilesChanged: false };
        }
        try {
          opts.mergeBehavior();
          return { ok: true, merged: exitOpts.merge, codeFilesChanged: false };
        } catch (err) {
          // Mirror Lifecycle's typed-result wrapping of MergeConflictError
          // and other thrown values per worktree-lifecycle.exitMilestone.
          const isMergeConflict =
            err !== null &&
            typeof err === "object" &&
            err !== undefined &&
            (err as { name?: string }).name === "MergeConflictError";
          return {
            ok: false,
            reason: isMergeConflict ? "merge-conflict" : "teardown-failed",
            cause: err,
          } as const;
        }
      },
    },
    stopAuto: async (_c?: unknown, _p?: unknown, reason?: string) => {
      log.stopAutoCalls.push(reason);
    },
  };

  const ic = {
    ctx,
    pi: {},
    s: session,
    deps,
  } as unknown as IterationContext;

  return { ic, log };
}

const STASH_PUSHED: PreflightResult = {
  stashPushed: true,
  stashMarker: "gsd-preflight-stash:M002:42:1700000000000:abc",
  summary: "Stashed uncommitted changes before merge (milestone M002).",
};

const STASH_NOT_PUSHED: PreflightResult = {
  stashPushed: false,
  summary: "",
};

const POP_OK: PostflightResult = {
  restored: true,
  needsManualRecovery: false,
  message: "Restored stashed changes after milestone M002 merge.",
  stashRef: "stash@{0}",
};

const POP_NEEDS_RECOVERY: PostflightResult = {
  restored: false,
  needsManualRecovery: true,
  message: "git stash pop stash@{0} failed: conflict in lib/models.ts",
};

test("happy path: merge succeeds and stash is popped", async () => {
  const { ic, log } = buildIc({
    preflightResult: STASH_PUSHED,
    mergeBehavior: "succeed",
    postflightResult: POP_OK,
  });

  const result = await _runMilestoneMergeWithStashRestore(ic, "M002");

  assert.equal(result, null, "happy path returns null (loop continues)");
  assert.equal(log.preflightCalls, 1);
  assert.equal(log.mergeCalls, 1);
  assert.equal(log.postflightCalls, 1, "postflight pop must run on success");
  assert.equal(log.stopAutoCalls.length, 0, "no stopAuto on happy path");
  assert.equal(log.milestoneMergedInPhases, true, "merge flag set");
});

test("regression #5538-followup: postflight pop runs even when mergeAndExit throws non-conflict error", async () => {
  // The original bug: when mergeAndExit threw, the catch block called
  // stopAuto + return break BEFORE postflight pop ran. The user's
  // gsd-preflight-stash:M00x stash was orphaned. This test exercises that
  // exact scenario and asserts the pop is now invoked.
  const { ic, log } = buildIc({
    preflightResult: STASH_PUSHED,
    mergeBehavior: () => {
      throw new Error("native git merge failed: index lock present");
    },
    postflightResult: POP_OK,
  });

  const result = await _runMilestoneMergeWithStashRestore(ic, "M002");

  assert.deepEqual(result, { action: "break", reason: "merge-failed" });
  assert.equal(log.mergeCalls, 1);
  assert.equal(
    log.postflightCalls,
    1,
    "postflight pop must run even on merge failure (was the bug)",
  );
  assert.equal(log.stopAutoCalls.length, 1);
  assert.match(log.stopAutoCalls[0] ?? "", /Merge error on milestone M002/);
  assert.equal(
    log.milestoneMergedInPhases,
    false,
    "merge flag must NOT be set when merge throws",
  );
});

test("regression #5538-followup: postflight pop runs even when mergeAndExit throws MergeConflictError", async () => {
  const { ic, log } = buildIc({
    preflightResult: STASH_PUSHED,
    mergeBehavior: () => {
      throw new MergeConflictError(
        ["lib/models.ts", "app/page.tsx"],
        "squash",
        "milestone/M002",
        "main",
      );
    },
    postflightResult: POP_OK,
  });

  const result = await _runMilestoneMergeWithStashRestore(ic, "M002");

  assert.deepEqual(result, { action: "break", reason: "merge-conflict" });
  assert.equal(log.mergeCalls, 1);
  assert.equal(
    log.postflightCalls,
    1,
    "postflight pop must run on merge conflict (was the bug)",
  );
  assert.equal(log.stopAutoCalls.length, 1);
  assert.match(log.stopAutoCalls[0] ?? "", /Merge conflict on milestone M002/);
});

test("clean tree: no stash to pop, merge succeeds, no pop attempted", async () => {
  const { ic, log } = buildIc({
    preflightResult: STASH_NOT_PUSHED,
    mergeBehavior: "succeed",
    postflightResult: POP_OK,
  });

  const result = await _runMilestoneMergeWithStashRestore(ic, "M002");

  assert.equal(result, null);
  assert.equal(log.postflightCalls, 0, "no pop when nothing was stashed");
  assert.equal(log.milestoneMergedInPhases, true);
});

test("merge succeeds but stash pop needs manual recovery -> postflight-stash-restore-failed break", async () => {
  const { ic, log } = buildIc({
    preflightResult: STASH_PUSHED,
    mergeBehavior: "succeed",
    postflightResult: POP_NEEDS_RECOVERY,
  });

  const result = await _runMilestoneMergeWithStashRestore(ic, "M002");

  assert.deepEqual(result, {
    action: "break",
    reason: "postflight-stash-restore-failed",
  });
  assert.equal(log.postflightCalls, 1);
  assert.equal(log.stopAutoCalls.length, 1);
  assert.match(
    log.stopAutoCalls[0] ?? "",
    /Post-merge stash restore failed for milestone M002/,
  );
});

test("merge error is reported even when stash pop also failed (merge-error takes priority)", async () => {
  const { ic, log } = buildIc({
    preflightResult: STASH_PUSHED,
    mergeBehavior: () => {
      throw new Error("network unreachable during push");
    },
    postflightResult: POP_NEEDS_RECOVERY,
  });

  const result = await _runMilestoneMergeWithStashRestore(ic, "M002");

  assert.deepEqual(result, { action: "break", reason: "merge-failed" });
  assert.equal(log.postflightCalls, 1, "postflight pop still attempted");
  assert.equal(log.stopAutoCalls.length, 1, "stopAuto called once, not twice");
  assert.match(
    log.stopAutoCalls[0] ?? "",
    /Merge error/,
    "stopAuto message reflects merge error, not stash failure",
  );
});
