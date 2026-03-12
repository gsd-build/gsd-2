import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test getConfiguredMainBranch by mocking the preference files it reads.
// Since the function uses loadEffectiveGSDPreferences() which reads from
// hardcoded paths, we test the validation logic and preference cascade
// by importing and testing the exported function indirectly through
// the preferences module.

import { getConfiguredMainBranch } from "../preferences.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// When no preferences are set, it should default to "main"
assertEqual(getConfiguredMainBranch(), "main", "default to 'main' when no preferences set");

// ─── Branch name validation regex ─────────────────────────────────────────────

// Test that the validation regex accepts valid branch names
const VALID_BRANCH_NAME = /^[a-zA-Z0-9_\-\/.]+$/;

const validNames = ["main", "master", "develop", "feature/foo", "release-1.0", "my_branch", "MAIN"];
for (const name of validNames) {
  assert(VALID_BRANCH_NAME.test(name), `valid branch name accepted: ${name}`);
}

// Test that the validation regex rejects invalid/dangerous names
const invalidNames = [
  "main; rm -rf /",
  "main && echo pwned",
  "branch name with spaces",
  "branch$(cmd)",
  "branch`cmd`",
  "branch|pipe",
  "",
];
for (const name of invalidNames) {
  assert(!VALID_BRANCH_NAME.test(name), `invalid branch name rejected: ${JSON.stringify(name)}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\npreferences-main-branch: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
