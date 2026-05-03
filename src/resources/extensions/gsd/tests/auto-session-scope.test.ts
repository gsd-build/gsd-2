// GSD-2 + Tests for MilestoneScope threading through AutoSession state (C2)
//
// Strategy: construct AutoSession directly + call createWorkspace/scopeMilestone
// to mirror the rebuildScope() helper in auto.ts — avoids importing the full
// auto.ts module (too many .js resolved imports).

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { AutoSession } from "../auto/session.ts";
import { createWorkspace, scopeMilestone } from "../workspace.ts";
import type { MilestoneScope } from "../workspace.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-scope-test-")));
  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  return dir;
}

function makeWorktreeDir(projectDir: string, milestoneId: string): string {
  const wt = join(projectDir, ".gsd", "worktrees", milestoneId);
  mkdirSync(wt, { recursive: true });
  return wt;
}

/**
 * Mirror the rebuildScope() helper from auto.ts — computes s.scope from the
 * same inputs so tests can verify the behaviour without importing auto.ts.
 */
function applyRebuildScope(
  s: AutoSession,
  rawPath: string,
  milestoneId: string | null,
): void {
  if (!milestoneId) {
    s.scope = null;
    return;
  }
  try {
    const workspace = createWorkspace(rawPath);
    s.scope = scopeMilestone(workspace, milestoneId);
  } catch {
    s.scope = null;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AutoSession.scope — project mode (basePath equals originalBasePath)", () => {
  let s: AutoSession;
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    s = new AutoSession();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("scope is null when milestoneId is null", () => {
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = null;

    applyRebuildScope(s, projectDir, null);

    assert.equal(s.scope, null);
  });

  test("scope mode is 'project' when basePath equals originalBasePath", () => {
    const mid = "M001";
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, projectDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.workspace.mode, "project");
    assert.equal(s.scope.milestoneId, mid);
  });

  test("scope projectRoot matches realpath of projectDir", () => {
    const mid = "M001";
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, projectDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.workspace.projectRoot, realpathSync(projectDir));
  });

  test("scope worktreeRoot is null in project mode", () => {
    const mid = "M001";
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, projectDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.workspace.worktreeRoot, null);
  });

  test("scope path methods resolve under the .gsd directory", () => {
    const mid = "M002";
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, projectDir, mid);

    assert.ok(s.scope, "scope should be set");
    const gsd = join(projectDir, ".gsd");
    assert.equal(s.scope.contextFile(), join(gsd, "milestones", mid, `${mid}-CONTEXT.md`));
    assert.equal(s.scope.roadmapFile(), join(gsd, "milestones", mid, `${mid}-ROADMAP.md`));
    assert.equal(s.scope.stateFile(), join(gsd, "STATE.md"));
  });
});

describe("AutoSession.scope — worktree mode (basePath differs from originalBasePath)", () => {
  let s: AutoSession;
  let projectDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    worktreeDir = makeWorktreeDir(projectDir, "M001");
    s = new AutoSession();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("scope mode is 'worktree' when basePath is the worktree path", () => {
    const mid = "M001";
    s.basePath = worktreeDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, worktreeDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.workspace.mode, "worktree");
  });

  test("scope worktreeRoot matches realpath of worktreeDir", () => {
    const mid = "M001";
    s.basePath = worktreeDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, worktreeDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.workspace.worktreeRoot, realpathSync(worktreeDir));
  });

  test("scope projectRoot resolves to project root (not worktree)", () => {
    const mid = "M001";
    s.basePath = worktreeDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, worktreeDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.workspace.projectRoot, realpathSync(projectDir));
  });

  test("scope milestoneId matches the milestone being tracked", () => {
    const mid = "M001";
    s.basePath = worktreeDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, worktreeDir, mid);

    assert.ok(s.scope, "scope should be set");
    assert.equal(s.scope.milestoneId, mid);
  });
});

