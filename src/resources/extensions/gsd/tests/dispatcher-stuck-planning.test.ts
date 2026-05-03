/**
 * dispatcher-stuck-planning.test.ts
 *
 * Verify that state.ts no longer imports disk PLAN.md tasks into the runtime
 * DB. PLAN.md is a projection; task rows must be created through DB-backed
 * planning/import APIs.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFile = join(__dirname, "..", "state.ts");

describe("dispatcher DB-authoritative planning boundary", () => {
  const source = readFileSync(sourceFile, "utf-8");

  test("does not import insertTask into state derivation", () => {
    assert.doesNotMatch(source, /import\s*\{[^}]*insertTask[^}]*\}\s*from/);
  });

  test("does not contain plan-file task reconciliation block", () => {
    assert.doesNotMatch(source, /dbTaskIds\.has\(t\.id\)/);
    assert.match(source, /Slice \$\{activeSlice\.id\} has no DB tasks/);
  });

  test("does not call insertTask from state derivation", () => {
    assert.doesNotMatch(source, /insertTask\(\{/);
  });

  test("documents markdown projections as non-authoritative", () => {
    assert.match(source, /Markdown files are projections only/);
  });
});
