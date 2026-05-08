/**
 * stale-slice-rows.test.ts
 *
 * Verify that state.ts no longer treats slice SUMMARY.md projections as
 * authority for DB slice status. Slice rows must be updated through DB-backed
 * completion/import APIs.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFile = join(__dirname, "..", "state.ts");

describe("stale slice row DB-authoritative boundary", () => {
  const source = readFileSync(sourceFile, "utf-8");

  test("does not import updateSliceStatus into state derivation", () => {
    assert.doesNotMatch(source, /import\s*\{[^}]*updateSliceStatus[^}]*\}\s*from/);
  });

  test("does not scan DB slice rows for disk SUMMARY reconciliation", () => {
    assert.doesNotMatch(source, /dbSlice/);
  });

  test("does not resolve slice SUMMARY to mutate DB state", () => {
    assert.doesNotMatch(source, /resolveSliceFile\(basePath,\s*mid,\s*dbSlice\.id,\s*["']SUMMARY["']\)/);
  });

  test("does not call updateSliceStatus from state derivation", () => {
    assert.doesNotMatch(source, /updateSliceStatus\(/);
  });

  test("documents markdown projections as non-authoritative", () => {
    assert.match(source, /Markdown files are projections only/);
  });
});
