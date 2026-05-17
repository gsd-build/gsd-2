// Project/App: GSD-2
// File Purpose: Worktree Lifecycle Module — typed-result contract tests for enterMilestone (ADR-016).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  WorktreeLifecycle,
  mergeMilestoneStandalone,
  resolvePausedResumeBasePath,
  type WorktreeLifecycleDeps,
  type WorktreeLifecycleTestOverrides,
  type NotifyCtx,
} from "../worktree-lifecycle.js";
import { WorktreeStateProjection } from "../worktree-state-projection.js";
import { AutoSession } from "../auto/session.js";
import { openDatabase, closeDatabase, insertMilestone } from "../gsd-db.js";
import { registerAutoWorker } from "../db/auto-workers.js";
import { claimMilestoneLease } from "../db/milestone-leases.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CallLog {
  fn: string;
  args: unknown[];
}

// The C1-C4-inlined primitive overrides come from
// `WorktreeLifecycleTestOverrides`, the test seam exported by the Module.
// Lifecycle reads these through `primitiveOverrides()` when present and
// falls back to direct imports otherwise.
type LegacyTestDeps = WorktreeLifecycleDeps & WorktreeLifecycleTestOverrides;

function makeSession(overrides?: Partial<AutoSession>): AutoSession {
  const s = new AutoSession();
  s.basePath = overrides?.basePath ?? "/project";
  s.originalBasePath = overrides?.originalBasePath ?? "/project";
  Object.assign(s, overrides);
  return s;
}

function makeDeps(
  overrides?: Partial<LegacyTestDeps>,
): LegacyTestDeps & { calls: CallLog[] } {
  const calls: CallLog[] = [];
  // ADR-016 phase 2 / C-track close-out: WorktreeLifecycleDeps is now a
  // 3-field bag (gitServiceFactory, worktreeProjection, mergeMilestoneToMain).
  // Tests still pass legacy override hooks via `LegacyTestDeps` — Lifecycle
  // ignores the extras structurally and reads them through the C1-healing
  // primitive-override pattern when stubs are needed.
  const deps: LegacyTestDeps & { calls: CallLog[] } = {
    calls,
    gitServiceFactory: (basePath: string) => {
      calls.push({ fn: "gitServiceFactory", args: [basePath] });
      return { basePath } as unknown as ReturnType<
        WorktreeLifecycleDeps["gitServiceFactory"]
      >;
    },
    worktreeProjection: new WorktreeStateProjection(),
    // Legacy stubs — Lifecycle no longer reads these post-C2; preserved as
    // no-ops so existing test fixtures keep type-checking.
    isInAutoWorktree: () => false,
    autoCommitCurrentBranch: (
      basePath: string,
      unitType: string,
      unitId: string,
      taskContext?: unknown,
    ) => {
      calls.push({ fn: "autoCommitCurrentBranch", args: [basePath, unitType, unitId, taskContext] });
      return null;
    },
    autoWorktreeBranch: (mid: string) => `milestone/${mid}`,
    teardownAutoWorktree: () => {},
    mergeMilestoneToMain: () => ({ pushed: false, codeFilesChanged: true }),
    ...overrides,
  };
  return deps;
}

/**
 * Create a real temporary git repo for tests that exercise the inlined
 * worktree-manager primitives (post-C2). Returns the realpath of the new
 * repo. Tests that previously relied on `deps.createAutoWorktree`,
 * `deps.enterAutoWorktree`, etc. now drive Lifecycle through these
 * fixtures.
 */
function makeGitRepoBase(opts?: {
  isolation?: "worktree" | "branch" | "none";
}): string {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-lifecycle-git-")));
  const git = (args: string[]): void => {
    execFileSync("git", args, { cwd: base, stdio: "pipe" });
  };
  git(["init", "-b", "main"]);
  git(["config", "user.email", "test@test.com"]);
  git(["config", "user.name", "Test"]);
  writeFileSync(join(base, "README.md"), "# test\n");
  writeFileSync(join(base, ".gitignore"), ".gsd/worktrees/\n");
  mkdirSync(join(base, ".gsd"), { recursive: true });
  if (opts?.isolation && opts.isolation !== "none") {
    writeFileSync(
      join(base, ".gsd", "preferences.md"),
      `## Git\n- isolation: ${opts.isolation}\n`,
    );
  }
  git(["add", "."]);
  git(["commit", "-m", "init"]);
  return base;
}

