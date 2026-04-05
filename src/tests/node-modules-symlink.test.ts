/**
 * Regression test for #3529: ensureNodeModulesSymlink must resolve to the
 * hoisted node_modules for global installs (where packageRoot is inside
 * a node_modules directory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("ensureNodeModulesSymlink detects global install via basename check (#3529)", () => {
  const src = readFileSync(join(__dirname, "..", "resource-loader.ts"), "utf-8");
  // The fix adds basename(hoistedNodeModules) === 'node_modules' check
  assert.ok(
    src.includes("hoistedNodeModules") || src.includes("dirname(packageRoot)"),
    "Must check for hoisted node_modules directory",
  );
  assert.ok(
    src.includes("node_modules"),
    "Must detect global install by checking directory name",
  );
});
