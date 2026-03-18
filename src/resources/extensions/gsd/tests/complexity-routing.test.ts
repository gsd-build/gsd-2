/**
 * Complexity Routing — unit tests for M004/S03.
 *
 * Tests complexity classification and dispatch integration.
 * Uses source-level checks for the classifier module and preference wiring.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const preferencesSrc = readFileSync(join(__dirname, "..", "preferences.ts"), "utf-8");
const complexitySrc = readFileSync(join(__dirname, "..", "complexity-classifier.ts"), "utf-8");

// ═══════════════════════════════════════════════════════════════════════════
// Model Config — execution_simple
// ═══════════════════════════════════════════════════════════════════════════

test("preferences: GSDModelConfig includes execution_simple field", () => {
  const v1Match = preferencesSrc.match(/interface GSDModelConfig\s*\{[^}]*execution_simple/);
  assert.ok(v1Match, "GSDModelConfig should have execution_simple field");
  const v2Match = preferencesSrc.match(/interface GSDModelConfigV2\s*\{[^}]*execution_simple/);
  assert.ok(v2Match, "GSDModelConfigV2 should have execution_simple field");
});

test("preferences: budget profile sets execution_simple model", () => {
  const budgetIdx = preferencesSrc.indexOf('case "budget":');
  const balancedIdx = preferencesSrc.indexOf('case "balanced":');
  const budgetBlock = preferencesSrc.slice(budgetIdx, balancedIdx);
  assert.ok(budgetBlock.includes("execution_simple:"), "budget profile should set execution_simple");
});

test("preferences: resolveModelWithFallbacksForUnit handles execute-task-simple", () => {
  assert.ok(
    preferencesSrc.includes('"execute-task-simple"'),
    "should have execute-task-simple case in model resolution",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Classifier Module Structure
// ═══════════════════════════════════════════════════════════════════════════

test("complexity: module exports classifyUnitComplexity function", () => {
  assert.ok(
    complexitySrc.includes("export function classifyUnitComplexity"),
    "should export classifyUnitComplexity",
  );
});

test("complexity: module exports ComplexityTier type", () => {
  assert.ok(
    complexitySrc.includes("export type ComplexityTier"),
    "should export ComplexityTier type",
  );
});

test("complexity: module exports tierLabel function", () => {
  assert.ok(
    complexitySrc.includes("export function tierLabel"),
    "should export tierLabel for dashboard display",
  );
});

test("complexity: module exports tierOrdinal function", () => {
  assert.ok(
    complexitySrc.includes("export function tierOrdinal"),
    "should export tierOrdinal for tier comparison",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Unit Complexity Classification (from #579 — combined)
// ═══════════════════════════════════════════════════════════════════════════

test("unit-classify: classifyUnitComplexity is exported", () => {
  assert.ok(
    complexitySrc.includes("export function classifyUnitComplexity"),
    "should export classifyUnitComplexity",
  );
});

test("unit-classify: unit type tier mapping exists", () => {
  assert.ok(complexitySrc.includes("UNIT_TYPE_TIERS"), "should have unit type tier mapping");
  assert.ok(complexitySrc.includes('"complete-slice": "light"'), "complete-slice should be light");
  assert.ok(complexitySrc.includes('"replan-slice": "heavy"'), "replan-slice should be heavy");
});

test("unit-classify: hook units default to light", () => {
  assert.ok(
    complexitySrc.includes('startsWith("hook/")') && complexitySrc.includes('"light"'),
    "hook units should default to light tier",
  );
});

test("unit-classify: budget pressure has graduated thresholds", () => {
  assert.ok(complexitySrc.includes("budgetPct >= 0.9"), "should have 90% threshold");
  assert.ok(complexitySrc.includes("budgetPct >= 0.75"), "should have 75% threshold");
  assert.ok(complexitySrc.includes("budgetPct < 0.5"), "should skip below 50%");
});

test("unit-classify: tierLabel function exists", () => {
  assert.ok(
    complexitySrc.includes("export function tierLabel") ||
    complexitySrc.includes("export { tierLabel"),
    "should export tierLabel for dashboard display",
  );
});
