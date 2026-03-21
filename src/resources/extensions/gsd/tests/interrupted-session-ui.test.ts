import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { assessInterruptedSession } from "../interrupted-session.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-smart-entry-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* */ }
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
  mkdirSync(sliceDir, { recursive: true });
  writeFileSync(join(sliceDir, "S01-SUMMARY.md"), "# Summary\nDone.\n", "utf-8");
  writeFileSync(join(sliceDir, "S01-UAT.md"), "# UAT\nPassed.\n", "utf-8");
  writeFileSync(join(milestoneDir, "M001-SUMMARY.md"), "# Milestone Summary\nDone.\n", "utf-8");
}

function writePausedSession(base: string): void {
  const runtimeDir = join(base, ".gsd", "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    join(runtimeDir, "paused-session.json"),
    JSON.stringify({ milestoneId: "M001", originalBasePath: base, stepMode: false }, null, 2),
    "utf-8",
  );
}

function writeLock(base: string, unitType: string, unitId: string, completedUnits = 1): void {
  writeFileSync(
    join(base, ".gsd", "auto.lock"),
    JSON.stringify({
      pid: 999999999,
      startedAt: new Date().toISOString(),
      unitType,
      unitId,
      unitStartedAt: new Date().toISOString(),
      completedUnits,
    }, null, 2),
    "utf-8",
  );
}

test("guided-flow stale complete scenario classifies as stale so the resume prompt can be suppressed", async () => {
  const base = makeTmpBase();
  try {
    writeRoadmap(base, true);
    writeCompleteArtifacts(base);
    writeLock(base, "execute-task", "M001/S01/T01", 1);

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
    writeLock(base, "execute-task", "M001/S01/T01", 1);

    const assessment = await assessInterruptedSession(base);
    assert.equal(assessment.classification, "recoverable");
    assert.equal(assessment.pausedSession?.milestoneId, "M001");
  } finally {
    cleanup(base);
  }
});

test("guided-flow source gates interrupted-session UI on assessment classification", () => {
  const source = readFileSync(join(import.meta.dirname, "..", "guided-flow.ts"), "utf-8");
  assert.ok(source.includes('const interrupted = await assessInterruptedSession(basePath);'));
  assert.ok(source.includes('if (interrupted.classification === "running")'));
  assert.ok(source.includes('if (interrupted.classification === "stale")'));
  assert.ok(source.includes('} else if (interrupted.classification === "recoverable")'));
  assert.ok(source.includes('await startAuto(ctx, pi, basePath, false, { interrupted });'));
});
