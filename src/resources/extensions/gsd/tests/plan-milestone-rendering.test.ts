// Project/App: GSD-2
// File Purpose: Verifies the milestone planning prompt renders compact required guidance.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("plan-milestone prompt renders compact DB-backed planning guidance", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const providedGsdHome = process.env.GSD_TEST_HOME;
  const isolatedHome = providedGsdHome ?? mkdtempSync(join(tmpdir(), "gsd-plan-milestone-render-"));
  const fixtureRoot = process.env.GSD_TEST_WORKSPACE_ROOT ?? process.cwd();
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    if (!providedGsdHome) rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("plan-milestone", {
    milestoneId: "M001",
    milestoneTitle: "Reduce prompt cost",
    workingDirectory: fixtureRoot,
    inlinedContext: "## Roadmap\n\nUse the roadmap template.",
    outputPath: ".gsd/milestones/M001/M001-ROADMAP.md",
    skillDiscoveryMode: "filtered",
    skillDiscoveryInstructions: "Use only relevant skills.",
    sourceFilePaths: "- src/resources/extensions/gsd/prompts/plan-milestone.md",
    researchOutputPath: ".gsd/milestones/M001/M001-RESEARCH.md",
    secretsOutputPath: ".gsd/milestones/M001/SECRETS.md",
  });

  assert.match(prompt, /Explore First, Then Decompose/);
  assert.match(prompt, /Call `gsd_plan_milestone`/);
  assert.match(prompt, /call `gsd_decision_save`/);
  assert.match(prompt, /Every relevant Active requirement must end as mapped/);
  assert.match(prompt, /Risk-first means proof-first/);
  assert.match(prompt, /Progressive Planning \(ADR-011\)/);
  assert.match(prompt, /Single-Slice Fast Path/);
  assert.match(prompt, /Secret Forecasting/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
