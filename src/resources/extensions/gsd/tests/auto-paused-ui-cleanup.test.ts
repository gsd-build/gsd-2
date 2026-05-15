// Project/App: GSD-2
// File Purpose: Behavior tests for auto-loop cleanup after paused provider exits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupAfterLoopExit, pauseAuto, rerootCommandSession, stopAuto } from "../auto.ts";
import { autoSession } from "../auto-runtime-state.ts";
import { closeDatabase, insertMilestone, insertSlice, openDatabase } from "../gsd-db.ts";
import { getAutoWorker, registerAutoWorker } from "../db/auto-workers.ts";
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

test("cleanupAfterLoopExit preserves paused worktree session and visible failure output", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-paused-session-preserve-"));
  const worktree = join(base, ".gsd", "worktrees", "M001");
  const previousCwd = process.cwd();
  const newSessionWorkspaces: string[] = [];
  let restoreCalls = 0;

  t.mock.method(WorktreeLifecycle.prototype, "restoreToProjectRoot", function () {
    restoreCalls += 1;
  });

  mkdirSync(worktree, { recursive: true });
  process.chdir(worktree);
  autoSession.reset();
  autoSession.active = true;
  autoSession.paused = true;
  autoSession.basePath = worktree;
  autoSession.originalBasePath = base;
  autoSession.cmdCtx = {
    newSession: async ({ workspaceRoot }: { workspaceRoot: string }) => {
      newSessionWorkspaces.push(workspaceRoot);
      return { cancelled: false };
    },
  } as any;

  try {
    await cleanupAfterLoopExit({
      ui: {
        setStatus: () => {},
        setWidget: () => {},
        notify: () => {},
      },
    } as any);

    assert.equal(restoreCalls, 0, "paused cleanup must not restore out of the active worktree");
    assert.deepEqual(newSessionWorkspaces, [], "paused cleanup must not start a blank rerooted session");
    assert.equal(autoSession.basePath, worktree);
    assert.equal(realpathSync(process.cwd()), realpathSync(worktree));
    assert.equal(autoSession.paused, true);
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});

test("cleanupAfterLoopExit clears status and progress widget without replacing outcome surface", async () => {
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
      true,
      "cleanup must clear the stale auto progress widget",
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

test("cleanupAfterLoopExit clears progress widget after stopAuto reset", async () => {
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
      true,
      "completion cleanup must clear the stale progress widget",
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

test("pauseAuto preserves artifact retry counts across pause/resume", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-pause-retry-count-"));
  const previousCwd = process.cwd();
  const retryKey = "execute-task:M001/S01/T01";

  autoSession.reset();
  autoSession.active = true;
  autoSession.verificationRetryCount.set(retryKey, 2);
  autoSession.pendingVerificationRetry = {
    unitId: "M001/S01/T01",
    failureContext: "Missing expected artifact (attempt 2/3).",
    attempt: 2,
  };

  try {
    process.chdir(base);
    await pauseAuto();

    assert.equal(autoSession.paused, true);
    assert.equal(autoSession.pendingVerificationRetry, null);
    assert.equal(autoSession.verificationRetryCount.get(retryKey), 2);
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});

test("pauseAuto marks active worker as stopping and clears workerId", async () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-pause-worker-stop-"));
  const previousCwd = process.cwd();
  const dbPath = join(base, ".gsd", "gsd.db");
  mkdirSync(join(base, ".gsd"), { recursive: true });

  autoSession.reset();
  autoSession.active = true;

  try {
    openDatabase(dbPath);
    const workerId = registerAutoWorker({ projectRootRealpath: base });
    autoSession.workerId = workerId;
    process.chdir(base);

    await pauseAuto();

    assert.equal(autoSession.workerId, null);
    assert.equal(getAutoWorker(workerId)?.status, "stopping");
  } finally {
    autoSession.reset();
    try { closeDatabase(); } catch { /* noop */ }
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
  }
});

test("cleanupAfterLoopExit preserves step-mode surface and worktree session after completed step", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-step-surface-"));
  const worktree = join(base, ".gsd", "worktrees", "M001");
  const previousCwd = process.cwd();
  const statusCalls: unknown[] = [];
  const widgetCalls: unknown[] = [];
  const newSessionWorkspaces: string[] = [];
  let restoreCalls = 0;

  t.mock.method(WorktreeLifecycle.prototype, "restoreToProjectRoot", function () {
    restoreCalls += 1;
  });

  mkdirSync(worktree, { recursive: true });
  process.chdir(worktree);
  autoSession.reset();
  autoSession.active = true;
  autoSession.paused = false;
  autoSession.stepMode = true;
  autoSession.preserveStepSurfaceAfterLoopExit = true;
  autoSession.basePath = worktree;
  autoSession.originalBasePath = base;
  autoSession.cmdCtx = {
    newSession: async ({ workspaceRoot }: { workspaceRoot: string }) => {
      newSessionWorkspaces.push(workspaceRoot);
      return { cancelled: false };
    },
  } as any;

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

    assert.deepEqual(statusCalls, [], "step-mode cleanup must leave the NEXT badge visible");
    assert.equal(
      widgetCalls.some((args) => Array.isArray(args) && args[0] === "gsd-progress" && args[1] === undefined),
      false,
      "step-mode cleanup must not clear the completed step progress surface",
    );
    assert.equal(
      widgetCalls.some((args) => Array.isArray(args) && args[0] === "gsd-health"),
      false,
      "step-mode cleanup must not replace the progress surface with idle health",
    );
    assert.deepEqual(newSessionWorkspaces, [], "step-mode cleanup must not re-root the visible command session");
    assert.equal(restoreCalls, 0, "step-mode cleanup must not restore out of the active worktree");
    assert.equal(autoSession.active, false);
    assert.equal(autoSession.preserveStepSurfaceAfterLoopExit, false);
    assert.equal(autoSession.basePath, worktree);
    assert.equal(realpathSync(process.cwd()), realpathSync(worktree));
  } finally {
    autoSession.reset();
    process.chdir(previousCwd);
    rmSync(base, { recursive: true, force: true });
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
  // `s.basePath = s.originalBasePath` AND chdir's BEFORE any throwable work
  // (rebuildGitService, cache invalidation). Mirror that ordering in the
  // mock so the throw scenario reflects production: basePath and cwd are
  // restored even when the verb throws partway through.
  t.mock.method(WorktreeLifecycle.prototype, "restoreToProjectRoot", function (this: WorktreeLifecycle) {
    restoreCalls += 1;
    const sRef = this as unknown as { s: { basePath: string; originalBasePath: string } };
    sRef.s.basePath = sRef.s.originalBasePath;
    try { process.chdir(sRef.s.basePath); } catch { /* mirror real verb's best-effort */ }
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
