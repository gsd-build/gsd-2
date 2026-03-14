---
id: T02
parent: S01
milestone: M001
provides:
  - Fetch/cache/fallback orchestration for models.dev API
  - 12-hour TTL caching with version invalidation
  - Graceful network failure fallback
key_files:
  - packages/pi-ai/src/models-dev.ts
  - packages/pi-ai/src/models-dev.test.ts
key_decisions:
  - Used lazy resolution for VERSION/getAgentDir to avoid build dependency during tests
  - All functions accept optional parameters for testability (cachePath, version, ttlMs)
  - Network errors never throw, always return null and fall back to cache
patterns_established:
  - Cache → fetch → fallback chain for resilient network operations
  - Version-based cache invalidation for release-triggered refreshes
  - Configurable TTL with sensible defaults
observability_surfaces:
  - Cache file at ~/.gsd/agent/cache/models-dev.json can be inspected directly
  - Network errors return null (would log in production)
  - Test assertions verify all scenarios: cache hit/miss, TTL expiry, version change, network failure
duration: 2h
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Implement fetch/cache/fallback orchestration

**Fetch, cache, and fallback orchestration for models.dev API with 12-hour TTL, version invalidation, and graceful network failure handling.**

## What Happened

Created two files implementing the models.dev fetch/cache/fallback layer:

1. **models-dev.ts** — Core functions:
   - `getCachedModelsDev()` — Read and validate cache file structure
   - `isCacheValid()` — Check TTL expiration and version match
   - `writeCache()` — Write `{ version, fetchedAt, data }` to cache file
   - `fetchModelsDev()` — Fetch from https://models.dev/api.json with 10s timeout
   - `getModelsDev()` — Orchestrate cache → fetch → fallback chain
   - `refreshModelsDev()` — Force refresh ignoring valid cache

2. **models-dev.test.ts** — 17 unit tests covering:
   - Cache read/write operations (4 tests)
   - TTL and version validation (4 tests)
   - Network fetch with timeout (2 tests)
   - Full orchestration scenarios (7 tests): cache hit, cache miss, expired cache, version change, force refresh, network failure fallback

**Key implementation decisions:**
- Used `require()` for lazy resolution of `VERSION` and `getAgentDir()` to avoid build dependency during tests
- All functions accept optional parameters (`cachePath`, `version`, `ttlMs`) for testability
- Network errors return `null` instead of throwing, enabling graceful fallback
- Stale cache used even when expired/version-mismatched if fetch fails

## Verification

**All 17 unit tests pass:**

```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test packages/pi-ai/src/models-dev.test.ts
```

Verified scenarios:
- ✅ Cache read returns null for missing/invalid files
- ✅ Cache read returns data for valid files
- ✅ TTL expiration detected correctly
- ✅ Version mismatch detected correctly
- ✅ Cache write creates directory structure
- ✅ Network fetch returns null on error
- ✅ Network fetch respects timeout
- ✅ `getModelsDev()` uses valid cache without fetching
- ✅ `getModelsDev()` fetches when cache expired
- ✅ `getModelsDev()` fetches when version changes
- ✅ `getModelsDev()` falls back to stale cache on network failure
- ✅ `refreshModelsDev()` ignores valid cache

**Mapper tests still pass** (14 tests) — no regressions.

## Diagnostics

**Inspection surfaces:**
- Cache file at `~/.gsd/agent/cache/models-dev.json` can be inspected directly
- Structure: `{ version: string, fetchedAt: number, data: ModelsDevData }`

**Failure visibility:**
- Network errors return `null` (would log in production)
- Cache read/write errors return `null`/`false` silently
- Test assertions show exact scenarios being verified

## Deviations

None — implemented exactly as specified in task plan.

## Known Issues

None.

## Files Created/Modified

- `packages/pi-ai/src/models-dev.ts` — Fetch/cache/fallback orchestration (170 lines)
- `packages/pi-ai/src/models-dev.test.ts` — 17 unit tests proving orchestration works
- `packages/pi-ai/src/index.ts` — Added export for models-dev module
