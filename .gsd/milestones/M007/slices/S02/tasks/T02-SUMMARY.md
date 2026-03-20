---
id: T02
parent: S02
milestone: M007
provides:
  - JSONL reader crash resilience tests validating durability across partial writes, truncated JSON, blank lines, and malformed content
key_files:
  - src/resources/extensions/gsd/tests/metrics-reader.test.ts
key_decisions:
  - Tests use temp files with randomUUID for isolation, matching the test pattern from summarize-metrics.test.ts
  - Reader validates required fields (type and id) and skips entries missing them, exposing this via skippedLines count
patterns_established:
  - JSONL durability test pattern: write temp file, call reader, assert on units/skippedLines/totalLines
  - Fixture helper makeUnit creates minimal valid UnitMetrics for test data
observability_surfaces:
  - readMetricsJsonl returns skippedLines count — downstream consumers can alert on high skip rates (format drift or corruption)
  - Test failures indicate regression in error handling
duration: 12m
verification_result: passed
completed_at: 2026-03-19T21:29:45-04:00
blocker_discovered: false
---

# T02: Add reader and durability tests

**Created comprehensive JSONL reader tests validating crash resilience for dispatch-metrics.jsonl parsing.**

## What Happened

Implemented 9 test cases for `readMetricsJsonl` covering all edge cases required for crash resilience:
1. Valid multi-line JSONL — parses all units correctly
2. Empty file — returns empty array with zero counts
3. Blank lines interspersed — skips blanks, returns valid entries
4. Truncated JSON lines (simulating crash mid-write) — skips bad lines, returns valid ones
5. File with only malformed content — returns empty array, reports all lines as skipped
6. Nonexistent file — returns empty result gracefully (no throw)
7. Mixed valid/invalid lines — correctly separates valid from malformed
8. Valid JSON missing required fields — validates type and id presence
9. Whitespace-only file — handles gracefully

Tests use Node.js built-in `node:test` and `node:assert` framework with temp file isolation via `os.tmpdir()` + `crypto.randomUUID()`.

## Verification

- Ran new tests: `npx tsx --test src/resources/extensions/gsd/tests/metrics-reader.test.ts` — 9 pass
- Ran existing tests: `npx tsx --test src/resources/extensions/gsd/tests/summarize-metrics.test.ts` — 11 pass (no regression)
- Verified CLI failure handling: `npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent.jsonl` — exits 0 with graceful message

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsx --test src/resources/extensions/gsd/tests/metrics-reader.test.ts` | 0 | ✅ pass | 234ms |
| 2 | `npx tsx --test src/resources/extensions/gsd/tests/summarize-metrics.test.ts` | 0 | ✅ pass | 827ms |
| 3 | `npx tsx src/resources/extensions/gsd/report-metrics.ts /nonexistent.jsonl` | 0 | ✅ pass | ~100ms |

## Diagnostics

To debug reader issues later:
- Run `npx tsx --test src/resources/extensions/gsd/tests/metrics-reader.test.ts` for test coverage
- Check `result.skippedLines` in return value to diagnose format problems
- CLI stderr shows `[report-metrics] parsed N valid units, skipped M malformed lines` for visibility

## Deviations

None — followed the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/metrics-reader.test.ts` — New test file with 9 test cases for JSONL reader crash resilience
- `.gsd/milestones/M007/slices/S02/S02-PLAN.md` — Added failure-path verification check
- `.gsd/milestones/M007/slices/S02/tasks/T02-PLAN.md` — Added Observability Impact section