function cleanupRepoBase(base: string, previousCwd?: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  try { if (previousCwd) process.chdir(previousCwd); } catch { /* noop */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
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

test("enterMilestone returns ok:true mode:worktree on successful create", (t) => {
  // ADR-016 phase 2 / C2 (#5625): the worktree-manager primitives are
  // inlined, so the success path needs a real git repo. The test exercises
  // Lifecycle.enterMilestone end-to-end against `createAutoWorktree`'s
  // real implementation in `auto-worktree.ts`.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));

  const s = makeSession({ basePath: base, originalBasePath: base });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.mode, "worktree");
    assert.ok(
      result.path.endsWith("/.gsd/worktrees/M001"),
      `expected path to end with /.gsd/worktrees/M001, got ${result.path}`,
    );
  }
  assert.ok(
    s.basePath.endsWith("/.gsd/worktrees/M001"),
    `expected s.basePath to end with /.gsd/worktrees/M001, got ${s.basePath}`,
  );
  // After C3 (#5626) `invalidateAllCaches` is inlined; assertion against
  // `deps.calls` for cache invalidation is no longer possible.
});

test("enterMilestone returns ok:true mode:branch on successful branch fallback", (t) => {
  // Real fixture with isolation:branch — `enterBranchModeForMilestone`'s
  // real implementation runs against the temp repo.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "branch" });
  t.after(() => cleanupRepoBase(base, previousCwd));

  const s = makeSession({ basePath: base, originalBasePath: base });
  const deps = makeDeps({ getIsolationMode: () => "branch" });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.mode, "branch");
    assert.equal(result.path, base);
  }
  // Branch mode does not mutate s.basePath
  assert.equal(s.basePath, base);
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
  const deps = makeDeps({ getIsolationMode: () => "branch" });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "isolation-degraded");
  }
  assert.equal(s.basePath, "/project");
  assert.equal(s.milestoneLeaseToken, null);
});

test("enterMilestone falls back to branch mode when session is degraded in worktree isolation", (t) => {
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));

  const s = makeSession({
    basePath: base,
    originalBasePath: base,
    isolationDegraded: true,
  });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.mode, "branch");
    assert.equal(result.path, base);
  }
  assert.equal(s.basePath, base);
  assert.equal(
    ctx.messages.some((m) =>
      m.level === "warning" &&
      m.msg.includes("Worktree isolation is degraded. Fell back to branch"),
    ),
    true,
  );
});

test("enterMilestone returns ok:false reason:creation-failed and degrades session on worktree throw", (t) => {
  // After C2 the worktree-manager primitives are inlined. Use a real
  // fixture and break the repo by deleting `.git` so any git op throws.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  rmSync(join(base, ".git"), { recursive: true, force: true });

  const s = makeSession({ basePath: base, originalBasePath: base });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false, `expected ok:false, got: ${JSON.stringify(result)}`);
  if (!result.ok) {
    assert.equal(result.reason, "creation-failed");
    assert.ok(result.cause instanceof Error);
  }
  assert.equal(s.isolationDegraded, true);
  // s.basePath unchanged on failure
  assert.equal(s.basePath, base);
});

test("enterMilestone returns ok:false reason:creation-failed when branch mode throws", (t) => {
  // Branch-mode failure scenario: real fixture with isolation:branch, but
  // delete the `.git` directory so any branch operation throws.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "branch" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  rmSync(join(base, ".git"), { recursive: true, force: true });

  const s = makeSession({ basePath: base, originalBasePath: base });
  const deps = makeDeps({ getIsolationMode: () => "branch" });
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, false, `expected ok:false, got: ${JSON.stringify(result)}`);
  if (!result.ok) {
    assert.equal(result.reason, "creation-failed");
  }
  assert.equal(s.isolationDegraded, true);
});

