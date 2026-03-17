---
estimated_steps: 8
estimated_files: 1
---

# T01: Convert bridge singleton to Map-based registry and add project resolution helpers

**Slice:** S01 — Bridge registry and project-scoped API surface
**Milestone:** M006

## Description

Replace the `projectBridgeSingleton` in `bridge-service.ts` with a `Map<string, BridgeService>` registry keyed by resolved project path. Add `getProjectBridgeServiceForCwd(projectCwd)` as the primary API for obtaining a bridge. Add `resolveProjectCwd(request)` for routes to extract `?project=` from URLs. Extend `resolveBridgeRuntimeConfig` with an optional `projectCwdOverride` parameter. Update all bridge-level aggregate functions to accept optional `projectCwd`. Keep `getProjectBridgeService()` as a backward-compatible shim.

## Steps

1. **Replace singleton with Map registry.** In `src/web/bridge-service.ts`, change `let projectBridgeSingleton: { key: string; service: BridgeService } | null = null;` to `const projectBridgeRegistry = new Map<string, BridgeService>();`.

2. **Add `getProjectBridgeServiceForCwd(projectCwd: string): BridgeService`.** This function: resolves the path with `resolve(projectCwd)`, checks the registry Map, returns existing entry if found, otherwise creates a new `BridgeService` with `resolveBridgeRuntimeConfig(undefined, projectCwd)` config, stores it in the Map, and returns it. Use the resolved path as the Map key (not the compound key the old singleton used — D061 specifies resolved project path as key).

3. **Add `resolveProjectCwd(request: Request): string`.** This function: creates `new URL(request.url)`, reads `searchParams.get("project")`, URL-decodes it if present, falls back to `(getBridgeDeps().env ?? process.env).GSD_WEB_PROJECT_CWD || process.cwd()`. Export it. It must never throw — always returns a valid string.

4. **Extend `resolveBridgeRuntimeConfig`.** Add optional second parameter `projectCwdOverride?: string`. When provided, use it instead of `env.GSD_WEB_PROJECT_CWD || process.cwd()` for `projectCwd`. Leave all other behavior unchanged.

5. **Update `getProjectBridgeService()` to be a backward-compatible shim.** It should call `resolveBridgeRuntimeConfig()` to get the env-based `projectCwd`, then delegate to `getProjectBridgeServiceForCwd(config.projectCwd)`. Remove the old singleton logic.

6. **Thread `projectCwd?: string` through aggregate functions.** Update these exported functions to accept optional `projectCwd?: string` as their last parameter:
   - `collectBootPayload(projectCwd?)` — use `resolveBridgeRuntimeConfig(env, projectCwd)` and `getProjectBridgeServiceForCwd(projectCwd)` when provided, else fall back to env-based
   - `sendBridgeInput(input, projectCwd?)` — use `getProjectBridgeServiceForCwd` when provided
   - `collectSelectiveLiveStatePayload(domains?, projectCwd?)` — use config override
   - `collectSessionBrowserPayload(query?, projectCwd?)` — use config override
   - `renameSessionInCurrentProject(request, projectCwd?)` — use config override
   - `collectCurrentProjectOnboardingState(projectCwd?)` — use config override
   - `emitProjectLiveStateInvalidation(descriptor, projectCwd?)` — use targeted bridge
   - `refreshProjectBridgeAuth(projectCwd?)` — use targeted bridge

7. **Update `resetBridgeServiceForTests`.** Dispose all entries in the registry Map, then clear it. Remove old singleton cleanup.

8. **Export the new functions.** Ensure `getProjectBridgeServiceForCwd` and `resolveProjectCwd` are exported from the module.

## Must-Haves

- [ ] `projectBridgeSingleton` replaced with `projectBridgeRegistry: Map<string, BridgeService>`
- [ ] `getProjectBridgeServiceForCwd(projectCwd)` exported and creates/returns bridges by resolved path
- [ ] `resolveProjectCwd(request)` exported and reads `?project=` with env fallback
- [ ] `resolveBridgeRuntimeConfig` accepts optional `projectCwdOverride`
- [ ] `getProjectBridgeService()` still works unchanged as backward-compatible shim
- [ ] All bridge-level aggregate functions accept optional `projectCwd?: string`
- [ ] `resetBridgeServiceForTests` clears the full registry
- [ ] `npm run build` passes (all consumers type-check)

## Verification

- `npm run build` exits 0 — proves type compatibility across all consumers
- `npm run test:unit -- --test-name-pattern "bridge"` — existing `web-bridge-contract.test.ts` passes unchanged (tests use `getProjectBridgeService()` shim which still works)
- Manual inspection: `rg "projectBridgeSingleton" src/web/bridge-service.ts` returns empty (singleton fully removed)

## Inputs

- `src/web/bridge-service.ts` — current singleton-based bridge management (2122 lines). Key structures: `projectBridgeSingleton` variable (line ~547), `getProjectBridgeService()` function (line ~1632), `resolveBridgeRuntimeConfig()` (line ~1004), `resetBridgeServiceForTests()` (line ~2116), aggregate functions `collectBootPayload` (~2010), `sendBridgeInput` (~2098), `collectSelectiveLiveStatePayload` (~1935), `collectSessionBrowserPayload` (~1780), `renameSessionInCurrentProject` (~1830), `collectCurrentProjectOnboardingState` (~1920).
- Decision D061: Convert singleton to `Map<string, BridgeService>` keyed by resolved project path. Bridges disposed only explicitly, never on access.
- Decision D062: `resolveProjectCwd(request)` reads `?project=`, URL-decodes, falls back to env var.

## Expected Output

- `src/web/bridge-service.ts` — modified with registry, new helpers, updated aggregate functions. All existing exports preserved with compatible signatures (new params are optional trailing params).

## Observability Impact

- **Registry visibility:** `projectBridgeRegistry` is a module-level `Map<string, BridgeService>`. Each entry exposes `BridgeRuntimeSnapshot` via `getSnapshot()` with per-project `projectCwd`, `phase`, `lastError`, `connectionCount` — previously only one snapshot existed.
- **Inspection by future agents:** `getProjectBridgeServiceForCwd(path).getSnapshot()` returns runtime state for any registered project. `resolveProjectCwd(request)` deterministically resolves which project a request targets.
- **Failure visibility:** `resolveProjectCwd` never throws — returns env fallback. `getProjectBridgeServiceForCwd` always returns a valid bridge (creates on first access). Per-bridge `lastError` surfaces failures isolated to that project's bridge.
- **Cleanup/reset:** `resetBridgeServiceForTests()` disposes all bridges and clears the registry — test isolation is complete.
