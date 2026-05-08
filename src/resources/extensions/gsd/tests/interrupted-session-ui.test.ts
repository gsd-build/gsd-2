import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { assessInterruptedSession } from "../interrupted-session.ts";
import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  _getAdapter,
} from "../gsd-db.ts";
import { registerAutoWorker } from "../db/auto-workers.ts";
import { claimMilestoneLease } from "../db/milestone-leases.ts";
import { recordDispatchClaim } from "../db/unit-dispatches.ts";
import { setRuntimeKv } from "../db/runtime-kv.ts";
import {
  PAUSED_SESSION_KV_KEY,
  type PausedSessionMetadata,
} from "../interrupted-session.ts";
import { normalizeRealPath } from "../paths.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-smart-entry-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
}

function openFixtureDb(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
}

function expireWorker(workerId: string): void {
  const db = _getAdapter()!;
  db.prepare(
    `UPDATE workers SET last_heartbeat_at = '1970-01-01T00:00:00.000Z' WHERE worker_id = :worker_id`,
  ).run({ ":worker_id": workerId });
}

function writePausedSession(base: string, milestoneId = "M001", stepMode = false): void {
  openFixtureDb(base);
  const meta: PausedSessionMetadata = {
    milestoneId,
    originalBasePath: base,
    stepMode,
  };
  setRuntimeKv("global", "", PAUSED_SESSION_KV_KEY, meta);
}

function writeLock(base: string, unitType: string, unitId: string): void {
  openFixtureDb(base);
  insertMilestone({
    id: "M001",
    title: "Test Milestone",
    status: unitType === "complete-slice" ? "complete" : "active",
  });
  const workerId = registerAutoWorker({ projectRootRealpath: normalizeRealPath(base) });
  const lease = claimMilestoneLease(workerId, "M001");
  assert.equal(lease.ok, true);
  if (lease.ok) {
    const [, sliceId = null, taskId = null] = unitId.split("/");
    const claimed = recordDispatchClaim({
      traceId: `trace-${randomUUID().slice(0, 8)}`,
      workerId,
      milestoneLeaseToken: lease.token,
      milestoneId: "M001",
      sliceId,
      taskId,
      unitType,
      unitId,
    });
    assert.equal(claimed.ok, true);
  }
  _getAdapter()!
    .prepare(`UPDATE workers SET pid = 99999 WHERE worker_id = :worker_id`)
    .run({ ":worker_id": workerId });
  expireWorker(workerId);
}

function writeRoadmap(base: string, checked = false): void {
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(join(milestoneDir, "slices", "S01", "tasks"), { recursive: true });
  writeFileSync(
    join(milestoneDir, "M001-ROADMAP.md"),
    [
      "# M001: Test Milestone",
      "",
      "## Vision",
      "",
      "Test milestone.",
      "",
      "## Success Criteria",
      "",
      "- It works.",
      "",
      "## Slices",
      "",
      `- [${checked ? "x" : " "}] **S01: Test slice** \`risk:low\``,
      "  After this: Demo",
      "",
      "## Boundary Map",
      "",
      "- S01 → terminal",
      "  - Produces: done",
      "  - Consumes: nothing",
    ].join("\n"),
    "utf-8",
  );
}

function writeCompleteArtifacts(base: string): void {
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  const sliceDir = join(milestoneDir, "slices", "S01");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(sliceDir, { recursive: true });
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(sliceDir, "S01-PLAN.md"), "# S01: Test Slice\n\n## Tasks\n- [x] **T01: Do thing** `est:10m`\n", "utf-8");
  writeFileSync(join(tasksDir, "T01-SUMMARY.md"), "# Task Summary\nDone.\n", "utf-8");
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# Summary\nDone.\n", "utf-8");
  writeFileSync(join(sliceDir, "S01-UAT.md"), "# UAT\nPassed.\n", "utf-8");
  writeFileSync(join(milestoneDir, "M001-SUMMARY.md"), "# Milestone Summary\nDone.\n", "utf-8");
}

test("guided-flow stale complete scenario classifies as stale so the resume prompt can be suppressed", async () => {
  const base = makeTmpBase();
  try {
    writeRoadmap(base, true);
    writeCompleteArtifacts(base);
    writeLock(base, "complete-slice", "M001/S01");

    const assessment = await assessInterruptedSession(base);
    assert.equal(assessment.classification, "stale");
    assert.equal(assessment.recoveryPrompt, null);
  } finally {
    cleanup(base);
  }
});

test("guided-flow paused-session scenario classifies as recoverable so resume remains available", async () => {
  const base = makeTmpBase();
  try {
    writeRoadmap(base, false);
    writePausedSession(base);
    writeLock(base, "execute-task", "M001/S01/T01");

    const assessment = await assessInterruptedSession(base);
    assert.equal(assessment.classification, "recoverable");
    assert.equal(assessment.pausedSession?.milestoneId, "M001");
  } finally {
    cleanup(base);
  }
});

test("guided-flow stale paused-session scenario is suppressed when no resumable work remains", async () => {
  const base = makeTmpBase();
  try {
    writeRoadmap(base, true);
    writeCompleteArtifacts(base);
    writePausedSession(base, "M999", true);

    const assessment = await assessInterruptedSession(base);
    assert.equal(assessment.classification, "stale");
    assert.equal(assessment.hasResumableDiskState, false);
  } finally {
    cleanup(base);
  }
});

// Note: the prior source-grep test that scanned guided-flow.ts for five
// string literals was removed under #4827. The invariants it encoded
// (step-aware resume + stale paused-session cleanup + pendingAutoStartMap
// side effect) should be covered by a runtime drive of guided-flow —
// tracked as a follow-up.
