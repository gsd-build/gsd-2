---
id: T01
parent: S01
milestone: M006
provides:
  - Map-based bridge registry keyed by resolved project path
  - getProjectBridgeServiceForCwd(projectCwd) — registry lookup/create API
  - resolveProjectCwd(request) — reads ?project= from URL with env fallback
  - resolveBridgeRuntimeConfig projectCwdOverride parameter
  - All bridge-level aggregate functions accept optional projectCwd
key_files:
  - src/web/bridge-service.ts
key_decisions:
  - Registry keyed by resolve(projectCwd), not compound key — simpler, per D061
  - resolveProjectCwd wraps URL parsing in try/catch — never throws, always returns valid fallback
patterns_established:
  - "projectCwd ? getProjectBridgeServiceForCwd(projectCwd) : getProjectBridgeService()" pattern for optional project targeting in aggregate functions
  - All new parameters are optional trailing params — backward compatible by construction
observability_surfaces:
  - Each registered bridge exposes BridgeRuntimeSnapshot via getSnapshot() with per-project projectCwd, phase, lastError, connectionCount
  - resolveProjectCwd deterministically resolves project context — never throws
  - resetBridgeServiceForTests disposes all bridges and clears registry
duration: 30m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Convert bridge singleton to Map-based registry and add project resolution helpers

**Replaced `projectBridgeSingleton` with `Map<string, BridgeService>` registry, added `getProjectBridgeServiceForCwd`, `resolveProjectCwd`, and threaded `projectCwd` through all bridge-level aggregate functions.**

## What Happened

1. Replaced `let projectBridgeSingleton` with `const projectBridgeRegistry = new Map<string, BridgeService>()`.
2. Added `getProjectBridgeServiceForCwd(projectCwd)` — resolves path, checks registry, creates on miss with `resolveBridgeRuntimeConfig(undefined, resolvedPath)`.
3. Added `resolveProjectCwd(request)` — reads `?project=` from URL, URL-decodes, falls back to env. Wrapped in try/catch so malformed URLs never throw.
4. Extended `resolveBridgeRuntimeConfig` with optional second param `projectCwdOverride?: string`.
5. Converted `getProjectBridgeService()` to a backward-compatible shim that delegates to `getProjectBridgeServiceForCwd(config.projectCwd)`.
6. Threaded `projectCwd?: string` through 8 aggregate functions: `collectBootPayload`, `sendBridgeInput`, `collectSelectiveLiveStatePayload`, `collectSessionBrowserPayload`, `renameSessionInCurrentProject`, `collectCurrentProjectOnboardingState`, `emitProjectLiveStateInvalidation`, `refreshProjectBridgeAuth`.
7. Updated `resetBridgeServiceForTests` to dispose all registry entries and clear the Map.
8. Both new functions exported from the module.

## Verification

- `npm run build` — exits 0, all consumers type-check ✅
- `node --test src/tests/web-bridge-contract.test.ts` — all 5 existing bridge contract tests pass ✅
- `rg "projectBridgeSingleton" src/web/bridge-service.ts` — empty, singleton fully removed ✅

### Slice-level verification (partial — T01 is intermediate):
- `npm run build` — ✅ passes
- `npm run test:unit -- --test-name-pattern "bridge"` — ✅ all 5 tests pass
- `npm run test:unit -- --test-name-pattern "multi-project"` — N/A (test file created in T04)
- `npm run build:web-host` — not run yet (will verify in final task)

## Diagnostics

- `getProjectBridgeServiceForCwd(path).getSnapshot()` — inspect per-project bridge state (phase, lastError, connectionCount, projectCwd)
- `resolveProjectCwd(request)` — deterministic resolution, never throws
- `projectBridgeRegistry` is module-scoped — `resetBridgeServiceForTests()` disposes all entries and clears it

## Deviations

None.

## Known Issues

- Test runner hangs after all tests pass (pre-existing — unclosed handles in bridge cleanup). Not introduced by this change.

## Files Created/Modified

- `src/web/bridge-service.ts` — replaced singleton with Map registry, added `getProjectBridgeServiceForCwd`, `resolveProjectCwd`, extended `resolveBridgeRuntimeConfig`, updated all aggregate functions with optional `projectCwd`, updated `resetBridgeServiceForTests`
