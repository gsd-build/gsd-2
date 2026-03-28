/**
 * consecutive-complete-bootstraps.test.ts — Guards the Map-keyed counter invariant.
 *
 * _consecutiveCompleteBootstraps must be a Map<string, number> keyed by normalized
 * basePath rather than a single module-level numeric counter.  A plain `let` counter
 * is a global singleton that clobbers counters across concurrent sessions for different
 * projects.
 *
 * These tests parse auto-start.ts source so they fail at test time — before a PR
 * merges — if someone reverts the Map back to a scalar.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(import.meta.dirname, "..", "auto-start.ts");
const source = readFileSync(sourcePath, "utf-8");

test("_consecutiveCompleteBootstraps is declared as a Map, not a scalar", () => {
  const mapDecl = source.indexOf("const _consecutiveCompleteBootstraps = new Map");
  assert.ok(
    mapDecl > -1,
    "_consecutiveCompleteBootstraps must be declared as `const _consecutiveCompleteBootstraps = new Map` " +
      "— a scalar counter is a global singleton that clobbers concurrent sessions for different projects",
  );
});

test("_consecutiveCompleteBootstraps has no module-level let declaration", () => {
  const lines = source.split("\n");
  const violations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^let\s+_consecutiveCompleteBootstraps\b/.test(line)) {
      violations.push(`line ${i + 1}: ${line.trim()}`);
    }
  }

  assert.equal(
    violations.length,
    0,
    `auto-start.ts must not declare _consecutiveCompleteBootstraps as a module-level \`let\`.\n` +
      `Violations:\n${violations.join("\n")}`,
  );
});

test("_consecutiveCompleteBootstraps Map is typed with a string key", () => {
  // Expect Map<string, number> — the string key is the normalized basePath
  const typedDecl = source.indexOf("new Map<string, number>");
  assert.ok(
    typedDecl > -1,
    "_consecutiveCompleteBootstraps should be typed Map<string, number> to make the keying intent explicit",
  );
});
