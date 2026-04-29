# `/gsd eval-review`

Audit a slice's AI evaluation strategy after it ships. Scores the implemented eval coverage and infrastructure, identifies gaps with cited evidence, and writes a scored `<sliceId>-EVAL-REVIEW.md` next to the slice's other artefacts.

The command is **audit-only** — it never modifies source code. Companion command `/gsd eval-fix` (issue #5115) is planned to address gaps once this audit lands.

## When to run it

- After a slice that includes AI features (LLM calls, retrieval, eval harness, etc.) reaches `phase: complete`.
- Before `/gsd ship`. The ship command surfaces a non-blocking warning when `EVAL-REVIEW.md` is missing or the verdict is `NOT_IMPLEMENTED`.

## Usage

```bash
/gsd eval-review <sliceId> [--force] [--show]
```

| Argument / Flag | Effect |
|---|---|
| `<sliceId>` | Required. Must match `/^S\d+$/` (e.g. `S07`). |
| `--force` | Overwrite an existing `<sliceId>-EVAL-REVIEW.md`. Without this flag, a present file is preserved. |
| `--show` | Print an existing `<sliceId>-EVAL-REVIEW.md` to the UI and exit; do not run a new audit. |

Examples:

```bash
/gsd eval-review S07
/gsd eval-review S07 --force
/gsd eval-review S07 --show
```

Unknown flags (e.g. `--force-wipe`) are rejected explicitly rather than silently stripped.

## Behaviour by state

| State | Condition | Behaviour |
|---|---|---|
| `ready` | Slice directory + `<sliceId>-SUMMARY.md` present (`<sliceId>-AI-SPEC.md` optional) | Full audit dispatched |
| `no-summary` | Slice directory present, `<sliceId>-SUMMARY.md` missing | Error message: run `/gsd execute-phase` first |
| `no-slice-dir` | Slice directory missing | Error message: probable typo in slice ID |

When `AI-SPEC.md` is present, the audit compares the implementation against the spec's eval dimensions. When it is absent, the audit runs against a best-practices dimension set (`observability`, `guardrails`, `tests`, `metrics`, `datasets`).

## Output contract

The audit writes `<sliceId>-EVAL-REVIEW.md` whose machine-readable fields live in YAML frontmatter. The body after the closing `---` is human-only prose and is never parsed by `/gsd ship` or any future consumer.

```yaml
---
schema: eval-review/v1
verdict: PRODUCTION_READY            # PRODUCTION_READY | NEEDS_WORK | SIGNIFICANT_GAPS | NOT_IMPLEMENTED
coverage_score: 78                   # int 0..100
infrastructure_score: 92             # int 0..100
overall_score: 84                    # round(coverage * 0.6 + infra * 0.4)
generated: 2026-04-28T14:00:00Z      # ISO 8601 UTC
slice: S07
milestone: M001-eh88as
gaps:
  - id: G01
    dimension: observability         # observability | guardrails | tests | metrics | datasets | other
    severity: major                  # blocker | major | minor
    description: "..."
    evidence: "<file>:<line> — cited code path or test"
    suggested_fix: "..."
counts:
  blocker: 0
  major: 1
  minor: 2
---

# Free-form analysis below — never parsed.
```

The handler validates the frontmatter via [TypeBox](https://github.com/sinclairzx81/typebox) on every read; an invalid file produces a JSON-Pointer-anchored error message rather than a silent partial parse.

## Scoring

```text
overall_score = round(coverage_score * 0.6 + infrastructure_score * 0.4)
```

| Verdict | overall_score |
|---|---|
| `PRODUCTION_READY` | ≥ 80 |
| `NEEDS_WORK` | 60..79 |
| `SIGNIFICANT_GAPS` | 40..59 |
| `NOT_IMPLEMENTED` | < 40 |

**Coverage (60%)** — fraction of eval dimensions called for by the spec (or the standard set when no spec) that have **behavior evidence** in the slice. Behavior evidence means a code path you can cite by file and line that *executes* the dimension, or a test that exercises it.

**Infrastructure (40%)** — presence of the tooling layer: logging provider, metrics sink, eval harness, training/evaluation datasets.

### Why 60/40

Three weightings were considered:

| Weighting | Rejected because |
|---|---|
| 50/50 | Treats coverage gaps and infrastructure gaps as equally recoverable. Coverage gaps compound (an unobserved feature can stay unobserved across multiple slices); infrastructure tends toward binary (the metrics sink either exists or doesn't). 50/50 understates the cost of coverage gaps. |
| 70/30 | Over-penalizes greenfield slices that haven't yet built infrastructure. A first slice in a project will have *no* metrics sink; punishing it 70/30 floors too many early slices to NOT_IMPLEMENTED. |
| **60/40** | Privileges behavior verification by 20 percentage points without flooring early slices. Coverage > infrastructure in marginal cases. |

The weights are exported as named constants in `eval-review-schema.ts` (`COVERAGE_WEIGHT`, `INFRASTRUCTURE_WEIGHT`) so the prompt, the schema, and the docs share one source of truth.

### Anti-Goodhart guard

Coverage rewards behavior evidence, not token presence. `grep langfuse` in the source tree is **not** evidence; it is a token. Acceptable evidence:

- ✅ `src/llm/wrapper.ts:42 — emit('llm.latency', { latency_ms })` (cited call site that runs at request time).
- ✅ `tests/llm-budget.test.ts: asserts the request is rejected when budget cap is exceeded` (a test that exercises the guardrail).
- ❌ `package.json includes 'langfuse' as a dependency` (the dependency might be unused).
- ❌ `src/observability/types.ts: defines a TraceId type` (a type declaration is not a runtime path).

The auditor prompt requires `evidence` on every gap; the schema makes the field non-optional. A scored dimension whose only evidence is string presence scores 0.

## Interaction with `/gsd ship`

After the existing phase-completeness check, `/gsd ship` walks the active milestone's slices and surfaces non-blocking notifications:

| Slice EVAL-REVIEW state | Notification |
|---|---|
| Missing | "Slice X has no EVAL-REVIEW.md — consider /gsd eval-review X (non-blocking)." |
| Frontmatter invalid | "Slice X EVAL-REVIEW.md frontmatter invalid at &lt;pointer&gt;: &lt;message&gt; (non-blocking)." |
| `verdict: NOT_IMPLEMENTED` | "Slice X eval verdict NOT_IMPLEMENTED (overall N/100) — shipping anyway, but the eval gap is unresolved." |
| `verdict: SIGNIFICANT_GAPS / NEEDS_WORK / PRODUCTION_READY` | (no notification) |

The ship is never gated on eval status. The notifications are informational only.

## Limits

- Combined `SUMMARY.md` + `AI-SPEC.md` content is hard-capped at 200 KiB inside the auditor prompt. Larger inputs are truncated with a `[truncated: N bytes elided]` marker and the auditor is instructed to flag the slice accordingly.
- `--force` overwrites the existing file in place; the previous version is not archived. Run with `--show` first if you want to keep the prior audit's text.

## Related

- Tracking: #5114 — this command's sub-issue.
- Planned: #5115 — `/gsd eval-fix`, the gap-driven fix agent (blocked-by #5114).
- Umbrella: #4246 — covers both `eval-review` and `eval-fix`.
