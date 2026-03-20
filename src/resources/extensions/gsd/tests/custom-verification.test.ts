/**
 * Unit tests for custom-verification.ts — runVerification() dispatcher
 * and all four verification policy handlers.
 *
 * Tests cover: undefined policy, content-heuristic (existence, minSize,
 * pattern), shell-command (exit 0, exit 1, path traversal rejection),
 * prompt-verify, and human-review.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runVerification, type VerificationResult } from "../custom-verification.ts";
import type { VerifyPolicy } from "../definition-loader.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-verify-test-"));
}

// ─── No policy (undefined) ───────────────────────────────────────────────

test("runVerification: undefined policy → continue", () => {
  const dir = makeTmpDir();
  try {
    const result = runVerification(undefined, dir, []);
    assert.deepStrictEqual(result, { result: "continue" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── content-heuristic ──────────────────────────────────────────────────

test("content-heuristic: artifact exists, no minSize or pattern → continue", () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "output.md"), "Hello world", "utf-8");
    const policy: VerifyPolicy = { policy: "content-heuristic" };
    const result = runVerification(policy, dir, ["output.md"]);
    assert.deepStrictEqual(result, { result: "continue" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content-heuristic: artifact missing → retry with path in reason", () => {
  const dir = makeTmpDir();
  try {
    const policy: VerifyPolicy = { policy: "content-heuristic" };
    const result = runVerification(policy, dir, ["missing.md"]);
    assert.equal(result.result, "retry");
    assert.ok(result.reason?.includes("missing.md"), `Expected reason to mention file path, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content-heuristic: artifact exists but too small → retry", () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "tiny.md"), "0123456789", "utf-8"); // 10 bytes
    const policy: VerifyPolicy = { policy: "content-heuristic", minSize: 100 };
    const result = runVerification(policy, dir, ["tiny.md"]);
    assert.equal(result.result, "retry");
    assert.ok(result.reason?.includes("too small"), `Expected 'too small' in reason, got: ${result.reason}`);
    assert.ok(result.reason?.includes("10"), `Expected actual size '10' in reason, got: ${result.reason}`);
    assert.ok(result.reason?.includes("100"), `Expected minSize '100' in reason, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content-heuristic: artifact exists, meets size, but pattern not found → retry", () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "report.md"), "This is the full report content.", "utf-8");
    const policy: VerifyPolicy = { policy: "content-heuristic", minSize: 10, pattern: "## Conclusion" };
    const result = runVerification(policy, dir, ["report.md"]);
    assert.equal(result.result, "retry");
    assert.ok(result.reason?.includes("Pattern not found"), `Expected 'Pattern not found' in reason, got: ${result.reason}`);
    assert.ok(result.reason?.includes("## Conclusion"), `Expected pattern text in reason, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("content-heuristic: artifact exists, meets size, pattern found → continue", () => {
  const dir = makeTmpDir();
  try {
    writeFileSync(join(dir, "report.md"), "# Report\n\n## Conclusion\n\nAll good.", "utf-8");
    const policy: VerifyPolicy = { policy: "content-heuristic", minSize: 10, pattern: "## Conclusion" };
    const result = runVerification(policy, dir, ["report.md"]);
    assert.deepStrictEqual(result, { result: "continue" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── shell-command ──────────────────────────────────────────────────────

test("shell-command: exit 0 → continue", () => {
  const dir = makeTmpDir();
  try {
    const policy: VerifyPolicy = { policy: "shell-command", command: "true" };
    const result = runVerification(policy, dir, []);
    assert.deepStrictEqual(result, { result: "continue" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shell-command: exit 1 → retry with exit code", () => {
  const dir = makeTmpDir();
  try {
    const policy: VerifyPolicy = { policy: "shell-command", command: "false" };
    const result = runVerification(policy, dir, []);
    assert.equal(result.result, "retry");
    assert.ok(result.reason?.includes("exited with code"), `Expected exit code in reason, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shell-command: command contains '..' → retry with rejection reason", () => {
  const dir = makeTmpDir();
  try {
    const policy: VerifyPolicy = { policy: "shell-command", command: "cat ../../../etc/passwd" };
    const result = runVerification(policy, dir, []);
    assert.equal(result.result, "retry");
    assert.ok(result.reason?.includes("Command rejected"), `Expected 'Command rejected' in reason, got: ${result.reason}`);
    assert.ok(result.reason?.includes(".."), `Expected '..' in reason, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── prompt-verify ──────────────────────────────────────────────────────

test("prompt-verify → pause with prompt text in reason", () => {
  const dir = makeTmpDir();
  try {
    const policy: VerifyPolicy = { policy: "prompt-verify", prompt: "Does the output contain valid JSON?" };
    const result = runVerification(policy, dir, []);
    assert.equal(result.result, "pause");
    assert.ok(result.reason?.includes("Does the output contain valid JSON?"), `Expected prompt in reason, got: ${result.reason}`);
    assert.ok(result.reason?.includes("Verification prompt:"), `Expected 'Verification prompt:' prefix, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── human-review ───────────────────────────────────────────────────────

test("human-review → pause with human review reason", () => {
  const dir = makeTmpDir();
  try {
    const policy: VerifyPolicy = { policy: "human-review" };
    const result = runVerification(policy, dir, []);
    assert.equal(result.result, "pause");
    assert.ok(result.reason?.includes("Human review"), `Expected 'Human review' in reason, got: ${result.reason}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
