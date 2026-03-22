/**
 * Integration Test — End-to-End Telemetry Pipeline Validation
 *
 * Exercises the full M007 telemetry pipeline:
 *   1. Load concept fixtures via fixture harness
 *   2. Extract fact-check metrics from fixture state trees
 *   3. Verify extracted metrics match manifest contract
 *   4. Build synthetic MetricsLedger objects
 *   5. Run through summarizeMetrics and formatComparisonTable
 *   6. Write durable validation report for future milestone verification
 *
 * @module integration-metrics.test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { loadFixture, readFixtureManifest, type FixtureManifest } from "./fixture-harness.js";
import { extractFactCheckMetrics, type MetricsLedger, type UnitMetrics, type FactCheckMetrics } from "../metrics.js";
import { summarizeMetrics, formatComparisonTable } from "../summarize-metrics.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FixtureResult {
  id: string;
  manifest: FixtureManifest;
  extractedMetrics: FactCheckMetrics | null;
  manifestMatch: boolean;
  error?: string;
}

interface ValidationReport {
  timestamp: string;
  fixtures: FixtureResult[];
  comparisonTable: string;
  allPassed: boolean;
}

// ─── Test Helpers ──────────────────────────────────────────────────────────────

/** Create a minimal MetricsLedger with the given units. */
function makeLedger(units: UnitMetrics[]): MetricsLedger {
  return {
    version: 1,
    projectStartedAt: Date.now() - 3600000,
    units,
  };
}

/** Create a synthetic UnitMetrics entry from extracted fact-check data. */
function makeUnitFromFixture(
  fixtureId: string,
  manifest: FixtureManifest,
  factCheck: FactCheckMetrics | null,
  interventionsCount: number
): UnitMetrics {
  const now = Date.now();
  const startedAt = now - 1800000; // 30 min ago
  const finishedAt = now - 900000; // 15 min ago

  // Use manifest's expected wallClockMs flag to set a realistic duration
  const wallClockMs = manifest.expectedTelemetryShape.wallClockMs ? 900000 : 0;

  return {
    type: "execute-task",
    id: `${manifest.milestoneId}/${manifest.sliceId}/T01`,
    model: "claude-3-sonnet",
    startedAt,
    finishedAt,
    tokens: {
      input: 50000,
      output: 25000,
      cacheRead: 0,
      cacheWrite: 0,
      total: 75000,
    },
    cost: 0.75,
    toolCalls: 10,
    assistantMessages: 5,
    userMessages: 3,
    interventions: {
      blocker: interventionsCount,
      correction: 0,
      redirect: 0,
    },
    factCheck: factCheck ?? undefined,
    wallClockMs,
  };
}

/** Verify extracted metrics match the manifest's expectedTelemetryShape.factCheck. */
function verifyFactCheckMatch(
  extracted: FactCheckMetrics | null,
  expected: FixtureManifest["expectedTelemetryShape"]["factCheck"]
): { match: boolean; error?: string } {
  if (!extracted) {
    return { match: false, error: "No metrics extracted (factcheck directory not found)" };
  }

  const mismatches: string[] = [];

  if (extracted.claimsChecked !== expected.claimsChecked) {
    mismatches.push(`claimsChecked: expected ${expected.claimsChecked}, got ${extracted.claimsChecked}`);
  }
  if (extracted.verified !== expected.verified) {
    mismatches.push(`verified: expected ${expected.verified}, got ${extracted.verified}`);
  }
  if (extracted.refuted !== expected.refuted) {
    mismatches.push(`refuted: expected ${expected.refuted}, got ${extracted.refuted}`);
  }
  if (extracted.inconclusive !== expected.inconclusive) {
    mismatches.push(`inconclusive: expected ${expected.inconclusive}, got ${extracted.inconclusive}`);
  }

  if (mismatches.length > 0) {
    return { match: false, error: mismatches.join("; ") };
  }

  return { match: true };
}

