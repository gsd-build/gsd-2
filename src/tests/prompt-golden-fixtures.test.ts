// Project/App: GSD-2
// File Purpose: Characterization tests for representative GSD prompt fixture metrics.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { promptGoldenUnits, type PromptGoldenUnitType } from "./fixtures/prompt-golden-fixtures.ts";

test("prompt golden fixtures render required markers and measurable sizes", async (t) => {
  const base = makePromptFixtureRoot();
  t.after(() => cleanup(base));
  const { buildCompleteSlicePrompt, buildExecuteTaskPrompt, buildPlanSlicePrompt, invalidateAllCaches } = await loadPromptBuilders(base);
  invalidateAllCaches();

  const prompts: Record<PromptGoldenUnitType, string> = {
    "plan-slice": await buildPlanSlicePrompt("M001", "Baseline Milestone", "S01", "Baseline Slice", base, "minimal"),
    "execute-task": await buildExecuteTaskPrompt("M001", "S01", "Baseline Slice", "T01", "Implement baseline harness", base, "minimal"),
    "complete-slice": await buildCompleteSlicePrompt("M001", "Baseline Milestone", "S01", "Baseline Slice", base, "minimal"),
  };

  for (const fixture of promptGoldenUnits) {
    const prompt = prompts[fixture.unitType];
    const metrics = promptMetric(prompt);

    assert.ok(metrics.chars > 1000, `${fixture.unitType} should be a real prompt, not an empty fixture`);
    assert.match(metrics.sha256, /^[a-f0-9]{64}$/);
    for (const marker of fixture.requiredMarkers) {
      assert.ok(prompt.includes(marker), `${fixture.unitType} prompt should include marker: ${marker}`);
    }
  }
});

test("prompt golden fixtures meet Phase 2 reduction gate", async (t) => {
  const base = makePromptFixtureRoot();
  t.after(() => cleanup(base));
  const { buildCompleteSlicePrompt, buildExecuteTaskPrompt, buildPlanSlicePrompt, invalidateAllCaches } = await loadPromptBuilders(base);
  invalidateAllCaches();

  const prompts: Record<PromptGoldenUnitType, string> = {
    "plan-slice": await buildPlanSlicePrompt("M001", "Baseline Milestone", "S01", "Baseline Slice", base, "minimal"),
    "execute-task": await buildExecuteTaskPrompt("M001", "S01", "Baseline Slice", "T01", "Implement baseline harness", base, "minimal"),
    "complete-slice": await buildCompleteSlicePrompt("M001", "Baseline Milestone", "S01", "Baseline Slice", base, "minimal"),
  };

  let baselineChars = 0;
  let currentChars = 0;
  for (const fixture of promptGoldenUnits) {
    const chars = prompts[fixture.unitType].length;
    baselineChars += fixture.phase2StartChars;
    currentChars += chars;
    assert.ok(
      chars <= Math.floor(fixture.phase2StartChars * 0.6),
      `${fixture.unitType} should be at least 40% smaller than Phase 2 start baseline (${chars}/${fixture.phase2StartChars})`,
    );
  }
  assert.ok(
    currentChars <= Math.floor(baselineChars * 0.6),
    `representative fixtures should be at least 40% smaller in aggregate (${currentChars}/${baselineChars})`,
  );
});

test("prompt golden fixtures expose stable unit coverage for future reductions", () => {
  assert.deepEqual(
    promptGoldenUnits.map(unit => unit.unitType),
    ["plan-slice", "execute-task", "complete-slice"],
  );
  for (const unit of promptGoldenUnits) {
    assert.ok(unit.requiredMarkers.length >= 4, `${unit.unitType} should pin meaningful prompt markers`);
  }
});

function promptMetric(prompt: string): { chars: number; bytes: number; lines: number; sha256: string } {
  return {
    chars: prompt.length,
    bytes: Buffer.byteLength(prompt, "utf8"),
    lines: prompt.length === 0 ? 0 : prompt.split(/\r\n|\r|\n/).length,
    sha256: createHash("sha256").update(prompt).digest("hex"),
  };
}

async function loadPromptBuilders(base: string): Promise<{
  buildCompleteSlicePrompt: typeof import("../resources/extensions/gsd/auto-prompts.ts").buildCompleteSlicePrompt;
  buildExecuteTaskPrompt: typeof import("../resources/extensions/gsd/auto-prompts.ts").buildExecuteTaskPrompt;
  buildPlanSlicePrompt: typeof import("../resources/extensions/gsd/auto-prompts.ts").buildPlanSlicePrompt;
  invalidateAllCaches: typeof import("../resources/extensions/gsd/cache.ts").invalidateAllCaches;
}> {
  process.env.GSD_HOME = join(base, ".test-gsd-home");
  const prompts = await import("../resources/extensions/gsd/auto-prompts.ts");
  const cache = await import("../resources/extensions/gsd/cache.ts");
  return { ...prompts, invalidateAllCaches: cache.invalidateAllCaches };
}

function makePromptFixtureRoot(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-prompt-golden-"));
  const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
  const tasksDir = join(sliceDir, "tasks");
  mkdirSync(tasksDir, { recursive: true });

  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    [
      "# M001 Roadmap",
      "",
      "## Slices",
      "- [ ] **S01: Baseline Slice** `risk:low` `depends:[]`",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    [
      "# S01 Plan",
      "",
      "## Goal",
      "Create a baseline harness for the long-running refactor.",
      "",
      "## Tasks",
      "- T01: Implement baseline harness",
      "",
      "## Verification",
      "- Baseline tests pass.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(tasksDir, "T01-PLAN.md"),
    [
      "# T01 Plan",
      "",
      "## Steps",
      "1. Implement baseline harness.",
      "2. Add tests.",
      "",
      "## Must-haves",
      "- Metrics are emitted as JSON.",
      "",
      "## Verification",
      "- Run focused baseline tests.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(tasksDir, "T01-SUMMARY.md"),
    [
      "---",
      "id: T01",
      "---",
      "# T01 Summary",
      "",
      "Implemented baseline harness and tests.",
      "",
    ].join("\n"),
  );

  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}
