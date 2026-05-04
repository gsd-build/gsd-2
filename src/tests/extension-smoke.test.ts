/**
 * Extension Smoke Tests
 *
 * Verifies every bundled extension can be imported without throwing.
 * Catches missing imports, circular dependencies, bad top-level code,
 * and module resolution failures that tsc alone cannot detect (since
 * extensions are loaded at runtime via jiti, not compiled by tsc).
 *
 * This test dynamically discovers all extension entry points using the
 * same discovery logic as the loader, so new extensions are automatically
 * covered without updating this file.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");
const extensionsDir = join(projectRoot, "src", "resources", "extensions");

// Extensions that can't be smoke-tested in a plain Node process.
// Each entry documents WHY so we can remove it when the underlying issue is fixed.
const SKIP_EXTENSIONS = new Set([
  // core.js is a pre-compiled file (no .ts source) — the resolve-ts test hook
  // rewrites .js→.ts imports and fails because core.ts doesn't exist.
  // Works fine at runtime via jiti which loads core.js directly.
  "browser-tools",
]);

test("all bundled extensions can be imported without throwing", async () => {
  const { discoverExtensionEntryPaths } = await import("../resource-loader.ts");
  const entryPaths = discoverExtensionEntryPaths(extensionsDir);

  assert.ok(entryPaths.length >= 10, `expected >=10 extensions, found ${entryPaths.length}`);

  const failures: { path: string; error: string }[] = [];
  let skipped = 0;

  for (const entryPath of entryPaths) {
    const relPath = entryPath.slice(extensionsDir.length + 1);
    const extName = relPath.split(/[/\\]/)[0].replace(/\.ts$/, "");

    if (SKIP_EXTENSIONS.has(extName)) {
      skipped++;
      continue;
    }

    try {
      await import(pathToFileURL(entryPath).href);
    } catch (err) {
      failures.push({
        path: relPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failures.length > 0) {
    const report = failures
      .map((f) => `  ${f.path}: ${f.error}`)
      .join("\n");
    assert.fail(
      `${failures.length}/${entryPaths.length - skipped} extensions failed to import:\n${report}`,
    );
  }
});