/** Write the validation report to disk. */
function writeValidationReport(report: ValidationReport, targetDir: string): void {
  const reportPath = join(targetDir, "M007-VALIDATION-REPORT.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

describe("End-to-End Telemetry Pipeline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-integration-"));
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loads both fixtures and extracts matching fact-check metrics", () => {
    const fixtureIds = ["low-unknown", "high-unknown"];
    const results: FixtureResult[] = [];

    for (const fixtureId of fixtureIds) {
      // Read manifest first to get expected values
      const manifest = readFixtureManifest(fixtureId);

      // Load fixture into temp directory
      const loadedManifest = loadFixture(fixtureId, tmpDir);

      // Extract fact-check metrics from the loaded state tree
      const sliceDir = join(tmpDir, "state", "slices", loadedManifest.sliceId);
      const extracted = extractFactCheckMetrics(sliceDir);

      // Verify extracted metrics match manifest contract
      const { match, error } = verifyFactCheckMatch(extracted, manifest.expectedTelemetryShape.factCheck);

      results.push({
        id: fixtureId,
        manifest,
        extractedMetrics: extracted,
        manifestMatch: match,
        error,
      });
    }

    // Both fixtures should have matched their manifest contracts
    for (const result of results) {
      assert.ok(
        result.manifestMatch,
        `Fixture ${result.id} should match manifest: ${result.error ?? "unknown error"}`
      );
      assert.ok(result.extractedMetrics, `Fixture ${result.id} should have extracted metrics`);
    }

    // Verify specific expected values for each fixture
    const lowUnknown = results.find(r => r.id === "low-unknown");
    assert.ok(lowUnknown, "Should have low-unknown result");
    assert.equal(lowUnknown.extractedMetrics!.claimsChecked, 4, "low-unknown should have 4 claims checked");
    assert.equal(lowUnknown.extractedMetrics!.verified, 3, "low-unknown should have 3 verified");
    assert.equal(lowUnknown.extractedMetrics!.refuted, 0, "low-unknown should have 0 refuted");
    assert.equal(lowUnknown.extractedMetrics!.inconclusive, 1, "low-unknown should have 1 inconclusive");

    const highUnknown = results.find(r => r.id === "high-unknown");
    assert.ok(highUnknown, "Should have high-unknown result");
    assert.equal(highUnknown.extractedMetrics!.claimsChecked, 5, "high-unknown should have 5 claims checked");
    assert.equal(highUnknown.extractedMetrics!.verified, 1, "high-unknown should have 1 verified");
    assert.equal(highUnknown.extractedMetrics!.refuted, 2, "high-unknown should have 2 refuted");
    assert.equal(highUnknown.extractedMetrics!.inconclusive, 1, "high-unknown should have 1 inconclusive");
  });

  it("builds ledgers from fixtures and produces valid comparison table", () => {
    const fixtureIds = ["low-unknown", "high-unknown"];

    // Process each fixture
    const ledgerInputs: { label: string; ledger: MetricsLedger }[] = [];

    for (const fixtureId of fixtureIds) {
      const manifest = loadFixture(fixtureId, tmpDir);
      const sliceDir = join(tmpDir, "state", "slices", manifest.sliceId);
      const extracted = extractFactCheckMetrics(sliceDir);

      // Get intervention count from manifest
      const interventionsCount = manifest.expectedTelemetryShape.interventions.minBlockers ?? 0;

      // Build synthetic unit
      const unit = makeUnitFromFixture(fixtureId, manifest, extracted, interventionsCount);

      // Assemble ledger
      const ledger = makeLedger([unit]);

      ledgerInputs.push({ label: fixtureId, ledger });
    }

    // Run through summary utility
    const comparison = summarizeMetrics(ledgerInputs);

    // Verify comparison structure
    assert.ok(comparison.rows.length > 0, "Should have at least one phase row");
    assert.equal(comparison.totals.length, 2, "Should have 2 ledger totals");

    // Format comparison table
    const table = formatComparisonTable(comparison);

    // Verify table contains both fixture labels
    assert.ok(table.includes("low-unknown"), "Table should include low-unknown label");
    assert.ok(table.includes("high-unknown"), "Table should include high-unknown label");

    // Verify table contains phase data
    assert.ok(table.includes("execution"), "Table should include execution phase");

    // Verify table contains fact-check numbers
    assert.ok(table.includes("4"), "Table should include fact-check count for low-unknown");
    assert.ok(table.includes("5"), "Table should include fact-check count for high-unknown");
  });

  it("writes validation report with structured proof data", () => {
    const fixtureIds = ["low-unknown", "high-unknown"];
    const results: FixtureResult[] = [];

    for (const fixtureId of fixtureIds) {
      const manifest = loadFixture(fixtureId, tmpDir);
      const sliceDir = join(tmpDir, "state", "slices", manifest.sliceId);
      const extracted = extractFactCheckMetrics(sliceDir);
      const { match, error } = verifyFactCheckMatch(extracted, manifest.expectedTelemetryShape.factCheck);

      results.push({
        id: fixtureId,
        manifest,
        extractedMetrics: extracted,
        manifestMatch: match,
        error,
      });
    }

    // Build ledgers and comparison
    const ledgerInputs: { label: string; ledger: MetricsLedger }[] = [];

    for (const result of results) {
      const interventionsCount = result.manifest.expectedTelemetryShape.interventions.minBlockers ?? 0;
      const unit = makeUnitFromFixture(result.id, result.manifest, result.extractedMetrics, interventionsCount);
      const ledger = makeLedger([unit]);
      ledgerInputs.push({ label: result.id, ledger });
    }

    const comparison = summarizeMetrics(ledgerInputs);
    const comparisonTable = formatComparisonTable(comparison);

    // Write validation report
    const report: ValidationReport = {
      timestamp: new Date().toISOString(),
      fixtures: results,
      comparisonTable,
      allPassed: results.every(r => r.manifestMatch),
    };

    writeValidationReport(report, tmpDir);

    // Verify report was written
    const reportPath = join(tmpDir, "M007-VALIDATION-REPORT.json");
    assert.ok(existsSync(reportPath), "Validation report should be written");

    // Verify report content
    const reportRaw = readFileSync(reportPath, "utf-8");
    const loadedReport = JSON.parse(reportRaw) as ValidationReport;

    assert.ok(loadedReport.timestamp, "Report should have timestamp");
    assert.equal(loadedReport.fixtures.length, 2, "Report should have 2 fixture results");
    assert.ok(loadedReport.allPassed, "Report should indicate all passed");
    assert.ok(loadedReport.comparisonTable.length > 0, "Report should have comparison table");

    // Verify each fixture result
    for (const fixture of loadedReport.fixtures) {
      assert.ok(fixture.id, "Fixture result should have id");
      assert.ok(fixture.manifestMatch, `Fixture ${fixture.id} should have manifestMatch: true`);
      assert.ok(fixture.extractedMetrics, `Fixture ${fixture.id} should have extractedMetrics`);
    }
  });

  it("handles missing factcheck directory gracefully", () => {
    // Create a temp directory without factcheck data
    const emptySliceDir = join(tmpDir, "state", "slices", "S99");

    const extracted = extractFactCheckMetrics(emptySliceDir);

    // Should return null for missing factcheck directory
    assert.equal(extracted, null, "Should return null for missing factcheck directory");

    // Verify this would produce a manifest mismatch
    const expected = { claimsChecked: 5, verified: 3, refuted: 1, inconclusive: 1 };
    const { match, error } = verifyFactCheckMatch(extracted, expected);

    assert.equal(match, false, "Should indicate mismatch");
    assert.ok(error?.includes("No metrics extracted"), "Error should mention missing metrics");
  });
});

