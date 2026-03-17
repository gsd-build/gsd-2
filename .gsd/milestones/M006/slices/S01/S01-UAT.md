# S01: Bridge registry and project-scoped API surface — UAT

**Milestone:** M006
**Written:** 2026-03-17

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 is purely server-side infrastructure (registry, parameter threading, API query parameter support). All claims are provable via contract tests, build verification, and curl — no browser UI was added or changed.

## Preconditions

- Repository is at the S01 commit (bridge registry, service threading, route threading, contract test all present)
- `npm run build` exits 0
- `npm run build:web-host` exits 0
- No env vars beyond `GSD_WEB_PROJECT_CWD` (set to any valid directory) are required

## Smoke Test

Run `npm run test:unit -- --test-name-pattern "multi-project"` — all 8 test cases should pass. This proves the registry, project resolution, and bridge isolation in one command.

## Test Cases

### 1. Registry creates distinct bridge instances for different project paths

1. Call `getProjectBridgeServiceForCwd("/tmp/project-alpha")`
2. Call `getProjectBridgeServiceForCwd("/tmp/project-beta")`
3. **Expected:** Two different `BridgeService` objects returned. Each has a `getSnapshot()` with its own `projectCwd` value.

### 2. Registry returns same instance for same path (idempotent lookup)

1. Call `getProjectBridgeServiceForCwd("/tmp/project-alpha")` twice
2. **Expected:** Both calls return the exact same object reference (`===`).

### 3. Bridge commands are independent (no cross-talk)

1. Create two bridges for different paths (A and B)
2. Send `get_state` to bridge A
3. Send `get_state` to bridge B
4. **Expected:** Bridge A's RPC child receives only bridge A's command. Bridge B's RPC child receives only bridge B's command. Session IDs returned are project-specific.

### 4. SSE subscriber isolation

1. Create two bridges for different paths (A and B)
2. Subscribe to bridge A's events
3. Emit a state event on bridge B's RPC child
4. **Expected:** Bridge A's subscriber does NOT receive bridge B's event. Events are isolated per-bridge.

### 5. resolveProjectCwd reads ?project= parameter

1. Construct a `Request` with URL `http://localhost/api/test?project=%2Ftmp%2Fmy-project`
2. Call `resolveProjectCwd(request)`
3. **Expected:** Returns `/tmp/my-project` (URL-decoded).

### 6. resolveProjectCwd falls back to env var

1. Set `process.env.GSD_WEB_PROJECT_CWD` to `/tmp/env-project`
2. Construct a `Request` with URL `http://localhost/api/test` (no `?project=` parameter)
3. Call `resolveProjectCwd(request)`
4. **Expected:** Returns `/tmp/env-project`.

### 7. Backward-compatible shim works

1. Set `GSD_WEB_PROJECT_CWD` to a valid path
2. Call `getProjectBridgeService()` (no args — the old API)
3. Call `getProjectBridgeServiceForCwd(resolvedEnvPath)` (new API with same path)
4. **Expected:** Both return the same `BridgeService` instance.

### 8. resetBridgeServiceForTests clears all entries

1. Create bridges for two different paths
2. Call `resetBridgeServiceForTests()`
3. Call `getProjectBridgeServiceForCwd` with one of the previous paths
4. **Expected:** Returns a NEW instance (not the one from step 1). Registry was fully cleared.

### 9. All API routes accept ?project= parameter

1. Verify `rg "resolveProjectCwd" web/app/api/ --files-with-matches | wc -l` returns 26
2. Verify the 26 files include: boot, captures, cleanup, doctor, export-data, files, forensics, git, history, hooks, inspect, knowledge, live-state, onboarding, recovery, session/browser, session/command, session/events, session/manage, settings-data, skill-health, steer, terminal/sessions, terminal/stream, undo, visualizer
3. **Expected:** All 26 project-scoped routes import and call `resolveProjectCwd(request)`.

### 10. No direct env reads remain in route files

1. Run `rg "process.env.GSD_WEB_PROJECT_CWD" web/app/api/`
2. **Expected:** Empty — no route file reads the env var directly anymore.

### 11. All child-process services accept projectCwdOverride

1. Run `rg "projectCwdOverride" src/web/ --files-with-matches | wc -l`
2. **Expected:** Returns 16 (15 child-process services + bridge-service.ts).

### 12. Full regression suite passes

1. Run `npm run test:unit`
2. **Expected:** 1205 tests pass, 0 fail.
3. Run `npm run build`
4. **Expected:** Exits 0.
5. Run `npm run build:web-host`
6. **Expected:** Exits 0 with all 29 routes compiled.

## Edge Cases

### Malformed URL in resolveProjectCwd

1. Construct a `Request` with an invalid URL that causes `URL()` to throw
2. Call `resolveProjectCwd(request)`
3. **Expected:** Returns the `GSD_WEB_PROJECT_CWD` env var value (never throws). The try/catch in `resolveProjectCwd` handles this gracefully.

### Same path with different representations

1. Call `getProjectBridgeServiceForCwd("/tmp/project-alpha/")` (trailing slash)
2. Call `getProjectBridgeServiceForCwd("/tmp/project-alpha")` (no trailing slash)
3. **Expected:** Both return the same instance — `path.resolve()` normalizes the paths.

### Missing ?project= parameter (single-project fallback)

1. With `GSD_WEB_PROJECT_CWD` set, make any API call without `?project=`
2. **Expected:** The route resolves to the env-var project, exactly matching pre-S01 behavior. No behavioral change for single-project users.

## Failure Signals

- `npm run test:unit -- --test-name-pattern "multi-project"` reports any test failures — indicates registry or isolation regression
- `npm run build` fails — indicates type errors from threading changes
- `npm run build:web-host` fails — indicates route compilation errors
- `rg "projectBridgeSingleton" src/web/bridge-service.ts` returns results — singleton was not fully removed
- Any existing contract test in `web-bridge-contract.test.ts` fails — backward compatibility broken

## Requirements Proved By This UAT

- R020 (multi-project workspace) — partially: proves the server-side foundation (bridge registry, project-scoped API surface, multi-bridge coexistence). Does not yet prove browser-side switching, project discovery, or context-aware launch.

## Not Proven By This UAT

- Browser-side multi-project behavior (store switching, SSE per-project connections) — deferred to S02
- Project discovery from dev root — deferred to S02
- Context-aware launch detection — deferred to S03
- Onboarding dev root step — deferred to S03
- Bridge lifecycle management (idle eviction, memory pressure) — intentionally deferred

## Notes for Tester

- The SSE stream cleanup hang is pre-existing in all web contract test files. Individual test cases pass; the process-level timeout/cancellation is a known node:test runner behavior with SSE ReadableStreams. Do not count these as failures.
- Test case numbering 1–8 corresponds directly to the 8 cases in `web-multi-project-contract.test.ts`. Running that file verifies cases 1–8 automatically.
- Cases 9–12 are structural verification via grep/build commands — they confirm the threading is complete across the codebase.