test("enterMilestone enters existing worktree when path resolves", (t) => {
  // After C2, `getAutoWorktreePath` runs against real git. To exercise the
  // "existing worktree" branch we pre-create the worktree on disk so
  // git's worktree list includes it.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  const wt = join(base, ".gsd", "worktrees", "M001");
  execFileSync("git", ["checkout", "-b", "milestone/M001"], {
    cwd: base,
    stdio: "pipe",
  });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "pipe" });
  execFileSync(
    "git",
    ["worktree", "add", wt, "milestone/M001"],
    { cwd: base, stdio: "pipe" },
  );

  const s = makeSession({ basePath: base, originalBasePath: base });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.mode, "worktree");
    assert.ok(
      result.path.endsWith("/.gsd/worktrees/M001"),
      `expected path to end with /.gsd/worktrees/M001, got ${result.path}`,
    );
  }
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
  assert.equal(s.basePath, base);
  assert.equal(s.milestoneLeaseToken, null);
  assert.equal(deps.calls.filter((c) => c.fn === "getIsolationMode").length, 0);
  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0]?.level, "error");
});

test("enterMilestone is idempotent when already in the milestone worktree", (t) => {
  // Real-fixture variant after C2/C3. The session is already pointing at
  // the worktree path with currentMilestoneId set, so the idempotency
  // early-return inside `_enterMilestoneCore` fires without invoking the
  // inlined worktree primitives.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  const wt = join(base, ".gsd", "worktrees", "M001");

  const s = makeSession({
    basePath: wt,
    originalBasePath: base,
    currentMilestoneId: "M001",
  });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const result = lifecycle.enterMilestone("M001", ctx);

  assert.equal(result.ok, true, `expected ok:true, got: ${JSON.stringify(result)}`);
  if (result.ok) {
    assert.equal(result.mode, "worktree");
    assert.equal(result.path, wt);
  }
  assert.equal(s.basePath, wt);
});

test("enterMilestone returns ok:false reason:invalid-milestone-id on path traversal", () => {
  const s = makeSession();
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  const traversal = lifecycle.enterMilestone("../escape", ctx);
  const separator = lifecycle.enterMilestone("a/b", ctx);

  assert.equal(traversal.ok, false);
  if (!traversal.ok) {
    assert.equal(traversal.reason, "invalid-milestone-id");
  }
  assert.equal(separator.ok, false);
  if (!separator.ok) {
    assert.equal(separator.reason, "invalid-milestone-id");
  }
});

// ─── exitMilestone — typed-result contract ────────────────────────────────────
//
// The delegation-shape tests that lived here were retired in slice 7 / step
// D of ADR-016: Lifecycle no longer takes a `resolverFactory`. The merge
// behaviour they covered now runs inside Lifecycle directly and is exercised
// end-to-end by the merge-mode tests in worktree-resolver.test.ts (which
// drive Lifecycle through Resolver delegation until step E retires the
// Resolver class entirely). When that retirement lands, those tests move
// here verbatim.

// ─── Queries (issue #5587) ────────────────────────────────────────────────────

test("isInMilestone returns true when session matches milestone id", () => {
  const s = makeSession();
  s.currentMilestoneId = "M001";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  assert.equal(lifecycle.isInMilestone("M001"), true);
  assert.equal(lifecycle.isInMilestone("M002"), false);
});

test("isInMilestone returns false when session has no active milestone", () => {
  const s = makeSession();
  s.currentMilestoneId = null;
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  assert.equal(lifecycle.isInMilestone("M001"), false);
});

test("getCurrentMilestoneIfAny returns the active milestone id or null", () => {
  const s = makeSession();
  s.currentMilestoneId = "M042";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  assert.equal(lifecycle.getCurrentMilestoneIfAny(), "M042");

  s.currentMilestoneId = null;
  assert.equal(lifecycle.getCurrentMilestoneIfAny(), null);
});

// ─── degradeToBranchMode (issue #5587) ────────────────────────────────────────

