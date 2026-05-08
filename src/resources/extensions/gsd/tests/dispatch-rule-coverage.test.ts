// gsd-2 / dispatch rule coverage canary test
//
// Iterates DISPATCH_RULES in order against representative GSDState stubs and
// asserts that the first matching rule has the expected name and unitType
// (mirroring auto-dispatch's first-match-wins semantics). The goal is a
// canary: if a future PR adds a new rule in the wrong position and steals
// a match from an existing one, this test fails.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DISPATCH_RULES } from "../auto-dispatch.ts";
import type { DispatchContext, DispatchAction } from "../auto-dispatch.ts";
import type { GSDState } from "../types.ts";

// ─── State helpers ────────────────────────────────────────────────────────

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Test Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "pre-planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "",
    registry: [],
    ...overrides,
  };
}

function makeCtx(basePath: string, state: GSDState, mid = "M001"): DispatchContext {
  return {
    basePath,
    mid,
    midTitle: "Test Milestone",
    state,
    prefs: undefined,
  };
}

// ─── Disk scaffold helpers ────────────────────────────────────────────────

function writeMilestoneFile(basePath: string, mid: string, suffix: string, content = "stub\n"): void {
  const dir = join(basePath, ".gsd", "milestones", mid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${mid}-${suffix}.md`), content);
}

function writeSliceFile(
  basePath: string,
  mid: string,
  sid: string,
  suffix: string,
  content = "stub\n",
): void {
  const dir = join(basePath, ".gsd", "milestones", mid, "slices", sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sid}-${suffix}.md`), content);
}

function writeTaskPlan(basePath: string, mid: string, sid: string, tid: string): void {
  const dir = join(basePath, ".gsd", "milestones", mid, "slices", sid, "tasks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${tid}-PLAN.md`), `# ${tid}\n\n## Steps\n- [ ] Step\n`);
}

// ─── Rule evaluation ──────────────────────────────────────────────────────

interface MatchEntry {
  ruleName: string;
  result: DispatchAction;
}

// First-match-wins semantics: walks DISPATCH_RULES in order and stops at the
// first non-null result. This mirrors the production resolver and is the
// canary against rule reordering or shadowing.
async function findFirstMatch(ctx: DispatchContext): Promise<MatchEntry | null> {
  for (const rule of DISPATCH_RULES) {
    const result = await rule.match(ctx);
    if (result) return { ruleName: rule.name, result };
  }
  return null;
}

function assertMatch(
  match: MatchEntry | null,
  expected: { ruleName: string; action: DispatchAction["action"]; unitType?: string },
  scenario: string,
): void {
  assert.ok(match, `${scenario}: no rule matched`);
  assert.equal(match.ruleName, expected.ruleName, `${scenario}: matched rule mismatch`);
  assert.equal(match.result.action, expected.action, `${scenario}: action mismatch`);
  if (expected.action === "dispatch" && expected.unitType) {
    assert.ok(
      match.result.action === "dispatch" && match.result.unitType === expected.unitType,
      `${scenario}: unitType mismatch (got ${
        match.result.action === "dispatch" ? match.result.unitType : match.result.action
      })`,
    );
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

test("dispatch-rule-coverage: escalating-task → stop (info)", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-esc-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const ctx = makeCtx(
    tmp,
    makeState({
      phase: "escalating-task",
      activeSlice: { id: "S01", title: "Slice" },
      nextAction: "Resolve escalation X",
    }),
  );
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    { ruleName: "escalating-task → pause-for-escalation", action: "stop" },
    "escalating-task",
  );
});

test("dispatch-rule-coverage: pre-planning, no CONTEXT → discuss-milestone", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-disc-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  // Bare milestone dir, no CONTEXT/RESEARCH/ROADMAP files.
  mkdirSync(join(tmp, ".gsd", "milestones", "M001"), { recursive: true });

  const ctx = makeCtx(tmp, makeState({ phase: "pre-planning" }));
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    {
      ruleName: "pre-planning (no context) → discuss-milestone",
      action: "dispatch",
      unitType: "discuss-milestone",
    },
    "pre-planning no context",
  );
});

