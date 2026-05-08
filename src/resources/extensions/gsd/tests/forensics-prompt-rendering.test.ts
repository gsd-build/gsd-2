// Project/App: GSD-2
// File Purpose: Verifies the forensics prompt renders required investigation and issue-routing guidance.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("forensics prompt renders compact investigation and issue routing guidance", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const providedGsdHome = process.env.GSD_TEST_HOME;
  const isolatedHome = providedGsdHome ?? mkdtempSync(join(tmpdir(), "gsd-forensics-render-"));
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    if (!providedGsdHome) rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("forensics", {
    problemDescription: "Auto-mode repeats the same unit.",
    forensicData: "stuck-detected event for execute-task/M001/S01/T01",
    gsdSourceDir: process.env.GSD_TEST_WORKSPACE_ROOT ?? process.cwd(),
    dedupSection: "No duplicate issue found.",
  });

  assert.match(prompt, /Investigation Protocol/);
  assert.match(prompt, /gsd_milestone_status/);
  assert.match(prompt, /sqlite3 .gsd\/gsd.db/);
  assert.match(prompt, /gh issue create --repo gsd-build\/gsd-2/);
  assert.match(prompt, /Do NOT use the `github_issues` tool/);
  assert.match(prompt, /Redaction Rules/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
