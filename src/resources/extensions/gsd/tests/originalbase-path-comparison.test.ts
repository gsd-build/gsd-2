// GSD-2 — Regression tests for originalBase path comparison correctness (M5 fix)
//
// After commit ade55a7f5, getAutoWorktreeOriginalBase() returns ws.projectRoot
// which is realpath-normalized. Callers that compare it with string === against
// a non-canonical s.basePath (trailing slash, symlink path, etc.) can get false
// mismatches. M5 replaced those comparisons with isSamePath-based helpers.
//
// Tests here verify:
//   1. getAutoWorktreeOriginalBase() always returns a canonical (realpath) path.
//   2. normalizeWorktreePathForCompare(canonical) === normalizeWorktreePathForCompare(non-canonical)
//      — i.e. the new comparison is true when raw === would be false.
//   3. WorktreeResolver._mergeWorktreeMode: when s.basePath has a trailing slash
//      (non-canonical form of originalBase), the roadmap-fallback branch is NOT
//      triggered (correct behaviour post-fix); with raw ===, it would have been.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  getAutoWorktreeOriginalBase,
  _resetAutoWorktreeOriginalBaseForTests,
  createAutoWorktree,
  teardownAutoWorktree,
} from "../auto-worktree.ts";
import { normalizeWorktreePathForCompare } from "../worktree-root.ts";
import {
  WorktreeResolver,
  type WorktreeResolverDeps,
  type NotifyCtx,
} from "../worktree-resolver.ts";
import { AutoSession } from "../auto/session.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function createTempRepo(t: { after: (fn: () => void) => void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "m5-obpath-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(["init"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

function makeSession(overrides?: Partial<{ basePath: string; originalBasePath: string }>): AutoSession {
  const s = new AutoSession();
  s.basePath = overrides?.basePath ?? "/project";
  s.originalBasePath = overrides?.originalBasePath ?? "/project";
  return s;
}

interface CallLog { fn: string; args: unknown[] }

function makeDeps(overrides?: Partial<WorktreeResolverDeps>): WorktreeResolverDeps & { calls: CallLog[] } {
  const calls: CallLog[] = [];

  const deps: WorktreeResolverDeps & { calls: CallLog[] } = {
    calls,
    isInAutoWorktree: (basePath: string) => {
      calls.push({ fn: "isInAutoWorktree", args: [basePath] });
      return basePath.includes("worktrees");
    },
    shouldUseWorktreeIsolation: () => true,
    getIsolationMode: () => "worktree",
    mergeMilestoneToMain: (basePath: string, milestoneId: string, roadmapContent: string) => {
      calls.push({ fn: "mergeMilestoneToMain", args: [basePath, milestoneId, roadmapContent] });
      return { pushed: false, codeFilesChanged: true };
    },
    syncWorktreeStateBack: (mainBasePath: string, worktreePath: string, milestoneId: string) => {
      calls.push({ fn: "syncWorktreeStateBack", args: [mainBasePath, worktreePath, milestoneId] });
      return { synced: [] };
    },
    teardownAutoWorktree: (basePath: string, milestoneId: string, opts?: { preserveBranch?: boolean }) => {
      calls.push({ fn: "teardownAutoWorktree", args: [basePath, milestoneId, opts] });
    },
    createAutoWorktree: (basePath: string, milestoneId: string) => {
      calls.push({ fn: "createAutoWorktree", args: [basePath, milestoneId] });
      return `${basePath}/.gsd/worktrees/${milestoneId}`;
    },
    enterAutoWorktree: (basePath: string, milestoneId: string) => {
      calls.push({ fn: "enterAutoWorktree", args: [basePath, milestoneId] });
      return `${basePath}/.gsd/worktrees/${milestoneId}`;
    },
    getAutoWorktreePath: (basePath: string, milestoneId: string) => {
      calls.push({ fn: "getAutoWorktreePath", args: [basePath, milestoneId] });
      return null;
    },
    autoCommitCurrentBranch: (basePath: string, reason: string, milestoneId: string) => {
      calls.push({ fn: "autoCommitCurrentBranch", args: [basePath, reason, milestoneId] });
    },
    getCurrentBranch: (basePath: string) => {
      calls.push({ fn: "getCurrentBranch", args: [basePath] });
      return "main";
    },
    checkoutBranch: (basePath: string, branch: string) => {
      calls.push({ fn: "checkoutBranch", args: [basePath, branch] });
    },
    autoWorktreeBranch: (milestoneId: string) => `milestone/${milestoneId}`,
    resolveMilestoneFile: (basePath: string, milestoneId: string, fileType: string) => {
      calls.push({ fn: "resolveMilestoneFile", args: [basePath, milestoneId, fileType] });
      return null;
    },
    readFileSync: (path: string, _enc: string) => {
      calls.push({ fn: "readFileSync", args: [path] });
      return "# Roadmap\n";
    },
    GitServiceImpl: class {
      constructor(_basePath: string, _gitConfig: unknown) {}
    } as unknown as WorktreeResolverDeps["GitServiceImpl"],
    loadEffectiveGSDPreferences: () => ({ preferences: { git: {} } }),
    invalidateAllCaches: () => { calls.push({ fn: "invalidateAllCaches", args: [] }); },
    captureIntegrationBranch: (_basePath: string, _mid: string) => {},
    enterBranchModeForMilestone: (_basePath: string, _milestoneId: string) => {},
    ...overrides,
  };

  if (overrides) {
    for (const [key, val] of Object.entries(overrides)) {
      if (key !== "calls") (deps as unknown as Record<string, unknown>)[key] = val;
    }
  }
  return deps;
}

function makeNotifyCtx(): NotifyCtx & { messages: Array<{ msg: string; level?: string }> } {
  const messages: Array<{ msg: string; level?: string }> = [];
  return {
    messages,
    notify: (msg: string, level?: "info" | "warning" | "error" | "success") => {
      messages.push({ msg, level });
    },
  };
}

// ─── Suite 1: getAutoWorktreeOriginalBase() returns realpath-canonical path ──

describe("getAutoWorktreeOriginalBase() is realpath-normalised", () => {
  const savedCwd = process.cwd();

  beforeEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
  });

  afterEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });

  test("returns canonical realpath even when called from a realpath-resolved dir", (t) => {
    const tempDir = createTempRepo(t);
    // tempDir is already realpathSync()-resolved by createTempRepo
    const msDir = join(tempDir, ".gsd", "milestones", "M001");
    mkdirSync(msDir, { recursive: true });
    writeFileSync(join(msDir, "CONTEXT.md"), "# M001\n");
    git(["add", "."], tempDir);
    git(["commit", "-m", "add M001"], tempDir);

    createAutoWorktree(tempDir, "M001");

    const base = getAutoWorktreeOriginalBase();
    assert.ok(base !== null, "originalBase is set after createAutoWorktree");

    // The returned path must equal its own realpathSync — i.e. it is canonical
    let realBase: string;
    try { realBase = realpathSync(base); } catch { realBase = base; }
    assert.strictEqual(base, realBase,
      "getAutoWorktreeOriginalBase() must return a realpath-normalised path");

    teardownAutoWorktree(tempDir, "M001");
    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });
});

