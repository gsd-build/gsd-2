# S03: Live models.dev Verification — Research

**Date:** 2026-03-14

## Summary

S03 delivers R009 by adding a live verification test against the real models.dev API to the main test suite. The test fetches from https://models.dev/api.json, validates the response structure against the existing `ModelsDevData` Zod schema, and verifies that the mapper produces valid gsd-2 `Model<Api>[]` output. This provides upstream compatibility checking and fails loudly if models.dev makes breaking API changes.

The implementation is straightforward: add a new test file `packages/pi-ai/src/models-dev-live.test.ts` (or integrate into the existing `models-dev.test.ts`) that calls `fetchModelsDev()` with the production URL and validates the result. The test needs a 30-second timeout to accommodate network latency and upstream response time. On failure, diagnostics must clearly distinguish between network errors (timeout, DNS, connection refused) and assertion failures (schema validation errors, missing required fields).

Three implementation options exist: (1) add a dedicated `it()` test in `models-dev.test.ts` with extended timeout, (2) create a separate `models-dev-live.test.ts` file that can be run selectively, or (3) use `describe.skip` with a `LIVE_TEST` env var to gate execution. Option 2 is recommended because it makes the live test explicit and allows CI to run it separately with appropriate timeout/retry policies while keeping it part of the standard `npm test` workflow.

The existing infrastructure supports this work: `fetchModelsDev()` already returns `ModelsDevData | null`, the `ModelsDevData` Zod schema validates the API response structure, and `mapToModelRegistry()` transforms the data into gsd-2 format. The test only needs to wire these together with clear failure diagnostics.

## Recommendation

Add a dedicated test file `packages/pi-ai/src/models-dev-live.test.ts` containing a single test that:
1. Calls `fetchModelsDev()` with the production URL (10s timeout)
2. Asserts the result is non-null (fails with clear message if network error)
3. Validates against `ModelsDevData.parse()` (fails with schema errors if API changed)
4. Passes through `mapToModelRegistry()` and verifies non-empty model array
5. Logs key diagnostics on failure: raw response size, provider count, sample model IDs

Configure the test with a 30-second timeout via the `timeout` option in the test descriptor. Add a `LIVE_MODELS_DEV_TEST` environment variable that can skip the test if needed (e.g., CI runs without network access), but default to running it as part of the main suite per R009.

This approach:
- **Minimizes risk** — isolated test file, doesn't interfere with existing unit tests
- **Provides clear diagnostics** — failures show whether it was network vs. schema vs. mapping
- **Enables selective execution** — CI can run with different timeout/retry policies
- **Maintains main suite integration** — runs with `npm test` by default

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Zod schema validation | `ModelsDevData.parse()` in `models-dev-types.ts` | Single source of truth for API structure; already validated against real data |
| API fetch with timeout | `fetchModelsDev()` in `models-dev.ts` | Handles AbortController timeout, returns null on error, already Zod-validates response |
| Mapping to Model[] format | `mapToModelRegistry()` in `models-dev-mapper.ts` | Transforms models.dev format to gsd-2 `Model<Api>[]`; tested with sample data |
| Test timeout configuration | Node.js test runner `timeout` option | Built-in support for extended timeouts; no custom harness needed |
| Test isolation | Node.js `describe`/`it` blocks | Existing test patterns in `models-dev.test.ts` already use this structure |

## Existing Code and Patterns

- `packages/pi-ai/src/models-dev-types.ts` — `ModelsDevData` Zod schema; use `ModelsDevData.parse(data)` for validation, catch `ZodError` for diagnostics
- `packages/pi-ai/src/models-dev.ts` — `fetchModelsDev(url, timeoutMs)` returns `ModelsDevData | null`; already includes 10s default timeout and Zod parsing
- `packages/pi-ai/src/models-dev-mapper.ts` — `mapToModelRegistry(data)` transforms `ModelsDevData` to `Model<Api>[]`; returns flat array of models
- `packages/pi-ai/src/models-dev.test.ts` — Existing test patterns: `describe`/`it` blocks, `tmpdir()` for isolation, `assert.ok()` for assertions, `before`/`after` hooks for cleanup
- `packages/pi-ai/package.json` — Test script: `node --import ../../src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/**/*.test.ts`
- `packages/pi-coding-agent/src/core/model-registry.test.ts` — Integration test patterns with `SAMPLE_MODELS_DEV_DATA` fixture showing expected API structure

## Constraints

