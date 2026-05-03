/**
 * EVAL-REVIEW frontmatter schema and parser.
 *
 * The auditor agent for `/gsd eval-review` writes a markdown file whose
 * machine-readable contract lives entirely in YAML frontmatter. The body
 * after the closing `---` is human-only prose and is never parsed by any
 * consumer (the design response to a prior parser that used regex over LLM-generated
 * prose and produced silent failures).
 *
 * This module owns:
 *   - The TypeBox schema for the frontmatter (single source of truth).
 *   - A small frontmatter extractor (locates the YAML block).
 *   - The validated parser (`parseEvalReviewFrontmatter`).
 *   - Pure helpers for derived fields the handler must recompute server-side
 *     (overall score, severity counts) — we never trust LLM arithmetic.
 *
 * Consumers: `commands-eval-review.ts` (writer), `commands-ship.ts` (reader
 * for the soft pre-ship warning), and a future `commands-eval-fix.ts`.
 */

import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { parse as parseYaml } from "yaml";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Schema version literal embedded in every EVAL-REVIEW.md frontmatter. */
export const EVAL_REVIEW_SCHEMA_VERSION = "eval-review/v1" as const;

/** Verdict values, ordered from worst to best for UI display purposes. */
export const VERDICT_VALUES = [
  "NOT_IMPLEMENTED",
  "SIGNIFICANT_GAPS",
  "NEEDS_WORK",
  "PRODUCTION_READY",
] as const;

/** Severity classifications used in `gaps[*].severity`. */
export const SEVERITY_VALUES = ["blocker", "major", "minor"] as const;

/** Eval dimensions an auditor scores. `other` is the catch-all. */
export const DIMENSION_VALUES = [
  "observability",
  "guardrails",
  "tests",
  "metrics",
  "datasets",
  "other",
] as const;

/** Lower bound for any score in the schema. */
export const MIN_SCORE = 0;
/** Upper bound for any score in the schema. */
export const MAX_SCORE = 100;
/** Coverage's contribution to overall_score. See `docs/user-docs/eval-review.md` for rationale. */
export const COVERAGE_WEIGHT = 0.6;
/** Infrastructure's contribution to overall_score. See `docs/user-docs/eval-review.md` for rationale. */
export const INFRASTRUCTURE_WEIGHT = 0.4;

// ─── Schema ───────────────────────────────────────────────────────────────────

const verdictSchema = Type.Union(VERDICT_VALUES.map((v) => Type.Literal(v)));
const severitySchema = Type.Union(SEVERITY_VALUES.map((v) => Type.Literal(v)));
const dimensionSchema = Type.Union(DIMENSION_VALUES.map((v) => Type.Literal(v)));

/**
 * One gap finding inside `gaps[]`. Every field is required — the prompt
 * cannot emit a partial gap. `evidence` is mandatory; the anti-Goodhart
 * guard depends on it.
 */
export const EvalReviewGap = Type.Object({
  id: Type.String({ pattern: "^G\\d+$" }),
  dimension: dimensionSchema,
  severity: severitySchema,
  description: Type.String({ minLength: 1 }),
  evidence: Type.String({ minLength: 1 }),
  suggested_fix: Type.String({ minLength: 1 }),
});

/** Severity histogram. The handler recomputes this from `gaps[]`. */
export const EvalReviewCounts = Type.Object({
  blocker: Type.Integer({ minimum: 0 }),
  major: Type.Integer({ minimum: 0 }),
  minor: Type.Integer({ minimum: 0 }),
});

/**
 * The full frontmatter schema. Field order in the schema definition mirrors
 * the order that the auditor prompt asks the LLM to emit, so a literal-eyeball
 * comparison between this file and `prompts/eval-review.md` stays meaningful.
 */
export const EvalReviewFrontmatter = Type.Object({
  schema: Type.Literal(EVAL_REVIEW_SCHEMA_VERSION),
  verdict: verdictSchema,
  coverage_score: Type.Integer({ minimum: MIN_SCORE, maximum: MAX_SCORE }),
  infrastructure_score: Type.Integer({ minimum: MIN_SCORE, maximum: MAX_SCORE }),
  overall_score: Type.Integer({ minimum: MIN_SCORE, maximum: MAX_SCORE }),
  generated: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z$" }),
  slice: Type.String({ pattern: "^S\\d+$" }),
  milestone: Type.String({ minLength: 1 }),
  gaps: Type.Array(EvalReviewGap),
  counts: EvalReviewCounts,
});

/** Inferred TypeScript type for a validated frontmatter object. */
export type EvalReviewFrontmatterT = Static<typeof EvalReviewFrontmatter>;
/** Inferred TypeScript type for a single gap finding. */
export type EvalReviewGapT = Static<typeof EvalReviewGap>;
/** Inferred TypeScript type for the counts histogram. */
export type EvalReviewCountsT = Static<typeof EvalReviewCounts>;
/** One of the four allowed verdict literals. */
export type Verdict = (typeof VERDICT_VALUES)[number];