// ─── Suite 2: normalizeWorktreePathForCompare makes trailing-slash safe ───────

describe("normalizeWorktreePathForCompare equalises canonical vs non-canonical forms", () => {
  test("trailing slash: normalize(p/) === normalize(p)", () => {
    // Use a path that definitely exists on this machine
    const base = realpathSync(tmpdir());
    const withSlash = base + "/";
    assert.strictEqual(
      normalizeWorktreePathForCompare(withSlash),
      normalizeWorktreePathForCompare(base),
      "trailing slash should be stripped by normalizeWorktreePathForCompare",
    );
    // Confirm raw === would have returned false (test validity check)
    assert.notStrictEqual(
      withSlash,
      base,
      "sanity: raw === IS false for trailing-slash path (test is meaningful)",
    );
  });

  test("double trailing slashes: normalize(p//) === normalize(p)", () => {
    const base = realpathSync(tmpdir());
    const withDoubleSlash = base + "//";
    assert.strictEqual(
      normalizeWorktreePathForCompare(withDoubleSlash),
      normalizeWorktreePathForCompare(base),
    );
  });

  test("same realpath, different string forms: isSamePath-style comparison is true; raw === is false", () => {
    const base = realpathSync(tmpdir());
    const canonical = normalizeWorktreePathForCompare(base);
    const nonCanonical = normalizeWorktreePathForCompare(base + "/");
    // Post-fix: the two forms compare as equal
    assert.strictEqual(canonical, nonCanonical,
      "isSamePath-style comparison returns true for same physical path");
  });
});

