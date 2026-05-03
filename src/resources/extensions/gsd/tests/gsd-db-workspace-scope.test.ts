// GSD-2 + gsd-db workspace-scoped connection cache tests

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createWorkspace, scopeMilestone } from "../workspace.ts";
import {
  openDatabaseByWorkspace,
  openDatabaseByScope,
  closeDatabaseByWorkspace,
  closeAllDatabases,
  _getDbCache,
  _getAdapter,
} from "../gsd-db.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a minimal project directory with the artifacts that make
 * createWorkspace() resolve it as a proper project root (not a bare temp dir).
 * Returns the realpath-normalised absolute path.
 */
function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-db-ws-scope-")));
  // hasGsdBootstrapArtifacts checks for .gsd/milestones or .gsd/PREFERENCES.md
  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  return dir;
}

/**
 * Create a worktree path inside a project's .gsd/worktrees/<MID>/ layout.
 * createWorkspace() will detect the /.gsd/worktrees/ segment and resolve the
 * project root back to `projectDir`.
 */
function makeWorktreeDir(projectDir: string, mid: string): string {
  const worktreeDir = join(projectDir, ".gsd", "worktrees", mid);
  mkdirSync(worktreeDir, { recursive: true });
  return worktreeDir;
}

// ─── Suite: same realpath → same identityKey → same DB instance ──────────────

describe("openDatabaseByWorkspace: same project reuses connection", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
  });

  afterEach(() => {
    closeAllDatabases();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("two createWorkspace calls with the same path share identityKey", () => {
    const ws1 = createWorkspace(projectDir);
    const ws2 = createWorkspace(projectDir);
    assert.equal(ws1.identityKey, ws2.identityKey);
  });

  test("openDatabaseByWorkspace returns the same DB adapter for the same project", () => {
    const ws1 = createWorkspace(projectDir);
    const ws2 = createWorkspace(projectDir);

    const ok1 = openDatabaseByWorkspace(ws1);
    assert.ok(ok1, "first open should succeed");
    const adapter1 = _getAdapter();

    const ok2 = openDatabaseByWorkspace(ws2);
    assert.ok(ok2, "second open should succeed");
    const adapter2 = _getAdapter();

    assert.equal(adapter1, adapter2, "same project → same DB adapter instance");
    assert.equal(_getDbCache().size, 1, "only one cache entry for same project");
  });
});

// ─── Suite: different projects → different DB instances ──────────────────────

describe("openDatabaseByWorkspace: different projects get separate connections", () => {
  let projectA: string;
  let projectB: string;

  beforeEach(() => {
    projectA = makeProjectDir();
    projectB = makeProjectDir();
  });

  afterEach(() => {
    closeAllDatabases();
    rmSync(projectA, { recursive: true, force: true });
    rmSync(projectB, { recursive: true, force: true });
  });

  test("two different projects produce different identityKeys", () => {
    const wsA = createWorkspace(projectA);
    const wsB = createWorkspace(projectB);
    assert.notEqual(wsA.identityKey, wsB.identityKey);
  });

  test("opening two different projects stores two cache entries", () => {
    const wsA = createWorkspace(projectA);
    const wsB = createWorkspace(projectB);

    openDatabaseByWorkspace(wsA);
    const adapterAfterA = _getAdapter();

    openDatabaseByWorkspace(wsB);
    const adapterAfterB = _getAdapter();

    assert.notEqual(adapterAfterA, adapterAfterB, "different projects → different adapter instances");
    assert.equal(_getDbCache().size, 2, "two cache entries for two distinct projects");
  });
});

// ─── Suite: sibling worktrees share the same DB instance ─────────────────────

describe("openDatabaseByWorkspace: sibling worktrees share DB connection", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeProjectDir();
  });

  afterEach(() => {
    closeAllDatabases();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("worktree path resolves to same identityKey as project root", () => {
    const worktreeDir = makeWorktreeDir(projectDir, "M001");
    const wsProject = createWorkspace(projectDir);
    const wsWorktree = createWorkspace(worktreeDir);
    assert.equal(
      wsProject.identityKey,
      wsWorktree.identityKey,
      "project root and sibling worktree share identityKey",
    );
  });

  test("opening via project path and via worktree path yields the same DB adapter", () => {
    const worktreeDir = makeWorktreeDir(projectDir, "M001");
    const wsProject = createWorkspace(projectDir);
    const wsWorktree = createWorkspace(worktreeDir);

    openDatabaseByWorkspace(wsProject);
    const adapterProject = _getAdapter();

    openDatabaseByWorkspace(wsWorktree);
    const adapterWorktree = _getAdapter();

    assert.equal(
      adapterProject,
      adapterWorktree,
      "sibling worktree reuses the same DB adapter as the project root",
    );
    assert.equal(_getDbCache().size, 1, "only one cache entry for project + sibling worktree");
  });
});

// ─── Suite: closing removes only the targeted cache entry ─────────────────────

describe("closeDatabaseByWorkspace: removes only the targeted cache entry", () => {
  let projectA: string;
  let projectB: string;

  beforeEach(() => {
    projectA = makeProjectDir();
    projectB = makeProjectDir();
  });

  afterEach(() => {
    closeAllDatabases();
    rmSync(projectA, { recursive: true, force: true });
    rmSync(projectB, { recursive: true, force: true });
  });

  test("closing workspace A removes only A from the cache", () => {
    const wsA = createWorkspace(projectA);
    const wsB = createWorkspace(projectB);

    openDatabaseByWorkspace(wsA);
    openDatabaseByWorkspace(wsB);
    assert.equal(_getDbCache().size, 2, "precondition: two cache entries");

    closeDatabaseByWorkspace(wsA);

    assert.equal(_getDbCache().size, 1, "one entry remains after closing A");
    assert.ok(!_getDbCache().has(wsA.identityKey), "A's entry is gone");
    assert.ok(_getDbCache().has(wsB.identityKey), "B's entry is still present");
  });

  test("closing the active workspace via closeDatabaseByWorkspace nulls currentDb", () => {
    const wsA = createWorkspace(projectA);

    openDatabaseByWorkspace(wsA);
    assert.ok(_getAdapter() !== null, "precondition: adapter is open");

    // Make wsA the active connection explicitly.
    openDatabaseByWorkspace(wsA);
    closeDatabaseByWorkspace(wsA);

    // After closing the active connection, the global adapter should be null.
    assert.equal(_getAdapter(), null, "currentDb should be null after closing active workspace");
    assert.equal(_getDbCache().size, 0, "cache should be empty after closing sole entry");
  });

  test("openDatabaseByScope delegates to workspace correctly", () => {
    const ws = createWorkspace(projectA);
    const scope = scopeMilestone(ws, "M001");

    const ok = openDatabaseByScope(scope);
    assert.ok(ok, "openDatabaseByScope should succeed");
    assert.ok(_getDbCache().has(ws.identityKey), "cache entry exists after openDatabaseByScope");

    closeDatabaseByWorkspace(ws);
  });
});
