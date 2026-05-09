/**
 * phases-merge-error-stops-auto.test.ts — Regression test for #2766.
 *
 * When mergeAndExit throws a non-MergeConflictError, the auto loop must
 * stop instead of continuing with unmerged work. This test verifies that
 * all catch blocks in auto/phases.ts that handle mergeAndExit errors
 * call stopAuto and return { action: "break" } for non-conflict errors.
 */

import { createTestContext } from "./test-helpers.ts";
import { runPreDispatch } from "../auto/phases.ts";

const { assertTrue, report } = createTestContext();

console.log("\n=== #2766: Non-MergeConflictError stops auto mode ===");

const notifications: Array<{ message: string; level?: string }> = [];
const calls: string[] = [];
const basePath = "/tmp/gsd-test";
const ic = {
  ctx: {
    ui: {
      notify(message: string, level?: string) {
        notifications.push({ message, level });
      },
    },
  },
  pi: {},
  s: {
    basePath,
    originalBasePath: basePath,
    canonicalProjectRoot: basePath,
    resourceVersionOnStart: "test",
    currentMilestoneId: "M001",
    currentUnit: null,
    milestoneMergedInPhases: false,
  },
  prefs: undefined,
  iteration: 1,
  flowId: "test-flow",
  nextSeq: () => 1,
  deps: {
    checkResourcesStale() {
      return null;
    },
    invalidateAllCaches() {
      calls.push("invalidate");
    },
    async preDispatchHealthGate() {
      calls.push("health");
      return { proceed: true, fixesApplied: [] };
    },
    async deriveState(projectRoot: string) {
      calls.push(`derive:${projectRoot}`);
      return {
        phase: "complete",
        activeMilestone: { id: "M001", title: "Milestone one" },
        activeSlice: null,
        activeTask: null,
        registry: [{ id: "M001", status: "complete" }],
        nextAction: "complete",
      };
    },
    syncCmuxSidebar() {
      calls.push("sync-sidebar");
    },
    setActiveMilestoneId(_basePath: string, mid: string) {
      calls.push(`set-active:${mid}`);
    },
    reconcileMergeState() {
      calls.push("reconcile");
      return "clean";
    },
    preflightCleanRoot() {
      calls.push("preflight");
      return { ok: true, stashPushed: true, stashMarker: "marker" };
    },
    postflightPopStash() {
      calls.push("postflight");
      return { ok: true, needsManualRecovery: false };
    },
    resolver: {
      mergeAndExit() {
        calls.push("merge");
        throw new Error("remote rejected push");
      },
    },
    lifecycle: {
      exitMilestone() {
        calls.push("merge");
        return {
          ok: false,
          reason: "teardown-failed",
          cause: new Error("remote rejected push"),
        };
      },
    },
    async stopAuto(_ctx: unknown, _pi: unknown, reason?: string) {
      calls.push(`stop:${reason}`);
    },
  },
} as any;

const result = await runPreDispatch(ic, {
  recentUnits: [],
  stuckRecoveryAttempts: 0,
  consecutiveFinalizeTimeouts: 0,
});

assertTrue(result.action === "break", "non-conflict merge error returns break");
if (result.action === "break") {
  assertTrue(result.reason === "merge-failed", "non-conflict merge error uses merge-failed reason");
}
assertTrue(
  calls.join(" > ") === "invalidate > health > derive:/tmp/gsd-test > sync-sidebar > set-active:M001 > reconcile > preflight > merge > postflight > stop:Merge error on milestone M001: Error: remote rejected push",
  `pre-dispatch stops immediately after non-conflict merge failure (${calls.join(" > ")})`,
);
assertTrue(
  notifications.some((n) => n.level === "error" && n.message.includes("Merge failed: remote rejected push")),
  "user is notified with an error that merge failed",
);

report();
