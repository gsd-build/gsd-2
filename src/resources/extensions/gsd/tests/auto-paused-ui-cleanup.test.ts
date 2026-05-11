// Project/App: GSD-2
// File Purpose: Behavior tests for auto-loop cleanup after paused provider exits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupAfterLoopExit, rerootCommandSession, stopAuto } from "../auto.ts";
import { autoSession } from "../auto-runtime-state.ts";
import { closeDatabase, insertMilestone, insertSlice, openDatabase } from "../gsd-db.ts";
import { WorktreeLifecycle } from "../worktree-lifecycle.ts";

test("cleanupAfterLoopExit preserves paused auto badge after provider pause", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-paused-cleanup-"));
  const previousCwd = process.cwd();
  const statuses: Array<[string, string | undefined]> = [];

  autoSession.reset();
  autoSession.active = true;
  autoSession.paused = true;
  autoSession.basePath = join(base, ".gsd", "worktrees", "M001");
  autoSession.originalBasePath = base;

  try {
    await cleanupAfterLoopExit({
      ui: {
        setStatus: (key: string, value: string | undefined) => {
          statuses.push([key, value]);
        },
        setWidget: () => {},
        notify: () => {},
      },
    } as any);

    assert.equal(statuses.some(([key]) => key === "gsd-auto"), false);
    assert.equal(autoSession.active, false);
    assert.equal(autoSession.paused, true);
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});

test("cleanupAfterLoopExit clears status without replacing the last auto surface", async () => {
  const statusCalls: unknown[] = [];
  const widgetCalls: unknown[] = [];

  autoSession.reset();
  autoSession.active = true;
  autoSession.paused = false;

  try {
    await cleanupAfterLoopExit({
      hasUI: false,
      ui: {
        setStatus: (...args: unknown[]) => statusCalls.push(args),
        setWidget: (...args: unknown[]) => widgetCalls.push(args),
        notify: () => {},
      },
    } as any);

    assert.deepEqual(statusCalls, [["gsd-auto", undefined]]);
    assert.equal(
      widgetCalls.some((args) => Array.isArray(args) && args[0] === "gsd-progress" && args[1] === undefined),
      false,
      "cleanup must not clear the last meaningful auto progress surface",
    );
    assert.equal(
      widgetCalls.some((args) => Array.isArray(args) && args[0] === "gsd-outcome"),
      false,
      "cleanup must not replace the auto deck with a generic loop-ended card",
    );
    assert.equal(autoSession.active, false);
    assert.equal(autoSession.paused, false);
  } finally {
    autoSession.reset();
  }
});

test("cleanupAfterLoopExit preserves completion roll-up after stopAuto reset", async () => {
  const statusCalls: unknown[] = [];
  const widgetCalls: unknown[] = [];

  autoSession.reset();
  autoSession.active = true;
  autoSession.paused = false;
  autoSession.completionStopInProgress = true;
  autoSession.resetAfterStop({ preserveCompletionSurface: true });

  try {
    await cleanupAfterLoopExit({
      hasUI: true,
      ui: {
        setStatus: (...args: unknown[]) => statusCalls.push(args),
        setWidget: (...args: unknown[]) => widgetCalls.push(args),
        setHeader: () => {},
        notify: () => {},
      },
    } as any);

    assert.deepEqual(statusCalls, [["gsd-auto", undefined]]);
    assert.equal(
      widgetCalls.some((args) => Array.isArray(args) && args[0] === "gsd-progress" && args[1] === undefined),
      false,
      "completion cleanup must not clear the roll-up progress widget",
    );
    assert.equal(
      widgetCalls.some((args) => Array.isArray(args) && args[0] === "gsd-outcome"),
      false,
      "completion cleanup must not replace the roll-up with a generic outcome card",
    );
    assert.equal(autoSession.completionStopInProgress, false);
  } finally {
    autoSession.reset();
  }
});

