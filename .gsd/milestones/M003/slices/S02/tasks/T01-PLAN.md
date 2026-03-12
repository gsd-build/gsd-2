---
estimated_steps: 5
estimated_files: 3
---

# T01: Surface models.json errors, generalize startup fallback, and fix auto-mode model restore

**Slice:** S02 — Startup validation and fallback
**Milestone:** M003

## Description

Three surgical changes to make GSD robust when the default provider is unavailable and custom providers are in play:

1. **Error surfacing** — After `ModelRegistry` construction in `cli.ts`, call `getError()` and emit a stderr warning if non-null. Don't crash — the SDK already falls back to built-in models gracefully.

2. **Generalized fallback** — Replace the Anthropic-only fallback chain (lines ~120-125 in `cli.ts`) with one that tries Anthropic first (preserving existing behavior for current users), then falls back to any model returned by `getAvailable()`. This ensures custom-provider-only users get a working default.

3. **Auto-mode model restore** — Add `originalProvider` module-level variable alongside `originalModelId` in `auto.ts`. Capture `ctx.model?.provider` where `originalModelId` is set. Use stored provider in `stopAuto()` instead of hardcoded `"anthropic"`. Add to `pauseAuto()` preservation comment.

## Steps

1. Read `cli.ts` startup section and `auto.ts` state variables / stopAuto / pauseAuto to confirm exact line targets
2. Add `modelRegistry.getError()` check in `cli.ts` after ModelRegistry construction — emit `console.error()` warning with the error text
3. Replace Anthropic-only fallback in `cli.ts` with generalized version: try Anthropic models first via `getAvailable()`, then any available model
4. In `auto.ts`: add `originalProvider` state var, capture it alongside `originalModelId`, fix `stopAuto()` to use it, update `pauseAuto()` preservation comment
5. Add tests to `src/tests/custom-provider.test.ts` covering: (a) error surfacing logic expectations, (b) fallback picks Anthropic when available, (c) fallback picks custom provider when Anthropic unavailable, (d) fallback handles zero available models, (e) auto-mode stores and uses provider for restore

## Must-Haves

- [ ] `modelRegistry.getError()` checked after construction; warning emitted to stderr if non-null
- [ ] Warning is informational, not fatal — GSD continues to run
- [ ] Fallback tries Anthropic first, then any available model
- [ ] Fallback only runs when `!configuredModel || !configuredExists` (guard preserved)
- [ ] `originalProvider` captured at auto-mode start and used in `stopAuto()`
- [ ] `originalProvider` listed in `pauseAuto()` preservation comment
- [ ] All changes covered by passing tests

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — all tests pass (S01 + S02)
- `npm test` — no new regressions beyond the 18 pre-existing failures

## Inputs

- `src/cli.ts` — startup boot sequence with ModelRegistry construction and Anthropic-only fallback
- `src/resources/extensions/gsd/auto.ts` — `originalModelId` state, `stopAuto()`, `pauseAuto()`
- `src/tests/custom-provider.test.ts` — existing S01 test patterns (temp dirs, imports)
- S01 summary — patterns for testability (agentDirOverride, AuthStorage.create)
- S02 research — exact line numbers, API surface (`getError()`, `getAvailable()`, `getAll()`)

## Expected Output

- `src/cli.ts` — error surfacing block + generalized fallback replacing Anthropic-only chain
- `src/resources/extensions/gsd/auto.ts` — `originalProvider` state var, fixed `stopAuto()`, updated `pauseAuto()` comment
- `src/tests/custom-provider.test.ts` — 4-6 new tests covering error surfacing, fallback behavior, and auto-mode provider tracking
