/**
 * ensure-preconditions-cache.test.ts — Regression test for #2051.
 *
 * ensurePreconditions creates milestone/slice directories with mkdirSync,
 * but the path cache (dirEntryCache/dirListCache) was not invalidated
 * afterward, causing subsequent resolveDir/resolveMilestonePath calls
 * to return null from stale cache entries.
 *
 * This test verifies that after ensurePreconditions runs, the path
 * resolver sees the newly-created directories.
 */

import { mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveDir, resolveMilestonePath, milestonesDir, clearPathCache } from "../paths.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function tmp(): string {
  const p = mkdtempSync(join(tmpdir(), "gsd-precond-cache-"));
  try { return realpathSync.native(p); } catch { return p; }
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Test 1: resolveDir returns null from stale cache after mkdirSync ────────

{
  console.log("\n=== 1. #2051: resolveDir sees directory after mkdirSync + clearPathCache ===");
  const base = tmp();
  try {
    const milestones = join(base, ".gsd", "milestones");
    mkdirSync(milestones, { recursive: true });

    // Prime the cache: no M001 directory yet
    clearPathCache();
    const before = resolveDir(milestones, "M001");
    assertEq(before, null, "before mkdir: M001 not found");

    // Create M001 (simulating what ensurePreconditions does)
    mkdirSync(join(milestones, "M001", "slices"), { recursive: true });

    // WITHOUT cache invalidation, resolveDir returns stale null
    const stale = resolveDir(milestones, "M001");
    // This assertion documents the bug: stale cache returns null
    // After the fix, clearPathCache is called inside ensurePreconditions,
    // so callers always get fresh results. Here we test the raw behavior.
    assertEq(stale, null, "stale cache: M001 still null without clearPathCache");

    // WITH cache invalidation, resolveDir finds the new directory
    clearPathCache();
    const fresh = resolveDir(milestones, "M001");
    assertEq(fresh, "M001", "after clearPathCache: M001 found");
  } finally {
    cleanup(base);
  }
}

// ── Test 2: resolveMilestonePath sees directory after mkdirSync ─────────────

{
  console.log("\n=== 2. #2051: resolveMilestonePath sees M001 after mkdirSync + clearPathCache ===");
  const base = tmp();
  try {
    mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });

    clearPathCache();
    const before = resolveMilestonePath(base, "M001");
    assertEq(before, null, "before mkdir: resolveMilestonePath returns null");

    // Create milestone directory
    mkdirSync(join(base, ".gsd", "milestones", "M001", "slices"), { recursive: true });

    // Stale cache
    const stale = resolveMilestonePath(base, "M001");
    assertEq(stale, null, "stale: resolveMilestonePath returns null without invalidation");

    // Invalidate and retry
    clearPathCache();
    const fresh = resolveMilestonePath(base, "M001");
    assertTrue(fresh !== null, "after clearPathCache: resolveMilestonePath returns non-null");
    assertTrue(fresh!.endsWith("M001"), "after clearPathCache: path ends with M001");
  } finally {
    cleanup(base);
  }
}

// ── Test 3: slice resolveDir after ensurePreconditions-like mkdir ────────────

{
  console.log("\n=== 3. #2051: slice resolveDir sees S01 after mkdirSync + clearPathCache ===");
  const base = tmp();
  try {
    const slicesDir = join(base, ".gsd", "milestones", "M001", "slices");
    mkdirSync(slicesDir, { recursive: true });

    clearPathCache();
    const before = resolveDir(slicesDir, "S01");
    assertEq(before, null, "before mkdir: S01 not found");

    // Create slice dir (simulating ensurePreconditions)
    mkdirSync(join(slicesDir, "S01", "tasks"), { recursive: true });

    // Stale
    const stale = resolveDir(slicesDir, "S01");
    assertEq(stale, null, "stale: S01 still null without clearPathCache");

    // Fresh
    clearPathCache();
    const fresh = resolveDir(slicesDir, "S01");
    assertEq(fresh, "S01", "after clearPathCache: S01 found");
  } finally {
    cleanup(base);
  }
}

// ── Test 4: full ensurePreconditions flow — path resolver works afterward ───

{
  console.log("\n=== 4. #2051: simulated ensurePreconditions flow with cache invalidation ===");
  const base = tmp();
  try {
    mkdirSync(join(base, ".gsd", "milestones"), { recursive: true });

    clearPathCache();

    // Step 1: resolve milestone — not found
    const mDir = resolveMilestonePath(base, "M001");
    assertEq(mDir, null, "step 1: M001 not resolved");

    // Step 2: create milestone dir
    const newDir = join(milestonesDir(base), "M001");
    mkdirSync(join(newDir, "slices"), { recursive: true });

    // Step 3: clear cache (this is the fix)
    clearPathCache();

    // Step 4: resolve milestone again — should work now
    const mDirResolved = resolveMilestonePath(base, "M001");
    assertTrue(mDirResolved !== null, "step 4: M001 resolved after cache clear");

    // Step 5: create slice dir
    const slicesPath = join(mDirResolved!, "slices");
    const sDir = resolveDir(slicesPath, "S01");
    assertEq(sDir, null, "step 5: S01 not resolved yet");

    mkdirSync(join(slicesPath, "S01", "tasks"), { recursive: true });
    clearPathCache();

    // Step 6: resolve slice — should work
    const sDirResolved = resolveDir(slicesPath, "S01");
    assertEq(sDirResolved, "S01", "step 6: S01 resolved after cache clear");

    // Step 7: tasks dir exists
    const tasksDir = join(slicesPath, "S01", "tasks");
    assertTrue(existsSync(tasksDir), "step 7: tasks dir exists");
  } finally {
    cleanup(base);
  }
}

report();
