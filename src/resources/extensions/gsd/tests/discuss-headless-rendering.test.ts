// Project/App: GSD-2
// File Purpose: Verifies the headless discussion prompt renders compact required guidance.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("discuss-headless prompt renders compact investigation and audit guidance", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const providedGsdHome = process.env.GSD_TEST_HOME;
  const isolatedHome = providedGsdHome ?? mkdtempSync(join(tmpdir(), "gsd-discuss-headless-render-"));
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    if (!providedGsdHome) rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("discuss-headless", {
    seedContext: "# Spec\n\nBuild the thing.",
    milestoneId: "M001",
    contextPath: ".gsd/milestones/M001/M001-CONTEXT.md",
    commitInstruction: "Commit the created milestone artifacts.",
    multiMilestoneCommitInstruction: "Commit the created milestone artifacts.",
    inlinedTemplates: "## Template\n\nUse standard GSD artifacts.",
  });

  assert.match(prompt, /Investigate before making decisions:/);
  assert.match(prompt, /Budget searches across investigation and focused research\./);
  assert.match(prompt, /Resolve all of these from the spec and investigation before writing artifacts:/);
  assert.match(prompt, /Print a structured depth summary in chat/);
  assert.match(prompt, /Document every assumption in CONTEXT\.md/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
