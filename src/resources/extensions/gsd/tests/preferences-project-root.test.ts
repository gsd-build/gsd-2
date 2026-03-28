/**
 * Tests that loadEffectiveGSDPreferences / loadProjectGSDPreferences use the
 * supplied projectRoot to locate PREFERENCES.md rather than process.cwd().
 *
 * Regression guard for #2985.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectGSDPreferences, loadEffectiveGSDPreferences } from "../preferences.ts";
import { _clearGsdRootCache } from "../paths.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTmpProject(prefsContent: string): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-prefs-root-"));
  const gsd = join(base, ".gsd");
  mkdirSync(gsd, { recursive: true });
  writeFileSync(join(gsd, "PREFERENCES.md"), prefsContent);
  return base;
}

// ── loadProjectGSDPreferences ─────────────────────────────────────────────────

test("loadProjectGSDPreferences: explicit projectRoot reads PREFERENCES.md from that dir", () => {
  const projectRoot = makeTmpProject("---\nversion: 1\nuat_dispatch: true\n---\n");
  try {
    _clearGsdRootCache();
    const loaded = loadProjectGSDPreferences(projectRoot);
    assert.ok(loaded !== null, "should find PREFERENCES.md in the given projectRoot");
    assert.equal(loaded!.preferences.uat_dispatch, true);
    assert.ok(
      loaded!.path.startsWith(projectRoot),
      `path ${loaded!.path} should be under projectRoot ${projectRoot}`,
    );
  } finally {
    _clearGsdRootCache();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("loadProjectGSDPreferences: does NOT read from process.cwd() when explicit projectRoot is given", () => {
  // Use a temp dir that has no PREFERENCES.md at all.
  const emptyRoot = mkdtempSync(join(tmpdir(), "gsd-prefs-empty-"));
  try {
    _clearGsdRootCache();
    // process.cwd() is the repo root which may or may not have a PREFERENCES.md,
    // but emptyRoot definitely does not.
    const loaded = loadProjectGSDPreferences(emptyRoot);
    assert.equal(loaded, null, "should return null when no PREFERENCES.md under projectRoot");
  } finally {
    _clearGsdRootCache();
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test("loadProjectGSDPreferences: falls back to process.cwd() when no projectRoot given", () => {
  // We cannot easily assert *which* project root is used without controlling
  // process.cwd(), but we can assert that calling without an argument doesn't
  // throw and returns either null or a LoadedGSDPreferences object.
  _clearGsdRootCache();
  let threw = false;
  try {
    const result = loadProjectGSDPreferences();
    // result is null or a valid object — both are acceptable
    assert.ok(result === null || typeof result === "object");
  } catch {
    threw = true;
  } finally {
    _clearGsdRootCache();
  }
  assert.equal(threw, false, "loadProjectGSDPreferences() without args must not throw");
});

// ── loadEffectiveGSDPreferences ───────────────────────────────────────────────

test("loadEffectiveGSDPreferences: explicit projectRoot is forwarded to project prefs lookup", () => {
  const projectRoot = makeTmpProject("---\nversion: 1\nuat_dispatch: false\n---\n");
  try {
    _clearGsdRootCache();
    const loaded = loadEffectiveGSDPreferences(projectRoot);
    // If no global preferences exist the function may return null (that's fine),
    // but if it does return something, the path must reference our projectRoot.
    if (loaded !== null) {
      // uat_dispatch from the project prefs should be visible in merged result
      // only if project prefs were actually read from projectRoot.
      assert.ok(
        loaded.path.startsWith(projectRoot) || loaded.preferences.uat_dispatch === false,
        "effective preferences should reflect the supplied projectRoot",
      );
    }
  } finally {
    _clearGsdRootCache();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("loadEffectiveGSDPreferences: different roots load independent project preferences", () => {
  const rootA = makeTmpProject("---\nversion: 1\nuat_dispatch: true\n---\n");
  const rootB = makeTmpProject("---\nversion: 1\nuat_dispatch: false\n---\n");
  try {
    _clearGsdRootCache();
    const loadedA = loadProjectGSDPreferences(rootA);
    _clearGsdRootCache();
    const loadedB = loadProjectGSDPreferences(rootB);

    assert.ok(loadedA !== null, "rootA should have preferences");
    assert.ok(loadedB !== null, "rootB should have preferences");
    assert.equal(loadedA!.preferences.uat_dispatch, true, "rootA: uat_dispatch=true");
    assert.equal(loadedB!.preferences.uat_dispatch, false, "rootB: uat_dispatch=false");
    assert.notEqual(loadedA!.path, loadedB!.path, "paths must differ between roots");
  } finally {
    _clearGsdRootCache();
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});
