# S01: models.dev fetching with caching

**Goal:** Implement runtime fetching of model data from models.dev/api.json with file-based caching (12h TTL), version-triggered cache invalidation, and graceful network failure fallback.

**Demo:** Unit tests prove the fetch → cache → fallback chain works correctly, including version change detection and TTL expiration.

## Must-Haves

- Zod schemas for models.dev API response (providers + models)
- Mapper function transforms models.dev schema to gsd-2 `Model<Api>[]`
- Fetch function with 10s timeout, non-blocking
- Cache file at `~/.gsd/agent/cache/models-dev.json` with structure `{ version, fetchedAt, data }`
- 12-hour TTL on cache (configurable)
- Version invalidation: cached version compared to current VERSION
- Fallback chain: cache → fetch → cache-on-failure
- Network errors silently fall back to cache, never crash

## Proof Level

- This slice proves: contract
- Real runtime required: no (mocked tests suffice)
- Human/UAT required: no

## Verification

- `npm test -- --test-name-pattern "models-dev-mapper"` — Mapper transforms sample models.dev data correctly
- `npm test -- --test-name-pattern "models-dev"` — Fetch/cache/fallback chain works with mocked network and filesystem

## Observability / Diagnostics

- Runtime signals: Cache hits/misses logged at debug level, fetch errors logged with context
- Inspection surfaces: Cache file `~/.gsd/agent/cache/models-dev.json` can be inspected directly
- Failure visibility: Network errors logged but don't block; stale cache used when fetch fails
- Redaction constraints: None (no secrets in model data)

## Integration Closure

- Upstream surfaces consumed: `packages/pi-coding-agent/src/config.ts` (VERSION, getAgentDir())
- New wiring introduced in this slice: None (S02 integrates into ModelRegistry)
- What remains before the milestone is truly usable end-to-end: S02 integrates fetch functions into ModelRegistry, S03 adds bundled snapshot

## Tasks

- [x] **T01: Build models.dev types and mapper** `est:1h`
  - Why: Proves schema mapping works, retires "schema mismatch" risk from roadmap
  - Files: `packages/pi-ai/src/models-dev-types.ts`, `packages/pi-ai/src/models-dev-mapper.ts`, `packages/pi-ai/src/models-dev-mapper.test.ts`
  - Do: Define Zod schemas for models.dev API response structure. Implement mapToModelRegistry() to transform models.dev providers/models to Model<Api>[]. Handle field mappings (cost.input/output, limit.context/output, modalities). Set defaults for missing fields (api, baseUrl, headers).
  - Verify: `npm test -- --test-name-pattern "models-dev-mapper"`
  - Done when: Mapper correctly transforms sample models.dev response to Model<Api>[] with all required fields populated

- [x] **T02: Implement fetch/cache/fallback orchestration** `est:2h`
  - Why: Implements core runtime logic for R001 (fetch), R002 (cache with fallback), R003 (version invalidation)
  - Files: `packages/pi-ai/src/models-dev.ts`, `packages/pi-ai/src/models-dev.test.ts`
  - Do: Implement fetchModelsDev() with 10s timeout. Implement getCachedModelsDev() with 12h TTL check. Implement getModelsDev() orchestrating cache → fetch → fallback chain. Add version invalidation (compare cached version to VERSION). Cache file structure: { version, fetchedAt, data }. Write tests with mocked fetch and fs.
  - Verify: `npm test -- --test-name-pattern "models-dev"`
  - Done when: Tests prove fetch → cache → fallback chain works, version change triggers refresh, TTL expiration triggers fetch, network errors fall back gracefully

## Files Likely Touched

- `packages/pi-ai/src/models-dev-types.ts` (new)
- `packages/pi-ai/src/models-dev-mapper.ts` (new)
- `packages/pi-ai/src/models-dev.ts` (new)
- `packages/pi-ai/src/models-dev-mapper.test.ts` (new)
- `packages/pi-ai/src/models-dev.test.ts` (new)