test("degradeToBranchMode sets isolationDegraded and runs branch-mode setup", (t) => {
  // After C2, `enterBranchModeForMilestone` runs against real git. Use a
  // real fixture so the branch checkout succeeds and we can observe the
  // session's isolationDegraded flag flip.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "branch" });
  t.after(() => cleanupRepoBase(base, previousCwd));

  const s = makeSession({ basePath: base, originalBasePath: base });
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.degradeToBranchMode("M001", ctx);

  assert.equal(s.isolationDegraded, true);
  // After C3 (#5626) `invalidateAllCaches` is inlined.
});

test("degradeToBranchMode is no-op when isolationDegraded is already true", () => {
  const s = makeSession();
  s.isolationDegraded = true;
  const deps = makeDeps();
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.degradeToBranchMode("M001", ctx);

  // Pre-check returns early before any side effect. After C3 the
  // `invalidateAllCaches` mock is gone; we assert the observable
  // contract: `s.isolationDegraded` stays true and no notify message
  // is emitted.
  assert.equal(s.isolationDegraded, true);
  assert.equal(ctx.messages.length, 0);
});

test("degradeToBranchMode marks degraded and notifies on branch-mode failure", () => {
  // Synthetic /project causes the real `enterBranchModeForMilestone` to
  // throw — same shape as the original mock-throws test but exercises the
  // production error path against the inlined helper.
  const s = makeSession();
  const deps = makeDeps({});
  const ctx = makeCtx();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.degradeToBranchMode("M001", ctx);

  assert.equal(s.isolationDegraded, true);
  assert.ok(
    ctx.messages.some(
      (m) => m.level === "warning" && m.msg.includes("Branch isolation setup"),
    ),
  );
});

// ─── restoreToProjectRoot (issue #5587) ───────────────────────────────────────

test("restoreToProjectRoot restores basePath to originalBasePath and rebuilds git service", () => {
  const s = makeSession();
  s.originalBasePath = "/project";
  s.basePath = "/project/.gsd/worktrees/M001";
  const deps = makeDeps();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.restoreToProjectRoot();

  assert.equal(s.basePath, "/project");
  // After C4 (#5627) the rebuild goes through `gitServiceFactory`
  // instead of `new GitServiceImpl(...)`. `invalidateAllCaches` is
  // inlined post-C3 and no longer routes through deps.
  assert.equal(
    deps.calls.filter((c) => c.fn === "gitServiceFactory").length,
    1,
  );
});

test("restoreToProjectRoot rebuilds git service via gitServiceFactory at the restored base path", () => {
  // ADR-016 phase 2 / C4 (#5627): the gitConfig load + GitServiceImpl
  // construction now live behind the `gitServiceFactory` seam. Lifecycle
  // is no longer responsible for either; the test asserts only that the
  // factory is invoked with the restored basePath.
  const s = makeSession();
  s.originalBasePath = "/project";
  s.basePath = "/project/.gsd/worktrees/M001";
  const deps = makeDeps();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.restoreToProjectRoot();

  assert.deepEqual(
    deps.calls.find((c) => c.fn === "gitServiceFactory")?.args,
    ["/project"],
  );
});

test("restoreToProjectRoot is no-op when originalBasePath is empty", () => {
  const s = makeSession();
  s.originalBasePath = "";
  s.basePath = "/some/path";
  const deps = makeDeps();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.restoreToProjectRoot();

  assert.equal(s.basePath, "/some/path"); // unchanged
  assert.equal(deps.calls.filter((c) => c.fn === "gitServiceFactory").length, 0);
});

test("restoreToProjectRoot completes session-state restore even when chdir fails (ADR-016 phase 3, #5693)", () => {
  // The verb attempts process.chdir to s.basePath after restoring it. The
  // chdir is best-effort; failure must not abort the session-state restore.
  // We exercise that contract by pointing originalBasePath at a path that
  // cannot be chdir'd into.
  const s = makeSession();
  s.originalBasePath = "/this/path/should/not/exist/in/any/test/env";
  s.basePath = "/project/.gsd/worktrees/M001";
  const deps = makeDeps();
  const lifecycle = new WorktreeLifecycle(s, deps);

  // Capture cwd so we can confirm we did NOT successfully chdir.
  const cwdBefore = process.cwd();
  lifecycle.restoreToProjectRoot();

  // Session-state restore happened despite chdir failure.
  assert.equal(s.basePath, "/this/path/should/not/exist/in/any/test/env");
  assert.equal(
    deps.calls.filter((c) => c.fn === "gitServiceFactory").length,
    1,
  );
  // cwd is unchanged because chdir threw and was swallowed.
  assert.equal(process.cwd(), cwdBefore);
});

