// Project/App: GSD-2
// File Purpose: Worktree Lifecycle Module — typed-result contract tests for enterMilestone (ADR-016).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WorktreeLifecycle,
  type WorktreeLifecycleDeps,
  type NotifyCtx,
} from "../worktree-lifecycle.js";
import { AutoSession } from "../auto/session.js";
import { openDatabase, closeDatabase, insertMilestone } from "../gsd-db.js";
import { registerAutoWorker } from "../db/auto-workers.js";
import { claimMilestoneLease } from "../db/milestone-leases.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CallLog {
  fn: string;
  args: unknown[];
}

function makeSession(overrides?: Partial<AutoSession>): AutoSession {
  const s = new AutoSession();
  s.basePath = overrides?.basePath ?? "/project";
  s.originalBasePath = overrides?.originalBasePath ?? "/project";
  Object.assign(s, overrides);
  return s;
}

function makeDeps(
  overrides?: Partial<WorktreeLifecycleDeps>,
): WorktreeLifecycleDeps & { calls: CallLog[] } {
  const calls: CallLog[] = [];
  const deps: WorktreeLifecycleDeps & { calls: CallLog[] } = {
    calls,
    enterAutoWorktree: (basePath, milestoneId) => {
      calls.push({ fn: "enterAutoWorktree", args: [basePath, milestoneId] });
      return `/project/.gsd/worktrees/${milestoneId}`;
    },
    createAutoWorktree: (basePath, milestoneId) => {
      calls.push({ fn: "createAutoWorktree", args: [basePath, milestoneId] });
      return `/project/.gsd/worktrees/${milestoneId}`;
    },
    enterBranchModeForMilestone: (basePath, milestoneId) => {
      calls.push({
        fn: "enterBranchModeForMilestone",
        args: [basePath, milestoneId],
      });
    },
    getAutoWorktreePath: (basePath, milestoneId) => {
      calls.push({ fn: "getAutoWorktreePath", args: [basePath, milestoneId] });
      return null;
    },
    getIsolationMode: () => {
      calls.push({ fn: "getIsolationMode", args: [] });
      return "worktree";
    },
    invalidateAllCaches: () => {
      calls.push({ fn: "invalidateAllCaches", args: [] });
    },
    GitServiceImpl: class MockGitService {
      basePath: string;
      gitConfig: unknown;
      constructor(basePath: string, gitConfig: unknown) {
        calls.push({ fn: "GitServiceImpl", args: [basePath, gitConfig] });
        this.basePath = basePath;
        this.gitConfig = gitConfig;
      }
    } as unknown as WorktreeLifecycleDeps["GitServiceImpl"],
    loadEffectiveGSDPreferences: () => {
      calls.push({ fn: "loadEffectiveGSDPreferences", args: [] });
      return { preferences: { git: {} } };
    },
    ...overrides,
  };
  return deps;
}

function makeCtx(): NotifyCtx & {
  messages: Array<{ msg: string; level?: string }>;
} {
  const messages: Array<{ msg: string; level?: string }> = [];
  return {
    messages,
    notify: (msg, level) => {
      messages.push({ msg, level });
    },
  };
}

function makeDbBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-lifecycle-"));
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanupDbBase(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
}

// ─── enterMilestone — typed-result contract ──────────────────────────────────

test("enterMilestone returns ok:true mode:worktree on successful create", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, "worktree");
    assert.equal(result.path, "/project/.gsd/worktrees/M001");
  }
  assert.equal(s.basePath, "/project/.gsd/worktrees/M001");
});

test("enterMilestone returns ok:true mode:branch on successful branch fallback", () => {
  const s = makeSession();
  const deps = makeDeps({ getIsolationMode: () => "branch" });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, "branch");
    assert.equal(result.path, "/project");
  }
  // Branch mode does not mutate s.basePath
  assert.equal(s.basePath, "/project");
});

test("enterMilestone returns ok:true mode:none when isolation disabled", () => {
  const s = makeSession();
  const deps = makeDeps({ getIsolationMode: () => "none" });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, "none");
    assert.equal(result.path, "/project");
  }
  assert.equal(s.basePath, "/project");
});

test("enterMilestone returns ok:false reason:isolation-degraded when session degraded", () => {
  const s = makeSession({ isolationDegraded: true });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "isolation-degraded");
  }
  // No worktree primitives invoked
  assert.equal(deps.calls.filter((c) => c.fn === "createAutoWorktree").length, 0);
  assert.equal(deps.calls.filter((c) => c.fn === "enterAutoWorktree").length, 0);
});

test("enterMilestone returns ok:false reason:creation-failed and degrades session on worktree throw", () => {
  const s = makeSession();
  const deps = makeDeps({
    createAutoWorktree: () => {
      throw new Error("boom");
    },
  });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "creation-failed");
    assert.ok(result.cause instanceof Error);
  }
  assert.equal(s.isolationDegraded, true);
  // s.basePath unchanged on failure
  assert.equal(s.basePath, "/project");
});

test("enterMilestone returns ok:false reason:creation-failed when branch mode throws", () => {
  const s = makeSession();
  const deps = makeDeps({
    getIsolationMode: () => "branch",
    enterBranchModeForMilestone: () => {
      throw new Error("branch checkout failed");
    },
  });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "creation-failed");
  }
  assert.equal(s.isolationDegraded, true);
});

