/**
 * Regression test for issue #909.
 *
 * When S##-PLAN.md exists (causing deriveState → phase:'executing') but the
 * individual task plan files (tasks/T01-PLAN.md, etc.) are absent, the dispatch
 * table must recover by re-running plan-slice — NOT hard-stop.
 *
 * Prior behaviour: action:"stop" → infinite loop on restart.
 * Fixed behaviour: action:"dispatch" unitType:"plan-slice".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveDispatch } from "../auto-dispatch.ts";
import type { DispatchContext } from "../auto-dispatch.ts";
import type { AutoSession } from "../auto/session.ts";
import type { GSDState } from "../types.ts";
import { enableDebug, disableDebug, getDebugLogPath } from "../debug-logger.ts";

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    activeMilestone: { id: "M002", title: "Test Milestone" },
    activeSlice: { id: "S03", title: "Third Slice" },
    activeTask: { id: "T01", title: "First Task" },
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
    ...overrides,
  };
}

function makeContext(basePath: string, stateOverrides?: Partial<GSDState>): DispatchContext {
  return {
    basePath,
    mid: "M002",
    midTitle: "Test Milestone",
    state: makeState(stateOverrides),
    prefs: undefined,
  };
}

function makeContextFor(
  basePath: string,
  mid: string,
  sid: string,
  tid: string,
  session?: Partial<AutoSession>,
): DispatchContext {
  return {
    basePath,
    mid,
    midTitle: "Test Milestone",
    state: makeState({
      activeMilestone: { id: mid, title: "Test Milestone" },
      activeSlice: { id: sid, title: "Second Slice" },
      activeTask: { id: tid, title: "First Task" },
    }),
    prefs: undefined,
    session: session as AutoSession | undefined,
  };
}

// ─── Scaffold helpers ──────────────────────────────────────────────────────

function scaffoldSlicePlan(basePath: string, mid: string, sid: string): void {
  const dir = join(basePath, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-PLAN.md`), [
    `# ${sid}: Third Slice`,
    "",
    "## Tasks",
    "- [ ] **T01: Do something** `est:1h`",
    "- [ ] **T02: Do another thing** `est:30m`",
    "",
  ].join("\n"));
}

function scaffoldMilestoneContext(basePath: string, mid: string): void {
  const dir = join(basePath, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-CONTEXT.md`), [
    `# ${mid}: Test Milestone`,
    "",
    "Context for dispatch recovery tests.",
    "",
  ].join("\n"));
}

function scaffoldTaskPlan(basePath: string, mid: string, sid: string, tid: string): void {
  const dir = join(basePath, ".gsd", "milestones", mid, "slices", sid, "tasks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${tid}-PLAN.md`), [
    `# ${tid}: Do something`,
    "",
    "## Steps",
    "- [ ] Step 1",
    "",
  ].join("\n"));
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test("dispatch: missing task plan triggers plan-slice (not stop) — issue #909", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-909-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  // Slice plan exists with tasks, but tasks/ directory is empty
  scaffoldMilestoneContext(tmp, "M002");
  scaffoldSlicePlan(tmp, "M002", "S03");

  const ctx = makeContext(tmp);
  const result = await resolveDispatch(ctx);

  assert.equal(result.action, "dispatch", "should dispatch, not stop");
  assert.ok(result.action === "dispatch" && result.unitType === "plan-slice",
    `unitType should be plan-slice, got: ${result.action === "dispatch" ? result.unitType : "(stop)"}`);
  assert.ok(result.action === "dispatch" && result.unitId === "M002/S03",
    `unitId should be M002/S03, got: ${result.action === "dispatch" ? result.unitId : "(stop)"}`);
});

test("dispatch: present task plan proceeds to execute-task normally", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-909-ok-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldMilestoneContext(tmp, "M002");
  scaffoldSlicePlan(tmp, "M002", "S03");
  scaffoldTaskPlan(tmp, "M002", "S03", "T01");

  const ctx = makeContext(tmp);
  const result = await resolveDispatch(ctx);

  assert.equal(result.action, "dispatch");
  assert.ok(result.action === "dispatch" && result.unitType === "execute-task",
    `unitType should be execute-task, got: ${result.action === "dispatch" ? result.unitType : "(stop)"}`);
  assert.ok(result.action === "dispatch" && result.unitId === "M002/S03/T01",
    `unitId should be M002/S03/T01, got: ${result.action === "dispatch" ? result.unitId : "(stop)"}`);
});

test("dispatch: executing recovery checks active milestone worktree task plans before re-dispatching plan-slice", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-6192-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldMilestoneContext(tmp, "M002");
  scaffoldSlicePlan(tmp, "M002", "S03");

  const worktreeRoot = join(tmp, ".gsd", "worktrees", "M002");
  mkdirSync(worktreeRoot, { recursive: true });
  writeFileSync(join(worktreeRoot, ".git"), "gitdir: /tmp/fake-worktree-gitdir\n");
  scaffoldMilestoneContext(worktreeRoot, "M002");
  scaffoldSlicePlan(worktreeRoot, "M002", "S03");
  scaffoldTaskPlan(worktreeRoot, "M002", "S03", "T01");

  const ctx = makeContext(tmp);
  const result = await resolveDispatch(ctx);

  assert.equal(result.action, "dispatch");
  assert.ok(result.action === "dispatch" && result.unitType === "execute-task",
    `unitType should be execute-task, got: ${result.action === "dispatch" ? result.unitType : "(stop)"}`);
  assert.ok(result.action === "dispatch" && result.unitId === "M002/S03/T01",
    `unitId should be M002/S03/T01, got: ${result.action === "dispatch" ? result.unitId : "(stop)"}`);
});

test("dispatch: active session worktree task plan wins over missing original-root task plan", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-worktree-artifact-root-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldMilestoneContext(tmp, "M004");
  scaffoldSlicePlan(tmp, "M004", "S02");

  const worktreeRoot = join(tmp, ".gsd", "worktrees", "M004");
  mkdirSync(worktreeRoot, { recursive: true });
  scaffoldMilestoneContext(worktreeRoot, "M004");
  scaffoldSlicePlan(worktreeRoot, "M004", "S02");
  scaffoldTaskPlan(worktreeRoot, "M004", "S02", "T01");

  const ctx = makeContextFor(tmp, "M004", "S02", "T01", {
    basePath: worktreeRoot,
    originalBasePath: tmp,
    currentMilestoneId: "M004",
  });
  const result = await resolveDispatch(ctx);

  assert.equal(result.action, "dispatch");
  assert.ok(result.action === "dispatch" && result.unitType === "execute-task",
    `unitType should be execute-task, got: ${result.action === "dispatch" ? result.unitType : "(stop)"}`);
  assert.ok(result.action === "dispatch" && result.unitId === "M004/S02/T01",
    `unitId should be M004/S02/T01, got: ${result.action === "dispatch" ? result.unitId : "(stop)"}`);
});

test("dispatch: artifact checks trust active session basePath even when originalBasePath matches", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-worktree-session-basepath-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldMilestoneContext(tmp, "M004");
  scaffoldSlicePlan(tmp, "M004", "S02");

  const activeMilestoneRoot = join(tmp, ".gsd", "runtime-active", "M004");
  mkdirSync(activeMilestoneRoot, { recursive: true });
  scaffoldMilestoneContext(activeMilestoneRoot, "M004");
  scaffoldSlicePlan(activeMilestoneRoot, "M004", "S02");
  scaffoldTaskPlan(activeMilestoneRoot, "M004", "S02", "T01");

  const ctx = makeContextFor(tmp, "M004", "S02", "T01", {
    basePath: activeMilestoneRoot,
    originalBasePath: activeMilestoneRoot,
    currentMilestoneId: "M004",
  });
  const result = await resolveDispatch(ctx);

  assert.equal(result.action, "dispatch");
  assert.ok(result.action === "dispatch" && result.unitType === "execute-task",
    `unitType should be execute-task, got: ${result.action === "dispatch" ? result.unitType : "(stop)"}`);
  assert.ok(result.action === "dispatch" && result.unitId === "M004/S02/T01",
    `unitId should be M004/S02/T01, got: ${result.action === "dispatch" ? result.unitId : "(stop)"}`);
});

test("dispatch: plan-slice recovery loop — second call after plan-slice still recovers cleanly", async (t) => {
  // Simulate: plan-slice ran but T01-PLAN.md is still missing (e.g. agent crashed mid-write).
  // Dispatch should still re-dispatch plan-slice, not hard-stop.
  const tmp = mkdtempSync(join(tmpdir(), "gsd-909-loop-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldMilestoneContext(tmp, "M002");
  scaffoldSlicePlan(tmp, "M002", "S03");

  const ctx = makeContext(tmp);
  const r1 = await resolveDispatch(ctx);
  assert.equal(r1.action, "dispatch");
  assert.ok(r1.action === "dispatch" && r1.unitType === "plan-slice");

  // Still no task plan written — dispatch again
  const r2 = await resolveDispatch(ctx);
  assert.equal(r2.action, "dispatch");
  assert.ok(r2.action === "dispatch" && r2.unitType === "plan-slice",
    "should keep dispatching plan-slice until task plans appear");
});

test("dispatch: missing task plan recovery logs root/worktree diagnostic when debug enabled — issue #6194", async (t) => {
  // The diagnostic exists to surface root/worktree artifact-path mismatches
  // when the recovery rule fires. It must report the paths that were checked
  // so a stuck session can be traced — not just that recovery happened.
  const tmp = mkdtempSync(join(tmpdir(), "gsd-6194-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldMilestoneContext(tmp, "M002");
  scaffoldSlicePlan(tmp, "M002", "S03");

  enableDebug(tmp);
  t.after(() => disableDebug());

  const ctx = makeContext(tmp);
  const result = await resolveDispatch(ctx);
  assert.ok(result.action === "dispatch" && result.unitType === "plan-slice",
    "recovery rule must fire for the diagnostic to be exercised");

  const logPath = getDebugLogPath();
  assert.ok(logPath, "debug log path should be set while debug is enabled");

  const entry = readFileSync(logPath!, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((e) => e.event === "dispatch-missing-task-plan-recovery");

  assert.ok(entry, "diagnostic event should be logged when recovery fires in debug mode");
  assert.equal(entry!.basePathUsedForArtifactChecks, tmp);
  assert.equal(entry!.artifactExists, false, "task plan is genuinely absent");
  assert.equal(entry!.expectedTaskPlanExists, false, "expected task plan is genuinely absent");
  assert.equal(entry!.projectionArtifactExists, false, "projection task plan is genuinely absent");
  assert.equal(entry!.hasRootWorktreeMismatch, false, "root/worktree mismatch should be false in single-root scenario");
  assert.equal(typeof entry!.expectedTaskPlanPath, "string");
  assert.equal(typeof entry!.projectionTaskPlanPath, "string");
});
