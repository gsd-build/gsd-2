---
id: S03
parent: M002
milestone: M002
provides:
  - Live models.dev verification test in main test suite
  - Upstream API compatibility checking per R009
  - Clear failure diagnostics distinguishing network vs. schema errors
requires:
  - slice: S01
    provides: Working build/test infrastructure for @gsd/pi-ai
affects: []
key_files:
  - packages/pi-ai/src/models-dev-live.test.ts
key_decisions:
  - Use 30s timeout for live API call (longer than internal 10s default)
  - Log diagnostic info on success: provider count and sample model IDs
  - Skip test when LIVE_MODELS_DEV_TEST="false" or "0" for CI/offline scenarios
patterns_established:
  - Live verification tests use console.log for diagnostic output visible in TAP
  - Env var gates allow selective disabling without code changes
observability_surfaces:
  - Console logs show fetch URL, timeout, provider count, sample model IDs on success
  - Network failure assertions include URL and clear error message
  - TAP output shows test duration (should complete within ~30s)
  - Skip message indicates LIVE_MODELS_DEV_TEST env var disabled the test
drill_down_paths:
  - .gsd/milestones/M002/slices/S03/tasks/T01-SUMMARY.md
duration: 15m
verification_result: passed
completed_at: 2026-03-14T21:07:00-05:00
---

# S03: Live models.dev Verification

**Added live verification test that fetches from production models.dev API, validates response structure, and confirms mapper produces non-empty output.**

## What Happened

Created a single live verification test in `packages/pi-ai/src/models-dev-live.test.ts` that:

1. Checks `LIVE_MODELS_DEV_TEST` env var — skips if set to "false" or "0" (for CI/offline scenarios)
2. Fetches from `https://models.dev/api.json` with 30-second timeout
3. Asserts non-null response with clear network failure message
4. Schema validation happens via `fetchModelsDev` internal `ModelsDevData.parse()` call
5. Passes data through `mapToModelRegistry()` and asserts non-empty model array
6. Logs diagnostic info: provider count, sample model IDs, mapper output stats

The test integrates cleanly into the existing test suite (32 total tests now pass). Diagnostic output is visible in TAP format for troubleshooting. Test completes in ~258ms with network available.

## Verification

```bash
# Live test runs in main suite and passes (102 providers, 3742 models)
npm test -w @gsd/pi-ai

# Test skips when env var disables it
LIVE_MODELS_DEV_TEST=0 npm test -w @gsd/pi-ai
```

All 32 tests pass. Live test fetches real data, validates schema, confirms mapper output.

## Requirements Advanced

- R009 — Live models.dev verification now exists in main test suite with clear failure diagnostics

## Requirements Validated

- R009 — Live test fetches from production API, validates via Zod schema, confirms mapper produces non-empty output; env var gate allows CI/offline control

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

None — executed exactly as planned.

## Known Limitations

- Live test requires network connectivity; CI environments without external access should set `LIVE_MODELS_DEV_TEST=0`
- Test accepts network-dependent behavior by user choice (intentional tradeoff)

## Follow-ups

- None — slice is complete

## Files Created/Modified

- `packages/pi-ai/src/models-dev-live.test.ts` — New live verification test (68 lines)

## Forward Intelligence

### What the next slice should know
- Live test pattern established: fetch → validate schema → verify mapper output → log diagnostics
- Env var gate pattern (`LIVE_MODELS_DEV_TEST`) can be reused for other network-dependent tests

### What's fragile
- Live test depends on models.dev availability — upstream outages will cause test failure (expected tradeoff)

### Authoritative diagnostics
- TAP output shows test duration and console logs for success/failure details
- Network failure message explicitly identifies URL and suggests checking connectivity

### What assumptions changed
- None — live test behaves as designed
