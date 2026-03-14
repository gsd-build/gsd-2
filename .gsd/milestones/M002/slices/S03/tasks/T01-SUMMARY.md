---
id: T01
parent: S03
milestone: M002
provides:
  - Live models.dev verification test in main test suite
  - Upstream API compatibility checking per R009
  - Clear failure diagnostics distinguishing network vs. schema errors
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
duration: 15m
verification_result: passed
completed_at: 2026-03-14T17:50:00-05:00
blocker_discovered: false
---

# T01: Add live models.dev verification test

**Added live verification test that fetches from production models.dev API, validates response structure, and confirms mapper produces non-empty output.**

## What Happened

Created `packages/pi-ai/src/models-dev-live.test.ts` with a single test that:

1. Checks `LIVE_MODELS_DEV_TEST` env var - skips if set to "false" or "0"
2. Fetches from `https://models.dev/api.json` with 30-second timeout
3. Asserts response is non-null with clear network failure message
4. Validates response via `ModelsDevData.parse()` (done inside `fetchModelsDev`)
5. Passes data through `mapToModelRegistry()` and asserts non-empty model array
6. Logs diagnostic info on success: provider count, up to 5 sample model IDs, mapper output stats

The test follows established patterns from S01: uses `.js` imports, Node.js test runner, and standard assert module. Console output provides visibility into what was fetched and transformed.

## Verification

```bash
# Test runs in main suite and passes (102 providers, 3742 models)
npm test -w @gsd/pi-ai

# Test skips when env var disables it
LIVE_MODELS_DEV_TEST=0 npm test -w @gsd/pi-ai

# File exists at correct location
ls -la packages/pi-ai/src/models-dev-live.test.ts
```

All 32 tests pass (31 existing + 1 new live test). Live test completes in ~230ms with network available. Skip behavior confirmed with `LIVE_MODELS_DEV_TEST=0`.

## Diagnostics

- Success output: `⊹ Success: 102 providers, sample models: evroc/nvidia/Llama-3.3-70B-Instruct-FP8...`
- Success output: `⊹ Mapper output: 3742 models from 102 providers`
- Network failure: assertion message includes URL and suggests checking connectivity
- Schema failure: Zod validation error would show before assertion (in `fetchModelsDev`)
- Skip message: `⊹ Skipped: LIVE_MODELS_DEV_TEST env var is set to 'false' or '0'`
- TAP output shows test duration for detecting slow/timeout issues

## Deviations

None - executed as planned.

## Known Issues

None - test is read-only against production API, no persistent state created.

## Files Created/Modified

- `packages/pi-ai/src/models-dev-live.test.ts` — New live verification test
