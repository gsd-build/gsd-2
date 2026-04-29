/**
 * Unit tests for the EVAL-REVIEW frontmatter schema and parser.
 *
 * Schema is the single source of truth for the machine-readable contract
 * between the auditor agent (writes EVAL-REVIEW.md) and downstream
 * consumers (`/gsd ship` pre-warning, future `/gsd eval-fix`). Regex over
 * LLM prose is explicitly forbidden — every consumer reads the validated
 * frontmatter only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EvalReviewFrontmatter,
  computeOverallScore,
  deriveCounts,
  extractFrontmatterRaw,
  parseEvalReviewFrontmatter,
} from "../eval-review-schema.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function buildFrontmatterText(overrides: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    schema: "eval-review/v1",
    verdict: "PRODUCTION_READY",
    coverage_score: "85",
    infrastructure_score: "80",
    overall_score: "83",
    generated: "2026-04-28T14:00:00Z",
    slice: "S07",
    milestone: "M001-eh88as",
    ...overrides,
  };
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) lines.push(`${k}: ${v}`);
  lines.push("gaps: []");
  lines.push("counts:");
  lines.push("  blocker: 0");
  lines.push("  major: 0");
  lines.push("  minor: 0");
  lines.push("---");
  lines.push("");
  lines.push("# Free-form body — never parsed");
  return lines.join("\n");
}

const HAPPY_PATH_FRONTMATTER = [
  "---",
  "schema: eval-review/v1",
  "verdict: PRODUCTION_READY",
  "coverage_score: 78",
  "infrastructure_score: 92",
  "overall_score: 84",
  "generated: 2026-04-28T14:00:00Z",
  "slice: S07",
  "milestone: M001-eh88as",
  "gaps:",
  "  - id: G01",
  "    dimension: observability",
  "    severity: major",
  "    description: \"No structured trace ID propagation between LLM call and post-processing.\"",
  "    evidence: \"src/llm/call.ts:42 logs latency only; no traceId emitted to sink.\"",
  "    suggested_fix: \"Pass ctx.traceId into emitLatencyMetric() and persist alongside the latency event.\"",
  "counts:",
  "  blocker: 0",
  "  major: 1",
  "  minor: 0",
  "---",
  "",
  "# Detailed analysis",
  "Free-form prose body. Never parsed.",
].join("\n");

// ─── extractFrontmatterRaw ────────────────────────────────────────────────────

describe("extractFrontmatterRaw", () => {
  it("returns the YAML content between --- delimiters", () => {
    const result = extractFrontmatterRaw("---\nfoo: bar\n---\nbody");
    assert.deepEqual(result, { yaml: "foo: bar" });
  });

  it("errors when the first line is not ---", () => {
    const result = extractFrontmatterRaw("foo: bar\n---\nbody");
    assert.ok("error" in result);
  });

  it("errors when no closing --- is found", () => {
    const result = extractFrontmatterRaw("---\nfoo: bar\nbody");
    assert.ok("error" in result);
  });

  it("handles CRLF line endings", () => {
    const result = extractFrontmatterRaw("---\r\nfoo: bar\r\n---\r\nbody");
    assert.deepEqual(result, { yaml: "foo: bar" });
  });
});

// ─── parseEvalReviewFrontmatter — happy path ──────────────────────────────────

describe("parseEvalReviewFrontmatter — happy path", () => {
  it("parses a valid frontmatter into typed data", () => {
    const result = parseEvalReviewFrontmatter(HAPPY_PATH_FRONTMATTER);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.verdict, "PRODUCTION_READY");
      assert.equal(result.data.coverage_score, 78);
      assert.equal(result.data.infrastructure_score, 92);
      assert.equal(result.data.gaps.length, 1);
      assert.equal(result.data.gaps[0]!.id, "G01");
      assert.equal(result.data.gaps[0]!.dimension, "observability");
      assert.equal(result.data.gaps[0]!.severity, "major");
    }
  });

  it("ignores the body content entirely (body content must not be parsed)", () => {
    const withProseBody = HAPPY_PATH_FRONTMATTER + "\n\n## Gap Analysis\n- some prose bullet that isn't a real gap";
    const result = parseEvalReviewFrontmatter(withProseBody);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.gaps.length, 1, "body bullets must not be confused with frontmatter gaps");
    }
  });

  it("ignores tables in the body (regression: body content must not be parsed)", () => {
    const withTable = HAPPY_PATH_FRONTMATTER + "\n\n| dim | sev |\n|---|---|\n| metrics | major |\n";
    const result = parseEvalReviewFrontmatter(withTable);
    assert.equal(result.ok, true);
  });

  it("ignores numbered lists in the body (regression: body content must not be parsed)", () => {
    const withNumbered = HAPPY_PATH_FRONTMATTER + "\n\n## Gaps\n1. first numbered\n2. second numbered\n";
    const result = parseEvalReviewFrontmatter(withNumbered);
    assert.equal(result.ok, true);
  });
});

// ─── parseEvalReviewFrontmatter — schema violations ───────────────────────────

describe("parseEvalReviewFrontmatter — schema violations", () => {
  it("rejects an unknown verdict literal", () => {
    const fm = buildFrontmatterText({ verdict: "MOSTLY_OK" });
    const result = parseEvalReviewFrontmatter(fm);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.pointer.includes("verdict"), `pointer should reference verdict, got ${result.pointer}`);
    }
  });

  it("rejects coverage_score above 100", () => {
    const fm = buildFrontmatterText({ coverage_score: "101" });
    const result = parseEvalReviewFrontmatter(fm);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.pointer.includes("coverage_score"));
    }
  });

  it("rejects negative infrastructure_score", () => {
    const fm = buildFrontmatterText({ infrastructure_score: "-1" });
    const result = parseEvalReviewFrontmatter(fm);
    assert.equal(result.ok, false);
  });

  it("rejects gap severity outside the allowed enum", () => {
    const raw = HAPPY_PATH_FRONTMATTER.replace("severity: major", "severity: critical");
    const result = parseEvalReviewFrontmatter(raw);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.pointer.includes("severity") || result.pointer.includes("gaps"));
    }
  });

  it("rejects a gap id that does not match /^G\\d+$/", () => {
    const raw = HAPPY_PATH_FRONTMATTER.replace("id: G01", "id: gap-one");
    const result = parseEvalReviewFrontmatter(raw);
    assert.equal(result.ok, false);
  });

  it("rejects a slice id that does not match /^S\\d+$/", () => {
    const fm = buildFrontmatterText({ slice: "../etc/passwd" });
    const result = parseEvalReviewFrontmatter(fm);
    assert.equal(result.ok, false);
  });

  it("rejects a wrong schema version literal", () => {
    const fm = buildFrontmatterText({ schema: "eval-review/v0" });
    const result = parseEvalReviewFrontmatter(fm);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.pointer.includes("schema"));
    }
  });
});

// ─── parseEvalReviewFrontmatter — structural failures ─────────────────────────

describe("parseEvalReviewFrontmatter — structural failures", () => {
  it("errors on a body-only file with no frontmatter", () => {
    const result = parseEvalReviewFrontmatter("# Just a body, no frontmatter");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.pointer, "/");
    }
  });

  it("errors on malformed YAML inside the frontmatter block", () => {
    const result = parseEvalReviewFrontmatter("---\nfoo: : bar\n---\n");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.toLowerCase().includes("yaml"));
    }
  });

  it("errors when the closing --- is missing", () => {
    const result = parseEvalReviewFrontmatter("---\nfoo: bar\nno closing");
    assert.equal(result.ok, false);
  });
});

// ─── computeOverallScore ──────────────────────────────────────────────────────

describe("computeOverallScore", () => {
  it("applies the 60/40 weighting", () => {
    // 100 * 0.6 + 0 * 0.4 = 60
    assert.equal(computeOverallScore(100, 0), 60);
    // 0 * 0.6 + 100 * 0.4 = 40
    assert.equal(computeOverallScore(0, 100), 40);
    // 78 * 0.6 + 92 * 0.4 = 46.8 + 36.8 = 83.6 → 84
    assert.equal(computeOverallScore(78, 92), 84);
  });

  it("rounds to the nearest integer", () => {
    // 50 * 0.6 + 50 * 0.4 = 50 (exact)
    assert.equal(computeOverallScore(50, 50), 50);
    // 51 * 0.6 + 50 * 0.4 = 30.6 + 20 = 50.6 → 51
    assert.equal(computeOverallScore(51, 50), 51);
  });

  it("clamps to 0..100 range when inputs are at extremes", () => {
    assert.equal(computeOverallScore(0, 0), 0);
    assert.equal(computeOverallScore(100, 100), 100);
  });

  it("clamps out-of-range inputs to MAX_SCORE (defense-in-depth for callers that bypass the schema)", () => {
    assert.equal(computeOverallScore(150, 200), 100);
    assert.equal(computeOverallScore(101, 100), 100);
  });

  it("clamps negative inputs to MIN_SCORE", () => {
    assert.equal(computeOverallScore(-50, -50), 0);
    assert.equal(computeOverallScore(-1, 0), 0);
  });
});

// ─── deriveCounts ─────────────────────────────────────────────────────────────

describe("deriveCounts", () => {
  it("returns zero counts for an empty gap list", () => {
    assert.deepEqual(deriveCounts([]), { blocker: 0, major: 0, minor: 0 });
  });

  it("counts gaps by severity", () => {
    const gaps = [
      { id: "G01", dimension: "tests" as const, severity: "blocker" as const, description: "x", evidence: "x", suggested_fix: "x" },
      { id: "G02", dimension: "tests" as const, severity: "major" as const, description: "x", evidence: "x", suggested_fix: "x" },
      { id: "G03", dimension: "tests" as const, severity: "major" as const, description: "x", evidence: "x", suggested_fix: "x" },
      { id: "G04", dimension: "tests" as const, severity: "minor" as const, description: "x", evidence: "x", suggested_fix: "x" },
    ];
    assert.deepEqual(deriveCounts(gaps), { blocker: 1, major: 2, minor: 1 });
  });
});

// ─── Schema export — sanity ───────────────────────────────────────────────────

describe("EvalReviewFrontmatter schema", () => {
  it("is exported as a TypeBox object schema", () => {
    assert.ok(EvalReviewFrontmatter);
    assert.equal(typeof EvalReviewFrontmatter, "object");
  });
});
