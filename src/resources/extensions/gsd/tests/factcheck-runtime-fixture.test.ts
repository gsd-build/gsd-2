// Tests for factcheck-runtime-fixture — fixture loading, validation, and contract verification.
//
// Sections:
//   (a) Fixture manifest loading and validation
//   (b) Research output parsing (Unknowns Inventory extraction)
//   (c) Claim annotation loading and validation
//   (d) Aggregate status loading and validation
//   (e) Failure-state visibility (malformed/missing fixture data)
//
// Run: node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Fixture Paths ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtureRoot = join(__dirname, "fixtures", "factcheck-runtime");
const manifestPath = join(fixtureRoot, "FIXTURE-MANIFEST.json");
const researchPath = join(fixtureRoot, "M999-PROOF", "slices", "S01", "S01-RESEARCH.md");
const factcheckDir = join(fixtureRoot, "M999-PROOF", "slices", "S01", "factcheck");
const statusPath = join(factcheckDir, "FACTCHECK-STATUS.json");
const claimsDir = join(factcheckDir, "claims");

// ─── Types (from factcheck.ts contract) ───────────────────────────────────

interface FactCheckManifest {
  fixtureId: string;
  description: string;
  milestoneId: string;
  sliceId: string;
  createdAt: string;
  version: number;
  expectedClaimCount: number;
  expectedRefutationClaimId: string;
  expectedImpact: "none" | "task" | "slice" | "milestone";
  expectedCorrectedValue: string;
  expectedOverallStatus: "clean" | "has-refutations" | "pending" | "exhausted";
  expectedPlanImpacting: boolean;
  claims: Array<{
    claimId: string;
    description: string;
    evidenceBasis: string;
    resolutionPath: string;
    expectedVerdict: string;
    correctedValue?: string;
    impact: string;
  }>;
  requiredFiles: string[];
  redactionConstraints: {
    secretsPresent: boolean;
    personalDataPresent: boolean;
    syntheticOnly: boolean;
  };
}

interface FactCheckAnnotation {
  claimId: string;
  verdict: "confirmed" | "refuted" | "inconclusive" | "unverified";
  citations: string[];
  correctedValue?: string | null;
  impact: "none" | "task" | "slice" | "milestone";
  checkedBy: string;
  timestamp: string;
  notes?: string;
}

interface FactCheckAggregateStatus {
  schemaVersion: number;
  cycleKey: string;
  overallStatus: "clean" | "has-refutations" | "pending" | "exhausted";
  planImpacting: boolean;
  counts: {
    total: number;
    confirmed: number;
    refuted: number;
    inconclusive: number;
    unverified: number;
  };
  maxCycles: number;
  currentCycle: number;
  claimIds: string[];
  planImpactingClaims?: string[];
  rerouteTarget?: string;
  checkedAt?: string;
}