// ─── adoptSessionRoot (ADR-016 phase 2 / B2, issue #5620) ─────────────────────

test("adoptSessionRoot sets basePath and seeds originalBasePath on a fresh session", () => {
  const s = makeSession();
  s.basePath = "";
  s.originalBasePath = "";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.adoptSessionRoot("/project");

  assert.equal(s.basePath, "/project");
  assert.equal(s.originalBasePath, "/project");
});

test("adoptSessionRoot preserves a pre-existing originalBasePath when no override is passed", () => {
  // Resume-from-paused path (auto.ts:2148 after meta-restore at 2003/2055):
  // s.originalBasePath was already restored from paused metadata; the verb
  // must NOT overwrite that value.
  const s = makeSession();
  s.basePath = "";
  s.originalBasePath = "/persisted/project-root";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.adoptSessionRoot("/project");

  assert.equal(s.basePath, "/project");
  assert.equal(s.originalBasePath, "/persisted/project-root");
});

test("adoptSessionRoot honors an explicit originalBase override", () => {
  const s = makeSession();
  s.basePath = "";
  s.originalBasePath = "/old-root";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.adoptSessionRoot("/project", "/explicit-original");

  assert.equal(s.basePath, "/project");
  assert.equal(s.originalBasePath, "/explicit-original");
});

test("adoptSessionRoot does not chdir, rebuild git service, or invalidate caches", () => {
  // The verb is a pure session-state mutation. Side effects (chdir, git
  // service rebuild, cache invalidation) belong to other Lifecycle verbs
  // (`enterMilestone`, `restoreToProjectRoot`).
  const s = makeSession();
  s.basePath = "";
  s.originalBasePath = "";
  const deps = makeDeps();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.adoptSessionRoot("/project");

  assert.equal(deps.calls.filter((c) => c.fn === "gitServiceFactory").length, 0);
  assert.equal(deps.calls.filter((c) => c.fn === "invalidateAllCaches").length, 0);
});

test("mergeMilestoneStandalone fails loud when both base paths are empty", () => {
  const deps = makeDeps();
  assert.throws(
    () =>
      mergeMilestoneStandalone(deps, {
        originalBasePath: "",
        worktreeBasePath: "",
        milestoneId: "M001",
        isolationDegraded: false,
        notify: () => {},
      }),
    /requires originalBasePath or worktreeBasePath/,
  );
});

// ─── resumeFromPausedSession (ADR-016 phase 2 / B3, issue #5621) ──────────────

test("resumeFromPausedSession adopts the persisted worktree path when it exists", (t) => {
  // Use a real temp directory so the existsSync check inside the verb
  // succeeds. Earlier `process.cwd()` ran into ENOENT after sibling tests
  // deleted their basePaths and left cwd dangling.
  const wtDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-resume-test-")));
  t.after(() => { try { rmSync(wtDir, { recursive: true, force: true }); } catch { /* */ } });

  const s = makeSession();
  s.basePath = "/some/old/path";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  // Verify the pure helper's contract first (folded in from the legacy
  // _resolvePausedResumeBasePathForTest)
  assert.equal(
    resolvePausedResumeBasePath("/project", "/persisted/worktree/M001", () => true),
    "/persisted/worktree/M001",
  );

  // Exercise the verb with a real path that exists.
  lifecycle.resumeFromPausedSession("/project", wtDir);
  assert.equal(s.basePath, wtDir);
});

test("resumeFromPausedSession falls back to base when persisted worktree is null", () => {
  const s = makeSession();
  s.basePath = "/old";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.resumeFromPausedSession("/project", null);
  assert.equal(s.basePath, "/project");
});

