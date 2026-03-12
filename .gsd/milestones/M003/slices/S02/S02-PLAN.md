# S02: Startup Validation and Fallback

**Goal:** GSD surfaces models.json errors at startup, falls back to any available provider when the default is unavailable, and auto-mode correctly restores the user's original model (including custom providers).
**Demo:** Start GSD with a broken models.json → see a clear warning. Start GSD with no Anthropic auth but a custom provider configured → GSD picks the custom provider model as default. Run auto-mode with a custom provider model → model restores correctly when auto-mode stops.

## Must-Haves

- `modelRegistry.getError()` checked at startup; non-null errors produce a stderr warning with actionable text
- Startup fallback uses `modelRegistry.getAll()` to find any available model, not just Anthropic
- Fallback preserves existing behavior: Anthropic users with valid auth still get Anthropic as default
- Fallback only runs when `!configuredModel || !configuredExists` (never overwrites valid user choice)
- Auto-mode stores both `originalModelId` and `originalProvider` at start
- `stopAuto()` uses stored provider instead of hardcoded `"anthropic"` for model restore
- `originalProvider` preserved across `pauseAuto()` (listed in the preservation comment)
- All changes covered by tests

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — all tests pass (existing S01 tests + new S02 tests)
- S02 tests cover: error surfacing logic, generalized fallback (Anthropic available, Anthropic unavailable, no providers), auto-mode provider storage and restore

## Tasks

- [x] **T01: Surface models.json errors, generalize startup fallback, and fix auto-mode model restore** `est:40m`
  - Why: All three S02 deliverables are surgical edits (3-10 lines each) to two files with shared test infrastructure — splitting would waste context loads
  - Files: `src/cli.ts`, `src/resources/extensions/gsd/auto.ts`, `src/tests/custom-provider.test.ts`
  - Do: (1) In `cli.ts` after `new ModelRegistry(authStorage)`, check `modelRegistry.getError()` and emit stderr warning if non-null. (2) Replace Anthropic-only fallback in `cli.ts` with `modelRegistry.getAvailable()` — try Anthropic first (preserve existing behavior), then fall back to any available model. (3) In `auto.ts`, add `originalProvider` alongside `originalModelId`, capture `ctx.model?.provider` at start, use stored provider in `stopAuto()`, and add to `pauseAuto()` preservation comment. (4) Add tests covering all three changes.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/custom-provider.test.ts` — all tests pass
  - Done when: All S02 must-haves verified by tests, `npm test` shows no new regressions

## Files Likely Touched

- `src/cli.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/tests/custom-provider.test.ts`
