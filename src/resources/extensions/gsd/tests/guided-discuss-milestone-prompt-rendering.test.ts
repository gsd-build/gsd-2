// Project/App: GSD-2
// File Purpose: Verifies the guided milestone discussion prompt renders its core interview and persistence contracts.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("guided milestone prompt renders compact interview and context guidance", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const providedGsdHome = process.env.GSD_TEST_HOME;
  const isolatedHome = providedGsdHome ?? mkdtempSync(join(tmpdir(), "gsd-guided-milestone-render-"));
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    if (!providedGsdHome) rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("guided-discuss-milestone", {
    workingDirectory: process.env.GSD_TEST_WORKSPACE_ROOT ?? process.cwd(),
    milestoneId: "M001",
    milestoneTitle: "Baseline And Safety",
    structuredQuestionsAvailable: "true",
    fastPathInstruction: "No fast path in this test.",
    inlinedTemplates: "## Context\n\n## Decisions\n\n## Open Questions",
    commitInstruction: "Do not commit during this test.",
  });

  assert.match(prompt, /M001 context written/);
  assert.match(prompt, /Project Shape/);
  assert.match(prompt, /default to `complex`/i);
  assert.match(prompt, /3 or 4 concrete, researched options/);
  assert.match(prompt, /"Other — let me discuss"/);
  assert.match(prompt, /CONTEXT-DRAFT/);
  assert.match(prompt, /Do NOT mention this save to the user/);
  assert.match(prompt, /depth_verification_M001_confirm/);
  assert.match(prompt, /artifact_type: "CONTEXT"/);
  assert.match(prompt, /milestone_id: M001/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
