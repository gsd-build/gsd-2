---
estimated_steps: 5
estimated_files: 1
---

# T01: Add live models.dev verification test

**Slice:** S03 — Live models.dev Verification
**Milestone:** M002

## Description

Create a dedicated test file that verifies the real models.dev API response structure and validates that our mapper produces correct output. This provides upstream compatibility checking per R009 and fails loudly if models.dev makes breaking API changes.

## Steps

1. Create `packages/pi-ai/src/models-dev-live.test.ts` with Node.js test runner imports
2. Add test with 30-second timeout that calls `fetchModelsDev()` with production URL
3. Assert non-null result with clear network failure message
4. Validate response against `ModelsDevData.parse()` (already done by fetchModelsDev, but verify structure)
5. Pass data through `mapToModelRegistry()` and assert non-empty model array
6. Add `LIVE_MODELS_DEV_TEST` env var check that skips test when set to "false" or "0"
7. Add diagnostic logging on failure: provider count, sample model IDs, schema error details

## Must-Haves

- [ ] Test file exists at `packages/pi-ai/src/models-dev-live.test.ts`
- [ ] Test fetches from `https://models.dev/api.json` with 30s timeout
- [ ] Test asserts response is non-null with clear network error message
- [ ] Test verifies mapper produces non-empty `Model<Api>[]` output
- [ ] Test includes `LIVE_MODELS_DEV_TEST` env var gate (default: enabled)
- [ ] Test provides diagnostic output on failure (provider count, sample IDs)

## Verification

- `npm test -w @gsd/pi-ai` includes the new live test in output
- Live test passes when network is available (exits 0)
- Live test skips when `LIVE_MODELS_DEV_TEST=0` (verify skip message in output)
- On network failure, test shows clear diagnostic message distinguishing network vs. schema errors

## Observability Impact

- Test logs diagnostic info on success: provider count, up to 5 sample model IDs
- Network failures logged before assertion: URL attempted, timeout value, error type
- Schema validation errors show Zod error details (path, message) for debugging
- Env var skip logged: clear message when `LIVE_MODELS_DEV_TEST` disables the test
- Failure state visible in TAP output: test name indicates "live" and "models.dev"
- No persistent state created—test is read-only against production API
- Future agents can inspect: test file location, env var name, production URL in source

## Inputs

- `packages/pi-ai/src/models-dev.ts` — `fetchModelsDev(url, timeoutMs)` function
- `packages/pi-ai/src/models-dev-types.ts` — `ModelsDevData` Zod schema
- `packages/pi-ai/src/models-dev-mapper.ts` — `mapToModelRegistry(data)` function
- S01 Summary — established test patterns and `.js` import convention

## Expected Output

- `packages/pi-ai/src/models-dev-live.test.ts` — New test file with live verification