describe("Validation Report Failure Path", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-validation-"));
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("writes report with manifestMatch: false and error field on mismatch", () => {
    // Simulate a mismatch scenario
    const mockExtracted: FactCheckMetrics = {
      claimsChecked: 3, // Wrong! Manifest expects 4
      verified: 2,      // Wrong! Manifest expects 3
      refuted: 0,
      inconclusive: 1,
      scoutTokens: 3000,
    };

    const expected = { claimsChecked: 4, verified: 3, refuted: 0, inconclusive: 1 };
    const { match, error } = verifyFactCheckMatch(mockExtracted, expected);

    assert.equal(match, false, "Should indicate mismatch");
    assert.ok(error, "Should have error message");
    assert.ok(error!.includes("claimsChecked: expected 4, got 3"), "Error should describe claimsChecked mismatch");
    assert.ok(error!.includes("verified: expected 3, got 2"), "Error should describe verified mismatch");

    // Write a validation report with the mismatch
    const report: ValidationReport = {
      timestamp: new Date().toISOString(),
      fixtures: [{
        id: "test-fixture",
        manifest: {} as FixtureManifest, // Simplified for this test
        extractedMetrics: mockExtracted,
        manifestMatch: false,
        error,
      }],
      comparisonTable: "_No comparison available._\n",
      allPassed: false,
    };

    writeValidationReport(report, tmpDir);

    // Verify the report structure
    const reportPath = join(tmpDir, "M007-VALIDATION-REPORT.json");
    const loaded = JSON.parse(readFileSync(reportPath, "utf-8")) as ValidationReport;

    assert.equal(loaded.allPassed, false, "Report should indicate not all passed");
    assert.equal(loaded.fixtures[0].manifestMatch, false, "Fixture should have manifestMatch: false");
    assert.ok(loaded.fixtures[0].error, "Fixture should have error field");
  });
});
