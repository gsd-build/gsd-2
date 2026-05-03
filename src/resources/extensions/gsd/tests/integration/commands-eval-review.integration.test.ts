/**
 * Integration test for `/gsd eval-review` .
 *
 * Walks the helper chain end-to-end (parseArgs → detectState → buildContext
 * → buildPrompt) against a real on-disk slice fixture, then validates the
 * round-trip: a frontmatter that conforms to the schema described in the
 * prompt body must parse successfully via the schema validator. This is the
 * concrete answer to the prior "no end-to-end proof" objection.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildEvalReviewContext,
  buildEvalReviewPrompt,
  detectEvalReviewState,
  evalReviewWritePath,
  MAX_CONTEXT_BYTES,
  parseEvalReviewArgs,
} from "../../commands-eval-review.js";
import { _clearGsdRootCache } from "../../paths.js";
import {
  computeOverallScore,
  deriveCounts,
  parseEvalReviewFrontmatter,
} from "../../eval-review-schema.js";

// ─── Fixture content ──────────────────────────────────────────────────────────

const AI_SPEC = [
  "# AI-SPEC for slice S07: LLM call orchestration",
  "",
  "## Required eval dimensions",
  "",
  "- observability: every LLM call emits latency + token-count metrics with a trace ID",
  "- guardrails: requests exceeding the per-session budget cap are rejected",
  "- tests: golden-file regression suite over canonical prompts",
  "- metrics: cost roll-up per model + latency P95 per provider",
  "",
  "## Tooling",
  "",
  "- Logging provider: langfuse (or compatible OpenTelemetry sink)",
  "- Eval harness: deterministic-prompt fixtures under tests/golden/",
].join("\n");

const SUMMARY = [
  "# Slice S07 — implementation summary",
  "",
  "Implemented the LLM call wrapper at src/llm/call.ts. Latency is captured",
  "via emit('llm.latency', { latency_ms, traceId }) on every successful call",
  "and consumed by the metrics sink at src/metrics/sink.ts:88. Budget cap",
  "rejection lives in src/llm/budget.ts:42 and has a unit test at",
  "tests/llm-budget.test.ts that asserts a 401 on cap exceedance.",
  "",
  "## Known gaps",
  "",
  "- Token-count metric is emitted only for OpenAI; other providers are",
  "  TODO. tests/golden/ exists but is empty pending the canonical prompt",
  "  set being finalised.",
].join("\n");

// ─── Setup helpers ────────────────────────────────────────────────────────────

interface Layout {
  readonly basePath: string;
  readonly milestoneId: string;
  readonly sliceId: string;
  readonly sliceDir: string;
}

function buildLayout(opts: { withSpec?: boolean; summaryBytes?: number } = {}): Layout {
  const basePath = mkdtempSync(join(tmpdir(), "gsd-eval-review-int-"));
  const milestoneId = "M001";
  const sliceId = "S07";
  const sliceDir = join(basePath, ".gsd", "milestones", milestoneId, "slices", sliceId);
  mkdirSync(sliceDir, { recursive: true });
  const summary = opts.summaryBytes != null
    ? "S".repeat(opts.summaryBytes)
    : SUMMARY;
  writeFileSync(join(sliceDir, `${sliceId}-SUMMARY.md`), summary, "utf-8");
  if (opts.withSpec !== false) {
    writeFileSync(join(sliceDir, `${sliceId}-AI-SPEC.md`), AI_SPEC, "utf-8");
  }
  return { basePath, milestoneId, sliceId, sliceDir };
}

// ─── End-to-end helper-chain pass ─────────────────────────────────────────────

describe("integration: /gsd eval-review helper chain on a real on-disk slice", () => {
  let layout: Layout;
  let cwd: string;

  beforeEach(() => {
    cwd = process.cwd();
    layout = buildLayout();
    process.chdir(layout.basePath);
  });

  afterEach(() => {
    _clearGsdRootCache();
    process.chdir(cwd);
    rmSync(layout.basePath, { recursive: true, force: true });
  });

  it("walks parseArgs → detect → context → prompt and produces a prompt that contains every required contract anchor", async () => {
    const args = parseEvalReviewArgs("S07");
    assert.equal(args.sliceId, "S07");

    const state = detectEvalReviewState(args, layout.basePath, layout.milestoneId);
    assert.equal(state.kind, "ready");
    if (state.kind !== "ready") return;

    const ctx = await buildEvalReviewContext(state, layout.milestoneId, () =>
      new Date("2026-04-28T14:00:00Z"),
    );
    assert.equal(ctx.truncated, false);
    assert.equal(ctx.sliceId, "S07");
    assert.equal(ctx.outputPath, evalReviewWritePath(layout.sliceDir, "S07"));

    const prompt = buildEvalReviewPrompt(ctx);

    // Schema + rubric anchors
    assert.ok(prompt.includes("schema: eval-review/v1"));
    assert.ok(prompt.includes("PRODUCTION_READY"));
    assert.ok(prompt.includes("NOT_IMPLEMENTED"));
    assert.ok(prompt.includes("0.6"));
    assert.ok(prompt.includes("0.4"));
    assert.ok(prompt.includes("Alternatives considered"));
    assert.ok(prompt.includes("Anti-Goodhart"));

    // Slice content was inlined verbatim — pick anchors that don't span line breaks.
    assert.ok(prompt.includes("emit('llm.latency'"));
    assert.ok(prompt.includes("src/llm/budget.ts:42"));
    assert.ok(prompt.includes("langfuse"));

    // Output path is the canonical slice file path
    assert.ok(prompt.includes(`${layout.sliceId}-EVAL-REVIEW.md`));
  });

  it("falls back to the no-spec audit mode when AI-SPEC.md is absent", async () => {
    rmSync(layout.basePath, { recursive: true, force: true });
    layout = buildLayout({ withSpec: false });
    process.chdir(layout.basePath);

    const args = parseEvalReviewArgs("S07");
    const state = detectEvalReviewState(args, layout.basePath, layout.milestoneId);
    assert.equal(state.kind, "ready");
    if (state.kind !== "ready") return;
    assert.equal(state.specPath, null);

    const ctx = await buildEvalReviewContext(state, layout.milestoneId);
    const prompt = buildEvalReviewPrompt(ctx);
    assert.ok(prompt.toLowerCase().includes("not present"));
  });

  it("truncates the SUMMARY at MAX_CONTEXT_BYTES and surfaces the truncation note in the prompt (regression: prompt-size cap)", async () => {
    rmSync(layout.basePath, { recursive: true, force: true });
    layout = buildLayout({ summaryBytes: MAX_CONTEXT_BYTES + 64 * 1024 });
    process.chdir(layout.basePath);

    const args = parseEvalReviewArgs("S07");
    const state = detectEvalReviewState(args, layout.basePath, layout.milestoneId);
    assert.equal(state.kind, "ready");
    if (state.kind !== "ready") return;

    const ctx = await buildEvalReviewContext(state, layout.milestoneId);
    assert.equal(ctx.truncated, true);
    const prompt = buildEvalReviewPrompt(ctx);
    assert.ok(prompt.includes("truncated"));
    assert.ok(prompt.includes("Inputs were truncated"));
  });
});

// ─── Round-trip: prompt's described schema → validator ────────────────────────

describe("integration: prompt-schema round-trip", () => {
  it("synthesizes a frontmatter that matches the prompt's described schema and parses successfully (regression: schema and prompt must not drift)", () => {
    const fakeContext = {
      milestoneId: "M001",
      sliceId: "S07",
      summary: "fake",
      summaryPath: "/fake/.gsd/milestones/M001/slices/S07/S07-SUMMARY.md",
      spec: "fake",
      specPath: "/fake/.gsd/milestones/M001/slices/S07/S07-AI-SPEC.md",
      outputPath: "/fake/.gsd/milestones/M001/slices/S07/S07-EVAL-REVIEW.md",
      relativeOutputPath: ".gsd/milestones/M001/slices/S07/S07-EVAL-REVIEW.md",
      truncated: false,
      generatedAt: "2026-04-28T14:00:00Z",
    } as const;
    const prompt = buildEvalReviewPrompt(fakeContext);

    // Build a frontmatter that should be the LLM's output if it follows
    // the prompt instructions verbatim, then validate it.
    const coverage = 78;
    const infrastructure = 92;
    const overall = computeOverallScore(coverage, infrastructure);
    const gaps = [
      {
        id: "G01",
        dimension: "metrics",
        severity: "minor",
        description: "Token-count metric only emitted for OpenAI provider.",
        evidence: "src/llm/call.ts:71 — emit happens inside the OpenAI branch only",
        suggested_fix: "Move emit('llm.tokens') above the provider switch in src/llm/call.ts",
      },
    ];
    const counts = deriveCounts(gaps as never);

    const frontmatter = [
      "---",
      "schema: eval-review/v1",
      "verdict: PRODUCTION_READY",
      `coverage_score: ${coverage}`,
      `infrastructure_score: ${infrastructure}`,
      `overall_score: ${overall}`,
      "generated: 2026-04-28T14:00:00Z",
      "slice: S07",
      "milestone: M001",
      "gaps:",
      `  - id: ${gaps[0]!.id}`,
      `    dimension: ${gaps[0]!.dimension}`,
      `    severity: ${gaps[0]!.severity}`,
      `    description: "${gaps[0]!.description}"`,
      `    evidence: "${gaps[0]!.evidence}"`,
      `    suggested_fix: "${gaps[0]!.suggested_fix}"`,
      "counts:",
      `  blocker: ${counts.blocker}`,
      `  major: ${counts.major}`,
      `  minor: ${counts.minor}`,
      "---",
      "",
      "# Free-form analysis below",
      "Detailed prose for human reviewers.",
    ].join("\n");

    const parsed = parseEvalReviewFrontmatter(frontmatter);
    assert.equal(parsed.ok, true, parsed.ok ? "" : `${parsed.error} at ${parsed.pointer}`);
    if (parsed.ok) {
      assert.equal(parsed.data.verdict, "PRODUCTION_READY");
      assert.equal(parsed.data.overall_score, overall);
      assert.equal(parsed.data.gaps.length, 1);
      assert.equal(parsed.data.gaps[0]!.dimension, "metrics");
    }

    // Cross-check: the prompt body must reference the same schema version
    // the validator accepts. If a future patch changes either side without
    // the other, this assertion catches the drift.
    assert.ok(prompt.includes("schema: eval-review/v1"));
  });
});
