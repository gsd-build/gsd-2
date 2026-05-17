// Project/App: GSD-2
// File Purpose: Regression tests for complete-milestone dispatch guards.

/**
 * dispatch-complete-milestone-guard.test.ts — #4324
 */

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { DISPATCH_RULES, type DispatchContext } from "../auto-dispatch.ts";
import { closeDatabase, insertMilestone, insertSlice, openDatabase } from "../gsd-db.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-complete-dispatch-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01"), { recursive: true });
  writeFileSync(join(base, ".gsd", "milestones", "M001", "ROADMAP.md"), "# M001\n\n## Slices\n\n- [x] **S01**: Done\n");
  writeFileSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "SUMMARY.md"), "# Summary\n");
  writeFileSync(join(base, "implementation.txt"), "done\n");
  return base;
}

function initGitRepo(base: string): void {
  execFileSync("git", ["init"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: base, stdio: "ignore" });
}

function buildDispatchCtx(basePath: string): DispatchContext {
  return {
    basePath,
    mid: "M001",
    midTitle: "Milestone One",
    state: {
      activeMilestone: { id: "M001", title: "Milestone One" },
      activeSlice: null,
      activeTask: null,
      phase: "completing-milestone",
      recentDecisions: [],
      blockers: [],
      nextAction: "",
      registry: [{ id: "M001", title: "Milestone One", status: "active" }],
      requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
      progress: { milestones: { done: 0, total: 1 } },
    },
    prefs: undefined,
  };
}

describe("completing-milestone dispatch guard (#4324)", () => {
  let base = "";
  const rule = DISPATCH_RULES.find((candidate) => candidate.name === "completing-milestone → complete-milestone");
  assert.ok(rule, "complete-milestone dispatch rule should exist");

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    if (base) rmSync(base, { recursive: true, force: true });
    base = "";
  });

  test("skips complete-milestone dispatch when the DB milestone is already closed", async () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone One", status: "complete" });

    const result = await rule.match(buildDispatchCtx(base));

    assert.equal(result?.action, "skip");
  });

  test("dispatches complete-milestone when the DB milestone is still active", async () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone One", status: "active" });

    const result = await rule.match(buildDispatchCtx(base));

    assert.equal(result?.action, "dispatch");
    assert.equal(result?.unitType, "complete-milestone");
    assert.equal(result?.unitId, "M001");
  });

  test("dispatches complete-milestone when only .gsd/ files exist in git history (#5097)", async () => {
    base = makeBase();
    rmSync(join(base, "implementation.txt"), { force: true });
    initGitRepo(base);
    writeFileSync(join(base, ".gsd", "milestones", "M001", "M001-SUMMARY.md"), "# Milestone Summary\n");
    execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "chore: planning artifacts only"], { cwd: base, stdio: "ignore" });

    const result = await rule.match(buildDispatchCtx(base));

    assert.equal(result?.action, "dispatch");
    assert.equal(result?.unitType, "complete-milestone");
    assert.equal(result?.unitId, "M001");
  });

  test("blocks complete-milestone dispatch when the working tree is dirty (#6132)", async () => {
    base = makeBase();
    initGitRepo(base);
    writeFileSync(join(base, "implementation.txt"), "dirty\n");

    const result = await rule.match(buildDispatchCtx(base));

    assert.equal(result?.action, "stop");
    assert.match(result?.reason ?? "", /uncommitted changes detected/i);
  });

  test("blocks complete-milestone dispatch when UAT verdict is non-PASS and uat_dispatch is enabled (#6132)", async () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone One", status: "active" });
    insertSlice({ milestoneId: "M001", id: "S01", title: "Done", status: "complete" });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-ASSESSMENT.md"),
      "---\nverdict: fail\n---\n\nUAT failed.\n",
    );

    const ctx = buildDispatchCtx(base);
    ctx.prefs = { uat_dispatch: true } as DispatchContext["prefs"];
    const result = await rule.match(ctx);

    assert.equal(result?.action, "stop");
    assert.match(result?.reason ?? "", /manual UAT sign-off \(PASS\) is required/i);
  });

  test("blocks complete-milestone dispatch when UAT verdict is missing and uat_dispatch is enabled (#6132)", async () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone One", status: "active" });
    insertSlice({ milestoneId: "M001", id: "S01", title: "Done", status: "complete" });
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-ASSESSMENT.md"),
      "# UAT\n\nNo verdict yet.\n",
    );

    const ctx = buildDispatchCtx(base);
    ctx.prefs = { uat_dispatch: true } as DispatchContext["prefs"];
    const result = await rule.match(ctx);

    assert.equal(result?.action, "stop");
    assert.match(result?.reason ?? "", /manual UAT sign-off \(PASS\) is required/i);
  });
});

describe("complete phase dispatch guard (#5683)", () => {
  let base = "";
  const rule = DISPATCH_RULES.find((candidate) => candidate.name === "complete → stop");
  assert.ok(rule, "complete phase terminal rule should exist");

  afterEach(() => {
    try { closeDatabase(); } catch { /* ignore */ }
    if (base) rmSync(base, { recursive: true, force: true });
    base = "";
  });

  test("dispatches complete-milestone when derived state is complete but DB milestone is still open", async () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone One", status: "in_progress" });

    const ctx = buildDispatchCtx(base);
    ctx.state.phase = "complete";

    const result = await rule.match(ctx);

    assert.equal(result?.action, "dispatch");
    assert.equal(result?.unitType, "complete-milestone");
    assert.equal(result?.unitId, "M001");
  });

  test("stops when derived state is complete and DB milestone is closed", async () => {
    base = makeBase();
    openDatabase(join(base, ".gsd", "gsd.db"));
    insertMilestone({ id: "M001", title: "Milestone One", status: "complete" });

    const ctx = buildDispatchCtx(base);
    ctx.state.phase = "complete";

    const result = await rule.match(ctx);

    assert.equal(result?.action, "stop");
    assert.equal(result?.reason, "All milestones complete.");
  });
});

describe("complete milestone context recovery guard (#5831)", () => {
  let base = "";
  const executionEntryRule = DISPATCH_RULES.find(
    (candidate) => candidate.name === "execution-entry phase (no context) → discuss-milestone",
  );
  const prePlanningRule = DISPATCH_RULES.find(
    (candidate) => candidate.name === "pre-planning (no context) → discuss-milestone",
  );
  assert.ok(executionEntryRule, "execution-entry missing-context rule should exist");
  assert.ok(prePlanningRule, "pre-planning missing-context rule should exist");

  afterEach(() => {
    if (base) rmSync(base, { recursive: true, force: true });
    base = "";
  });

  test("does not discuss a complete execution-entry milestone with no CONTEXT file", async () => {
    base = makeBase();
    const ctx = buildDispatchCtx(base);
    ctx.state.registry = [{ id: "M001", title: "Milestone One", status: "complete" }];
    ctx.state.phase = "completing-milestone";

    const result = await executionEntryRule.match(ctx);

    assert.equal(result, null);
  });

  test("does not discuss a complete pre-planning milestone with no CONTEXT file", async () => {
    base = makeBase();
    const ctx = buildDispatchCtx(base);
    ctx.state.registry = [{ id: "M001", title: "Milestone One", status: "complete" }];
    ctx.state.phase = "pre-planning";

    const result = await prePlanningRule.match(ctx);

    assert.equal(result, null);
  });
});
