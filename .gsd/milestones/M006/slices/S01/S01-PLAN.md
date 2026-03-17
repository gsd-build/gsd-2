# S01: Bridge registry and project-scoped API surface

**Goal:** Replace the bridge singleton with a Map-based registry keyed by project path, add a `resolveProjectCwd(request)` helper that reads `?project=` query parameters, and thread project context through all API routes and child-process services so that multiple bridges can coexist in the same host process.

**Demo:** Two bridge instances for different project paths run concurrently without interference. Every API route accepts `?project=/path/to/project` to target a specific bridge. Omitting the parameter falls back to `GSD_WEB_PROJECT_CWD` env var, preserving single-project behavior. All existing tests and builds pass unchanged.

## Must-Haves

- `getProjectBridgeServiceForCwd(projectCwd: string): BridgeService` — registry-based lookup that creates/returns bridge instances keyed by resolved project path
- `resolveProjectCwd(request: Request): string` — reads `?project=` from URL, URL-decodes it, falls back to `GSD_WEB_PROJECT_CWD` env var
- `resolveBridgeRuntimeConfig(env?, projectCwdOverride?: string)` — extended to accept runtime override
- All bridge-level aggregate functions (`collectBootPayload`, `sendBridgeInput`, `collectSelectiveLiveStatePayload`, `collectSessionBrowserPayload`, `renameSessionInCurrentProject`, `collectCurrentProjectOnboardingState`, `emitProjectLiveStateInvalidation`, `refreshProjectBridgeAuth`) accept optional `projectCwd?: string`
- All 15 child-process service `collect*()` / `execute*()` functions accept optional `projectCwd?: string`
- All 28 project-scoped API routes call `resolveProjectCwd(request)` and pass to their service functions
- `getProjectBridgeService()` backward-compatible shim still works for existing code paths
- Two concurrent bridge instances for different project paths coexist without interference
- All existing contract tests, integration tests, and both builds pass unchanged

## Proof Level

- This slice proves: contract + integration (multi-bridge coexistence)
- Real runtime required: no (contract tests with fake RPC children)
- Human/UAT required: no

## Verification

- `npm run test:unit` — all existing tests pass including `web-bridge-contract.test.ts`
- `npm run test:unit -- --test-name-pattern "multi-project"` — new `web-multi-project-contract.test.ts` passes
- `npm run build` — TypeScript compilation succeeds
- `npm run build:web-host` — Next.js standalone build succeeds
- `resetBridgeServiceForTests()` disposes all registry entries and leaves registry empty — verified by multi-project contract test
- `resolveProjectCwd(request)` never throws even with malformed URLs — returns deterministic env-based fallback; verified by contract test
- Each bridge instance exposes `BridgeRuntimeSnapshot` with per-project `projectCwd`, `phase`, and `lastError` — verified by contract test asserting distinct snapshots per bridge

## Observability / Diagnostics

- Runtime signals: `BridgeRuntimeSnapshot` already surfaces `projectCwd`, `phase`, `lastError`, `connectionCount` per bridge instance — registry makes these per-project
- Inspection surfaces: `/api/boot?project=X` returns bridge snapshot for project X; `/api/live-state?project=X` returns targeted live state
- Failure visibility: `BridgeLastError` per bridge instance, `resolveProjectCwd` returns deterministic fallback (never throws)
- Redaction constraints: project paths are not secrets — no new redaction needed

## Integration Closure

- Upstream surfaces consumed: `bridge-service.ts` singleton, `resolveBridgeRuntimeConfig()`, `getProjectBridgeService()`, all 15 child-process services, 28 project-scoped API routes, `web/lib/pty-manager.ts`, `web/app/api/files/route.ts`
- New wiring introduced in this slice: `resolveProjectCwd(request)` called in every route, project context threaded from route → service → bridge registry
- What remains before the milestone is truly usable end-to-end: S02 (project discovery, Projects view, store switching), S03 (onboarding dev root, context-aware launch)

## Tasks

