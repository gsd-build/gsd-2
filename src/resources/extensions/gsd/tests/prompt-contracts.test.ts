import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const promptsDir = join(process.cwd(), "src/resources/extensions/gsd/prompts");

function readPrompt(name: string): string {
  return readFileSync(join(promptsDir, `${name}.md`), "utf-8");
}

test("reactive-execute prompt keeps task summaries with subagents and avoids batch commits", () => {
  const prompt = readPrompt("reactive-execute");
  assert.match(prompt, /subagent-written summary as authoritative/i);
  assert.match(prompt, /Do NOT create a batch commit/i);
  assert.doesNotMatch(prompt, /\*\*Write task summaries\*\*/i);
  assert.doesNotMatch(prompt, /\*\*Commit\*\* all changes/i);
});

test("run-uat prompt branches on dynamic UAT mode and supports runtime evidence", () => {
  const prompt = readPrompt("run-uat");
  assert.match(prompt, /\*\*Detected UAT mode:\*\*\s*`\{\{uatType\}\}`/);
  assert.match(prompt, /uatType:\s*\{\{uatType\}\}/);
  assert.match(prompt, /live-runtime/);
  assert.match(prompt, /browser\/runtime\/network/i);
  assert.match(prompt, /NEEDS-HUMAN/);
  assert.doesNotMatch(prompt, /uatType:\s*artifact-driven/);
});

test("workflow-start prompt defaults to autonomy instead of per-phase confirmation", () => {
  const prompt = readPrompt("workflow-start");
  assert.match(prompt, /Keep moving by default/i);
  assert.match(prompt, /Decision gates, not ceremony/i);
  assert.doesNotMatch(prompt, /confirm with the user before proceeding/i);
  assert.doesNotMatch(prompt, /Gate between phases/i);
});

test("discuss prompt allows implementation questions when they materially matter", () => {
  const prompt = readPrompt("discuss");
  assert.match(prompt, /Lead with experience, but ask implementation when it materially matters/i);
  assert.match(prompt, /one gate, not two/i);
  assert.doesNotMatch(prompt, /Questions must be about the experience, not the implementation/i);
});

test("guided discussion prompts avoid wrap-up prompts after every round", () => {
  const milestonePrompt = readPrompt("guided-discuss-milestone");
  const slicePrompt = readPrompt("guided-discuss-slice");
  assert.match(milestonePrompt, /Do \*\*not\*\* ask a meta "ready to wrap up\?" question after every round/i);
  assert.match(slicePrompt, /Do \*\*not\*\* ask a meta "ready to wrap up\?" question after every round/i);
  assert.doesNotMatch(milestonePrompt, /I think I have a solid picture of this milestone\. Ready to wrap up/i);
  assert.doesNotMatch(slicePrompt, /I think I have a solid picture of this slice\. Ready to wrap up/i);
});

test("guided-resume-task prompt preserves recovery state until work is superseded", () => {
  const prompt = readPrompt("guided-resume-task");
  assert.match(prompt, /Do \*\*not\*\* delete the continue file immediately/i);
  assert.match(prompt, /successfully completed or you have written a newer summary\/continue artifact/i);
  assert.doesNotMatch(prompt, /Delete the continue file after reading it/i);
});

// ─── Prompt migration: execute-task → gsd_task_complete ───────────────

test("execute-task prompt references gsd_task_complete tool", () => {
  const prompt = readPrompt("execute-task");
  assert.match(prompt, /gsd_task_complete/);
});

test("execute-task prompt does not instruct LLM to write summary file manually", () => {
  const prompt = readPrompt("execute-task");
  // Should not contain "Write {{taskSummaryPath}}" as an action instruction
  assert.doesNotMatch(prompt, /^\d+\.\s+Write `?\{\{taskSummaryPath\}\}`?/m);
});

test("execute-task prompt does not instruct LLM to toggle checkboxes manually", () => {
  const prompt = readPrompt("execute-task");
  assert.doesNotMatch(prompt, /change \[ \] to \[x\]/);
  assert.doesNotMatch(prompt, /Mark \{\{taskId\}\} done in/);
});

test("execute-task prompt still contains template variables for context", () => {
  const prompt = readPrompt("execute-task");
  assert.match(prompt, /\{\{taskSummaryPath\}\}/);
  assert.match(prompt, /\{\{planPath\}\}/);
});

test("guided-execute-task prompt references gsd_task_complete tool", () => {
  const prompt = readPrompt("guided-execute-task");
  assert.match(prompt, /gsd_task_complete/);
});

test("guided-execute-task prompt does not instruct manual file write", () => {
  const prompt = readPrompt("guided-execute-task");
  assert.doesNotMatch(prompt, /Write `?\{\{taskId\}\}-SUMMARY\.md`?.*mark it done/i);
});

// ─── Prompt migration: complete-slice → gsd_slice_complete ────────────
// These tests are for T02 — expected to fail until that task runs.

test("complete-slice prompt references gsd_slice_complete tool", () => {
  const prompt = readPrompt("complete-slice");
  assert.match(prompt, /gsd_slice_complete/);
});

test("complete-slice prompt does not instruct LLM to toggle checkboxes manually", () => {
  const prompt = readPrompt("complete-slice");
  assert.doesNotMatch(prompt, /change \[ \] to \[x\]/);
});

test("guided-complete-slice prompt references gsd_slice_complete tool", () => {
  const prompt = readPrompt("guided-complete-slice");
  assert.match(prompt, /gsd_slice_complete/);
});

test("complete-slice prompt does not instruct LLM to write summary/UAT files manually", () => {
  const prompt = readPrompt("complete-slice");
  assert.doesNotMatch(prompt, /^\d+\.\s+Write `?\{\{sliceSummaryPath\}\}/m);
  assert.doesNotMatch(prompt, /^\d+\.\s+Write `?\{\{sliceUatPath\}\}/m);
});

test("complete-slice prompt preserves decisions and knowledge review steps", () => {
  const prompt = readPrompt("complete-slice");
  assert.match(prompt, /DECISIONS\.md/);
  assert.match(prompt, /KNOWLEDGE\.md/);
});

test("complete-slice prompt still contains template variables for context", () => {
  const prompt = readPrompt("complete-slice");
  assert.match(prompt, /\{\{sliceSummaryPath\}\}/);
  assert.match(prompt, /\{\{sliceUatPath\}\}/);
  assert.match(prompt, /\{\{roadmapPath\}\}/);
});

test("reactive-execute prompt references tool calls instead of checkbox updates", () => {
  const prompt = readPrompt("reactive-execute");
  assert.doesNotMatch(prompt, /checkbox updates/);
  assert.doesNotMatch(prompt, /checkbox edits/);
  assert.match(prompt, /completion tool calls/);
});