test("resumeFromPausedSession falls back to base when persisted worktree does not exist", () => {
  const s = makeSession();
  s.basePath = "/old";
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.resumeFromPausedSession(
    "/project",
    "/this/path/does/not/exist/abc/xyz",
  );
  assert.equal(s.basePath, "/project");
});

test("resumeFromPausedSession does not chdir, rebuild git service, or invalidate caches", () => {
  const s = makeSession();
  const deps = makeDeps();
  const lifecycle = new WorktreeLifecycle(s, deps);

  lifecycle.resumeFromPausedSession("/project", null);

  assert.equal(deps.calls.filter((c) => c.fn === "gitServiceFactory").length, 0);
  assert.equal(deps.calls.filter((c) => c.fn === "invalidateAllCaches").length, 0);
});

// ─── adoptOrphanWorktree (ADR-016 phase 2 / B4, issue #5622) ──────────────────

// After C2 (#5625) the `getAutoWorktreePath` primitive is inlined, so these
// tests use a real-git fixture with a pre-created worktree to exercise the
// swap-run-revert protocol. The "fall back when getAutoWorktreePath returns
// null" test uses a fixture WITHOUT a worktree so the real call returns null.

test("adoptOrphanWorktree swaps to worktree path and reverts to base on !merged", (t) => {
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  const wt = join(base, ".gsd", "worktrees", "M001");
  execFileSync("git", ["checkout", "-b", "milestone/M001"], { cwd: base, stdio: "pipe" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "pipe" });
  execFileSync("git", ["worktree", "add", wt, "milestone/M001"], { cwd: base, stdio: "pipe" });

  const s = makeSession();
  s.basePath = "/old";
  s.originalBasePath = "/old";
  s.active = true;
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  let basePathInsideCallback = "";
  const result = lifecycle.adoptOrphanWorktree("M001", base, () => {
    basePathInsideCallback = s.basePath;
    return { merged: false as const, reason: "synthetic" };
  });

  assert.equal(basePathInsideCallback, wt);
  assert.equal(s.basePath, base);
  assert.equal(s.originalBasePath, base);
  assert.equal(result.merged, false);
});

test("adoptOrphanWorktree holds the swap on merged && active", (t) => {
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  const wt = join(base, ".gsd", "worktrees", "M001");
  execFileSync("git", ["checkout", "-b", "milestone/M001"], { cwd: base, stdio: "pipe" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "pipe" });
  execFileSync("git", ["worktree", "add", wt, "milestone/M001"], { cwd: base, stdio: "pipe" });

  const s = makeSession();
  s.basePath = "/old";
  s.originalBasePath = "/old";
  s.active = true;
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.adoptOrphanWorktree("M001", base, () => ({
    merged: true as const,
  }));

  assert.equal(s.basePath, wt);
  assert.equal(s.originalBasePath, base);
});

test("adoptOrphanWorktree restores prior paths on merged && !active", (t) => {
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));
  const wt = join(base, ".gsd", "worktrees", "M001");
  execFileSync("git", ["checkout", "-b", "milestone/M001"], { cwd: base, stdio: "pipe" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "pipe" });
  execFileSync("git", ["worktree", "add", wt, "milestone/M001"], { cwd: base, stdio: "pipe" });

  const s = makeSession();
  s.basePath = "/prior";
  s.originalBasePath = "/prior-original";
  s.active = false;
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  lifecycle.adoptOrphanWorktree("M001", base, () => ({
    merged: true as const,
  }));

  assert.equal(s.basePath, "/prior");
  assert.equal(s.originalBasePath, "/prior-original");
});

test("adoptOrphanWorktree falls back to base when getAutoWorktreePath returns null", (t) => {
  // Real fixture with isolation:worktree but NO worktree pre-created — the
  // real `getAutoWorktreePath` returns null so the verb falls back to base.
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));

  const s = makeSession();
  s.basePath = "/old";
  s.active = true;
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  let basePathInsideCallback = "";
  lifecycle.adoptOrphanWorktree("M001", base, () => {
    basePathInsideCallback = s.basePath;
    return { merged: true as const };
  });

  assert.equal(basePathInsideCallback, base);
});

