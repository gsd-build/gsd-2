# S01: models.dev fetching with caching — Research

**Date:** 2026-03-14
**Status:** Ready for planning

## Summary

This slice implements runtime fetching of model data from models.dev/api.json with file-based caching (12h TTL), version-triggered cache invalidation, and graceful network failure fallback. The approach mirrors opencode's pattern but adapted for gsd-2's architecture and caching conventions.

**Primary recommendation:** Implement three core modules in `packages/pi-ai/src/`:
1. `models-dev-types.ts` — Zod schemas for models.dev API response
2. `models-dev-mapper.ts` — Transform models.dev schema to gsd-2 `Model<Api>[]`
3. `models-dev-fetch.ts` — Fetch/cache/fallback logic with version invalidation

The models.dev schema is compatible with our needs but requires mapping (different field names, nested structure with providers wrapping models). Cache stored in `~/.gsd/agent/cache/models-dev.json` with structure `{ version, fetchedAt, data }`.

## Recommendation

Implement the fetch/cache/fallback chain as pure functions (not a class) following the update-check.ts pattern. This keeps the module stateless and testable. The ModelRegistry will call these functions during initialization.

**Why this approach:**
- Matches existing gsd-2 patterns (update-check.ts for caching, model-registry.ts for loading)
- Stateless functions are easier to test than classes with internal state
- File-based cache enables offline debugging (user can inspect/edit cache file)
- Graceful degradation ensures CLI startup never blocks on network

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Cached network fetch with TTL | `src/update-check.ts` | Already implements cache file pattern with TTL, error handling, and non-blocking fetch |
| Schema validation | opencode's Zod schemas | Battle-tested against models.dev schema changes, used in production |
| Async lazy loading | opencode's `lazy()` helper | Prevents blocking startup, defers fetch until first access |

## Existing Code and Patterns

- `src/update-check.ts` — Cached network fetch pattern with 24h TTL, file-based cache, non-blocking fetch with timeout. **Use this pattern** for models.dev fetching (adapt TTL to 12h).
- `packages/pi-coding-agent/src/core/model-registry.ts` — Model loading, merging, and override logic. **Read this** to understand where fetch integration happens in S02.
- `packages/pi-ai/src/models.ts` — Current model registry access functions (getModel, getProviders, getModels). **These remain unchanged** — they read from the in-memory registry.
- `packages/pi-ai/src/models.generated.ts` — Static model data (342KB). **This file is deleted in S03** after snapshot bundling is implemented.
- `packages/pi-ai/src/types.ts` — Model<Api> interface definition. **Mapper must convert** models.dev schema to this type.
- `packages/pi-coding-agent/src/config.ts` — VERSION constant, getAgentDir() for cache path. **Use these** for version invalidation and cache directory.
- `~/Documents/kimi-coding-check/opencode/packages/opencode/src/provider/models.ts` — Reference implementation for models.dev fetching with Zod validation, lazy loading, and refresh interval.

## Constraints

- **12-hour cache TTL** — Requirement R002, configurable but start with 12h
- **10-second network timeout** — Matches opencode's timeout, prevents blocking startup
- **Non-blocking fetch** — CLI startup must not wait for network; use cache/snapshot first
- **Cache file in `~/.gsd/agent/cache/`** — Standard gsd-2 cache directory
- **Version invalidation** — Compare cached version with `VERSION` from package.json
- **Graceful network failure** — Network errors must not crash startup; fall back to cache

## Common Pitfalls

- **Blocking startup on network** — Fetch must be async with cache-first approach; network request fires after cache is served
- **Missing version invalidation** — Cache must be invalidated when gsd-2 version changes (new release may need updated models)
- **Schema drift** — models.dev may add/remove fields; Zod validation catches this early but mapper must handle optional fields
- **Cost field mismatches** — models.dev uses per-million token pricing (same as gsd-2) but may have different field names or nested structures
- **Provider/model ID collisions** — models.dev uses nested structure (provider.models[modelId]); mapper must flatten correctly

## Open Risks

- **models.dev schema changes** — API may evolve; Zod validation helps but mapper may need updates
- **Large cache file** — models.dev response is ~56KB compressed, ~200KB+ parsed; cache file similar size (acceptable)
- **Network reliability** --Users behind proxies/firewalls may have inconsistent access; fallback chain must be robust
- **Test coverage** — Need to mock network calls and file system for unit tests; vitest setup required

## Models.dev Schema Analysis

**Structure:** `{ [providerId]: { id, name, env, npm, api, models: { [modelId]: Model } } }`

**Key fields per model:**
- `id` — Model identifier (e.g., "claude-sonnet-4-20250514")
- `name` — Human-readable name (e.g., "Claude Sonnet 4 20250514")
- `family` — Model family (optional, e.g., "claude")
- `reasoning` — Boolean for reasoning capability
- `tool_call` — Boolean for tool use support
- `temperature` — Boolean for temperature control
- `interleaved` — Object with `field` property for reasoning content location
- `cost` — Object with `input`, `output`, `cache_read`, `cache_write` (all $/million tokens)
- `limit` — Object with `context`, `output` (token limits)
- `modalities` — Object with `input` and `output` arrays (text, image, audio, video, pdf)
- `release_date` — ISO date string
- `open_weights` — Boolean for open-source models

**Mapping required:**
- `cost.input/output` → `Model.cost.input/output` (same units: $/million tokens)
- `cost.cache_read/cache_write` → `Model.cost.cacheRead/cacheWrite` (camelCase conversion)
- `limit.context` → `Model.contextWindow`
- `limit.output` → `Model.maxTokens`
- `modalities.input` → `Model.input` (filter to "text" | "image" only, gsd-2 doesn't support audio/video)
- Provider-level `api` → `Model.baseUrl` or `Model.api` type
- `reasoning` → `Model.reasoning`

**Missing from models.dev (need defaults):**
- `Model.api` — Must infer from provider or use "openai-completions" as default
- `Model.baseUrl` — Use provider-level `api` field or model-specific `base_url` if present
- `Model.provider` — Use provider ID from models.dev structure
- `Model.headers` — Empty object, not provided by models.dev

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| None | None | No specialized skills needed — standard TypeScript + Node.js fs/fetch APIs |

## Sources

- models.dev API schema (source: [https://models.dev/api.json](https://models.dev/api.json))
- opencode models.ts implementation (source: [~/Documents/kimi-coding-check/opencode/packages/opencode/src/provider/models.ts](file://~/Documents/kimi-coding-check/opencode/packages/opencode/src/provider/models.ts))
- gsd-2 update-check.ts caching pattern (source: [src/update-check.ts](file:///Users/kassie/projects/gsd-2/src/update-check.ts))
- gsd-2 model-registry.ts loading logic (source: [packages/pi-coding-agent/src/core/model-registry.ts](file:///Users/kassie/projects/gsd-2/packages/pi-coding-agent/src/core/model-registry.ts))
