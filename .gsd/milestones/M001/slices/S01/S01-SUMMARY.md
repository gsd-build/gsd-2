---
id: S01
parent: M001
milestone: M001
provides:
  - Zod schemas for models.dev API response structure
  - Mapper function transforming models.dev schema to gsd-2 Model<Api>[] format
  - Fetch/cache/fallback orchestration with 12h TTL and version invalidation
  - Unit tests proving fetch → cache → fallback chain works correctly
requires: []
affects:
  - S02
key_files:
  - packages/pi-ai/src/models-dev-types.ts
  - packages/pi-ai/src/models-dev-mapper.ts
  - packages/pi-ai/src/models-dev.ts
  - packages/pi-ai/src/models-dev-mapper.test.ts
  - packages/pi-ai/src/models-dev.test.ts
key_decisions:
  - Used exported Zod schemas (not namespace) for --experimental-strip-types compatibility
  - Test imports use .ts extension directly to work with custom ESM resolver
  - API type inference based on provider ID substring matching
  - Lazy resolution for VERSION/getAgentDir to avoid build dependency during tests
  - All functions accept optional parameters for testability (cachePath, version, ttlMs)
  - Network errors never throw, always return null and fall back to cache
patterns_established:
  - Cache → fetch → fallback chain for resilient network operations
  - Version-based cache invalidation for release-triggered refreshes
  - Zod schema validation before mapping
  - Safe parsing with graceful skip for invalid data
observability_surfaces:
  - Cache file at ~/.gsd/agent/cache/models-dev.json can be inspected directly
  - Structure: { version: string, fetchedAt: number, data: ModelsDevData }
  - Network errors return null (would log in production)
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
duration: 4h
verification_result: passed
completed_at: 2026-03-14
---

# S01: models.dev fetching with caching

**Zod schemas, mapper, and fetch/cache/fallback orchestration for models.dev API with 12h TTL, version invalidation, and graceful network failure handling — proven by 31 unit tests.**

## What Happened

Built the complete models.dev integration layer in two tasks:

**T01 — Types and Mapper:** Created Zod schemas for ModelsDevModel, ModelsDevProvider, and ModelsDevData based on the opencode reference. Implemented `mapToModelRegistry()` to transform the external schema to gsd-2's `Model<Api>[]` format with field mappings:
- Cost: `cache_read/cache_write` → `cacheRead/cacheWrite`
- Limits: `limit.context` → `contextWindow`, `limit.output` → `maxTokens`
- Modalities: Filtered to text/image only
- API type inferred from provider ID (anthropic→anthropic-messages, google→google-generative-ai, etc.)

**T02 — Fetch/Cache/Fallback:** Implemented the orchestration layer:
- `fetchModelsDev()` — 10s timeout, returns null on error
- `getCachedModelsDev()` — Reads cache file with structure validation
- `isCacheValid()` — TTL (12h) and version checks
- `getModelsDev()` — Cache → fetch → fallback chain
- `refreshModelsDev()` — Force refresh ignoring valid cache

All functions designed for testability with optional parameters, and network errors never throw.

## Verification

**All 31 unit tests pass:**
- 14 mapper tests: Schema validation, all field mappings, defaults, edge cases
- 17 orchestration tests: Cache hit/miss, TTL expiry, version change, network failure fallback, force refresh

```
✔ models-dev-mapper (14 tests)
✔ models-dev cache functions (10 tests)
✔ models-dev fetch functions (7 tests)
```

Verified scenarios:
- ✅ Zod schemas validate models.dev API response structure
- ✅ Mapper correctly transforms all required Model<Api> fields
- ✅ Cache read/write with proper structure validation
- ✅ TTL expiration triggers fetch
- ✅ Version mismatch triggers fetch
- ✅ Network failure falls back to stale cache
- ✅ Force refresh ignores valid cache

## Requirements Advanced

- R001 — Implemented fetchModelsDev() with 10s timeout, ready for S02 integration
- R002 — Cache file at ~/.gsd/agent/cache/models-dev.json with 12h TTL, fallback on network failure
- R003 — Version comparison in isCacheValid() triggers refresh on VERSION change

## Requirements Validated

- R001 — Unit tests prove fetch works with mocked network (contract-level proof)
- R002 — Unit tests prove 12h TTL and fallback chain (contract-level proof)
- R003 — Unit tests prove version invalidation (contract-level proof)

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

None — implemented exactly as specified in slice plan.

## Known Limitations

- No bundled snapshot yet (S03)
- Not integrated into ModelRegistry yet (S02)
- No logging in production code (would add in S02)

## Follow-ups

- S02 will integrate getModelsDev() into ModelRegistry
- S03 will add bundled snapshot for offline-first cold start

## Files Created/Modified

- `packages/pi-ai/src/models-dev-types.ts` — Zod schemas and inferred types for models.dev API
- `packages/pi-ai/src/models-dev-mapper.ts` — mapToModelRegistry() and parseModelsDevData() functions
- `packages/pi-ai/src/models-dev.ts` — Fetch/cache/fallback orchestration (170 lines)
- `packages/pi-ai/src/models-dev-mapper.test.ts` — 14 unit tests proving mapper correctness
- `packages/pi-ai/src/models-dev.test.ts` — 17 unit tests proving orchestration works
- `packages/pi-ai/src/index.ts` — Added exports for new modules

## Forward Intelligence

### What the next slice should know
- Use `getModelsDev()` in ModelRegistry — it handles the full cache → fetch → fallback chain
- Call `mapToModelRegistry(data)` to transform the raw API data to Model<Api>[]
- VERSION and getAgentDir are lazily resolved, so no import issues
- All functions have optional parameters for testing if needed

### What's fragile
- API type inference uses provider ID substring matching — if a new provider doesn't match patterns, it defaults to 'openai'
- Cache file format must stay compatible (version, fetchedAt, data fields)

### Authoritative diagnostics
- Unit test output shows exact field values and scenarios
- Cache file at ~/.gsd/agent/cache/models-dev.json is the runtime truth

### What assumptions changed
- Assumed we'd need build-time generation for the snapshot — still true, but S03 handles it
- Assumed network errors might throw — they return null instead, simplifying fallback logic
