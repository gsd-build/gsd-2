import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _describeArtifactVerificationFailureForTest } from "../auto-post-unit.ts";

test("missing execute-task artifact includes completion contract and completion-tool hint", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-artifact-diag-"));
  const taskDir = join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks");
  mkdirSync(taskDir, { recursive: true });

  const msg = _describeArtifactVerificationFailureForTest("execute-task", "M001/S01/T01", base);
  assert.match(msg, /was not found on disk after unit execution/);
  assert.match(msg, /Task T01 marked \[x\].*summary written/i);
  assert.match(msg, /No completion tool call detected \(`gsd_task_complete`\/alias\)/);
});

test("missing execute-task artifact skips completion-tool hint when completion tool call is present", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-artifact-diag-"));
  const taskDir = join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks");
  mkdirSync(taskDir, { recursive: true });

  const msg = _describeArtifactVerificationFailureForTest(
    "execute-task",
    "M001/S01/T01",
    base,
    [{ content: [{ type: "toolCall", name: "gsd_task_complete" }] }],
  );
  assert.match(msg, /was not found on disk after unit execution/);
  assert.doesNotMatch(msg, /No completion tool call detected \(`gsd_task_complete`\/alias\)/);
});
