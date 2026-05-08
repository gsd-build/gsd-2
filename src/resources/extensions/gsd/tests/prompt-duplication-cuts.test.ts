// Project/App: GSD-2
// File Purpose: Verifies low-risk auto-prompt duplication cuts render through prompt builders.

import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { invalidateAllCaches } from "../cache.ts";
import {
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  openDatabase,
  upsertMilestonePlanning,
} from "../gsd-db.ts";

type AutoPromptBuilders = typeof import("../auto-prompts.ts");

function makeBase(prefix: string): string {
  const base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  invalidateAllCaches();
  rmSync(base, { recursive: true, force: true });
}

async function loadAutoPromptBuilders(t: TestContext): Promise<AutoPromptBuilders> {
  const previousGsdHome = process.env.GSD_HOME;
  const isolatedHome = mkdtempSync(join(tmpdir(), "gsd-prompt-loader-home-"));
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    rmSync(isolatedHome, { recursive: true, force: true });
  });
  return import(`../auto-prompts.ts?promptDupCuts=${Date.now()}-${Math.random()}`) as Promise<AutoPromptBuilders>;
}

function seedDb(base: string, taskStatus = "complete"): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Prompt Cuts", status: "active", depends_on: [] });
  upsertMilestonePlanning("M001", {
    title: "Prompt Cuts",
    status: "active",
    vision: "Reduce duplicate prompt reads.",
    successCriteria: ["Prompt builders render compact context."],
    keyRisks: [],
    proofStrategy: [],
    verificationContract: "",
    verificationIntegration: "",
    verificationOperational: "",
    verificationUat: "",
    definitionOfDone: [],
    requirementCoverage: "",
    boundaryMapMarkdown: "",
  });
  insertSlice({
    id: "S01",
    milestoneId: "M001",
    title: "Prompt Slice",
    status: "active",
    risk: "low",
    depends: [],
    demo: "",
    sequence: 1,
  });
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: "M001",
    title: "Task one",
    status: taskStatus,
  });
}

function writeRoadmapAndPlan(base: string): void {
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    [
      "# M001 Roadmap",
      "## Slices",
      "- [ ] **S01: Prompt Slice** `risk:low` `depends:[]`",
    ].join("\n"),
  );
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
    [
      "# S01 Plan",
      "",
      "**Goal:** Reduce duplicate prompt reads.",
      "",
      "## Tasks",
      "- [x] **T01: Task one** `est:15m`",
    ].join("\n"),
  );
}

function writeTaskSummary(base: string, options?: { blocker?: boolean; repeatedNarrative?: string }): void {
  const narrative = options?.repeatedNarrative ?? "This full implementation narrative should stay out of closer prompts.";
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
    [
      "---",
      "id: T01",
      "parent: S01",
      "milestone: M001",
      "provides:",
      "  - prompt context reduction",
      "key_files:",
      "  - src/resources/extensions/gsd/auto-prompts.ts",
      "key_decisions:",
      "  - use compact excerpts before full reads",
      "patterns_established:",
      "  - excerpt-first complete-slice context",
      "observability_surfaces: []",
      "duration: 15m",
      "verification_result: passed",
      "completed_at: 2026-05-06T12:00:00Z",
      `blocker_discovered: ${options?.blocker ? "true" : "false"}`,
      "---",
      "",
      "# T01: Task one",
      "**One-line result.**",
      "",
      "## What Happened",
      narrative,
      "",
      "## Verification",
      "node:test passed.",
      "",
      "## Diagnostics",
      "Prompt size stayed bounded.",
    ].join("\n"),
  );
}

