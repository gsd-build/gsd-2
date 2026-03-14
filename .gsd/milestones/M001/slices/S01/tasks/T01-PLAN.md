---
estimated_steps: 5
estimated_files: 3
---

# T01: Build models.dev types and mapper

**Slice:** S01 — models.dev fetching with caching
**Milestone:** M001

## Description

Define Zod schemas for the models.dev API response structure and implement a mapper function that transforms the models.dev schema into gsd-2's `Model<Api>[]` format. This task proves the schema mapping works and retires the "schema mismatch" risk from the roadmap.

## Steps

1. Create `packages/pi-ai/src/models-dev-types.ts` with Zod schemas for models.dev Provider and Model structures (based on opencode reference)
2. Export inferred TypeScript types from the Zod schemas (ModelsDevProvider, ModelsDevModel, ModelsDevData)
3. Create `packages/pi-ai/src/models-dev-mapper.ts` with mapToModelRegistry() function
4. Implement field mappings:
   - cost.input/output/cache_read/cache_write → Model.cost.input/output/cacheRead/cacheWrite
   - limit.context → Model.contextWindow, limit.output → Model.maxTokens
   - modalities.input → Model.input (filter to "text" | "image" only)
   - provider ID → Model.provider, model ID → Model.id
5. Set defaults for missing fields:
   - Model.api: infer from provider or use "openai-completions"
   - Model.baseUrl: use provider-level api field or empty string
   - Model.headers: empty object
   - Model.name: use models.dev name field
   - Model.reasoning: use models.dev reasoning boolean
6. Create test file with sample models.dev response data and verify mapper output matches Model<Api> interface

## Must-Haves

- [ ] Zod schemas validate models.dev API response structure
- [ ] Mapper correctly transforms all required Model<Api> fields
- [ ] Optional fields (cacheRead, cacheWrite, modalities) handled safely
- [ ] Default values set for api, baseUrl, headers
- [ ] Unit tests pass with sample models.dev data

## Verification

- Run: `npm test -- --test-name-pattern "models-dev-mapper"`
- Test should include:
  - Sample models.dev response with at least 2 providers and 3 models
  - Verify mapper output has correct field names (camelCase)
  - Verify cost values preserved correctly
  - Verify contextWindow and maxTokens set from limit fields
  - Verify modalities filtered to text/image only

## Inputs

- `packages/pi-ai/src/types.ts` — Model<Api> interface definition
- `~/Documents/kimi-coding-check/opencode/packages/opencode/src/provider/models.ts` — Reference Zod schemas

## Expected Output

- `packages/pi-ai/src/models-dev-types.ts` — Zod schemas and inferred types for models.dev API
- `packages/pi-ai/src/models-dev-mapper.ts` — mapToModelRegistry() function
- `packages/pi-ai/src/models-dev-mapper.test.ts` — Unit tests proving mapper works

## Observability Impact

**New signals:** None at runtime — this is a pure mapping layer with no logging.

**Inspection surfaces:** 
- Mapper output can be inspected via unit test output
- Type errors will surface at compile time via TypeScript

**Failure visibility:**
- Zod validation errors will throw with clear messages if models.dev schema changes
- Mapper will produce TypeScript errors if Model<Api> interface changes

**Redaction constraints:** None (no secrets in model data)