test("enterMilestone enters existing worktree when path resolves", () => {
  const s = makeSession();
  const deps = makeDeps({
    getAutoWorktreePath: () => "/project/.gsd/worktrees/M001",
  });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true);
  assert.equal(deps.calls.filter((c) => c.fn === "enterAutoWorktree").length, 1);
  assert.equal(deps.calls.filter((c) => c.fn === "createAutoWorktree").length, 0);
});

test("enterMilestone returns ok:false reason:lease-conflict when another worker holds the lease", (t) => {
  const base = makeDbBase();
  t.after(() => cleanupDbBase(base));
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  const holder = registerAutoWorker({ projectRootRealpath: base });
  const contender = registerAutoWorker({ projectRootRealpath: base });
  const claim = claimMilestoneLease(holder, "M001");
  assert.equal(claim.ok, true);

  const s = makeSession({ basePath: base, originalBasePath: base, workerId: contender });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "lease-conflict");
  }
  assert.equal(s.isolationDegraded, false);
  assert.equal(deps.calls.filter((c) => c.fn === "createAutoWorktree").length, 0);
  assert.equal(deps.calls.filter((c) => c.fn === "enterAutoWorktree").length, 0);
});

test("enterMilestone is idempotent when already in the milestone worktree", () => {
  const s = makeSession({
    basePath: "/project/.gsd/worktrees/M001",
    originalBasePath: "/project",
    currentMilestoneId: "M001",
  });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.mode, "worktree");
    assert.equal(result.path, "/project/.gsd/worktrees/M001");
  }
  assert.equal(s.basePath, "/project/.gsd/worktrees/M001");
  assert.equal(deps.calls.filter((c) => c.fn === "createAutoWorktree").length, 0);
  assert.equal(deps.calls.filter((c) => c.fn === "enterAutoWorktree").length, 0);
});

test("enterMilestone returns ok:false reason:invalid-milestone-id on path traversal", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const traversal = lifecycle.enterMilestone("../escape", ctx);
  assert.equal(traversal.ok, false);
  if (!traversal.ok) {
    assert.equal(traversal.reason, "invalid-milestone-id");
    assert.ok(traversal.cause instanceof Error);
  }

  const separator = lifecycle.enterMilestone("a/b", ctx);
  assert.equal(separator.ok, false);
  if (!separator.ok) {
    assert.equal(separator.reason, "invalid-milestone-id");
    assert.ok(separator.cause instanceof Error);
  }
});

// ─── exitMilestone — typed-result contract ────────────────────────────────────

test("exitMilestone throws when no resolverFactory is provided", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  assert.throws(
    () => lifecycle.exitMilestone("M001", { merge: true }, ctx),
    /requires a resolverFactory/,
  );
});

test("exitMilestone delegates merge:true to Resolver.mergeAndExit and returns ok:true", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  let calledMid: string | null = null;
  const fakeResolver = {
    mergeAndExit: (mid: string) => {
      calledMid = mid;
    },
  };
  const lifecycle = new WorktreeLifecycle(s, deps, () => fakeResolver as any);

  const result = lifecycle.exitMilestone("M001", { merge: true }, ctx);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.merged, true);
    assert.equal(result.codeFilesChanged, false);
  }
  assert.equal(calledMid, "M001");
});

test("exitMilestone surfaces MergeConflictError as ok:false reason:merge-conflict", async () => {
  const { MergeConflictError } = await import("../git-service.js");
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  const conflict = new MergeConflictError(
    ["src/foo.ts"],
    "merge",
    "milestone/M001",
    "main",
  );
  const fakeResolver = {
    mergeAndExit: () => {
      throw conflict;
    },
  };
  const lifecycle = new WorktreeLifecycle(s, deps, () => fakeResolver as any);

  const result = lifecycle.exitMilestone("M001", { merge: true }, ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "merge-conflict");
    assert.equal(result.cause, conflict);
  }
});

test("exitMilestone wraps non-conflict throws as ok:false reason:teardown-failed", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  const fsErr = new Error("EACCES: permission denied");
  const fakeResolver = {
    mergeAndExit: () => {
      throw fsErr;
    },
  };
  const lifecycle = new WorktreeLifecycle(s, deps, () => fakeResolver as any);

  const result = lifecycle.exitMilestone("M001", { merge: true }, ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "teardown-failed");
    assert.equal(result.cause, fsErr);
  }
});

test("exitMilestone with merge:false delegates to Resolver.exitMilestone with preserveBranch", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  let receivedOpts: { preserveBranch?: boolean } | undefined;
  const fakeResolver = {
    exitMilestone: (
      _mid: string,
      _ctx: NotifyCtx,
      opts?: { preserveBranch?: boolean },
    ) => {
      receivedOpts = opts;
    },
  };
  const lifecycle = new WorktreeLifecycle(s, deps, () => fakeResolver as any);

  const result = lifecycle.exitMilestone(
    "M001",
    { merge: false, preserveBranch: true },
    ctx,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.merged, false);
  }
  assert.deepEqual(receivedOpts, { preserveBranch: true });
});
