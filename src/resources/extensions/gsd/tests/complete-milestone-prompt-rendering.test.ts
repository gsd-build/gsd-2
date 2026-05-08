// Project/App: GSD-2
// File Purpose: Verifies the complete milestone prompt renders required completion and verification guardrails.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("complete milestone prompt renders compact verification and completion guidance", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const providedGsdHome = process.env.GSD_TEST_HOME;
  const isolatedHome = providedGsdHome ?? mkdtempSync(join(tmpdir(), "gsd-complete-milestone-render-"));
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    if (!providedGsdHome) rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("complete-milestone", {
    workingDirectory: process.env.GSD_TEST_WORKSPACE_ROOT ?? process.cwd(),
    milestoneId: "M001",
    milestoneTitle: "Baseline And Safety",
    roadmapPath: ".gsd/milestones/M001/M001-ROADMAP.md",
    milestoneSummaryPath: ".gsd/milestones/M001/M001-SUMMARY.md",
    inlinedContext: "## Milestone Summary\n\n## Horizontal Checklist\n\n## Decision Re-evaluation",
    extractLearningsSteps: "Write M001-LEARNINGS.md and call capture_thought.",
  });

  assert.match(prompt, /Complete Milestone M001/);
  assert.match(prompt, /Verification Gate/);
  assert.match(prompt, /Do NOT call `gsd_complete_milestone`/);
  assert.match(prompt, /verification FAILED/);
  assert.match(prompt, /gsd_requirement_update/);
  assert.match(prompt, /gsd_complete_milestone/);
  assert.match(prompt, /verificationPassed/);
  assert.match(prompt, /gsd_milestone_status/);
  assert.match(prompt, /Do NOT query.*\.gsd\/gsd\.db/i);
  assert.match(prompt, /Horizontal Checklist/);
  assert.match(prompt, /Decision Re-evaluation/);
  assert.match(prompt, /self-diff/i);
  assert.match(prompt, /GSD-(?:Task|Unit)/);
  assert.match(prompt, /Milestone M001 complete/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
