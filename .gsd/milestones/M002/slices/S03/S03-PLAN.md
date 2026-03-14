# S03: Live models.dev Verification

**Goal:** Add live verification against the real models.dev API to the main test suite, validating response structure and mapper output with clear failure diagnostics.

**Demo:** `npm test -w @gsd/pi-ai` executes a live test that fetches from https://models.dev/api.json, validates the response against the `ModelsDevData` schema, and confirms the mapper produces valid output.

## Must-Haves

- Live test file `packages/pi-ai/src/models-dev-live.test.ts` in main suite
- Test fetches from production URL with 30s timeout
- Response validated against `ModelsDevData` Zod schema
- Mapper output verified as non-empty `Model<Api>[]`
- Clear diagnostics distinguishing network failures from schema validation errors
- `LIVE_MODELS_DEV_TEST` env var gates execution (default: enabled)

## Verification

- `npm test -w @gsd/pi-ai` runs live test and passes (or skips if env var set to false)
- Live test output shows provider count and sample model IDs on success
- On network failure: clear error message indicating network issue, not assertion failure
- On schema failure: Zod validation error with specific field paths

## Observability / Diagnostics

- Test logs provider count and up to 5 sample model IDs on success
- Network failures logged with URL and timeout value before assertion
- Schema validation errors include Zod error path and message
- Skip message clearly indicates `LIVE_MODELS_DEV_TEST` env var disabled the test
- Test duration visible in TAP output (should complete within 30s timeout)

## Tasks

- [x] **T01: Add live models.dev verification test** `est:30m`
  - Why: R009 requires live verification in main suite; this is the only deliverable for S03
  - Files: `packages/pi-ai/src/models-dev-live.test.ts`
  - Do: Create dedicated test file with single test that fetches from production URL, validates schema, and verifies mapper output. Include 30s timeout, `LIVE_MODELS_DEV_TEST` env var gate, and clear failure diagnostics.
  - Verify: `npm test -w @gsd/pi-ai` includes live test and passes (network permitting)
  - Done when: Live test runs in main suite, validates real API response, and provides clear failure diagnostics

## Files Likely Touched

- `packages/pi-ai/src/models-dev-live.test.ts` (new)
