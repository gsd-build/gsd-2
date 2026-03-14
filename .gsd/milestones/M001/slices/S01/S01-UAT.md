# S01: models.dev fetching with caching — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice is contract-level infrastructure with no user-facing UI. All behavior is proven by unit tests. UAT confirms the tests exist and pass.

## Preconditions

- Node.js 20+ available
- Repository at gsd-2 root
- `npm install` completed (Zod dependency)

## Smoke Test

```bash
# Run all models-dev tests
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test "packages/pi-ai/src/models-dev*.test.ts"
```

**Expected:** All 31 tests pass (14 mapper + 17 orchestration).

## Test Cases

### 1. Mapper transforms models.dev schema correctly

1. Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test packages/pi-ai/src/models-dev-mapper.test.ts`
2. **Expected:** 14 tests pass covering:
   - Schema validation (valid/invalid data)
   - Field name mapping (camelCase conversion)
   - Cost values preserved
   - ContextWindow/maxTokens from limit fields
   - Modalities filtered to text/image
   - API type inference from provider ID
   - Default values for missing fields

### 2. Fetch/cache/fallback chain works

1. Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test packages/pi-ai/src/models-dev.test.ts`
2. **Expected:** 17 tests pass covering:
   - Cache read/write operations
   - TTL expiration detection
   - Version mismatch detection
   - Network fetch with timeout
   - Cache hit scenario (no fetch)
   - Cache miss scenario (fetch + write)
   - Network failure fallback to stale cache
   - Force refresh ignores valid cache

### 3. Cache file structure is correct

1. Inspect test code in `packages/pi-ai/src/models-dev.test.ts`
2. Verify cache structure: `{ version: string, fetchedAt: number, data: ModelsDevData }`
3. **Expected:** Tests assert this structure in `writeCache` and `getCachedModelsDev` tests

## Edge Cases

### Models without modalities

1. Check test: "should handle models without modalities"
2. **Expected:** Model defaults to text-only modalities

### Missing cost fields

1. Check test: "should handle missing optional cost fields with defaults"
2. **Expected:** cacheRead and cacheWrite default to 0

### Network timeout

1. Check test: "respects timeout"
2. **Expected:** Fetch returns null after 10s timeout

### Stale cache used on network failure

1. Check test: "fetches when cache is expired" and fallback behavior in getModelsDev tests
2. **Expected:** Expired cache still used if fetch fails

## Failure Signals

- Any test failures in the 31-unit test suite
- TypeScript compilation errors in models-dev*.ts files
- Missing Zod dependency

## Requirements Proved By This UAT

- R001 — Fetch works with 10s timeout (test: "respects timeout", "returns null on network error")
- R002 — 12h TTL cache with fallback (tests: isCacheValid scenarios, getModelsDev orchestration)
- R003 — Version invalidation (test: "returns false when version doesn't match")

## Not Proven By This UAT

- Live network fetch to real models.dev/api.json (S02 integration test)
- ModelRegistry integration (S02)
- Bundled snapshot for offline-first (S03)
- End-to-end `pi --list-models` with models.dev data (S02)

## Notes for Tester

This is pure infrastructure with no CLI integration yet. S02 will wire it into ModelRegistry for end-to-end testing. The 31 unit tests provide complete contract-level coverage.
