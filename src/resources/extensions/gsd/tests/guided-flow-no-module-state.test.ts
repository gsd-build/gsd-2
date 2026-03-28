/**
 * guided-flow-no-module-state.test.ts — Guards the no-module-singleton invariant in guided-flow.ts.
 *
 * guided-flow.ts must NOT hold a module-level `let pendingAutoStart` (or similar
 * `_pending*`) singleton.  The old pattern created cross-session state contamination:
 * one project's guided flow could fire auto-start callbacks registered by a different
 * concurrent session.
 *
 * The correct pattern is an injected `onAutoStart` callback passed through
 * `showSmartEntry` options — guided-flow stays stateless with respect to auto-start
 * trigger ownership.
 *
 * These tests parse guided-flow.ts source so they fail at test time before a PR merges.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(import.meta.dirname, "..", "guided-flow.ts");
const source = readFileSync(sourcePath, "utf-8");

// ── Invariant 1: No module-level let pendingAutoStart ─────────────────────────

test("guided-flow.ts has no module-level `let pendingAutoStart` declaration", () => {
  const lines = source.split("\n");
  const violations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^let\s+pendingAutoStart\b/.test(line)) {
      violations.push(`line ${i + 1}: ${line.trim()}`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `guided-flow.ts must not declare a module-level \`let pendingAutoStart\`.\n` +
      `Use an injected onAutoStart callback via showSmartEntry options instead.\n` +
      `Violations:\n${violations.join("\n")}`,
  );
});

// ── Invariant 2: No module-level let _pending* singleton ─────────────────────

test("guided-flow.ts has no module-level `let _pending*` singleton", () => {
  const lines = source.split("\n");
  const violations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^let\s+_pending/.test(line)) {
      violations.push(`line ${i + 1}: ${line.trim()}`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `guided-flow.ts must not declare module-level \`let _pending*\` singletons.\n` +
      `Violations:\n${violations.join("\n")}`,
  );
});

// ── Invariant 3: showSmartEntry accepts an onAutoStart option ─────────────────

test("showSmartEntry signature accepts an onAutoStart option", () => {
  // The exported function must accept options with onAutoStart
  const hasOnAutoStart = source.includes("onAutoStart?: OnAutoStart");
  assert.ok(
    hasOnAutoStart,
    "showSmartEntry (or its options interface) must accept an `onAutoStart?: OnAutoStart` parameter — " +
      "the callback is how callers inject auto-start behaviour without guided-flow importing auto.ts",
  );
});

test("showSmartEntry is exported from guided-flow.ts", () => {
  const exportIdx = source.indexOf("export async function showSmartEntry");
  assert.ok(
    exportIdx > -1,
    "showSmartEntry must be exported from guided-flow.ts",
  );
});

test("guided-flow.ts exports OnAutoStart type", () => {
  const exportIdx = source.indexOf("export type OnAutoStart");
  assert.ok(
    exportIdx > -1,
    "guided-flow.ts must export the OnAutoStart type so callers can type their callback",
  );
});
