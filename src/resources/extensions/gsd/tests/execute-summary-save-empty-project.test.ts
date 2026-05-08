// gsd-2 / execute-summary-save PROJECT registration hard-fail tests
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { openDatabase, closeDatabase, getAllMilestones } from "../gsd-db.ts";
import { markApprovalGateVerified, clearDiscussionFlowState } from "../bootstrap/write-gate.ts";
import { executeSummarySave } from "../tools/workflow-tool-executors.ts";

function makeTmpBase(): string {
  const base = join(tmpdir(), `gsd-summary-save-empty-project-${randomUUID()}`);
  mkdirSync(join(base, ".gsd"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* swallow */ }
}

function openTestDb(base: string): void {
  openDatabase(join(base, ".gsd", "gsd.db"));
}

async function inProjectDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  try {
    process.chdir(dir);
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

function setupBase(t: { after: (fn: () => void) => void }): string {
  const base = makeTmpBase();
  // Force deep planning so the root-artifact guard requires a verified approval gate,
  // matching the production flow that surfaces the regression.
  writeFileSync(join(base, ".gsd", "PREFERENCES.md"), "---\nplanning_depth: deep\n---\n");
  openTestDb(base);
  markApprovalGateVerified("depth_verification_project_confirm", base);
  t.after(() => {
    clearDiscussionFlowState(base);
    closeDatabase();
    cleanup(base);
  });
  return base;
}

test("executeSummarySave returns isError when PROJECT.md content has zero parseable milestone lines", async (t) => {
  const base = setupBase(t);

  const content = [
    "# Project",
    "",
    "## What This Is",
    "",
    "Bad-separator regression fixture.",
    "",
    "## Milestone Sequence",
    "",
    // Wrong separator: " : " instead of em-dash / -- / -  → MILESTONE_LINE_RE matches zero lines.
    "- [ ] M001: Foundation : Establish the first runnable slice.",
    "",
    "## Next Section",
    "",
    "Trailing prose with no list bullets so MILESTONE_LINE_RE cannot bridge across lines.",
    "",
  ].join("\n");

  const result = await inProjectDir(base, () => executeSummarySave({
    artifact_type: "PROJECT",
    content,
  }, base));

  assert.equal(result.isError, true);
  assert.equal(result.details.error, "milestone_registration_empty_parse");
  assert.match(result.content[0].text, /zero parseable milestone lines/);
  assert.equal(getAllMilestones().length, 0);
});

test("executeSummarySave registers milestones when PROJECT.md uses canonical em-dash format", async (t) => {
  const base = setupBase(t);

  const content = [
    "# Project",
    "",
    "## What This Is",
    "",
    "Canonical milestone-sequence fixture.",
    "",
    "## Milestone Sequence",
    "",
    "- [ ] M001: Foo — bar",
    "- [ ] M002: Baz — qux",
    "",
  ].join("\n");

  const result = await inProjectDir(base, () => executeSummarySave({
    artifact_type: "PROJECT",
    content,
  }, base));

  assert.notEqual(result.isError, true);
  assert.deepEqual(result.details.registeredMilestones, ["M001", "M002"]);
  assert.equal(getAllMilestones().length, 2);
});