test("adoptOrphanWorktree restores prior paths and cwd when the callback throws", () => {
  const originalCwd = process.cwd();
  const base = mkdtempSync(join(tmpdir(), "gsd-orphan-rollback-base-"));
  const worktree = mkdtempSync(join(tmpdir(), "gsd-orphan-rollback-wt-"));
  const s = makeSession({
    basePath: "/prior",
    originalBasePath: originalCwd,
    active: true,
  });
  const deps = makeDeps({
    getAutoWorktreePath: () => worktree,
  });
  const lifecycle = new WorktreeLifecycle(s, deps);
  const thrown = new Error("synthetic callback failure");

  try {
    assert.throws(
      () =>
        lifecycle.adoptOrphanWorktree<{ merged: boolean }>("M001", base, () => {
          assert.equal(s.basePath, worktree);
          assert.equal(s.originalBasePath, base);
          throw thrown;
        }),
      thrown,
    );

    assert.equal(s.basePath, "/prior");
    assert.equal(s.originalBasePath, originalCwd);
    assert.equal(process.cwd(), originalCwd);
  } finally {
    process.chdir(originalCwd);
    rmSync(base, { recursive: true, force: true });
    rmSync(worktree, { recursive: true, force: true });
  }
});

test("adoptOrphanWorktree rejects traversal-style milestone ids before path resolution", () => {
  const s = makeSession({
    basePath: "/prior",
    originalBasePath: "/prior-original",
    active: true,
  });
  const deps = makeDeps({
    getAutoWorktreePath: () => {
      throw new Error("getAutoWorktreePath should not be called");
    },
  });
  const lifecycle = new WorktreeLifecycle(s, deps);

  assert.throws(
    () =>
      lifecycle.adoptOrphanWorktree("../M001", "/project", () => ({
        merged: true as const,
      })),
    /Invalid milestoneId: \.\.\/M001/,
  );

  assert.equal(s.basePath, "/prior");
  assert.equal(s.originalBasePath, "/prior-original");
  assert.equal(
    deps.calls.filter((c) => c.fn === "getAutoWorktreePath").length,
    0,
  );
});

test("adoptOrphanWorktree forwards the callback's return value", (t) => {
  const previousCwd = process.cwd();
  const base = makeGitRepoBase({ isolation: "worktree" });
  t.after(() => cleanupRepoBase(base, previousCwd));


  const s = makeSession();
  s.active = true;
  const lifecycle = new WorktreeLifecycle(s, makeDeps());

  const result = lifecycle.adoptOrphanWorktree("M001", base, () => ({
    merged: true as const,
    customField: "preserved",
  }));

  assert.equal(result.merged, true);
  assert.equal(result.customField, "preserved");
});

test("adoptOrphanWorktree leaves session unchanged when getAutoWorktreePath throws", () => {
  const s = makeSession();
  s.basePath = "/prior";
  s.originalBasePath = "/prior-original";
  s.active = true;
  const lifecycle = new WorktreeLifecycle(
    s,
    makeDeps({
      getAutoWorktreePath: () => {
        throw new Error("git state unavailable");
      },
    }),
  );

  assert.throws(
    () =>
      lifecycle.adoptOrphanWorktree("M001", "/project", () => ({
        merged: true as const,
      })),
    /git state unavailable/,
  );
  assert.equal(s.basePath, "/prior");
  assert.equal(s.originalBasePath, "/prior-original");
});

test("adoptOrphanWorktree restores prior paths when callback throws", () => {
  const s = makeSession();
  s.basePath = "/prior";
  s.originalBasePath = "/prior-original";
  s.active = true;
  const lifecycle = new WorktreeLifecycle(
    s,
    makeDeps({
      getAutoWorktreePath: () => "/project/.gsd/worktrees/M001",
    }),
  );

  assert.throws(
    () =>
      lifecycle.adoptOrphanWorktree("M001", "/project", () => {
        assert.equal(s.basePath, "/project/.gsd/worktrees/M001");
        assert.equal(s.originalBasePath, "/project");
        throw new Error("merge exploded");
      }),
    /merge exploded/,
  );
  assert.equal(s.basePath, "/prior");
  assert.equal(s.originalBasePath, "/prior-original");
});
