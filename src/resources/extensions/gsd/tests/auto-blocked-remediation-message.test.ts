import test from "node:test";
import assert from "node:assert/strict";

import { runPreDispatch } from "../auto/phases.ts";

test("blocked remediation warning uses /gsd dispatch reassess and hides internal tool name", async () => {
  const notifications: Array<{ message: string; level?: string }> = [];
  const desktopMessages: string[] = [];

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
      basePath: "/tmp/gsd-test",
      originalBasePath: "/tmp/gsd-test",
      canonicalProjectRoot: "/tmp/gsd-test",
      resourceVersionOnStart: "test",
      currentMilestoneId: null,
      currentUnit: null,
      milestoneMergedInPhases: false,
    },
    prefs: undefined,
    iteration: 1,
    flowId: "flow-1",
    nextSeq: () => 1,
    deps: {
      checkResourcesStale() {
        return null;
      },
      invalidateAllCaches() {},
      async preDispatchHealthGate() {
        return { proceed: true, fixesApplied: [] };
      },
      async deriveState() {
        return {
          phase: "blocked",
          activeMilestone: { id: "M005", title: "Milestone five" },
          activeSlice: null,
          activeTask: null,
          recentDecisions: [],
          blockers: [
            "Milestone M005 validation verdict is needs-remediation but all slices are complete. Add remediation slices via gsd_reassess_roadmap, or run `/gsd verdict pass --rationale \"...\"` to override.",
          ],
          nextAction: "Resolve M005 remediation before proceeding.",
          registry: [{ id: "M005", status: "active" }],
        };
      },
      syncCmuxSidebar() {},
      setActiveMilestoneId() {},
      getIsolationMode() {
        return "none";
      },
      captureIntegrationBranch() {},
      pruneQueueOrder() {},
      async rebuildState() {},
      reconcileMergeState() {
        return "clean";
      },
      async pauseAuto() {},
      sendDesktopNotification(_title: string, message: string) {
        desktopMessages.push(message);
      },
      logCmuxEvent() {},
      emitJournalEvent() {},
    },
  } as any;

  const result = await runPreDispatch(ic, {
    recentUnits: [],
    stuckRecoveryAttempts: 0,
    consecutiveFinalizeTimeouts: 0,
  });

  assert.deepEqual(result, { action: "break", reason: "blocked" });

  const warning = notifications.find((n) => n.level === "warning")?.message ?? "";
  assert.match(warning, /\/gsd dispatch reassess/);
  assert.doesNotMatch(warning, /gsd_reassess_roadmap/);

  const desktop = desktopMessages[0] ?? "";
  assert.match(desktop, /\/gsd dispatch reassess/);
  assert.doesNotMatch(desktop, /gsd_reassess_roadmap/);
});