test("execute-task rendering makes memory_query and template disk reads fallback-only", async (t) => {
  const base = makeBase("gsd-execute-dup-cuts-");
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seedDb(base, "pending");
  writeRoadmapAndPlan(base);
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-PLAN.md"),
    "# T01 Plan\n\nDo the prompt edit.\n",
  );

  const { buildExecuteTaskPrompt } = await loadAutoPromptBuilders(t);
  const prompt = await buildExecuteTaskPrompt("M001", "S01", "Prompt Slice", "T01", "Task one", base);

  assert.match(prompt, /Call `memory_query`.*only when no injected memory block exists or the inlined memory\/context is insufficient/s);
  assert.doesNotMatch(prompt, /Call `memory_query` with 2-4 keywords from the task title and touched files unless this is purely mechanical/);
  assert.match(prompt, /Use the inlined Task Summary template below/);
  assert.match(prompt, /Read `.*task-summary\.md` only if the inlined template is absent or visibly truncated/);
  assert.doesNotMatch(prompt, /Read the template at `.*task-summary\.md`/);
  assert.match(prompt, /### Output Template: Task Summary/);
});

test("complete-slice renders task summary excerpts without full summary bodies", async (t) => {
  const base = makeBase("gsd-complete-slice-excerpts-");
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seedDb(base);
  writeRoadmapAndPlan(base);
  const repeatedNarrative = "FULL_TASK_BODY_SHOULD_NOT_RENDER ".repeat(40);
  writeTaskSummary(base, { repeatedNarrative });

  const { buildCompleteSlicePrompt } = await loadAutoPromptBuilders(t);
  const prompt = await buildCompleteSlicePrompt("M001", "Prompt Cuts", "S01", "Prompt Slice", base);

  assert.match(prompt, /### Task Summary: T01 \(excerpt\)/);
  assert.match(prompt, /On-demand.*read `\.gsd\/milestones\/M001\/slices\/S01\/tasks\/T01-SUMMARY\.md` only when this excerpt is absent\/truncated/s);
  assert.doesNotMatch(prompt, /FULL_TASK_BODY_SHOULD_NOT_RENDER/);
  assert.match(prompt, /Review the inlined task-summary excerpts/);
});

test("complete-slice caps malformed task summaries instead of inlining full bodies", async (t) => {
  const base = makeBase("gsd-complete-slice-malformed-excerpts-");
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seedDb(base);
  writeRoadmapAndPlan(base);
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks", "T01-SUMMARY.md"),
    [
      "# Legacy summary without frontmatter id",
      "LEGACY_FULL_BODY_SHOULD_BE_CAPPED ".repeat(200),
    ].join("\n"),
  );

  const { buildCompleteSlicePrompt } = await loadAutoPromptBuilders(t);
  const prompt = await buildCompleteSlicePrompt("M001", "Prompt Cuts", "S01", "Prompt Slice", base);

  assert.match(prompt, /Truncated malformed summary/);
  assert.ok(prompt.length < 20_000);
  assert.ok((prompt.match(/LEGACY_FULL_BODY_SHOULD_BE_CAPPED/g) ?? []).length < 60);
});

test("replan-slice renders blocker summary excerpt and tells the agent to read full only on demand", async (t) => {
  const base = makeBase("gsd-replan-excerpts-");
  t.after(() => cleanup(base));
  invalidateAllCaches();

  seedDb(base);
  writeRoadmapAndPlan(base);
  writeTaskSummary(base, {
    blocker: true,
    repeatedNarrative: "FULL_BLOCKER_BODY_SHOULD_NOT_RENDER ".repeat(40),
  });

  const { buildReplanSlicePrompt } = await loadAutoPromptBuilders(t);
  const prompt = await buildReplanSlicePrompt("M001", "Prompt Cuts", "S01", "Prompt Slice", base);

  assert.match(prompt, /### Blocker Task Summary: T01 \(excerpt\)/);
  assert.match(prompt, /Use the inlined blocker summary excerpt first/);
  assert.match(prompt, /Read the full blocker task summary only if the excerpt is absent, marked truncated, or lacks the specific blocker evidence needed to replan/);
  assert.doesNotMatch(prompt, /FULL_BLOCKER_BODY_SHOULD_NOT_RENDER/);
  assert.doesNotMatch(prompt, /Read the blocker task summary carefully/);
});
