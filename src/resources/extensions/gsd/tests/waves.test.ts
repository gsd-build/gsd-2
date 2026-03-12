/**
 * Unit tests for `computeWaves`.
 * Tests the pure function — no file I/O, no extension context.
 */

import { computeWaves } from "../waves.js";
import type { TaskPlanEntry } from "../types.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

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

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Create a minimal TaskPlanEntry with sensible defaults. */
function makeTask(overrides: Partial<TaskPlanEntry> & { id: string }): TaskPlanEntry {
  return {
    title: overrides.id,
    description: "",
    done: false,
    estimate: "10m",
    ...overrides,
  };
}

// ─── 1. Disjoint files → same wave ───────────────────────────────────────────

console.log("\n=== disjoint files → same wave ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01", files: ["a.ts", "b.ts"] }),
    makeTask({ id: "T02", files: ["c.ts", "d.ts"] }),
  ]);

  assertEq(waves.length, 1, "disjoint: single wave");
  assertEq(waves[0].length, 2, "disjoint: wave contains both tasks");
  assertEq(waves[0][0].id, "T01", "disjoint: first task is T01");
  assertEq(waves[0][1].id, "T02", "disjoint: second task is T02");
}

// ─── 2. Overlapping files → separate waves ──────────────────────────────────

console.log("\n=== overlapping files → separate waves ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01", files: ["shared.ts", "a.ts"] }),
    makeTask({ id: "T02", files: ["shared.ts", "b.ts"] }),
  ]);

  assertEq(waves.length, 2, "overlap: two waves");
  assertEq(waves[0].length, 1, "overlap: wave 0 has one task");
  assertEq(waves[1].length, 1, "overlap: wave 1 has one task");
  assertEq(waves[0][0].id, "T01", "overlap: wave 0 is T01");
  assertEq(waves[1][0].id, "T02", "overlap: wave 1 is T02");
}

// ─── 3. No files field → isolated wave ──────────────────────────────────────

console.log("\n=== no files field → isolated wave ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01" }),
    makeTask({ id: "T02" }),
  ]);

  assertEq(waves.length, 2, "no-files: two waves (each isolated)");
  assertEq(waves[0].length, 1, "no-files: wave 0 has one task");
  assertEq(waves[1].length, 1, "no-files: wave 1 has one task");
  assertEq(waves[0][0].id, "T01", "no-files: wave 0 is T01");
  assertEq(waves[1][0].id, "T02", "no-files: wave 1 is T02");
}

// ─── 4. Single task → single wave ──────────────────────────────────────────

console.log("\n=== single task → single wave ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01", files: ["foo.ts"] }),
  ]);

  assertEq(waves.length, 1, "single: one wave");
  assertEq(waves[0].length, 1, "single: wave has one task");
  assertEq(waves[0][0].id, "T01", "single: task is T01");
}

// ─── 5. Empty input → empty output ─────────────────────────────────────────

console.log("\n=== empty input → empty output ===");
{
  const waves = computeWaves([]);

  assertEq(waves.length, 0, "empty: no waves");
}

// ─── 6. Mixed: some with files, some without ───────────────────────────────

console.log("\n=== mixed: files and no-files ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01", files: ["a.ts"] }),
    makeTask({ id: "T02" }),                    // no files → isolated
    makeTask({ id: "T03", files: ["b.ts"] }),   // disjoint from T01
    makeTask({ id: "T04", files: ["a.ts"] }),   // conflicts with T01
  ]);

  // T01 → wave 0 (files: a.ts)
  // T02 → wave 1 (no files, isolated)
  // T03 → wave 0 would be first fit, but wave 0 already has T01 with no conflict → wave 0
  //        BUT wave 1 is an isolated (no-files) wave → skipped. Wave 0 has T01 with files [a.ts],
  //        T03 has [b.ts] → no conflict → fits in wave 0
  // Actually: wave 1 is the isolated wave for T02. It has waveFileSets[1] = [] and waves[1].length > 0,
  // so the loop skips it. T03 checks wave 0 → no conflict → placed in wave 0.
  // T04 → conflicts with T01 in wave 0 (a.ts). Wave 1 is isolated → skipped. New wave 2.

  assertEq(waves.length, 3, "mixed: three waves");
  assertEq(waves[0].length, 2, "mixed: wave 0 has T01 and T03");
  assertEq(waves[0][0].id, "T01", "mixed: wave 0 first is T01");
  assertEq(waves[0][1].id, "T03", "mixed: wave 0 second is T03");
  assertEq(waves[1].length, 1, "mixed: wave 1 has T02 (isolated)");
  assertEq(waves[1][0].id, "T02", "mixed: wave 1 is T02");
  assertEq(waves[2].length, 1, "mixed: wave 2 has T04");
  assertEq(waves[2][0].id, "T04", "mixed: wave 2 is T04");
}

// ─── 7. Path normalization ──────────────────────────────────────────────────

console.log("\n=== path normalization ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01", files: ["./src/foo.ts"] }),
    makeTask({ id: "T02", files: ["src/foo.ts"] }),
  ]);

  assertEq(waves.length, 2, "path-norm: two waves (./src/foo.ts == src/foo.ts)");
  assertEq(waves[0][0].id, "T01", "path-norm: wave 0 is T01");
  assertEq(waves[1][0].id, "T02", "path-norm: wave 1 is T02");
}

// ─── 8. Case insensitivity ─────────────────────────────────────────────────

console.log("\n=== case insensitivity ===");
{
  const waves = computeWaves([
    makeTask({ id: "T01", files: ["Src/Foo.ts"] }),
    makeTask({ id: "T02", files: ["src/foo.ts"] }),
  ]);

  assertEq(waves.length, 2, "case-insensitive: two waves (Src/Foo.ts == src/foo.ts)");
  assertEq(waves[0][0].id, "T01", "case-insensitive: wave 0 is T01");
  assertEq(waves[1][0].id, "T02", "case-insensitive: wave 1 is T02");
}

// ─── Results ────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed.");
}
