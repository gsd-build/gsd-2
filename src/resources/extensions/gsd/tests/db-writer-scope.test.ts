// GSD-2 + db-writer saveArtifactToDbByScope: workspace-contract path routing tests

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { createWorkspace, scopeMilestone } from "../workspace.ts";
import { saveArtifactToDb, saveArtifactToDbByScope } from "../db-writer.ts";
import { openDatabase, closeDatabase } from "../gsd-db.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-dbwriter-scope-")));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

// ─── Suite 1: scope variant writes to the same canonical path as legacy ──────

describe("saveArtifactToDbByScope: path parity with legacy saveArtifactToDb", () => {
  let tmp1: string;
  let tmp2: string;

  beforeEach(() => {
    tmp1 = makeProjectDir();
    tmp2 = makeProjectDir();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp1, { recursive: true, force: true });
    rmSync(tmp2, { recursive: true, force: true });
  });

  test("scope variant writes artifact to same canonical path as legacy variant", async () => {
    const relPath = "milestones/M001/slices/S01/tasks/T01-SUMMARY.md";
    const content = "# T01 Summary\n\nTest content.\n";
    const opts = {
      path: relPath,
      artifact_type: "SUMMARY",
      content,
      milestone_id: "M001",
      slice_id: "S01",
      task_id: "T01",
    };

    // Legacy path: basePath + '.gsd' join
    const legacyExpectedPath = resolve(tmp1, ".gsd", relPath);

    // Scope path: contract.projectGsd
    const ws = createWorkspace(tmp2);
    const scope = scopeMilestone(ws, "M001");
    const scopeExpectedPath = resolve(ws.contract.projectGsd, relPath);

    // Both should resolve to the same relative structure
    // (though under different temp dirs — so we compare structure, not absolute path)
    assert.equal(
      scopeExpectedPath,
      resolve(ws.contract.projectGsd, relPath),
      "scope path must be contract.projectGsd + relPath",
    );
    assert.equal(
      legacyExpectedPath,
      resolve(tmp1, ".gsd", relPath),
      "legacy path must be basePath/.gsd + relPath",
    );

    // Open DB for tmp1 and write via legacy
    const dbPath1 = join(tmp1, ".gsd", "gsd.db");
    openDatabase(dbPath1);
    await saveArtifactToDb(opts, tmp1);
    closeDatabase();

    // Open DB for tmp2 and write via scope variant
    const dbPath2 = join(tmp2, ".gsd", "gsd.db");
    openDatabase(dbPath2);
    await saveArtifactToDbByScope(scope, opts);
    closeDatabase();

    // Both should have written to the correct location under their respective .gsd dirs
    assert.ok(existsSync(legacyExpectedPath), "legacy: artifact written at basePath/.gsd/relPath");
    assert.ok(existsSync(scopeExpectedPath), "scope: artifact written at contract.projectGsd/relPath");

    // Content must match
    assert.equal(readFileSync(legacyExpectedPath, "utf-8"), content, "legacy: content matches");
    assert.equal(readFileSync(scopeExpectedPath, "utf-8"), content, "scope: content matches");
  });
});

// ─── Suite 2: scope variant uses contract.projectGsd, not a basePath join ────

describe("saveArtifactToDbByScope: uses contract.projectGsd, not hand-rolled basePath join", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeProjectDir();
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("scope.workspace.contract.projectGsd is used as the .gsd root, not basePath/.gsd", async () => {
    const ws = createWorkspace(tmp);
    const scope = scopeMilestone(ws, "M001");

    // The contract.projectGsd must equal the canonical join(projectRoot, '.gsd')
    assert.equal(
      ws.contract.projectGsd,
      join(ws.projectRoot, ".gsd"),
      "contract.projectGsd must equal join(projectRoot, '.gsd')",
    );

    // It must NOT be a hand-rolled resolution from an arbitrary basePath string
    // (i.e., contract.projectGsd routes through the workspace contract)
    assert.ok(
      ws.contract.projectGsd.startsWith(ws.projectRoot),
      "contract.projectGsd must be rooted at projectRoot",
    );

    const relPath = "milestones/M001/M001-CONTEXT.md";
    const content = "# M001 Context\n";
    const opts = {
      path: relPath,
      artifact_type: "CONTEXT",
      content,
      milestone_id: "M001",
    };

    openDatabase(join(tmp, ".gsd", "gsd.db"));
    await saveArtifactToDbByScope(scope, opts);

    // File must be at contract.projectGsd/relPath
    const expectedPath = resolve(ws.contract.projectGsd, relPath);
    assert.ok(existsSync(expectedPath), "artifact written at contract.projectGsd/relPath");
    assert.equal(readFileSync(expectedPath, "utf-8"), content, "content matches");

    // And must NOT be at some other location
    const handRolledPath = resolve(tmp, ".gsd", relPath);
    // Both should be the same path in project mode (they should agree)
    assert.equal(
      expectedPath,
      handRolledPath,
      "in project mode, contract.projectGsd resolves same as basePath/.gsd",
    );
  });
});

// ─── Suite 3: worktree-mode scope routes to project root's .gsd/ ─────────────

describe("saveArtifactToDbByScope: worktree scope writes to project root .gsd/", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "gsd-dbwriter-wt-scope-")));
    // Create project .gsd directory
    mkdirSync(join(tmp, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("worktree-mode scope: contract.projectGsd resolves to project root's .gsd/, not worktree .gsd/", async () => {
    // Construct a worktree path inside the project's .gsd/worktrees/<MID>
    const worktreePath = join(tmp, ".gsd", "worktrees", "M001");
    mkdirSync(join(worktreePath, ".gsd"), { recursive: true });

    const projectWs = createWorkspace(tmp);
    const worktreeWs = createWorkspace(worktreePath);

    // Both should share the same projectRoot (worktree-root resolution)
    assert.equal(
      worktreeWs.projectRoot,
      projectWs.projectRoot,
      "worktree workspace must have same projectRoot as project workspace",
    );

    // contract.projectGsd for the worktree workspace must point to the PROJECT root's .gsd/
    assert.equal(
      worktreeWs.contract.projectGsd,
      join(projectWs.projectRoot, ".gsd"),
      "worktree contract.projectGsd must equal project root's .gsd/",
    );

    // Must NOT be the worktree-local .gsd/
    assert.notEqual(
      worktreeWs.contract.projectGsd,
      join(worktreePath, ".gsd"),
      "worktree contract.projectGsd must NOT be the worktree-local .gsd/",
    );

    // Write via the worktree-mode scope
    const scope = scopeMilestone(worktreeWs, "M001");
    const relPath = "milestones/M001/M001-CONTEXT.md";
    const content = "# M001 Context from worktree scope\n";
    const opts = {
      path: relPath,
      artifact_type: "CONTEXT",
      content,
      milestone_id: "M001",
    };

    openDatabase(join(tmp, ".gsd", "gsd.db"));
    await saveArtifactToDbByScope(scope, opts);

    // File must land in the PROJECT root's .gsd/, not in the worktree's .gsd/
    const projectPath = resolve(projectWs.contract.projectGsd, relPath);
    const worktreeLocalPath = resolve(worktreePath, ".gsd", relPath);

    assert.ok(existsSync(projectPath), "artifact written to project root's .gsd/");
    assert.ok(
      !existsSync(worktreeLocalPath),
      "artifact must NOT be written to worktree-local .gsd/",
    );
    assert.equal(readFileSync(projectPath, "utf-8"), content, "content at project root matches");
  });
});
