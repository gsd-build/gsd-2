// Project/App: GSD-2
// File Purpose: Verifies the guided project discussion prompt renders its core interview and persistence contracts.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("guided project prompt renders compact interview and artifact guidance", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const providedGsdHome = process.env.GSD_TEST_HOME;
  const isolatedHome = providedGsdHome ?? mkdtempSync(join(tmpdir(), "gsd-guided-project-render-"));
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    if (!providedGsdHome) rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("guided-discuss-project", {
    workingDirectory: process.env.GSD_TEST_WORKSPACE_ROOT ?? process.cwd(),
    structuredQuestionsAvailable: "true",
    inlinedTemplates: "## Project\n\n## Project Shape\n\n## Capability Contract\n\n## Milestone Sequence",
    commitInstruction: "Do not commit during this test.",
  });

  assert.match(prompt, /What do you want to build\?/);
  assert.match(prompt, /Project shape: simple/);
  assert.match(prompt, /Default to `complex` when uncertain/);
  assert.match(prompt, /3 or 4 concrete, researched options/);
  assert.match(prompt, /"Other — let me discuss"/);
  assert.match(prompt, /depth_verification_project_confirm/);
  assert.match(prompt, /artifact_type: "PROJECT"/);
  assert.match(prompt, /omit `milestone_id`/);
  assert.match(prompt, /Do NOT use `artifact_type: "CONTEXT"` and do NOT pass `milestone_id: "PROJECT"`/);
  assert.match(prompt, /\*\*Complexity:\*\* simple/);
  assert.match(prompt, /\*\*Complexity:\*\* complex/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
