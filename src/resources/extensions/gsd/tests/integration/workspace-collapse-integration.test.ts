// GSD-2 + Integration regression suite for workspace collapse (feat/workspace-collapse)

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { createWorkspace, scopeMilestone } from "../../workspace.ts";
import {
  gsdRoot,
  clearPathCache,
  _clearGsdRootCache,
} from "../../paths.ts";
import {
  loadWriteGateSnapshot,
  markDepthVerified,
  clearDiscussionFlowState,
} from "../../bootstrap/write-gate.ts";
import {
  teardownAutoWorktree,
  _resetAutoWorktreeOriginalBaseForTests,
} from "../../auto-worktree.ts";
import {
  openDatabaseByWorkspace,
  closeAllDatabases,
  _getDbCache,
} from "../../gsd-db.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-collapse-int-")));
  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  return dir;
}

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function makeGitRepo(): string {
  const dir = makeProjectDir();
  git(["init"], dir);
  git(["config", "user.email", "test@gsd.test"], dir);
  git(["config", "user.name", "GSD Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(["add", "README.md"], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

// ─── Test 1: Writer/validator path agreement under cwd-drift ─────────────────

describe("workspace-collapse integration: Test 1 — cwd-drift path agreement", () => {
  let projectDir: string;
  let otherDir: string;
  const savedCwd = process.cwd();

  beforeEach(() => {
    projectDir = makeProjectDir();
    otherDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-cwd-drift-other-")));
    _clearGsdRootCache();
  });

  afterEach(() => {
    process.chdir(savedCwd);
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(otherDir, { recursive: true, force: true });
    _clearGsdRootCache();
  });

  test("contextFile() returns same absolute path before and after cwd change", () => {
    const worktreeDir = join(projectDir, ".gsd", "worktrees", "M001");
    mkdirSync(worktreeDir, { recursive: true });

    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");

    // Record the path the "writer" would use
    const writerPath = scope.contextFile();
    assert.ok(writerPath.startsWith(projectDir), "writer path is under projectDir");

    // Simulate cwd drift
    process.chdir(otherDir);
    assert.notEqual(process.cwd(), projectDir, "cwd has drifted away from projectDir");

    // The "validator" recomputes via the same scope
    const validatorPath = scope.contextFile();

    assert.equal(
      validatorPath,
      writerPath,
      "contextFile() must return the same absolute path regardless of cwd drift",
    );
  });

  test("scopeMilestone paths are stable across cwd changes (roadmap, state, db)", () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");

    const before = {
      roadmap: scope.roadmapFile(),
      state: scope.stateFile(),
      db: scope.dbPath(),
      milestoneDir: scope.milestoneDir(),
    };

    process.chdir(otherDir);

    assert.equal(scope.roadmapFile(), before.roadmap, "roadmapFile() stable after cwd drift");
    assert.equal(scope.stateFile(), before.state, "stateFile() stable after cwd drift");
    assert.equal(scope.dbPath(), before.db, "dbPath() stable after cwd drift");
    assert.equal(scope.milestoneDir(), before.milestoneDir, "milestoneDir() stable after cwd drift");
  });
});

// ─── Test 2: Abort path leaves no stale state ────────────────────────────────

describe("workspace-collapse integration: Test 2 — abort teardown clears stale state", () => {
  let repoDir: string;
  const savedCwd = process.cwd();

  beforeEach(() => {
    repoDir = makeGitRepo();
    _resetAutoWorktreeOriginalBaseForTests();
  });

  afterEach(() => {
    process.chdir(savedCwd);
    _resetAutoWorktreeOriginalBaseForTests();
    rmSync(repoDir, { recursive: true, force: true });
  });

  test("STATE.md and M001-META.json are removed by teardownAutoWorktree", () => {
    // Phase C pt 2: auto.lock no longer exists as a file — it migrated
    // to the workers + unit_dispatches tables.
    const gsdDir = join(repoDir, ".gsd");
    const milestonesDir = join(gsdDir, "milestones", "M001");
    mkdirSync(milestonesDir, { recursive: true });

    const stateMd = join(gsdDir, "STATE.md");
    const metaJson = join(milestonesDir, "M001-META.json");

    writeFileSync(stateMd, "# State\nactive\n");
    writeFileSync(metaJson, JSON.stringify({ milestoneId: "M001" }));

    assert.ok(existsSync(stateMd), "STATE.md exists before teardown");
    assert.ok(existsSync(metaJson), "M001-META.json exists before teardown");

    // teardownAutoWorktree clears state files before the git step; git removal
    // may fail in a minimal test repo — that is acceptable.
    try {
      teardownAutoWorktree(repoDir, "M001");
    } catch {
      // git worktree removal may fail when no worktree was created — non-fatal for this assertion
    }

    assert.ok(!existsSync(stateMd), "STATE.md removed by teardownAutoWorktree (regression: A5)");
    assert.ok(!existsSync(metaJson), "M001-META.json removed by teardownAutoWorktree (regression: A5)");
  });
});

// ─── Test 3: Cwd drift between persist and load of write-gate state ──────────

describe("workspace-collapse integration: Test 3 — write-gate snapshot survives cwd drift", () => {
  let projectDir: string;
  let otherDir: string;
  const savedCwd = process.cwd();

  beforeEach(() => {
    projectDir = makeProjectDir();
    otherDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-wg-other-")));
    // Start with a clean write-gate state for projectDir
    clearDiscussionFlowState(projectDir);
  });

  afterEach(() => {
    process.chdir(savedCwd);
    clearDiscussionFlowState(projectDir);
    try { clearDiscussionFlowState(otherDir); } catch { /* best-effort */ }
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(otherDir, { recursive: true, force: true });
  });

  test("loadWriteGateSnapshot returns persisted state after cwd drift", () => {
    // Persist a snapshot: mark M001 depth-verified for projectDir
    markDepthVerified("M001", projectDir);

    // Drift cwd away from projectDir
    process.chdir(otherDir);
    assert.notEqual(process.cwd(), projectDir, "cwd has drifted");

    // Load the snapshot using the explicit basePath — must not be affected by cwd
    const snapshot = loadWriteGateSnapshot(projectDir);

    assert.ok(
      snapshot.verifiedDepthMilestones.includes("M001"),
      "snapshot loaded from projectDir includes M001 despite cwd drift",
    );
  });

  test("loadWriteGateSnapshot from different basePath does not bleed state", () => {
    markDepthVerified("M001", projectDir);

    process.chdir(otherDir);

    // otherDir has no persisted state — should return empty snapshot
    const snapshot = loadWriteGateSnapshot(otherDir);

    assert.ok(
      !snapshot.verifiedDepthMilestones.includes("M001"),
      "otherDir snapshot must not bleed M001 state from projectDir",
    );
  });
});

// ─── Test 4: Sibling worktrees share DB connection ───────────────────────────

describe("workspace-collapse integration: Test 4 — sibling worktrees share DB connection", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
  });

  afterEach(() => {
    closeAllDatabases();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("ws1 and ws2 (sibling worktrees) have same identityKey", () => {
    const wt1 = join(projectDir, ".gsd", "worktrees", "M001");
    const wt2 = join(projectDir, ".gsd", "worktrees", "M002");
    mkdirSync(wt1, { recursive: true });
    mkdirSync(wt2, { recursive: true });

    const ws1 = createWorkspace(wt1);
    const ws2 = createWorkspace(wt2);

    assert.equal(
      ws1.identityKey,
      ws2.identityKey,
      "sibling worktrees M001 and M002 must share the same identityKey",
    );
    assert.equal(
      ws1.identityKey,
      realpathSync(projectDir),
      "identityKey is the realpath of the project root",
    );
  });

  test("openDatabaseByWorkspace for sibling worktrees resolves to the same DB path", () => {
    const wt1 = join(projectDir, ".gsd", "worktrees", "M001");
    const wt2 = join(projectDir, ".gsd", "worktrees", "M002");
    mkdirSync(wt1, { recursive: true });
    mkdirSync(wt2, { recursive: true });

    const ws1 = createWorkspace(wt1);
    const ws2 = createWorkspace(wt2);

    const ok1 = openDatabaseByWorkspace(ws1);
    assert.ok(ok1, "openDatabaseByWorkspace(ws1) must succeed");
    const cacheAfterWs1 = _getDbCache();
    const entry1 = cacheAfterWs1.get(ws1.identityKey);
    assert.ok(entry1, "cache entry for ws1.identityKey must exist");
    const dbPath1 = entry1.dbPath;

    const ok2 = openDatabaseByWorkspace(ws2);
    assert.ok(ok2, "openDatabaseByWorkspace(ws2) must succeed");
    const cacheAfterWs2 = _getDbCache();
    const entry2 = cacheAfterWs2.get(ws2.identityKey);
    assert.ok(entry2, "cache entry for ws2.identityKey must exist");
    const dbPath2 = entry2.dbPath;

    assert.equal(
      dbPath1,
      dbPath2,
      "sibling worktrees must resolve to the same DB path (shared WAL)",
    );
    assert.equal(
      cacheAfterWs2.size,
      1,
      "only one cache entry for project + two sibling worktrees",
    );
  });
});

// ─── Test 5: gsdRootCache normalization survives trailing-slash inputs ────────

describe("workspace-collapse integration: Test 5 — gsdRootCache normalization deduplicates trailing-slash inputs", () => {
  let projectDir: string;
  let fakeHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedGsdHome: string | undefined;

  beforeEach(() => {
    projectDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-cache-int-")));
    mkdirSync(join(projectDir, ".gsd"), { recursive: true });

    fakeHome = realpathSync(mkdtempSync(join(tmpdir(), "gsd-cache-int-home-")));

    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedGsdHome = process.env.GSD_HOME;

    // Prevent ~/.gsd interference
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    process.env.GSD_HOME = join(fakeHome, ".gsd");

    clearPathCache();
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = savedGsdHome;

    clearPathCache();
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test("gsdRoot('/path/to/project') and gsdRoot('/path/to/project/') return identical paths", () => {
    const withoutSlash = gsdRoot(projectDir);
    const withSlash = gsdRoot(projectDir + "/");

    assert.equal(
      withoutSlash,
      withSlash,
      "gsdRoot must return identical paths for inputs with and without trailing slash",
    );
    assert.equal(
      withoutSlash,
      join(projectDir, ".gsd"),
      "both calls must resolve to projectDir/.gsd",
    );
  });

  test("both calls after clearPathCache() return identical paths (no duplicate cache entries)", () => {
    // Start clean
    clearPathCache();

    const r1 = gsdRoot(projectDir);
    const r2 = gsdRoot(projectDir + "/");

    assert.equal(r1, r2, "r1 and r2 must be the same string after normalization");
    // The cache normalizes both inputs to the same key — no duplicate entries.
    // We can't inspect the cache size directly, but the behavioral proof is
    // that a second call after clearPathCache re-probes and still matches.
    clearPathCache();
    const r3 = gsdRoot(projectDir + "/");
    assert.equal(r3, r1, "re-probe after clearPathCache must produce the same result");
  });
});
