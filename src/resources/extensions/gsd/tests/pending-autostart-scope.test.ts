// GSD-2 + Tests for MilestoneScope pinning in pendingAutoStartMap (C1 regression guard)

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  setPendingAutoStart,
  clearPendingAutoStart,
  _getPendingAutoStart,
} from "../guided-flow.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-pas-scope-")));
  mkdirSync(join(dir, ".gsd", "milestones"), { recursive: true });
  return dir;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("pendingAutoStart scope pinning (C1)", () => {
  let base: string;

  beforeEach(() => {
    clearPendingAutoStart();
    base = makeProjectDir();
  });

  afterEach(() => {
    clearPendingAutoStart();
    if (base) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("setPendingAutoStart stores a scope whose paths derive from the basePath at reservation time", () => {
    setPendingAutoStart(base, { basePath: base, milestoneId: "M001" });

    const entry = _getPendingAutoStart(base);
    assert.ok(entry, "entry should exist");
    assert.ok(entry.scope, "entry.scope should be set");
    assert.equal(entry.scope.milestoneId, "M001");

    const expectedContext = join(base, ".gsd", "milestones", "M001", "M001-CONTEXT.md");
    const expectedRoadmap = join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md");
    const expectedState = join(base, ".gsd", "STATE.md");

    assert.equal(entry.scope.contextFile(), expectedContext);
    assert.equal(entry.scope.roadmapFile(), expectedRoadmap);
    assert.equal(entry.scope.stateFile(), expectedState);
  });

  test("scope paths are unaffected by process.chdir after reservation", (t) => {
    setPendingAutoStart(base, { basePath: base, milestoneId: "M002" });

    const entry = _getPendingAutoStart(base);
    assert.ok(entry, "entry should exist");

    // Capture paths before cwd change
    const ctxBefore = entry.scope.contextFile();
    const roadmapBefore = entry.scope.roadmapFile();
    const stateBefore = entry.scope.stateFile();

    // Change cwd to a different directory, then check that scope is unchanged
    const originalCwd = process.cwd();
    const altDir = mkdtempSync(join(tmpdir(), "gsd-cwd-alt-"));
    t.after(() => {
      process.chdir(originalCwd);
      rmSync(altDir, { recursive: true, force: true });
    });

    process.chdir(altDir);

    assert.equal(entry.scope.contextFile(), ctxBefore, "contextFile must not change after cwd drift");
    assert.equal(entry.scope.roadmapFile(), roadmapBefore, "roadmapFile must not change after cwd drift");
    assert.equal(entry.scope.stateFile(), stateBefore, "stateFile must not change after cwd drift");
  });

  test("scope identityKey matches the realpath of the original basePath even with trailing slash", () => {
    const baseWithSlash = base + "/";
    setPendingAutoStart(base, { basePath: baseWithSlash, milestoneId: "M003" });

    const entry = _getPendingAutoStart(base);
    assert.ok(entry, "entry should exist");

    const expectedIdentityKey = realpathSync(base);
    assert.equal(
      entry.scope.workspace.identityKey,
      expectedIdentityKey,
      "identityKey must match realpath of the original (non-canonical) basePath",
    );
  });

  test("clearPendingAutoStart removes the entry", () => {
    setPendingAutoStart(base, { basePath: base, milestoneId: "M001" });

    const before = _getPendingAutoStart(base);
    assert.ok(before, "entry should exist before clear");

    clearPendingAutoStart(base);

    const after = _getPendingAutoStart(base);
    assert.equal(after, null, "entry should be null after clearPendingAutoStart(base)");
  });

  test("_getPendingAutoStart with no basePath argument returns the sole entry", () => {
    setPendingAutoStart(base, { basePath: base, milestoneId: "M001" });

    // No argument — should return the sole entry
    const entry = _getPendingAutoStart();
    assert.ok(entry, "sole entry should be returned when no basePath given");
    assert.equal(entry.milestoneId, "M001");
    assert.ok(entry.scope, "sole entry must have a scope");
    assert.equal(entry.scope.milestoneId, "M001");
  });
});
