# S03: Live models.dev Verification — UAT

**Milestone:** M002
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The slice delivers a single test file that runs in the existing test suite; verification is fully automated through standard test execution

## Preconditions

- Node.js environment with npm available
- Network connectivity to https://models.dev/api.json (or ability to skip via env var)
- Repository in clean state at slice completion

## Smoke Test

```bash
npm test -w @gsd/pi-ai -- --test-name-pattern="models-dev live verification"
```

Expected: Test passes with console output showing provider count and sample model IDs.

## Test Cases

### 1. Live test fetches and validates real API response

1. Run: `npm test -w @gsd/pi-ai -- --test-name-pattern="models-dev live verification"`
2. Observe console output includes:
   - `Fetching from https://models.dev/api.json (timeout: 30000ms)...`
   - `Success: N providers, sample models: ...`
   - `Mapper output: M models from P providers`
3. **Expected:** Test passes (✔), all diagnostic messages visible, completes within 30s

### 2. Live test skips when env var is disabled

1. Run: `LIVE_MODELS_DEV_TEST=0 npm test -w @gsd/pi-ai -- --test-name-pattern="models-dev live verification"`
2. Observe console output includes:
   - `Skipped: LIVE_MODELS_DEV_TEST env var is set to 'false' or '0'`
3. **Expected:** Test passes (✔) without network call, completes in <5ms

### 3. Full test suite includes live test

1. Run: `npm test -w @gsd/pi-ai`
2. Observe output includes `models-dev live verification` test
3. **Expected:** All 32 tests pass, including live verification

## Edge Cases

### Network failure produces clear error message

1. Temporarily block network or use invalid URL (requires code modification)
2. Run test without env var skip
3. **Expected:** Assertion failure message includes:
   - `Network failure: Could not fetch from https://models.dev/api.json`
   - Suggestion to check network connectivity

### Schema validation failure shows Zod error

1. If upstream returns malformed data, Zod validation in `fetchModelsDev` will throw before test assertion
2. **Expected:** Zod validation error with field path and message

## Failure Signals

- Test suite reports fewer than 32 tests (live test not discovered)
- Test times out after 35s (network issue with no clear error)
- Assertion failure without diagnostic context (missing console.log statements)
- Skip message appears when `LIVE_MODELS_DEV_TEST` is not set (logic error in shouldRunLiveTest)

## Requirements Proved By This UAT

- R009 — Live test fetches from real models.dev API, validates response structure via Zod schema, confirms mapper produces non-empty output; env var gate allows CI/offline control

## Not Proven By This UAT

- Does not prove offline fallback behavior (covered by S02 scenario tests)
- Does not prove cache lifecycle (covered by S02 scenario tests)
- Does not prove all edge cases in mapper (covered by S01 mapper unit tests)

## Notes for Tester

- Test requires network access to models.dev — if testing in restricted environment, use `LIVE_MODELS_DEV_TEST=0` to skip
- Test duration varies with network latency but should complete well under 30s timeout
- Console output is intentional diagnostic surface — do not suppress