// ─── Suite 3: WorktreeResolver roadmap-fallback branch under cwd-drift ───────
//
// The buggy line was:
//   if (!roadmapPath && this.s.basePath !== originalBase) { /* try worktree */ }
//
// After the fix:
//   if (!roadmapPath && !isSamePath(this.s.basePath, originalBase)) { ... }
//
// When s.basePath is a non-canonical form of originalBase (e.g. trailing slash),
// the old code falsely entered the fallback branch (attempted a second
// resolveMilestoneFile call against the "worktree" path that is actually the
// same directory). The new code correctly skips the fallback.

describe("WorktreeResolver: roadmap-fallback skipped when basePath is same physical path as originalBase", () => {
  test("with trailing-slash basePath equal to originalBase: resolveMilestoneFile called once", () => {
    // originalBase is canonical (as returned by workspace registry)
    const canonicalBase = "/tmp/m5-test-project";
    // s.basePath has a trailing slash — same physical dir, non-canonical string
    const trailingSlashBase = canonicalBase + "/";

    const s = makeSession({
      basePath: trailingSlashBase,
      originalBasePath: canonicalBase,
    });

    const calls: CallLog[] = [];
    const deps = makeDeps({
      // isInAutoWorktree: basePath has trailing slash but is NOT a worktree
      isInAutoWorktree: (basePath: string) => {
        calls.push({ fn: "isInAutoWorktree", args: [basePath] });
        return false;
      },
      // resolveMilestoneFile always returns null (no roadmap found)
      resolveMilestoneFile: (basePath: string, milestoneId: string, fileType: string) => {
        calls.push({ fn: "resolveMilestoneFile", args: [basePath, milestoneId, fileType] });
        return null;
      },
      teardownAutoWorktree: (basePath: string, milestoneId: string, opts?: { preserveBranch?: boolean }) => {
        calls.push({ fn: "teardownAutoWorktree", args: [basePath, milestoneId, opts] });
      },
    });

    // Override calls ref so we can inspect it directly
    (deps as unknown as { calls: CallLog[] }).calls = calls;

    const resolver = new WorktreeResolver(s, deps);
    const ctx = makeNotifyCtx();

    // mergeAndExit → _mergeWorktreeMode
    // originalBase = s.originalBasePath = canonicalBase
    // s.basePath = trailingSlashBase — physically same as canonicalBase
    // Post-fix: isSamePath(trailingSlashBase, canonicalBase) is true
    //   → roadmap fallback branch is skipped (resolveMilestoneFile called once)
    // Pre-fix (bug): trailingSlashBase !== canonicalBase → fallback entered
    //   → resolveMilestoneFile called twice

    resolver.mergeAndExit("M001", ctx);

    const rmfCalls = calls.filter(c => c.fn === "resolveMilestoneFile");
    assert.strictEqual(rmfCalls.length, 1,
      "resolveMilestoneFile must be called exactly once — fallback should be skipped when " +
      "s.basePath is the same physical path as originalBase (isSamePath fix)");
  });

  test("with genuinely different basePath (inside worktree): resolveMilestoneFile called twice", () => {
    // originalBase is the project root
    const projectRoot = "/tmp/m5-test-project";
    // s.basePath is inside a worktree — a physically different path
    const worktreePath = projectRoot + "/.gsd/worktrees/M002";

    const s = makeSession({
      basePath: worktreePath,
      originalBasePath: projectRoot,
    });

    const calls: CallLog[] = [];
    const deps = makeDeps({
      isInAutoWorktree: (basePath: string) => {
        calls.push({ fn: "isInAutoWorktree", args: [basePath] });
        return basePath.includes("worktrees");
      },
      resolveMilestoneFile: (basePath: string, milestoneId: string, fileType: string) => {
        calls.push({ fn: "resolveMilestoneFile", args: [basePath, milestoneId, fileType] });
        return null; // no roadmap in either location
      },
      teardownAutoWorktree: (basePath: string, milestoneId: string, opts?: { preserveBranch?: boolean }) => {
        calls.push({ fn: "teardownAutoWorktree", args: [basePath, milestoneId, opts] });
      },
    });
    (deps as unknown as { calls: CallLog[] }).calls = calls;

    const resolver = new WorktreeResolver(s, deps);
    const ctx = makeNotifyCtx();

    resolver.mergeAndExit("M002", ctx);

    const rmfCalls = calls.filter(c => c.fn === "resolveMilestoneFile");
    assert.strictEqual(rmfCalls.length, 2,
      "resolveMilestoneFile must be called twice when basePath is a genuine worktree path " +
      "(fallback should run for different physical paths)");
  });
});