- **Node.js version**: >=20.6.0 required (root `package.json` engines field)
- **Test timeout**: 30 seconds minimum for live test (network + upstream latency)
- **Network dependency**: Test will fail if models.dev is unreachable; diagnostics must distinguish network vs. assertion failures
- **Zod v4**: Using Zod v4 APIs (v4.3.6 in dependencies); error handling via `ZodError` with `.errors` array
- **Module resolution**: Node16 with `.js` import specifiers (D017)
- **Test runner**: Node.js built-in `node:test` module; no Jest/Mocha patterns

## Common Pitfalls

- **Insufficient timeout** — The default 10s fetch timeout in `fetchModelsDev()` is appropriate for runtime but may be tight for CI. The test itself should have a 30s overall timeout to allow for retry logic or slow upstream responses. Don't increase the fetch timeout beyond 10s — that's a runtime setting.

- **Unclear failure diagnostics** — A bare `assert.ok(data)` failure doesn't help diagnose whether models.dev changed their API or the network failed. Always include the error message: `assert.ok(data, "Live fetch failed: check network or upstream API")`. For schema errors, log the Zod error details.

- **Test pollution** — Even though this test doesn't write to the cache, it should not depend on cache state. Use `forceRefresh: true` or a unique cache path to ensure the test actually fetches from the network.

- **Assuming non-empty response** — The API could return an empty provider list on error. Validate that `Object.keys(data).length > 0` and that the mapped model array is non-empty.

- **Hardcoding provider/model expectations** — Don't assert that specific providers (e.g., "openai") exist — models.dev may add/remove providers. Instead, validate structural properties: at least N providers, each has required fields (name, id, models), models have required fields (id, name, cost, limit).

## Open Risks

- **models.dev API instability** — The API may change structure, add/remove required fields, or have downtime. The Zod schema validation will catch breaking changes, but the test may flake due to upstream issues. Clear diagnostics are essential.

- **CI network restrictions** — Some CI environments block outbound network access or have strict egress policies. The `LIVE_MODELS_DEV_TEST` env var can gate execution, but this reduces the value of R009. Document the tradeoff.

- **Test execution time** — A 30s timeout test will slow down the main suite if it hangs. Node's test runner should respect the timeout, but monitor for cases where the test doesn't complete within the expected window.

- **Upstream rate limiting** — models.dev may rate-limit frequent requests. The test runs once per test suite execution, which should be acceptable, but CI running every commit could trigger rate limits. Consider adding a retry-with-backoff mechanism if this becomes an issue.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Node.js test runner | Built-in `node:test` module | Available — already used in all pi-ai tests |
| Zod validation | Runtime schema validation | Available — `ModelsDevData` schema exists and is used |
| models.dev API | Direct HTTP fetch | No skill needed — `fetchModelsDev()` handles this |
| TypeScript ESM | `.js` import specifiers | Available — established pattern in S01 |

No external agent skills are needed — this is standard Node.js/TypeScript testing with existing project infrastructure.

## Sources

- M002 Roadmap and Requirements (source: `.gsd/milestones/M002/M002-ROADMAP.md`, `.gsd/REQUIREMENTS.md`)
- Existing models.dev test patterns (source: `packages/pi-ai/src/models-dev.test.ts`)
- Zod schema definition (source: `packages/pi-ai/src/models-dev-types.ts`)
- Fetch/cache orchestration (source: `packages/pi-ai/src/models-dev.ts`)
- Mapper implementation (source: `packages/pi-ai/src/models-dev-mapper.ts`)
- models.dev API structure (source: live fetch from https://models.dev/api.json)
- Node.js test runner documentation (source: Node.js v20+ `node:test` module)

## Candidate Requirements (Advisory Only)

These are surfaced from research but **not automatically in scope** — require explicit confirmation:

- **C005 — Live test environment variable gate** — Add a `LIVE_MODELS_DEV_TEST=true` environment variable that enables the live test, defaulting to enabled in local dev but allowing CI to opt-out if network access is restricted. This balances R009's intent with practical CI constraints.

- **C006 — Live test retry mechanism** — Implement a simple retry-with-backoff (e.g., 2 retries, 1s delay) for the live fetch to handle transient network failures without failing the entire test suite. This reduces flakiness while maintaining the explicit failure surface.

- **C007 — Live test artifact output** — On failure, write the raw API response (or error details) to a temp file for post-mortem analysis. This helps diagnose whether failures are network-related or actual API changes.
