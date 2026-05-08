// GSD-2 write-gate bootstrap — regression tests for basePath threading on
// shouldBlockContextWrite / shouldBlockPendingGate (R1).
//
// The underlying bug: readers defaulted to process.cwd() and so missed the
// per-basePath state Map entry written by markDepthVerified(..., baseDirA)
// when cwd had drifted to baseDirB. With basePath threaded explicitly to
// the readers, the depth-gate sees the verified state regardless of cwd.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  markDepthVerified,
  setPendingGate,
  shouldBlockContextWrite,
  shouldBlockPendingGate,
  clearDiscussionFlowState,
} from "../write-gate.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "wg-shouldblock-basepath-"));
}

let originalCwd: string;
before(() => {
  originalCwd = process.cwd();
});
after(() => {
  if (process.cwd() !== originalCwd) {
    process.chdir(originalCwd);
  }
});

describe("write-gate shouldBlock readers respect explicit basePath", () => {
  let baseDirA: string;
  let baseDirB: string;
  let prevPersist: string | undefined;

  before(() => {
    baseDirA = makeTempDir();
    baseDirB = makeTempDir();
    prevPersist = process.env.GSD_PERSIST_WRITE_GATE_STATE;
    process.env.GSD_PERSIST_WRITE_GATE_STATE = "1";
  });

  after(() => {
    process.chdir(originalCwd);
    if (prevPersist === undefined) {
      delete process.env.GSD_PERSIST_WRITE_GATE_STATE;
    } else {
      process.env.GSD_PERSIST_WRITE_GATE_STATE = prevPersist;
    }
    rmSync(baseDirA, { recursive: true, force: true });
    rmSync(baseDirB, { recursive: true, force: true });
  });

  test("shouldBlockContextWrite with explicit basePath sees verified state after cwd drift", () => {
    clearDiscussionFlowState(baseDirA);
    clearDiscussionFlowState(baseDirB);

    markDepthVerified("M001", baseDirA);
    process.chdir(baseDirB);

    const contextPath = join(baseDirA, ".gsd", "milestones", "M001", "M001-CONTEXT.md");
    const result = shouldBlockContextWrite("write", contextPath, "M001", undefined, baseDirA);

    assert.equal(result.block, false, "explicit basePath should resolve to baseDirA's verified state");
  });

  test("shouldBlockContextWrite without basePath defaults to cwd and misses verified state (bug repro)", () => {
    clearDiscussionFlowState(baseDirA);
    clearDiscussionFlowState(baseDirB);

    markDepthVerified("M001", baseDirA);
    process.chdir(baseDirB);

    const contextPath = join(baseDirA, ".gsd", "milestones", "M001", "M001-CONTEXT.md");
    const result = shouldBlockContextWrite("write", contextPath, "M001");

    assert.equal(result.block, true, "default-to-cwd path resolves to baseDirB and misses baseDirA state");
  });

  test("shouldBlockPendingGate with explicit basePath sees pending gate after cwd drift", () => {
    clearDiscussionFlowState(baseDirA);
    clearDiscussionFlowState(baseDirB);

    setPendingGate("depth_verification_M001_confirm", baseDirA);
    process.chdir(baseDirB);

    const result = shouldBlockPendingGate("write", "M001", false, baseDirA);

    assert.equal(result.block, true, "explicit basePath should resolve to baseDirA's pending gate state");
  });
});
