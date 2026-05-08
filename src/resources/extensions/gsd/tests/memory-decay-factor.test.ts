// gsd-2 / memoryDecayFactor unit tests
//
// Pure-function boundary tests for the V28 time-decay scoring helper.
// The function maps last_hit_at → multiplier in [0.7, 1.0] used by
// queryMemoriesRanked to down-weight stale memories without fully suppressing
// them. These tests pin the contract:
//
//   - null / invalid / future timestamps → 1.0 (no decay penalty)
//   - 0 days ago → 1.0
//   - linear decay between 0 and 90 days
//   - 90+ days ago → 0.7 floor

import test from "node:test";
import assert from "node:assert/strict";

import { memoryDecayFactor } from "../memory-store.ts";

const DAY_MS = 86_400_000;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

test("memoryDecayFactor: null lastHitAt returns 1.0 (never-hit = no decay)", () => {
  assert.equal(memoryDecayFactor(null), 1.0);
});

test("memoryDecayFactor: invalid timestamp string returns 1.0 (defensive)", () => {
  assert.equal(memoryDecayFactor("not-a-date"), 1.0);
  assert.equal(memoryDecayFactor(""), 1.0);
});

test("memoryDecayFactor: future timestamp clamps to daysAgo=0 → 1.0", () => {
  // Clock skew or manual DB edits can yield future last_hit_at values.
  // The factor must stay within [0.7, 1.0] regardless.
  const future = new Date(Date.now() + 30 * DAY_MS).toISOString();
  const factor = memoryDecayFactor(future);
  assert.ok(factor <= 1.0, `factor must not exceed 1.0, got ${factor}`);
  assert.ok(factor >= 0.7, `factor must not fall below 0.7, got ${factor}`);
  assert.equal(factor, 1.0);
});

test("memoryDecayFactor: 0 days ago returns 1.0", () => {
  const factor = memoryDecayFactor(new Date().toISOString());
  // Tiny clock drift between now-string and Date.now() inside the function;
  // assert it's effectively 1.0 within float tolerance.
  assert.ok(Math.abs(factor - 1.0) < 1e-6, `expected ≈1.0, got ${factor}`);
});

test("memoryDecayFactor: 30 days ago returns ~0.90 (linear midpoint)", () => {
  // Formula: 1.0 - 0.3 * (30/90) = 1.0 - 0.1 = 0.90
  const factor = memoryDecayFactor(isoDaysAgo(30));
  assert.ok(Math.abs(factor - 0.90) < 1e-3, `expected ≈0.90, got ${factor}`);
});

test("memoryDecayFactor: 60 days ago returns ~0.80", () => {
  // Formula: 1.0 - 0.3 * (60/90) = 1.0 - 0.2 = 0.80
  const factor = memoryDecayFactor(isoDaysAgo(60));
  assert.ok(Math.abs(factor - 0.80) < 1e-3, `expected ≈0.80, got ${factor}`);
});

test("memoryDecayFactor: 90 days ago returns 0.70 (floor)", () => {
  const factor = memoryDecayFactor(isoDaysAgo(90));
  assert.ok(Math.abs(factor - 0.70) < 1e-3, `expected ≈0.70, got ${factor}`);
});

test("memoryDecayFactor: 180 days ago stays at 0.70 floor", () => {
  const factor = memoryDecayFactor(isoDaysAgo(180));
  assert.equal(factor, 0.70);
});

test("memoryDecayFactor: result always in [0.7, 1.0] for any input", () => {
  const samples: (string | null)[] = [
    null,
    "",
    "garbage",
    new Date(0).toISOString(),
    isoDaysAgo(0),
    isoDaysAgo(15),
    isoDaysAgo(45),
    isoDaysAgo(89),
    isoDaysAgo(91),
    isoDaysAgo(365),
    new Date(Date.now() + 365 * DAY_MS).toISOString(),
  ];
  for (const s of samples) {
    const f = memoryDecayFactor(s);
    assert.ok(f >= 0.7 && f <= 1.0, `factor out of [0.7, 1.0] for ${s}: ${f}`);
  }
});
