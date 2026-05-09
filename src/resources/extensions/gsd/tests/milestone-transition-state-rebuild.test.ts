/**
 * milestone-transition-state-rebuild.test.ts — Tests for #1576 fix.
 *
 * Verifies that:
 * 1. rebuildState() is called after milestone transitions so STATE.md
 *    reflects the new active milestone.
 * 2. completed-units.json is reset when the active milestone changes,
 *    preventing stale entries from causing dispatch skips.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AutoSession } from "../auto/session.ts";
import { runPreDispatch } from "../auto/phases.ts";

test("milestone transition archives completed units and rebuilds state", async () => {
  const tempDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-cu-reset-")));
  const calls: string[] = [];
  try {
    const gsdDir = join(tempDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });

    const completedKeysPath = join(gsdDir, "completed-units.json");
    const staleEntries = [
      "context-gather/M001",
      "roadmap-plan/M001",
      "plan-slice/S01",
      "execute-task/T01",
    ];
    writeFileSync(completedKeysPath, JSON.stringify(staleEntries, null, 2));

    const s = new AutoSession();
    s.basePath = tempDir;
    s.originalBasePath = tempDir;
    s.currentMilestoneId = "M001";
    s.unitDispatchCount.set("old", 1);
    s.unitRecoveryCount.set("old", 1);
    s.unitLifetimeDispatches.set("old", 1);

    const state = {
      phase: "planning",
      activeMilestone: { id: "M002", title: "Next" },
      activeSlice: null,
      activeTask: null,
      recentDecisions: [],
      blockers: [],
      nextAction: "Plan M002",
      registry: [
        { id: "M001", title: "Done", status: "complete" },
        { id: "M002", title: "Next", status: "active" },
      ],
    };

    const result = await runPreDispatch({
      ctx: { ui: { notify() {} } },
      pi: {},
      s,
      prefs: undefined,
      iteration: 1,
      flowId: "test-flow",
      nextSeq: () => 1,
      deps: {
        checkResourcesStale: () => null,
        invalidateAllCaches: () => calls.push("invalidate"),
        preDispatchHealthGate: async () => ({ proceed: true, fixesApplied: [] }),
        syncProjectRootToWorktree: () => {},
        deriveState: async () => state,
        syncCmuxSidebar: () => {},
        preflightCleanRoot: () => ({ ok: true, stashPushed: false }),
        postflightPopStash: () => ({ ok: true, needsManualRecovery: false }),
        resolver: {
          mergeAndExit: () => calls.push("merge"),
        },
        lifecycle: {
          enterMilestone: (mid: string) => {
            calls.push(`enter:${mid}`);
            return { ok: true, mode: "worktree", path: `/wt/${mid}` };
          },
          exitMilestone: (mid: string, opts: { merge: boolean }) => {
            calls.push(opts.merge ? `merge:${mid}` : `exit:${mid}`);
            return { ok: true, merged: opts.merge, codeFilesChanged: false };
          },
        },
        sendDesktopNotification: () => {},
        logCmuxEvent: () => {},
        getIsolationMode: () => "none",
        captureIntegrationBranch: () => {},
        pruneQueueOrder: (_base: string, pending: string[]) => calls.push(`prune:${pending.join(",")}`),
        rebuildState: async () => calls.push("rebuild"),
        setActiveMilestoneId: (_base: string, mid: string) => calls.push(`active:${mid}`),
        reconcileMergeState: () => "clean",
        emitJournalEvent: () => {},
        stopAuto: async () => {},
        pauseAuto: async () => {},
        closeoutUnit: async () => {},
        buildSnapshotOpts: () => ({}),
      },
    } as any, {
      recentUnits: [{ key: "stale" }],
      stuckRecoveryAttempts: 2,
      consecutiveFinalizeTimeouts: 0,
    });

    assert.equal(result.action, "next");
    assert.equal(s.currentMilestoneId, "M002");
    assert.equal(s.unitDispatchCount.size, 0);
    assert.equal(s.unitRecoveryCount.size, 0);
    assert.equal(s.unitLifetimeDispatches.size, 0);
    assert.ok(existsSync(join(gsdDir, "completed-units-M001.json")));
    const after = JSON.parse(readFileSync(completedKeysPath, "utf-8"));
    assert.deepEqual(after, []);
    assert.ok(
      calls.indexOf("prune:M002") < calls.indexOf("rebuild"),
      `expected prune before rebuild, got ${calls.join(" > ")}`,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
