/**
 * Extension loading performance test
 *
 * Regression test for https://github.com/gsd-build/gsd-2/issues/2108
 *
 * Verifies that loading multiple extensions sharing common dependencies
 * does NOT re-compile those dependencies for each extension. The jiti
 * module cache must be shared across extension loads so that shared
 * modules are compiled once.
 *
 * Uses the built dist/ (not raw TS source) because pi-coding-agent uses
 * TypeScript features unsupported by --experimental-strip-types.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// Import loadExtensions from the compiled dist (it IS re-exported from the
// core/extensions barrel but not from the top-level index).
const loaderPath = join(
  fileURLToPath(import.meta.url), "..", "..", "..",
  "packages", "pi-coding-agent", "dist", "core", "extensions", "loader.js",
);

test("loadExtensions shares module cache across extensions (perf regression #2108)", async () => {
  const { loadExtensions } = await import(loaderPath);

  // Create a temp directory with two extensions that import a shared helper
  const tmp = mkdtempSync(join(tmpdir(), "gsd-perf-test-"));

  try {
    // Shared helper module
    const sharedDir = join(tmp, "shared");
    mkdirSync(sharedDir, { recursive: true });
    writeFileSync(
      join(sharedDir, "helper.ts"),
      `export const SHARED_VALUE = "shared-${Date.now()}";\n`,
    );

    // Extension A — imports the shared helper
    const extADir = join(tmp, "ext-a");
    mkdirSync(extADir, { recursive: true });
    writeFileSync(
      join(extADir, "index.ts"),
      `import { SHARED_VALUE } from "${join(sharedDir, "helper.ts").replace(/\\/g, "/")}";\n` +
      `export default function(api: any) {\n` +
      `  api.registerCommand("ext-a-cmd", { description: "test A " + SHARED_VALUE, handler: async () => {} });\n` +
      `}\n`,
    );

    // Extension B — imports the same shared helper
    const extBDir = join(tmp, "ext-b");
    mkdirSync(extBDir, { recursive: true });
    writeFileSync(
      join(extBDir, "index.ts"),
      `import { SHARED_VALUE } from "${join(sharedDir, "helper.ts").replace(/\\/g, "/")}";\n` +
      `export default function(api: any) {\n` +
      `  api.registerCommand("ext-b-cmd", { description: "test B " + SHARED_VALUE, handler: async () => {} });\n` +
      `}\n`,
    );

    const paths = [join(extADir, "index.ts"), join(extBDir, "index.ts")];
    const start = Date.now();
    const result = await loadExtensions(paths, tmp);
    const elapsed = Date.now() - start;

    // Both extensions should load without errors
    assert.strictEqual(result.errors.length, 0, `Extension errors: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.extensions.length, 2, "Expected 2 extensions to load");

    // With shared jiti cache, loading 2 trivial extensions that share a
    // dependency should complete in well under 5 seconds.
    assert.ok(
      elapsed < 5000,
      `Extension loading took ${elapsed}ms — expected < 5000ms. ` +
      `This suggests jiti module caching is not shared across extensions.`,
    );
  } finally {
    try { rmSync(tmp, { recursive: true, force: true, maxRetries: 3 }); } catch { /* cleanup */ }
  }
});

test("bundled extensions load in parallel within a reasonable time budget", async () => {
  // This is the real-world regression test: load actual bundled extensions
  // and assert total time is under a budget. The budget is generous (15s)
  // to avoid flaking, but without the shared-cache fix, loading 19+ extensions
  // with separate jiti instances can easily exceed this on cold starts.
  const { loadExtensions } = await import(loaderPath);
  const { discoverExtensionEntryPaths } = await import("../resource-loader.ts");

  const projectRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");
  const extensionsDir = join(projectRoot, "src", "resources", "extensions");

  const entryPaths = discoverExtensionEntryPaths(extensionsDir);
  assert.ok(entryPaths.length >= 5, `Expected >= 5 extensions, found ${entryPaths.length}`);

  const start = Date.now();
  const result = await loadExtensions(entryPaths, process.cwd());
  const elapsed = Date.now() - start;

  // Some extensions may fail in test env (missing native deps etc.), that's OK.
  // We care about timing, not whether every extension is functional.
  assert.ok(
    result.extensions.length > 0,
    "Expected at least one extension to load successfully",
  );

  // Budget: 15s is generous. Before the fix, this could take 20-30s on cold runs.
  // After the fix (shared jiti cache), typical time is 3-8s.
  assert.ok(
    elapsed < 15000,
    `Bundled extension loading took ${elapsed}ms — expected < 15000ms. ` +
    `This may indicate a regression in extension loading performance (see #2108).`,
  );
});
