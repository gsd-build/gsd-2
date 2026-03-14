---
estimated_steps: 7
estimated_files: 2
---

# T02: Implement fetch/cache/fallback orchestration

**Slice:** S01 — models.dev fetching with caching
**Milestone:** M001

## Description

Implement the runtime fetch/cache/fallback logic that retrieves model data from models.dev, caches it locally with 12-hour TTL, invalidates cache on version changes, and gracefully falls back to cached data when network requests fail. This task delivers requirements R001 (fetch), R002 (cache with fallback), and R003 (version invalidation).

## Steps

1. Create `packages/pi-ai/src/models-dev.ts` with core functions:
   - fetchModelsDev(): Fetch from https://models.dev/api.json with 10s timeout
   - getCachedModelsDev(): Read and validate cache file, check TTL and version
   - getModelsDev(): Orchestrate cache → fetch → fallback chain
   - writeCache(): Write { version, fetchedAt, data } to cache file

2. Implement cache file structure:
   - Path: `~/.gsd/agent/cache/models-dev.json`
   - Structure: `{ version: string, fetchedAt: number, data: ModelsDevData }`
   - Use getAgentDir() from config.ts to resolve cache directory

3. Implement TTL logic:
   - Default 12 hours (43200000 ms)
   - Configurable via parameter for testing
   - Skip fetch if cache exists and fetchedAt is within TTL

4. Implement version invalidation:
   - Compare cached version with VERSION from config.ts
   - Force refresh if versions differ (new release may need updated models)

5. Implement fallback chain:
   - Try cache first (if valid and not expired)
   - If cache invalid/expired, try network fetch
   - If network fails, fall back to stale cache (log warning)
   - Never throw on network errors

6. Create test file with mocked dependencies:
   - Mock fetch to return sample data or simulate failures
   - Mock fs operations for cache read/write
   - Test each scenario: cache hit, cache miss, network error, version change, TTL expiration

7. Export public API:
   - getModelsDev(): Main entry point
   - fetchModelsDev(): For forced refresh
   - getCachedModelsDev(): For cache inspection

## Must-Haves

- [ ] Fetch from models.dev/api.json with 10s timeout
- [ ] Cache file at ~/.gsd/agent/cache/models-dev.json
- [ ] 12-hour TTL on cache (configurable)
- [ ] Version invalidation: cache refreshed when VERSION changes
- [ ] Fallback chain: cache → fetch → stale cache on error
- [ ] Network errors never crash, always fall back gracefully
- [ ] Unit tests cover all scenarios with mocked fetch/fs

## Verification

- Run: `npm test -- --test-name-pattern "models-dev"`
- Test scenarios:
  - Fresh install (no cache): fetches from network
  - Cache hit (valid, within TTL): returns cached data, no fetch
  - Cache expired (TTL passed): fetches from network, updates cache
  - Network error: falls back to stale cache
  - Version change: ignores TTL, forces fetch
  - Cache write failure: logs error but doesn't crash

## Observability Impact

- Signals added/changed: Debug logs for cache hit/miss, fetch success/failure, version mismatch
- How a future agent inspects this: Read cache file directly, check console logs for fetch status
- Failure state exposed: Network errors logged with error message, cache read/write errors logged

## Inputs

- `packages/pi-ai/src/models-dev-types.ts` — ModelsDevData type (from T01)
- `packages/pi-coding-agent/src/config.ts` — VERSION, getAgentDir()
- `src/update-check.ts` — Reference pattern for cached network fetch

## Expected Output

- `packages/pi-ai/src/models-dev.ts` — Fetch/cache/fallback implementation
- `packages/pi-ai/src/models-dev.test.ts` — Unit tests proving orchestration works