describe("AutoSession.scope — milestoneId change rebuilds scope", () => {
  let s: AutoSession;
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    s = new AutoSession();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("scope reflects the new milestoneId after rebuild", () => {
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = "M001";
    applyRebuildScope(s, projectDir, "M001");

    assert.ok(s.scope, "initial scope should be set");
    assert.equal(s.scope.milestoneId, "M001");

    // Simulate milestone transition mid-session
    s.currentMilestoneId = "M002";
    applyRebuildScope(s, projectDir, "M002");

    assert.ok(s.scope, "scope should be set after transition");
    assert.equal(s.scope.milestoneId, "M002");
  });

  test("scope contextFile changes when milestoneId changes", () => {
    s.basePath = projectDir;
    s.originalBasePath = projectDir;

    s.currentMilestoneId = "M001";
    applyRebuildScope(s, projectDir, "M001");
    const ctxM001 = s.scope?.contextFile();

    s.currentMilestoneId = "M002";
    applyRebuildScope(s, projectDir, "M002");
    const ctxM002 = s.scope?.contextFile();

    assert.ok(ctxM001, "M001 contextFile should be set");
    assert.ok(ctxM002, "M002 contextFile should be set");
    assert.notEqual(ctxM001, ctxM002, "contextFile must differ between milestone IDs");
    assert.ok(ctxM001.includes("M001"), "M001 path should contain M001");
    assert.ok(ctxM002.includes("M002"), "M002 path should contain M002");
  });
});

describe("AutoSession.scope — resume from persisted state", () => {
  let s: AutoSession;
  let projectDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
    worktreeDir = makeWorktreeDir(projectDir, "M003");
    s = new AutoSession();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("resume without worktree: scope mode is project, projectRoot is base", () => {
    // Mirror the paused-session resume path:
    //   s.currentMilestoneId = meta.milestoneId
    //   s.originalBasePath   = meta.originalBasePath || base
    //   rawPath              = originalBasePath (no worktreePath present)
    const mid = "M003";
    s.currentMilestoneId = mid;
    s.originalBasePath = projectDir;
    s.basePath = projectDir;

    applyRebuildScope(s, s.originalBasePath, s.currentMilestoneId);

    assert.ok(s.scope, "scope should be reconstructed");
    assert.equal(s.scope.milestoneId, mid);
    assert.equal(s.scope.workspace.mode, "project");
    assert.equal(s.scope.workspace.projectRoot, realpathSync(projectDir));
    assert.equal(s.scope.workspace.worktreeRoot, null);
  });

  test("resume with valid worktree path: scope mode is worktree", () => {
    // Mirror the paused-session resume path where worktreePath exists on disk:
    //   rawPath = worktreePath (existsSync true)
    const mid = "M003";
    s.currentMilestoneId = mid;
    s.originalBasePath = projectDir;
    s.basePath = worktreeDir;

    assert.ok(existsSync(worktreeDir), "worktreeDir must exist for this test");

    applyRebuildScope(s, worktreeDir, s.currentMilestoneId);

    assert.ok(s.scope, "scope should be reconstructed");
    assert.equal(s.scope.milestoneId, mid);
    assert.equal(s.scope.workspace.mode, "worktree");
    assert.equal(s.scope.workspace.projectRoot, realpathSync(projectDir));
    assert.equal(s.scope.workspace.worktreeRoot, realpathSync(worktreeDir));
  });

  test("scope is consistent with direct createWorkspace + scopeMilestone for same inputs", () => {
    const mid = "M003";
    s.currentMilestoneId = mid;
    s.originalBasePath = projectDir;
    s.basePath = projectDir;

    applyRebuildScope(s, projectDir, mid);
    assert.ok(s.scope, "scope should be set");

    // Build expected scope via lower-level API to verify equivalence
    const ws = createWorkspace(projectDir);
    const expected = scopeMilestone(ws, mid);

    assert.equal(s.scope.milestoneId, expected.milestoneId);
    assert.equal(s.scope.contextFile(), expected.contextFile());
    assert.equal(s.scope.roadmapFile(), expected.roadmapFile());
    assert.equal(s.scope.stateFile(), expected.stateFile());
    assert.equal(s.scope.dbPath(), expected.dbPath());
    assert.equal(s.scope.milestoneDir(), expected.milestoneDir());
    assert.equal(s.scope.metaJson(), expected.metaJson());
  });

  test("reset() clears scope", () => {
    const mid = "M003";
    s.basePath = projectDir;
    s.originalBasePath = projectDir;
    s.currentMilestoneId = mid;

    applyRebuildScope(s, projectDir, mid);
    assert.ok(s.scope, "scope should be set before reset");

    s.reset();
    assert.equal(s.scope, null, "scope must be null after reset()");
  });
});
