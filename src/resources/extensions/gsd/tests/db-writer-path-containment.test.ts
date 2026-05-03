// GSD-2 + db-writer path containment: regression tests for path.relative-based traversal guard

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase, closeDatabase } from "../gsd-db.ts";
import { createWorkspace, scopeMilestone } from "../workspace.ts";
import {
  saveArtifactToDbForWorkspace,
  saveArtifactToDbByScope,
} from "../db-writer.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(base: string): string {
  mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });
  return base;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("saveArtifactToDbForWorkspace: path.relative containment guard", () => {
  let tmp: string;
  let projectDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gsd-path-contain-fw-"));
    projectDir = makeProjectDir(tmp);
    openDatabase(join(projectDir, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  // Attack: /foo/.gsd-other/file resolves to a path that startsWith("/foo/.gsd")
  // but is NOT inside /foo/.gsd/. The path.relative fix correctly detects this.
  test("rejects sibling directory that startsWith would have accepted", async () => {
    // Create a sibling directory next to .gsd that shares the prefix
    const sibling = join(projectDir, ".gsd-other");
    mkdirSync(sibling, { recursive: true });

    const ws = createWorkspace(projectDir);
    // Craft an opts.path that traverses out of .gsd into .gsd-other
    // resolve(gsdDir, "../.gsd-other/evil.md") === projectDir + "/.gsd-other/evil.md"
    // which startsWith(projectDir + "/.gsd") because ".gsd-other" starts with ".gsd"
    const traversalPath = "../.gsd-other/evil.md";

    await assert.rejects(
      () =>
        saveArtifactToDbForWorkspace(ws, {
          path: traversalPath,
          artifact_type: "CONTEXT",
          content: "attack",
        }),
      /path escapes \.gsd\/ directory/,
    );
  });

  test("rejects absolute path input", async () => {
    const ws = createWorkspace(projectDir);
    await assert.rejects(
      () =>
        saveArtifactToDbForWorkspace(ws, {
          path: "/etc/passwd",
          artifact_type: "CONTEXT",
          content: "attack",
        }),
      /path escapes \.gsd\/ directory/,
    );
  });

  test("accepts a legitimate path inside .gsd/", async () => {
    const ws = createWorkspace(projectDir);
    // Should not throw — CONTEXT.md inside .gsd is valid
    await assert.doesNotReject(() =>
      saveArtifactToDbForWorkspace(ws, {
        path: "CONTEXT.md",
        artifact_type: "CONTEXT",
        content: "# Context\n",
      }),
    );
  });
});

describe("saveArtifactToDbByScope: path.relative containment guard", () => {
  let tmp: string;
  let projectDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gsd-path-contain-bs-"));
    projectDir = makeProjectDir(tmp);
    openDatabase(join(projectDir, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("rejects sibling directory that startsWith would have accepted", async () => {
    const sibling = join(projectDir, ".gsd-other");
    mkdirSync(sibling, { recursive: true });

    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    const traversalPath = "../.gsd-other/evil.md";

    await assert.rejects(
      () =>
        saveArtifactToDbByScope(scope, {
          path: traversalPath,
          artifact_type: "CONTEXT",
          content: "attack",
        }),
      /path escapes \.gsd\/ directory/,
    );
  });

  test("rejects absolute path input", async () => {
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    await assert.rejects(
      () =>
        saveArtifactToDbByScope(scope, {
          path: "/etc/passwd",
          artifact_type: "CONTEXT",
          content: "attack",
        }),
      /path escapes \.gsd\/ directory/,
    );
  });

  test("accepts a legitimate milestone-relative path inside .gsd/", async () => {
    mkdirSync(join(projectDir, ".gsd", "milestones", "M001"), {
      recursive: true,
    });
    const ws = createWorkspace(projectDir);
    const scope = scopeMilestone(ws, "M001");
    await assert.doesNotReject(() =>
      saveArtifactToDbByScope(scope, {
        path: "milestones/M001/M001-CONTEXT.md",
        artifact_type: "CONTEXT",
        content: "# Context\n",
      }),
    );
  });
});
