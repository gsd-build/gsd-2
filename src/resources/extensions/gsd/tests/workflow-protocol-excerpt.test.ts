// Project/App: GSD-2
// File Purpose: Tests for capped GSD workflow protocol and doctor-heal payload helpers.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDoctorHealIssuePayload,
  buildDoctorHealSummary,
  buildWorkflowDispatchContent,
  buildWorkflowProtocolExcerpt,
} from "../workflow-protocol.ts";

test("workflow protocol helper emits capped excerpt plus source path", () => {
  const workflow = `# Protocol\n${"FULL_WORKFLOW_BODY ".repeat(500)}`;
  const excerpt = buildWorkflowProtocolExcerpt(workflow, "/tmp/GSD-WORKFLOW.md", { maxChars: 1200 });

  assert.match(excerpt, /Source: `\/tmp\/GSD-WORKFLOW\.md`/);
  assert.match(excerpt, /\[Workflow Protocol Truncated\]/);
  assert.ok(excerpt.length < workflow.length);
  assert.ok(excerpt.length < 1600);
});

test("workflow dispatch uses excerpt instead of full workflow body", () => {
  const workflow = `# Protocol\n${"FULL_WORKFLOW_BODY ".repeat(500)}`;
  const content = buildWorkflowDispatchContent({
    workflow,
    workflowPath: "/tmp/GSD-WORKFLOW.md",
    task: "Run the selected unit.",
    maxProtocolChars: 1200,
  });

  assert.match(content, /## GSD Workflow Protocol Excerpt/);
  assert.match(content, /## Your Task/);
  assert.match(content, /Run the selected unit/);
  assert.ok(content.length < workflow.length);
});

test("workflow protocol excerpt includes late verification and advance rules", () => {
  const workflow = [
    "# GSD Workflow",
    "intro",
    "## Quick Start",
    "quick",
    "## File Format Reference",
    "format ".repeat(400),
    "## The Phases",
    "phase overview",
    "### Phase 4: Execute",
    "execute rules",
    "### Phase 5: Verify",
    "verification rules",
    "### Phase 7: Advance",
    "advance rules",
  ].join("\n");

  const excerpt = buildWorkflowProtocolExcerpt(workflow, "/tmp/GSD-WORKFLOW.md", { maxChars: 1300 });

  assert.match(excerpt, /Quick Start/);
  assert.match(excerpt, /Phase 5: Verify/);
  assert.match(excerpt, /Phase 7: Advance/);
  assert.doesNotMatch(excerpt, /format format format format format/);
});

test("doctor heal summary omits duplicated full report body", () => {
  const report = [
    "# GSD doctor heal prep.",
    "Scope: M001",
    "Status: warning",
    "Warnings: 9",
    "",
    "VERY_LONG_FULL_REPORT_BODY ".repeat(300),
  ].join("\n");

  const summary = buildDoctorHealSummary(report, { maxChars: 900 });

  assert.match(summary, /GSD doctor heal prep/);
  assert.match(summary, /Warnings: 9/);
  assert.ok(summary.length <= 900);
  assert.doesNotMatch(summary, /VERY_LONG_FULL_REPORT_BODY VERY_LONG_FULL_REPORT_BODY VERY_LONG_FULL_REPORT_BODY/);
});

test("doctor heal issue payload keeps top actionable issues and caps detail", () => {
  const issues = Array.from({ length: 20 }, (_, index) =>
    `### Issue ${index + 1}\n${`detail ${index + 1} `.repeat(80)}`,
  ).join("\n");

  const payload = buildDoctorHealIssuePayload(issues, {
    maxIssues: 3,
    maxIssueChars: 180,
    maxChars: 900,
  });

  assert.match(payload, /Issue 1/);
  assert.match(payload, /Issue 3/);
  assert.doesNotMatch(payload, /Issue 4/);
  assert.match(payload, /17 additional actionable issue/);
  assert.ok(payload.length <= 900);
});