test("dispatch-rule-coverage: pre-planning, has CONTEXT, no RESEARCH → research-milestone", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-res-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  writeMilestoneFile(tmp, "M001", "CONTEXT", "# Context\n");

  const ctx = makeCtx(tmp, makeState({ phase: "pre-planning" }));
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    {
      ruleName: "pre-planning (no research) → research-milestone",
      action: "dispatch",
      unitType: "research-milestone",
    },
    "pre-planning no research",
  );
});

test("dispatch-rule-coverage: pre-planning, has CONTEXT + RESEARCH → plan-milestone", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-plan-m-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  writeMilestoneFile(tmp, "M001", "CONTEXT", "# Context\n");
  writeMilestoneFile(tmp, "M001", "RESEARCH", "# Research\n");

  const ctx = makeCtx(tmp, makeState({ phase: "pre-planning" }));
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    {
      ruleName: "pre-planning (has research) → plan-milestone",
      action: "dispatch",
      unitType: "plan-milestone",
    },
    "pre-planning has research",
  );
});

test("dispatch-rule-coverage: planning with active slice and skip_research → plan-slice", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-plan-s-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  writeMilestoneFile(tmp, "M001", "CONTEXT", "# Context\n");
  writeMilestoneFile(tmp, "M001", "ROADMAP", "# Roadmap\n");

  const state = makeState({
    phase: "planning",
    activeSlice: { id: "S01", title: "First Slice" },
  });
  const ctx: DispatchContext = {
    basePath: tmp,
    mid: "M001",
    midTitle: "Test Milestone",
    state,
    // Skip slice research so the parallel/single research rules fall through.
    prefs: { phases: { skip_slice_research: true } } as DispatchContext["prefs"],
  };
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    {
      ruleName: "planning → plan-slice",
      action: "dispatch",
      unitType: "plan-slice",
    },
    "planning → plan-slice",
  );
});

test("dispatch-rule-coverage: executing with task plan present → execute-task", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-exec-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  writeMilestoneFile(tmp, "M001", "CONTEXT", "# Context\n");
  writeSliceFile(tmp, "M001", "S01", "PLAN", "# Plan\n");
  writeTaskPlan(tmp, "M001", "S01", "T01");

  const state = makeState({
    phase: "executing",
    activeSlice: { id: "S01", title: "First Slice" },
    activeTask: { id: "T01", title: "First Task" },
  });
  // Disable reactive dispatch so the parallel batching rule falls through.
  const ctx: DispatchContext = {
    basePath: tmp,
    mid: "M001",
    midTitle: "Test Milestone",
    state,
    prefs: { reactive_execution: { enabled: false } } as DispatchContext["prefs"],
  };
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    {
      ruleName: "executing → execute-task",
      action: "dispatch",
      unitType: "execute-task",
    },
    "executing → execute-task",
  );
});

test("dispatch-rule-coverage: summarizing → complete-slice", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-sum-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  // Rule "execution-entry phase (no context)" fires for summarizing if CONTEXT
  // is missing — write it so the summarizing rule wins.
  writeMilestoneFile(tmp, "M001", "CONTEXT", "# Context\n");

  const ctx = makeCtx(
    tmp,
    makeState({
      phase: "summarizing",
      activeSlice: { id: "S01", title: "First Slice" },
    }),
  );
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    {
      ruleName: "summarizing → complete-slice",
      action: "dispatch",
      unitType: "complete-slice",
    },
    "summarizing → complete-slice",
  );
});

test("dispatch-rule-coverage: complete phase → stop", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-disp-cov-done-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const ctx = makeCtx(
    tmp,
    makeState({
      phase: "complete",
      activeMilestone: null,
      lastCompletedMilestone: { id: "M001", title: "Test Milestone" },
    }),
  );
  const match = await findFirstMatch(ctx);
  assertMatch(
    match,
    { ruleName: "complete → stop", action: "stop" },
    "complete → stop",
  );
});

// ─── Ordering canary: every scenario above resolves to exactly one rule ────

test("dispatch-rule-coverage: rule registry has the expected size", () => {
  // Sanity check that complements the per-state assertions: if someone adds a
  // new rule, this number changes — prompting them to add a state stub above.
  // Exact count is a brittle but useful canary; update when adding rules
  // intentionally.
  assert.equal(
    DISPATCH_RULES.length,
    29,
    `DISPATCH_RULES length changed (got ${DISPATCH_RULES.length}). ` +
      "If you added a rule, add a state stub to dispatch-rule-coverage.test.ts " +
      "and update this expected count.",
  );
});