// ─── Frontmatter extraction ───────────────────────────────────────────────────

/**
 * Locate the YAML block between two `---` lines and return its raw text.
 *
 * Tolerant to CRLF line endings. Does not interpret the YAML — that's the
 * caller's job. The extractor only enforces the markdown frontmatter shape.
 *
 * @param raw - Full contents of an EVAL-REVIEW.md file.
 * @returns `{ yaml }` with the inner YAML text on success, or `{ error }`
 *   describing why the frontmatter could not be located.
 */
export function extractFrontmatterRaw(
  raw: string,
): { yaml: string } | { error: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { error: "Missing opening `---` frontmatter delimiter on line 1" };
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      return { yaml: lines.slice(1, i).join("\n") };
    }
  }
  return { error: "Missing closing `---` frontmatter delimiter" };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/** Discriminated result type returned by the parser. */
export type ParseResult =
  | { ok: true; data: EvalReviewFrontmatterT }
  | { ok: false; error: string; pointer: string };

/**
 * Parse and validate the frontmatter of an EVAL-REVIEW.md file.
 *
 * Failure cases are exhaustive and deterministic:
 *   - missing/unclosed frontmatter → `pointer: "/"`, message names the cause
 *   - YAML syntax error → `pointer: "/"`, message contains "YAML"
 *   - schema violation → `pointer` is the JSON-Pointer path of the bad field
 *
 * Body content after the closing `---` is never inspected. This is an
 * response to a prior parser that used regex over the body and silently
 * failed on prose / tables / numbered lists.
 *
 * @param raw - Full contents of an EVAL-REVIEW.md file.
 * @returns A discriminated `ParseResult`.
 */
export function parseEvalReviewFrontmatter(raw: string): ParseResult {
  const fm = extractFrontmatterRaw(raw);
  if ("error" in fm) {
    return { ok: false, error: fm.error, pointer: "/" };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(fm.yaml, { schema: "core" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `YAML parse error: ${msg}`, pointer: "/" };
  }

  const schema: TSchema = EvalReviewFrontmatter;
  if (!Value.Check(schema, parsed)) {
    const errs = [...Value.Errors(schema, parsed)];
    const first = errs[0];
    return {
      ok: false,
      error: `Schema validation failed: ${first?.message ?? "unknown error"}`,
      pointer: first?.path ?? "/",
    };
  }

  return { ok: true, data: parsed as EvalReviewFrontmatterT };
}

// ─── Derived fields ───────────────────────────────────────────────────────────

/**
 * Compute `overall_score` from the two component scores using the rubric
 * weights documented in `docs/user-docs/eval-review.md`.
 *
 * The handler always recomputes this value rather than trusting whatever the
 * LLM emitted in `overall_score`. If the LLM-emitted value disagrees with the
 * recomputed one, the disagreement is logged and the recomputed value wins.
 *
 * Clamps the result into `[MIN_SCORE, MAX_SCORE]` defensively. Schema-validated
 * inputs are already in range, but the helper is exported and may be called
 * from a code path that bypasses the schema (tests, future tools); the clamp
 * keeps the contract honest in those cases.
 *
 * @param coverage - integer 0..100 from the auditor's coverage assessment.
 * @param infrastructure - integer 0..100 from the auditor's infra assessment.
 * @returns rounded integer 0..100.
 */
export function computeOverallScore(coverage: number, infrastructure: number): number {
  const raw = Math.round(coverage * COVERAGE_WEIGHT + infrastructure * INFRASTRUCTURE_WEIGHT);
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, raw));
}

/**
 * Build the severity histogram for a list of gaps.
 *
 * Used by the handler to overwrite whatever the LLM put in `counts` —
 * we recompute server-side rather than trust LLM arithmetic.
 *
 * @param gaps - validated gap list.
 * @returns counts keyed by severity literal.
 */
export function deriveCounts(gaps: readonly EvalReviewGapT[]): EvalReviewCountsT {
  const counts: EvalReviewCountsT = { blocker: 0, major: 0, minor: 0 };
  for (const g of gaps) counts[g.severity]++;
  return counts;
}

/**
 * Map a numeric overall_score to its verdict literal using the bands from
 * Bands per `docs/user-docs/eval-review.md`: ≥80 PRODUCTION_READY, 60..79 NEEDS_WORK, 40..59 SIGNIFICANT_GAPS,
 * <40 NOT_IMPLEMENTED.
 *
 * @param overall - integer 0..100.
 * @returns a verdict literal.
 */
export function verdictForScore(overall: number): Verdict {
  if (overall >= 80) return "PRODUCTION_READY";
  if (overall >= 60) return "NEEDS_WORK";
  if (overall >= 40) return "SIGNIFICANT_GAPS";
  return "NOT_IMPLEMENTED";
}