- [x] **T01: Convert bridge singleton to Map-based registry and add project resolution helpers** `est:1h30m`
  - Why: Foundation for all multi-project support — the singleton is the root blocker. Everything else in this slice depends on these primitives existing.
  - Files: `src/web/bridge-service.ts`
  - Do: Replace `projectBridgeSingleton` with `Map<string, BridgeService>` registry. Add `getProjectBridgeServiceForCwd(projectCwd)` that resolves path and looks up/creates entries. Add `resolveProjectCwd(request)` that reads `?project=` from URL, URL-decodes, falls back to env. Extend `resolveBridgeRuntimeConfig` with optional `projectCwdOverride?: string` parameter. Update all bridge-level aggregate functions (`collectBootPayload`, `sendBridgeInput`, `collectSelectiveLiveStatePayload`, `collectSessionBrowserPayload`, `renameSessionInCurrentProject`, `collectCurrentProjectOnboardingState`, `emitProjectLiveStateInvalidation`, `refreshProjectBridgeAuth`) to accept optional `projectCwd?: string` and use `getProjectBridgeServiceForCwd` when provided. Keep `getProjectBridgeService()` as backward-compatible shim that delegates to `getProjectBridgeServiceForCwd` with env-resolved cwd. Update `resetBridgeServiceForTests` to clear the full registry Map.
  - Verify: `npm run build` succeeds (type-checks all consumers). Existing `web-bridge-contract.test.ts` passes unchanged via `npm run test:unit -- --test-name-pattern "bridge"`.
  - Done when: Registry is in place, all bridge-level functions accept `projectCwd`, backward compat shim works, TypeScript build passes.

- [x] **T02: Thread project context through child-process services** `est:1h`
  - Why: The 15 child-process services sit between routes and the bridge registry. Routes can't pass project context through to bridges until services accept it.
  - Files: `src/web/captures-service.ts`, `src/web/cleanup-service.ts`, `src/web/doctor-service.ts`, `src/web/export-service.ts`, `src/web/forensics-service.ts`, `src/web/git-summary-service.ts`, `src/web/history-service.ts`, `src/web/hooks-service.ts`, `src/web/inspect-service.ts`, `src/web/knowledge-service.ts`, `src/web/recovery-diagnostics-service.ts`, `src/web/settings-service.ts`, `src/web/skill-health-service.ts`, `src/web/undo-service.ts`, `src/web/visualizer-service.ts`
  - Do: For each service file: add `projectCwd?: string` parameter to every exported `collect*()` / `execute*()` / `resolve*()` function. Change `resolveBridgeRuntimeConfig()` calls to `resolveBridgeRuntimeConfig(undefined, projectCwd)` to pass the override. For `recovery-diagnostics-service.ts`, also pass `projectCwd` to the bridge-level functions it calls (`collectCurrentProjectOnboardingState`, `collectSelectiveLiveStatePayload`). For `git-summary-service.ts`, pass `projectCwd` to its internal `collectCurrentProjectGitSummary` and bridge functions. Preserve all existing default behavior when `projectCwd` is undefined.
  - Verify: `npm run build` succeeds. All existing tests pass unchanged via `npm run test:unit`.
  - Done when: Every child-process service function accepts optional `projectCwd` and threads it through to `resolveBridgeRuntimeConfig`. Build succeeds.

- [x] **T03: Thread project context through API routes** `est:1h30m`
  - Why: The API surface is where `?project=` enters the system — routes must read it and pass it to services and bridge functions.
  - Files: `web/app/api/boot/route.ts`, `web/app/api/captures/route.ts`, `web/app/api/cleanup/route.ts`, `web/app/api/doctor/route.ts`, `web/app/api/export-data/route.ts`, `web/app/api/files/route.ts`, `web/app/api/forensics/route.ts`, `web/app/api/git/route.ts`, `web/app/api/history/route.ts`, `web/app/api/hooks/route.ts`, `web/app/api/inspect/route.ts`, `web/app/api/knowledge/route.ts`, `web/app/api/live-state/route.ts`, `web/app/api/onboarding/route.ts`, `web/app/api/recovery/route.ts`, `web/app/api/session/browser/route.ts`, `web/app/api/session/command/route.ts`, `web/app/api/session/events/route.ts`, `web/app/api/session/manage/route.ts`, `web/app/api/settings-data/route.ts`, `web/app/api/skill-health/route.ts`, `web/app/api/steer/route.ts`, `web/app/api/terminal/input/route.ts`, `web/app/api/terminal/resize/route.ts`, `web/app/api/terminal/sessions/route.ts`, `web/app/api/terminal/stream/route.ts`, `web/app/api/undo/route.ts`, `web/app/api/visualizer/route.ts`, `web/lib/pty-manager.ts`
  - Do: For each route: (1) import `resolveProjectCwd` from `bridge-service.ts`. (2) Add `request: Request` parameter to GET/POST handlers that lack it. (3) Call `const projectCwd = resolveProjectCwd(request)` at the top of each handler. (4) Pass `projectCwd` to the service/bridge function call. For `files/route.ts`: replace the local `getProjectCwd()` helper with `resolveProjectCwd(request)`. For `steer/route.ts`: replace `resolveBridgeRuntimeConfig()` with `resolveBridgeRuntimeConfig(undefined, projectCwd)`. For `pty-manager.ts`: add `projectCwd?: string` to `getOrCreateSession`, use it instead of direct `process.env.GSD_WEB_PROJECT_CWD`, and update route callers to pass it. Skip `shutdown/route.ts` — it's process-level with no project context.
  - Verify: `npm run build` and `npm run build:web-host` both succeed. All existing contract and integration tests pass via `npm run test:unit && npm run test:integration`.
  - Done when: Every project-scoped route reads `?project=` via `resolveProjectCwd` and passes it downstream. Both builds succeed. No existing test breaks.

