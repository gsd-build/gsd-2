// GSD-2 — Subagent model dispatch behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validatePreferences } from "../preferences-validation.ts";
import {
  buildGateEvaluatePrompt,
  buildParallelResearchSlicesPrompt,
  buildReactiveExecutePrompt,
} from "../auto-prompts.ts";

function writeReactiveFixture(repo: string): void {
  const gsd = join(repo, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(join(gsd, "tasks"), { recursive: true });
  writeFileSync(
    join(gsd, "S01-PLAN.md"),
    [
      "# S01: Test Slice",
      "",
      "**Goal:** Verify model injection",
      "**Demo:** Model appears in subagent prompt",
      "",
      "## Tasks",
      "",
      "- [ ] **T01: Task One** `est:15m`",
      "  Do something.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(gsd, "tasks", "T01-PLAN.md"),
    [
      "# T01: Task One",
      "",
      "## Description",
      "Do something.",
      "",
      "## Inputs",
      "",
      "- `src/config.json` — Config",
      "",
      "## Expected Output",
      "",
      "- `src/out.ts` — Result",
    ].join("\n"),
  );
}

test("reactive_execution subagent_model is preserved in validated preferences", () => {
  const result = validatePreferences({
    reactive_execution: {
      enabled: true,
      max_parallel: 2,
      isolation_mode: "same-tree",
      subagent_model: "claude-opus-4-6",
    },
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.preferences.reactive_execution?.subagent_model, "claude-opus-4-6");
});

test("reactive_execution subagent_model rejects empty string", () => {
  const result = validatePreferences({
    reactive_execution: {
      enabled: true,
      max_parallel: 2,
      isolation_mode: "same-tree",
      subagent_model: "",
    } as any,
  });
  assert.ok(result.errors.some((e) => e.includes("subagent_model")));
});

test("buildReactiveExecutePrompt injects subagent model when provided", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-subagent-model-reactive-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  writeReactiveFixture(repo);

  const prompt = await buildReactiveExecutePrompt(
    "M001",
    "Test Milestone",
    "S01",
    "Test Slice",
    ["T01"],
    repo,
    "claude-opus-4-6",
  );

  assert.match(prompt, /model: "claude-opus-4-6"/);
  assert.match(prompt, /Lane: \*\*execution lane\*\*\./);
  assert.match(prompt, /## Context Mode/);
  assert.doesNotMatch(prompt, /You are executing GSD auto-mode\./);
});

test("buildReactiveExecutePrompt omits model instruction when subagentModel is omitted", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-subagent-model-none-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  writeReactiveFixture(repo);

  const prompt = await buildReactiveExecutePrompt(
    "M001",
    "Test Milestone",
    "S01",
    "Test Slice",
    ["T01"],
    repo,
  );

  assert.doesNotMatch(prompt, /with model:/);
});

test("buildParallelResearchSlicesPrompt injects subagent model for each slice", async (t) => {
  const repo = mkdtempSync(join(tmpdir(), "gsd-subagent-model-parallel-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  mkdirSync(join(repo, ".gsd", "milestones", "M001", "slices", "S01"), { recursive: true });

  const prompt = await buildParallelResearchSlicesPrompt(
    "M001",
    "Test Milestone",
    [{ id: "S01", title: "Research Slice" }],
    repo,
    "claude-opus-4-6",
  );

  assert.match(prompt, /model: "claude-opus-4-6"/);
});

test("buildGateEvaluatePrompt uses nested context guidance and model instruction", async (t) => {
  const { closeDatabase, insertGateRow, insertMilestone, insertSlice, openDatabase } = await import("../gsd-db.ts");
  const repo = mkdtempSync(join(tmpdir(), "gsd-subagent-model-gate-"));
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmSync(repo, { recursive: true, force: true });
  });

  const sliceDir = join(repo, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(sliceDir, { recursive: true });
  writeFileSync(join(sliceDir, "S01-PLAN.md"), "# S01 Plan\n\n## Verification\n- Run checks.\n");
  openDatabase(join(repo, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test Milestone", status: "active", depends_on: [] });
  insertSlice({
    id: "S01",
    milestoneId: "M001",
    title: "Test Slice",
    status: "planned",
    risk: "low",
    depends: [],
    demo: "",
    sequence: 1,
  });
  insertGateRow({
    milestoneId: "M001",
    sliceId: "S01",
    gateId: "Q3",
    scope: "slice",
  });

  const prompt = await buildGateEvaluatePrompt(
    "M001",
    "Test Milestone",
    "S01",
    "Test Slice",
    repo,
    "claude-opus-4-6",
  );

  assert.match(prompt, /Context Mode \(verification lane\):/);
  assert.match(prompt, /## Context Mode/);
  assert.match(prompt, /model: "claude-opus-4-6"/);
});