test("cleanupAfterLoopExit restores project root through lifecycle and preserves chdir", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-cleanup-lifecycle-"));
  const worktree = join(base, ".gsd", "worktrees", "M001");
  const previousCwd = process.cwd();
  let restoreCalls = 0;
  const originalRestore = WorktreeLifecycle.prototype.restoreToProjectRoot;
  t.mock.method(WorktreeLifecycle.prototype, "restoreToProjectRoot", function (this: WorktreeLifecycle) {
    restoreCalls += 1;
    return originalRestore.call(this);
  });

  mkdirSync(worktree, { recursive: true });
  autoSession.reset();
  autoSession.active = true;
  autoSession.basePath = worktree;
  autoSession.originalBasePath = base;

  try {
    await cleanupAfterLoopExit({
      ui: {
        setStatus: () => {},
        setWidget: () => {},
        notify: () => {},
      },
    } as any);

    assert.equal(restoreCalls, 1);
    assert.equal(autoSession.basePath, base);
    assert.equal(realpathSync(process.cwd()), realpathSync(base));
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});

test("cleanupAfterLoopExit keeps cleanup best-effort when lifecycle restore throws", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-cleanup-restore-throw-"));
  const worktree = join(base, ".gsd", "worktrees", "M001");
  const previousCwd = process.cwd();
  let restoreCalls = 0;
  // ADR-016 phase 3 (#5693): the real `restoreToProjectRoot` assigns
  // `s.basePath = s.originalBasePath` BEFORE any throwable work
  // (rebuildGitService, cache invalidation). Mirror that ordering in the
  // mock so the throw scenario reflects production: basePath is restored
  // even when the verb throws partway through.
  t.mock.method(WorktreeLifecycle.prototype, "restoreToProjectRoot", function (this: WorktreeLifecycle) {
    restoreCalls += 1;
    (this as unknown as { s: { basePath: string; originalBasePath: string } })
      .s.basePath = (this as unknown as { s: { originalBasePath: string } }).s.originalBasePath;
    throw new Error("restore failed");
  });

  mkdirSync(worktree, { recursive: true });
  autoSession.reset();
  autoSession.active = true;
  autoSession.basePath = worktree;
  autoSession.originalBasePath = base;

  try {
    await cleanupAfterLoopExit({
      ui: {
        setStatus: () => {},
        setWidget: () => {},
        notify: () => {},
      },
    } as any);

    assert.equal(restoreCalls, 1);
    assert.equal(autoSession.basePath, base);
    assert.equal(realpathSync(process.cwd()), realpathSync(base));
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});

test("rerootCommandSession refreshes command workspace to project root", async () => {
  const calls: string[] = [];
  const result = await rerootCommandSession(
    {
      newSession: async ({ workspaceRoot }: { workspaceRoot: string }) => {
        calls.push(workspaceRoot);
        return { cancelled: false };
      },
    } as any,
    "/project/root",
  );

  assert.deepEqual(result, { status: "ok" });
  assert.deepEqual(calls, ["/project/root"]);
});

