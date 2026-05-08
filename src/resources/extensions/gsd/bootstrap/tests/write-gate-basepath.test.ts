// GSD-2 write-gate bootstrap — regression test for required basePath (commit A3)
//
// Verifies that persistWriteGateSnapshot / loadWriteGateSnapshot are pinned to
// the basePath argument and do not silently fall back to process.cwd(). The
// underlying bug: both functions defaulted `basePath = process.cwd()`, so a
// persist in cwd-A followed by a chdir to cwd-B and a load (which also
// defaulted to process.cwd(), now cwd-B) missed the persisted file entirely —
// the depth-verification state became invisible across cwd boundaries.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  markDepthVerified,
  loadWriteGateSnapshot,
  clearDiscussionFlowState,
} from "../write-gate.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "wg-basepath-test-"));
}

// Save and restore process.cwd() across tests to avoid cross-test pollution.
let originalCwd: string;
before(() => {
  originalCwd = process.cwd();
});
after(() => {
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }
});

// ─── Scenario: persist with basePath=A, chdir, load with basePath=A ─────────
//
// This is the exact failure mode from the bug: persist used process.cwd() and
// load used process.cwd(), and they resolved to different directories after a
// chdir.  With the fix, both calls receive an explicit basePath so cwd changes
// have no effect.

describe("write-gate basePath regression", () => {
  let baseDirA: string;
  let baseDirB: string;

  before(() => {
    baseDirA = makeTempDir();
    baseDirB = makeTempDir();
  });

  after(() => {
    // Restore cwd before cleanup to avoid issues on Windows.
    process.chdir(originalCwd);
    rmSync(baseDirA, { recursive: true, force: true });
    rmSync(baseDirB, { recursive: true, force: true });
  });

  test("snapshot persisted to basePath=A is readable after chdir to basePath=B", (t) => {
    // Arrange: enable persistence (the default when env var is not set to "0"/"false").
    const prev = process.env.GSD_PERSIST_WRITE_GATE_STATE;
    t.after(() => {
      if (prev === undefined) {
        delete process.env.GSD_PERSIST_WRITE_GATE_STATE;
      } else {
        process.env.GSD_PERSIST_WRITE_GATE_STATE = prev;
      }
    });
    process.env.GSD_PERSIST_WRITE_GATE_STATE = "1";

    // Reset state and clear any stale snapshot files from both dirs.
    clearDiscussionFlowState(baseDirA);
    clearDiscussionFlowState(baseDirB);

    // Act: persist a milestone as depth-verified into baseDirA.
    markDepthVerified("M001", baseDirA);

    // Confirm the snapshot file was written under baseDirA.
    const snapshotPath = join(baseDirA, ".gsd", "runtime", "write-gate-state.json");
    assert.ok(existsSync(snapshotPath), "snapshot file should exist under baseDirA");

    // Simulate what happens when cwd changes to a different project root.
    process.chdir(baseDirB);
    assert.notEqual(process.cwd(), baseDirA, "cwd should differ from baseDirA after chdir");

    // Load snapshot using the explicit baseDirA — must see the persisted state.
    const snapshot = loadWriteGateSnapshot(baseDirA);
    assert.ok(
      snapshot.verifiedDepthMilestones.includes("M001"),
      "loadWriteGateSnapshot(baseDirA) must return the persisted milestone despite cwd being baseDirB",
    );

    // Loading with baseDirB must NOT see the state from baseDirA.
    const snapshotB = loadWriteGateSnapshot(baseDirB);
    assert.ok(
      !snapshotB.verifiedDepthMilestones.includes("M001"),
      "loadWriteGateSnapshot(baseDirB) must not bleed state from baseDirA",
    );
  });
});