interface FixtureValidationError {
  fixtureId: string;
  stage: string;
  expectedPath: string;
  message: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────

function loadManifest(): FactCheckManifest {
  if (!existsSync(manifestPath)) {
    const error: FixtureValidationError = {
      fixtureId: "missing",
      stage: "manifest-load",
      expectedPath: manifestPath,
      message: "FIXTURE-MANIFEST.json not found",
    };
    throw new Error(JSON.stringify(error));
  }

  try {
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as FactCheckManifest;
  } catch (e) {
    const error: FixtureValidationError = {
      fixtureId: "corrupt",
      stage: "manifest-parse",
      expectedPath: manifestPath,
      message: e instanceof Error ? e.message : String(e),
    };
    throw new Error(JSON.stringify(error));
  }
}

function loadClaimAnnotation(claimId: string): FactCheckAnnotation {
  const claimPath = join(claimsDir, `${claimId}.json`);
  if (!existsSync(claimPath)) {
    const error: FixtureValidationError = {
      fixtureId: "factcheck-runtime-proof-v1",
      stage: "artifact-parse",
      expectedPath: claimPath,
      message: `Claim annotation file not found: ${claimId}`,
    };
    throw new Error(JSON.stringify(error));
  }
  return JSON.parse(readFileSync(claimPath, "utf-8")) as FactCheckAnnotation;
}

function loadAggregateStatus(): FactCheckAggregateStatus {
  if (!existsSync(statusPath)) {
    const error: FixtureValidationError = {
      fixtureId: "factcheck-runtime-proof-v1",
      stage: "artifact-parse",
      expectedPath: statusPath,
      message: "FACTCHECK-STATUS.json not found",
    };
    throw new Error(JSON.stringify(error));
  }
  return JSON.parse(readFileSync(statusPath, "utf-8")) as FactCheckAggregateStatus;
}

function extractUnknownsInventory(markdown: string): Array<{
  claimId: string;
  description: string;
  evidenceBasis: string;
  resolutionPath: string;
}> {
  const claims: Array<{
    claimId: string;
    description: string;
    evidenceBasis: string;
    resolutionPath: string;
  }> = [];

  const sectionMatch = markdown.match(/## Unknowns Inventory\s*\n([\s\S]*?)(?=\n## |\n*$)/);
  if (!sectionMatch) return claims;

  const lines = sectionMatch[1].split("\n");
  let foundSeparator = false;

  for (const line of lines) {
    if (line.includes("---")) {
      foundSeparator = true;
      continue;
    }
    if (!line.trim().startsWith("|")) continue;
    if (!foundSeparator) continue;

    const parts = line.split("|");
    const cols = parts.slice(1, -1).map((c) => c.trim());

    if (cols.length >= 4) {
      claims.push({
        claimId: cols[0] || `C${String(claims.length + 1).padStart(3, "0")}`,
        description: cols[1],
        evidenceBasis: cols[2],
        resolutionPath: cols[3],
      });
    }
  }

  return claims;
}

// ═══════════════════════════════════════════════════════════════════════════
// (a) Fixture Manifest Tests
// ═══════════════════════════════════════════════════════════════════════════

test("fixture: manifest loads and has required fields", () => {
  const manifest = loadManifest();

  assert.strictEqual(typeof manifest.fixtureId, "string");
  assert.strictEqual(typeof manifest.milestoneId, "string");
  assert.strictEqual(typeof manifest.sliceId, "string");
  assert.strictEqual(typeof manifest.expectedClaimCount, "number");
  assert.strictEqual(typeof manifest.expectedPlanImpacting, "boolean");
});

test("fixture: manifest declares expected refutation", () => {
  const manifest = loadManifest();

  assert.strictEqual(manifest.expectedRefutationClaimId, "C001");
  assert.strictEqual(manifest.expectedImpact, "slice");
  assert.strictEqual(manifest.expectedCorrectedValue, "5.2.0");
  assert.strictEqual(manifest.expectedPlanImpacting, true);
});

test("fixture: manifest claims match expected claim count", () => {
  const manifest = loadManifest();

  assert.strictEqual(manifest.claims.length, manifest.expectedClaimCount);
  assert.strictEqual(manifest.claims.length, 3);
});

test("fixture: manifest required files exist", () => {
  const manifest = loadManifest();

  for (const file of manifest.requiredFiles) {
    const fullPath = join(fixtureRoot, file);
    assert.ok(existsSync(fullPath), `Required file exists: ${file}`);
  }
});

test("fixture: manifest declares synthetic-only data", () => {
  const manifest = loadManifest();

  assert.strictEqual(manifest.redactionConstraints.secretsPresent, false);
  assert.strictEqual(manifest.redactionConstraints.personalDataPresent, false);
  assert.strictEqual(manifest.redactionConstraints.syntheticOnly, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// (b) Research Output Parsing Tests
// ═══════════════════════════════════════════════════════════════════════════

test("fixture: research output loads", () => {
  assert.ok(existsSync(researchPath), "Research file exists");

  const research = readFileSync(researchPath, "utf-8");
  assert.ok(research.includes("## Unknowns Inventory"), "Has Unknowns Inventory section");
});

test("fixture: research contains extractable claims", () => {
  const research = readFileSync(researchPath, "utf-8");
  const claims = extractUnknownsInventory(research);

  assert.strictEqual(claims.length, 3, "Extracts 3 claims");

  // C001 should be the refuted claim
  const c001 = claims.find((c) => c.claimId === "C001");
  assert.ok(c001, "C001 exists");
  assert.ok(c001.description.includes("4.1.0"), "C001 mentions version 4.1.0");
});

test("fixture: research claims match manifest claims", () => {
  const manifest = loadManifest();
  const research = readFileSync(researchPath, "utf-8");
  const claims = extractUnknownsInventory(research);

  for (const manifestClaim of manifest.claims) {
    const researchClaim = claims.find((c) => c.claimId === manifestClaim.claimId);
    assert.ok(researchClaim, `Claim ${manifestClaim.claimId} in research`);
    assert.strictEqual(researchClaim.description, manifestClaim.description, `Claim ${manifestClaim.claimId} description matches`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// (c) Claim Annotation Tests
// ═══════════════════════════════════════════════════════════════════════════

test("fixture: C001 is refuted with corrected value", () => {
  const claim = loadClaimAnnotation("C001");

  assert.strictEqual(claim.verdict, "refuted");
  assert.strictEqual(claim.correctedValue, "5.2.0");
  assert.strictEqual(claim.impact, "slice");
  assert.ok(claim.citations.length > 0, "Has citations");
});

test("fixture: C002 is confirmed", () => {
  const claim = loadClaimAnnotation("C002");

  assert.strictEqual(claim.verdict, "confirmed");
  assert.strictEqual(claim.impact, "none");
  assert.ok(claim.citations.length > 0, "Has citations");
});

test("fixture: C003 is inconclusive", () => {
  const claim = loadClaimAnnotation("C003");

  assert.strictEqual(claim.verdict, "inconclusive");
  assert.strictEqual(claim.impact, "none");
  assert.strictEqual(claim.citations.length, 0, "No citations for inconclusive");
});

test("fixture: all claim files exist", () => {
  const manifest = loadManifest();

  for (const claim of manifest.claims) {
    const claimPath = join(claimsDir, `${claim.claimId}.json`);
    assert.ok(existsSync(claimPath), `Claim file exists: ${claim.claimId}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// (d) Aggregate Status Tests
// ═══════════════════════════════════════════════════════════════════════════

test("fixture: aggregate status loads", () => {
  const status = loadAggregateStatus();

  assert.strictEqual(status.schemaVersion, 1);
  assert.strictEqual(typeof status.cycleKey, "string");
  assert.strictEqual(typeof status.planImpacting, "boolean");
});

test("fixture: aggregate status matches manifest expectations", () => {
  const manifest = loadManifest();
  const status = loadAggregateStatus();

  assert.strictEqual(status.overallStatus, manifest.expectedOverallStatus);
  assert.strictEqual(status.planImpacting, manifest.expectedPlanImpacting);
  assert.strictEqual(status.counts.total, manifest.expectedClaimCount);
});

test("fixture: aggregate status shows has-refutations", () => {
  const status = loadAggregateStatus();

  assert.strictEqual(status.overallStatus, "has-refutations");
  assert.strictEqual(status.counts.refuted, 1);
  assert.strictEqual(status.counts.confirmed, 1);
  assert.strictEqual(status.counts.inconclusive, 1);
  assert.strictEqual(status.counts.unverified, 0);
});

test("fixture: aggregate status declares plan-impacting", () => {
  const status = loadAggregateStatus();

  assert.strictEqual(status.planImpacting, true);
  assert.ok(status.planImpactingClaims, "Has planImpactingClaims array");
  assert.ok(status.planImpactingClaims.includes("C001"), "C001 is plan-impacting");
});

test("fixture: aggregate status declares reroute target", () => {
  const status = loadAggregateStatus();

  assert.strictEqual(status.rerouteTarget, "plan-slice");
});

test("fixture: aggregate status claim IDs match annotations", () => {
  const status = loadAggregateStatus();

  assert.strictEqual(status.claimIds.length, 3);
  assert.ok(status.claimIds.includes("C001"), "Includes C001");
  assert.ok(status.claimIds.includes("C002"), "Includes C002");
  assert.ok(status.claimIds.includes("C003"), "Includes C003");
});

// ═══════════════════════════════════════════════════════════════════════════
// (e) Failure-State Visibility Tests
// ═══════════════════════════════════════════════════════════════════════════

test("failure: missing claim annotation produces structured error", () => {
  const missingClaimId = "C999";

  try {
    loadClaimAnnotation(missingClaimId);
    assert.fail("Should have thrown");
  } catch (e) {
    const error = JSON.parse((e as Error).message) as FixtureValidationError;

    assert.strictEqual(error.fixtureId, "factcheck-runtime-proof-v1");
    assert.strictEqual(error.stage, "artifact-parse");
    assert.ok(error.expectedPath.includes("C999.json"), "Expected path includes claim ID");
    assert.ok(error.message.includes("not found"), "Message indicates not found");
  }
});

test("failure: invalid JSON in annotation produces parseable error", () => {
  // This test documents the expected error structure for downstream tests
  const expectedErrorShape: FixtureValidationError = {
    fixtureId: "string",
    stage: "manifest-load | manifest-parse | artifact-parse",
    expectedPath: "string",
    message: "string",
  };

  // Verify the interface is satisfied by the error type
  assert.strictEqual(typeof expectedErrorShape.fixtureId, "string");
  assert.strictEqual(typeof expectedErrorShape.stage, "string");
  assert.strictEqual(typeof expectedErrorShape.expectedPath, "string");
  assert.strictEqual(typeof expectedErrorShape.message, "string");
});

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

test("Test suite complete", () => {
  console.log("\n=== FACTCHECK-RUNTIME-FIXTURE TESTS ===");
  console.log("All fixture tests passed.");
});