- [x] **T04: Multi-bridge coexistence contract test and full regression** `est:1h`
  - Why: The slice's proof claim is that two bridges coexist and backward compatibility holds — this must be proven by an automated test covering the registry, the project resolution helper, and bridge isolation.
  - Files: `src/tests/web-multi-project-contract.test.ts`
  - Do: Write a contract test file using the existing `configureBridgeServiceForTests` / `FakeRpcChild` / `makeWorkspaceFixture` pattern from `web-bridge-contract.test.ts`. Tests to write: (1) `getProjectBridgeServiceForCwd(pathA)` and `getProjectBridgeServiceForCwd(pathB)` return distinct `BridgeService` instances. (2) Calling `getProjectBridgeServiceForCwd(pathA)` twice returns the same instance (idempotent). (3) Each bridge receives commands independently — send `get_state` to bridge A and bridge B, verify each gets only its own command. (4) SSE events from bridge A's subscribers don't appear in bridge B's subscribers. (5) `resolveProjectCwd(request)` reads `?project=` parameter and URL-decodes it. (6) `resolveProjectCwd(request)` falls back to `GSD_WEB_PROJECT_CWD` when no `?project=` is present. (7) `getProjectBridgeService()` backward compat shim still returns a valid bridge. (8) `resetBridgeServiceForTests()` clears all registry entries. Run full regression: `npm run test:unit`, `npm run test:integration`, `npm run build`, `npm run build:web-host`.
  - Verify: `npm run test:unit` passes including `web-multi-project-contract.test.ts`. `npm run test:integration` passes. Both builds succeed.
  - Done when: All 8 test cases pass. All existing 12+ contract tests pass. All integration tests pass. `npm run build` and `npm run build:web-host` exit 0.

## Files Likely Touched

- `src/web/bridge-service.ts`
- `src/web/captures-service.ts`
- `src/web/cleanup-service.ts`
- `src/web/doctor-service.ts`
- `src/web/export-service.ts`
- `src/web/forensics-service.ts`
- `src/web/git-summary-service.ts`
- `src/web/history-service.ts`
- `src/web/hooks-service.ts`
- `src/web/inspect-service.ts`
- `src/web/knowledge-service.ts`
- `src/web/recovery-diagnostics-service.ts`
- `src/web/settings-service.ts`
- `src/web/skill-health-service.ts`
- `src/web/undo-service.ts`
- `src/web/visualizer-service.ts`
- `web/app/api/boot/route.ts`
- `web/app/api/captures/route.ts`
- `web/app/api/cleanup/route.ts`
- `web/app/api/doctor/route.ts`
- `web/app/api/export-data/route.ts`
- `web/app/api/files/route.ts`
- `web/app/api/forensics/route.ts`
- `web/app/api/git/route.ts`
- `web/app/api/history/route.ts`
- `web/app/api/hooks/route.ts`
- `web/app/api/inspect/route.ts`
- `web/app/api/knowledge/route.ts`
- `web/app/api/live-state/route.ts`
- `web/app/api/onboarding/route.ts`
- `web/app/api/recovery/route.ts`
- `web/app/api/session/browser/route.ts`
- `web/app/api/session/command/route.ts`
- `web/app/api/session/events/route.ts`
- `web/app/api/session/manage/route.ts`
- `web/app/api/settings-data/route.ts`
- `web/app/api/skill-health/route.ts`
- `web/app/api/steer/route.ts`
- `web/app/api/terminal/input/route.ts`
- `web/app/api/terminal/resize/route.ts`
- `web/app/api/terminal/sessions/route.ts`
- `web/app/api/terminal/stream/route.ts`
- `web/app/api/undo/route.ts`
- `web/app/api/visualizer/route.ts`
- `web/lib/pty-manager.ts`
- `src/tests/web-multi-project-contract.test.ts`
