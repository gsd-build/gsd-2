/**
 * Regression tests for three false-positive sources in the safety harness.
 * Issue #4385
 *
 * Bug 1: Hardcoded BASH_READ_ONLY_RE — new legitimate commands blocked
 * Bug 2: Non-persisted evidence — session restart causes false positive on resume
 * Bug 3: git diff HEAD~1 scope check — fails on initial commits / shallow clones
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { shouldBlockQueueExecution } from "../bootstrap/write-gate.ts";
import {
  resetEvidence,
  recordToolCall,
  recordToolResult,
  getEvidence,
  saveEvidenceToDisk,
  loadEvidenceFromDisk,
  type BashEvidence,
} from "../safety/evidence-collector.ts";
import { validateFileChanges } from "../safety/file-change-validator.ts";

// ─── Bug 1: Hardcoded Bash allowlist ────────────────────────────────────────

test("safety-harness-bug1: npm commands are not blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "npm run test", true);
  assert.strictEqual(r.block, false, "npm run test must be read-only-safe");
});

test("safety-harness-bug1: npx commands are not blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "npx tsc --noEmit", true);
  assert.strictEqual(r.block, false, "npx tsc --noEmit must pass");
});

test("safety-harness-bug1: tsx commands are not blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "tsx src/index.ts", true);
  assert.strictEqual(
    r.block,
    false,
    "tsx (TypeScript runner — read-only investigative) must pass",
  );
});

test("safety-harness-bug1: node --print commands are not blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "node --print 'process.version'", true);
  assert.strictEqual(r.block, false, "node --print must pass");
});

test("safety-harness-bug1: python read-only invocations are not blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "python -c 'import sys; print(sys.version)'", true);
  assert.strictEqual(r.block, false, "python -c read-only must pass");
});

test("safety-harness-bug1: jq read-only command is not blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "jq '.version' package.json", true);
  assert.strictEqual(r.block, false, "jq (read-only JSON query) must pass");
});

test("safety-harness-bug1: destructive commands are still blocked during queue mode", () => {
  const r = shouldBlockQueueExecution("bash", "rm -rf dist/", true);
  assert.strictEqual(r.block, true, "rm -rf must still be blocked");
});

// ─── Bug 2: Non-persisted evidence ──────────────────────────────────────────

test("safety-harness-bug2: evidence survives save/load round-trip (simulates session restart)", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-evidence-persist-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  resetEvidence();

  // Simulate bash tool calls during unit execution
  recordToolCall("tc-001", "Bash", { command: "npm run test:unit" });
  recordToolCall("tc-002", "Bash", { command: "npx tsc --noEmit" });
  recordToolCall("tc-003", "Write", { file_path: "src/foo.ts" });

  const before = getEvidence();
  assert.equal(before.length, 3, "three entries before save");

  // Persist to disk
  saveEvidenceToDisk(base, "M001", "S001", "T001");

  // Simulate session restart: module-level array reset
  resetEvidence();
  assert.equal(getEvidence().length, 0, "in-memory cleared after reset");

  // Resume: load from disk
  loadEvidenceFromDisk(base, "M001", "S001", "T001");

  const after = getEvidence();
  assert.equal(after.length, 3, "evidence restored from disk after simulated restart");

  const bashEntries = after.filter((e) => e.kind === "bash");
  assert.equal(bashEntries.length, 2, "both bash entries restored");

  const writeEntries = after.filter((e) => e.kind === "write");
  assert.equal(writeEntries.length, 1, "write entry restored");
});

test("safety-harness-bug2: loadEvidenceFromDisk returns empty array when no file exists (fresh unit)", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-evidence-nopersist-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  resetEvidence();
  loadEvidenceFromDisk(base, "M001", "S001", "T001");
  assert.equal(getEvidence().length, 0, "no evidence on fresh unit is correct — not a false positive");
});

test("safety-harness-bug2-race: bash evidence survives mid-unit reset between tool_call and tool_execution_end", (t) => {
  // Reproduces the race where runUnitPhase re-fires (resetEvidence + loadEvidenceFromDisk)
  // between a bash tool_call and its tool_execution_end. Pre-fix, the call entry lived
  // only in memory until tool_execution_end; the reset wiped it and recordToolResult
  // silently no-op'd, producing the "task complete with no bash calls" false positive.
  // Post-fix, register-hooks.ts persists at tool_call time too — so the entry survives
  // the reset via the disk round-trip.
  const base = mkdtempSync(join(tmpdir(), "gsd-evidence-race-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  resetEvidence();

  // tool_call fires: record AND persist (post-fix register-hooks.ts behavior).
  recordToolCall("tc-bash-1", "bash", { command: "grep -q saveTodos app.js" });
  saveEvidenceToDisk(base, "M001", "S01", "T02");

  // Mid-unit race: runUnitPhase re-fires, calling resetEvidence + loadEvidenceFromDisk.
  resetEvidence();
  assert.equal(getEvidence().length, 0, "memory cleared by mid-unit reset");
  loadEvidenceFromDisk(base, "M001", "S01", "T02");
  assert.equal(getEvidence().length, 1, "entry restored from disk-persisted tool_call");

  // tool_execution_end fires: result must update the restored entry by toolCallId.
  recordToolResult("tc-bash-1", "bash", "Command exited with code 0\nfound\n", false);

  const bash = getEvidence().filter((e): e is BashEvidence => e.kind === "bash");
  assert.equal(bash.length, 1, "bash entry must survive race + result update");
  assert.equal(bash[0].exitCode, 0, "result populated the restored entry");
  assert.equal(bash[0].command, "grep -q saveTodos app.js", "command preserved across race");
  assert.ok(bash[0].outputSnippet.includes("found"), "output snippet captured");
});

test("safety-harness: gsd_exec counts as execution evidence", () => {
  resetEvidence();

  recordToolCall("tc-exec-1", "gsd_exec", { command: "grep -n render index.html" });
  recordToolResult("tc-exec-1", "gsd_exec", "Command exited with code 0\n1:render\n", false);

  const bash = getEvidence().filter((e): e is BashEvidence => e.kind === "bash");
  assert.equal(bash.length, 1, "gsd_exec must be tracked as execution evidence");
  assert.equal(bash[0].command, "grep -n render index.html");
  assert.equal(bash[0].exitCode, 0);
});

// ─── Bug 3: git diff HEAD~1 scope check ─────────────────────────────────────

test("safety-harness-bug3: validateFileChanges works on initial commit (no HEAD~1)", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-initial-commit-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  execFileSync("git", ["init"], { cwd: base });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: base });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: base });

  writeFileSync(join(base, "index.ts"), "export const x = 1;\n");
  execFileSync("git", ["add", "."], { cwd: base });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: base });

  // On initial commit, HEAD~1 does not exist — must not throw or produce wrong results
  const audit = validateFileChanges(base, ["index.ts"], []);

  assert.ok(audit !== null, "audit must be produced for initial commit");
  assert.deepEqual(audit!.unexpectedFiles, [], "no unexpected files on initial commit");
  assert.deepEqual(audit!.missingFiles, [], "no missing files on initial commit");
});

test("safety-harness-bug3: validateFileChanges works on shallow clone (shallow repo without full history)", (t) => {
  // Simulate shallow clone: create a repo, then clone it with depth=1
  const origin = mkdtempSync(join(tmpdir(), "gsd-origin-"));
  const shallow = mkdtempSync(join(tmpdir(), "gsd-shallow-"));
  t.after(() => {
    rmSync(origin, { recursive: true, force: true });
    rmSync(shallow, { recursive: true, force: true });
  });

  // Set up origin with multiple commits
  execFileSync("git", ["init"], { cwd: origin });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: origin });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: origin });
  writeFileSync(join(origin, "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["add", "."], { cwd: origin });
  execFileSync("git", ["commit", "-m", "first"], { cwd: origin });
  writeFileSync(join(origin, "b.ts"), "export const b = 2;\n");
  execFileSync("git", ["add", "."], { cwd: origin });
  execFileSync("git", ["commit", "-m", "second"], { cwd: origin });

  // Shallow clone with depth=1 — HEAD~1 will not exist
  execFileSync("git", ["clone", "--depth=1", `file://${origin}`, shallow], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Verify the shallow clone has no parent (HEAD~1 unavailable)
  let hasParent = true;
  try {
    execFileSync("git", ["rev-parse", "HEAD~1"], {
      cwd: shallow,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    hasParent = false;
  }
  assert.equal(hasParent, false, "shallow clone should not have HEAD~1");

  // validateFileChanges must not throw or give wrong results
  const audit = validateFileChanges(shallow, ["b.ts"], []);
  assert.ok(audit !== null, "audit must be produced even in shallow clone");
});

test("safety-harness-bug3: validateFileChanges works on merge commit", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-merge-commit-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  execFileSync("git", ["init", "-b", "main"], { cwd: base });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: base });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: base });

  // Main branch: initial commit
  writeFileSync(join(base, "main.ts"), "export const m = 1;\n");
  execFileSync("git", ["add", "."], { cwd: base });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: base });

  // Feature branch
  execFileSync("git", ["checkout", "-b", "feature"], { cwd: base });
  writeFileSync(join(base, "feature.ts"), "export const f = 2;\n");
  execFileSync("git", ["add", "."], { cwd: base });
  execFileSync("git", ["commit", "-m", "feature work"], { cwd: base });

  // Merge back to main
  execFileSync("git", ["checkout", "main"], { cwd: base });
  execFileSync("git", ["merge", "--no-ff", "feature", "-m", "Merge feature"], { cwd: base });

  // HEAD is now a merge commit with two parents — git diff HEAD~1 gives wrong scope
  const audit = validateFileChanges(base, ["feature.ts"], []);

  // Must produce a valid result without throwing
  assert.ok(audit !== null, "audit must be produced for merge commit repo");
});

test("safety-harness: planned changed file avoids unexpected-file warning", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-planned-file-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  execFileSync("git", ["init"], { cwd: base });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: base });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: base });
  writeFileSync(join(base, "index.html"), "<main></main>\n");
  execFileSync("git", ["add", "index.html"], { cwd: base });
  execFileSync("git", ["commit", "-m", "add static app"], { cwd: base });

  const audit = validateFileChanges(base, [], ["index.html"]);
  assert.ok(audit !== null, "audit must be produced");
  assert.deepEqual(audit!.unexpectedFiles, [], "planned index.html must not be unexpected");
  assert.deepEqual(audit!.missingFiles, [], "planned index.html must not be missing");
});