test("stopAuto completion closeout reroots session, restores cwd, and preserves final widget", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-completion-stop-"));
  const previousCwd = process.cwd();
  const widgetCalls: Array<[string, unknown]> = [];
  const notifications: string[] = [];
  const newSessionWorkspaces: string[] = [];
  let restoreCalls = 0;
  const originalRestore = WorktreeLifecycle.prototype.restoreToProjectRoot;
  t.mock.method(WorktreeLifecycle.prototype, "restoreToProjectRoot", function (this: WorktreeLifecycle) {
    restoreCalls += 1;
    return originalRestore.call(this);
  });
  const milestoneDir = join(base, ".gsd", "milestones", "M003");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(join(milestoneDir, "M003-SUMMARY.md"), [
    "---",
    "id: M003",
    'title: "Budget tracking"',
    "status: complete",
    "key_decisions:",
    "  - Keep completion closeout in the same TUI surface.",
    "key_files:",
    "  - src/resources/extensions/gsd/auto-dashboard.ts",
    "lessons_learned:",
    "  - Milestone endings need report output, not auto-loop status.",
    "---",
    "",
    "# M003: Budget tracking",
    "",
    "**Added budget warning output and provider roll-up details.**",
    "",
    "## Success Criteria Results",
    "",
    "Budget warnings appear at milestone completion.",
    "",
    "## Definition of Done Results",
    "",
    "Completion leaves the report surface visible.",
    "",
    "## Requirement Outcomes",
    "",
    "Users can see what shipped without opening a fresh session.",
    "",
    "## Deviations",
    "",
    "None.",
    "",
    "## Follow-ups",
    "",
    "None.",
    "",
  ].join("\n"), "utf-8");

  autoSession.reset();
  openDatabase(join(base, "gsd-test.db"));
  insertMilestone({ id: "M003", title: "Budget tracking", status: "complete" });
  insertSlice({ id: "S01", milestoneId: "M003", title: "Complete slice", status: "complete", sequence: 1 });
  insertSlice({ id: "S02", milestoneId: "M003", title: "Done slice", status: "done", sequence: 2 });
  insertSlice({ id: "S03", milestoneId: "M003", title: "Pending slice", status: "active", sequence: 3 });

  autoSession.active = true;
  autoSession.paused = false;
  autoSession.basePath = join(base, ".gsd", "worktrees", "M003");
  autoSession.originalBasePath = base;
  autoSession.currentMilestoneId = "M003";
  autoSession.autoStartTime = Date.now() - 60_000;
  autoSession.cmdCtx = {
    newSession: async ({ workspaceRoot }: { workspaceRoot: string }) => {
      newSessionWorkspaces.push(workspaceRoot);
      widgetCalls.push(["gsd-progress", undefined]);
      return { cancelled: false };
    },
    sessionManager: {
      getEntries: () => [
        {
          type: "message",
          message: {
            role: "assistant",
            usage: { input: 100, cacheRead: 900 },
          },
        },
      ],
    },
    getContextUsage: () => ({ percent: 0.9, contextWindow: 1_000_000 }),
    model: { contextWindow: 1_000_000 },
  } as any;

  try {
    await stopAuto(
      {
        hasUI: true,
        ui: {
          setStatus: () => {},
          setWidget: (key: string, value: unknown) => {
            widgetCalls.push([key, value]);
          },
          setHeader: () => {},
          notify: (message: string) => {
            notifications.push(message);
          },
        },
        modelRegistry: { find: () => null },
      } as any,
      { events: { emit: () => {} } } as any,
      "Milestone M003 complete",
      {
        completionWidget: {
          milestoneId: "M003",
          milestoneTitle: "Budget tracking",
        },
      },
    );

    assert.deepEqual(newSessionWorkspaces, [base], "completion stop must reroot command session to original project root");
    assert.equal(restoreCalls, 1, "completion stop must restore project root through lifecycle");
    assert.equal(realpathSync(process.cwd()), realpathSync(base), "completion stop must chdir back to project root");
    assert.ok(
      widgetCalls.some(([key, value]) => key === "gsd-progress" && typeof value === "function"),
      "completion stop must install a final progress widget",
    );
    const lastProgressWidget = widgetCalls.filter(([key]) => key === "gsd-progress").at(-1);
    assert.equal(typeof lastProgressWidget?.[1], "function", "completion stop must leave the final progress widget installed after reroot");
    const factory = lastProgressWidget?.[1] as any;
    const component = factory(
      { requestRender() {} },
      { fg: (_color: string, text: string) => text, bold: (text: string) => text },
    );
    const output = component.render(140).join("\n");
    assert.match(output, /Milestone M003 roll-up/);
    assert.match(output, /Outcome/);
    assert.match(output, /Added budget warning output/);
    assert.match(output, /Verification/);
    assert.match(output, /Files: src\/resources\/extensions\/gsd\/auto-dashboard\.ts/);
    assert.match(output, /Lessons: Milestone endings need report output/);
    assert.match(output, /2\/3 slices/);
    assert.match(output, /Next/);
    assert.match(output, /Review the roll-up/);
    assert.match(output, /\/gsd auto for next milestone/);
    assert.doesNotMatch(output, /COMPLETE-MILESTONE/);
    assert.doesNotMatch(output, /\/gsd auto to resume/);
    assert.ok(
      notifications.some(message => message.includes("Milestone M003 complete. Auto-mode finished this milestone.")),
      "completion stop notification should describe completion, not an aborted pause",
    );
    assert.ok(
      notifications.every(message => !message.includes("/gsd auto to resume")),
      "completion stop notification must not tell users to resume a finished auto run",
    );
    assert.ok(
      widgetCalls.every(([key, value]) => key !== "gsd-outcome" || value === undefined),
      "completion stop should use the roll-up as the single final surface",
    );
  } finally {
    try { closeDatabase(); } catch { /* noop */ }
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});
