---
id: T01
parent: S01
milestone: M001
provides:
  - Zod schemas for models.dev API response structure
  - Mapper function transforming models.dev schema to gsd-2 Model<Api>[] format
  - Unit tests proving schema validation and field mapping correctness
key_files:
  - packages/pi-ai/src/models-dev-types.ts
  - packages/pi-ai/src/models-dev-mapper.ts
  - packages/pi-ai/src/models-dev-mapper.test.ts
key_decisions:
  - Used exported Zod schemas (not namespace) for --experimental-strip-types compatibility
  - Test imports use .ts extension directly to work with custom ESM resolver
  - API type inference based on provider ID substring matching
patterns_established:
  - Zod schema validation before mapping
  - Safe parsing with graceful skip for invalid data
  - Default values for optional fields (cacheRead/cacheWrite default to 0)
observability_surfaces:
  - Unit test output shows field-level mapping verification
  - Zod validation errors provide clear schema mismatch messages
duration: 2h
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Build models.dev types and mapper

**Zod schemas and mapper implementation for models.dev API integration, with comprehensive unit tests proving correct field transformation.**

## What Happened

Created three files implementing the models.dev schema layer:

1. **models-dev-types.ts** — Defined Zod schemas for ModelsDevModel, ModelsDevProvider, and ModelsDevData based on the opencode reference. Exported inferred TypeScript types for type-safe usage.

2. **models-dev-mapper.ts** — Implemented `mapToModelRegistry()` function with field mappings:
   - Cost: `cache_read/cache_write` → `cacheRead/cacheWrite` (camelCase)
   - Limits: `limit.context` → `contextWindow`, `limit.output` → `maxTokens`
   - Modalities: Filtered to text/image only (excluded audio/video/pdf)
   - Provider/model IDs preserved from source
   - Defaults: `api` inferred from provider ID, `baseUrl` from provider.api, `headers` as empty object

3. **models-dev-mapper.test.ts** — Created 14 unit tests with sample data covering:
   - Schema validation (valid/invalid data)
   - All required field mappings (cost, limits, modalities, provider, api, baseUrl)
   - Default value handling for missing optional fields
   - Edge case: models without modalities default to text-only

**Key implementation decisions:**
- Avoided TypeScript namespaces (not supported by `--experimental-strip-types`)
- Used exported const schemas with inferred types instead
- Test imports use `.ts` extension to work with custom ESM resolver
- API type inference uses provider ID substring matching (anthropic→anthropic-messages, google→google-generative-ai, etc.)
- Missing cost fields (cache_read/cache_write) default to 0

## Verification

**All 14 unit tests pass:**
```
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test packages/pi-ai/src/models-dev-mapper.test.ts
```

Verified:
- ✅ Zod schemas validate models.dev API response structure
- ✅ Mapper correctly transforms all required Model<Api> fields
- ✅ Optional fields (cacheRead, cacheWrite, modalities) handled safely
- ✅ Default values set for api, baseUrl, headers
- ✅ Unit tests pass with sample models.dev data (2 providers, 4 models)
- ✅ Field names use camelCase (cacheRead, cacheWrite, contextWindow, maxTokens)
- ✅ Cost values preserved correctly
- ✅ ContextWindow and maxTokens set from limit fields
- ✅ Modalities filtered to text/image only

## Diagnostics

**Inspection surfaces:**
- Run test command above to verify mapper output
- Zod validation errors include detailed schema mismatch messages
- Test assertions show exact field values for debugging

**Failure visibility:**
- Invalid provider/model data is skipped silently (would log in production)
- `parseModelsDevData()` returns `null` for completely invalid input
- TypeScript catches type mismatches at compile time

## Deviations

None — implemented exactly as specified in task plan.

## Known Issues

None.

## Files Created/Modified

- `packages/pi-ai/src/models-dev-types.ts` — Zod schemas and inferred types for models.dev API
- `packages/pi-ai/src/models-dev-mapper.ts` — mapToModelRegistry() and parseModelsDevData() functions
- `packages/pi-ai/src/models-dev-mapper.test.ts` — 14 unit tests proving mapper correctness
- `packages/pi-ai/src/index.ts` — Added exports for new modules
- `packages/pi-ai/package.json` — Zod dependency added (auto-installed)
