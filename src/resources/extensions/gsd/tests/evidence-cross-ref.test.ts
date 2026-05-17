// Project/App: GSD-2
// File Purpose: Tests for verification evidence cross-reference mismatch policy.

import test from "node:test";
import assert from "node:assert/strict";

import { crossReferenceEvidence } from "../safety/evidence-cross-ref.ts";
import type { EvidenceEntry } from "../safety/evidence-collector.ts";

test("claims of passing verification become errors when recorded bash evidence failed", () => {
  const mismatches = crossReferenceEvidence(
    [{ command: "npm test", exitCode: 0, verdict: "passed" }],
    [
      {
        kind: "bash",
        toolCallId: "call-1",
        command: "npm test",
        exitCode: 1,
        outputSnippet: "failed",
        timestamp: Date.now(),
      },
    ] as EvidenceEntry[],
  );

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].severity, "error");
  assert.match(mismatches[0].reason, /Claimed exitCode=0/);
});

test("passing retry evidence is not invalidated by an earlier failed run of the same command", () => {
  const command = "node todo.js add 'Task A' && node todo.js add 'Task B' && node todo.js done 1";
  const mismatches = crossReferenceEvidence(
    [{ command, exitCode: 0, verdict: "passed after retry" }],
    [
      {
        kind: "bash",
        toolCallId: "call-1",
        command,
        exitCode: 1,
        outputSnippet: "Task #1 not found",
        timestamp: 1,
      },
      {
        kind: "bash",
        toolCallId: "call-2",
        command,
        exitCode: 0,
        outputSnippet: "Marked #1 done.",
        timestamp: 2,
      },
    ] as EvidenceEntry[],
  );

  assert.deepEqual(mismatches, []);
});

test("stale verification evidence batches are ignored when a newer completion batch exists", () => {
  const command = "node todo.js add 'Task A' && node todo.js add 'Task B' && node todo.js done 1";
  const resetCommand = `rm -f "$HOME/.config/todo/data.json" && ${command}`;
  const mismatches = crossReferenceEvidence(
    [
      { command, exitCode: 0, verdict: "pass", createdAt: "2026-05-14T11:16:48.588Z" },
      { command, exitCode: 1, verdict: "fail before reset", createdAt: "2026-05-14T11:28:36.952Z" },
      { command: resetCommand, exitCode: 0, verdict: "pass after reset", createdAt: "2026-05-14T11:28:36.952Z" },
    ],
    [
      {
        kind: "bash",
        toolCallId: "call-1",
        command,
        exitCode: 1,
        outputSnippet: "Task #1 not found",
        timestamp: 1,
      },
      {
        kind: "bash",
        toolCallId: "call-2",
        command: resetCommand,
        exitCode: 0,
        outputSnippet: "Marked #1 done.",
        timestamp: 2,
      },
    ] as EvidenceEntry[],
  );

  assert.deepEqual(mismatches, []);
});

test("missing recorded bash evidence remains a warning", () => {
  const mismatches = crossReferenceEvidence(
    [{ command: "npm test", exitCode: 0, verdict: "passed" }],
    [],
  );

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].severity, "warning");
});
