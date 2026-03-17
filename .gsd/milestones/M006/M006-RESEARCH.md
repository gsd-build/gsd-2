# M006: Multi-Project Workspace — Research

**Date:** 2026-03-17
**Status:** Complete

## Summary

M006 replaces the single-project-per-host architecture with a multi-project workspace. The hardest change is the bridge singleton → registry migration: every API route, service, and SSE stream currently derives project context from `GSD_WEB_PROJECT_CWD` env var set once at host process startup. Multi-project requires this to become a runtime parameter threaded through all 29 API routes, 17 child-process services, the bridge service, the onboarding service, and the SSE event stream.

The existing codebase has strong structural hooks that make the migration tractable. `resolveBridgeRuntimeConfig()` is already the single chokepoint for project context derivation — every service calls it. The bridge singleton key is already `projectCwd::projectSessionsDir::packageRoot` — making it a Map key instead of a singleton match is mechanical. The instance registry (`web-instances.json`) already tracks multiple concurrent instances by cwd. `detectProjectKind()` already has smart project detection signals (`.git`, `.gsd`, `package.json`, etc.) that project discovery can reuse.

The recommended approach is: one host process, multiple bridge instances (registry pattern), project-scoped API routes via query parameter, per-project store instances in the browser with hot-swap on project switch, and one SSE connection per active project. The bridge registry is the foundation — everything else builds on it.

## Recommendation

**Build bottom-up: bridge registry → project-scoped APIs → dev root scanning → browser store multi-project → project picker UI → onboarding dev root step → context-aware launch.**

The bridge registry is the single riskiest change and the dependency for everything else. Prove it first with a focused test that runs two bridge instances concurrently. Then make API routes project-aware by threading `projectCwd` through `resolveBridgeRuntimeConfig()` and accepting a `?project=` query parameter. Build the project discovery service next since it's standalone and needed by both the API and the browser. Then build the browser store's multi-project support (per-project store instances, SSE connection management, project switching). The Projects view and onboarding step are leaf-node UI work that can only be proven after the backend supports multi-project.

## Implementation Landscape

### Key Files

**Bridge & Project Context (server-side)**

- `src/web/bridge-service.ts` (2121 lines) — The architectural center. `projectBridgeSingleton` (line 647) becomes a `Map<string, BridgeService>`. `resolveBridgeRuntimeConfig()` (line 1014) currently reads `GSD_WEB_PROJECT_CWD` from env — needs a `projectCwd` parameter override. `getProjectBridgeService()` (line 1632) already has key-based lookup logic with dispose-on-mismatch — converts to Map get/set. `collectBootPayload()` (line 1984) needs a `projectCwd` parameter. Every exported function that calls `resolveBridgeRuntimeConfig()` (13 functions total) needs the same threading.
- `src/web/onboarding-service.ts` (837 lines) — `OnboardingService` singleton (line 417) keyed by... nothing. Needs project-keying or parameterization. `getOnboardingService()` (line 813) creates one instance globally.
- `src/web-mode.ts` (715 lines) — `launchWebMode()` (line 543) sets `GSD_WEB_PROJECT_CWD` in the spawned process env. Multi-project means either: (a) launch with a dev root instead of a single project, or (b) keep single-project launch but support switching in-process. Instance registry (line 122) already tracks multiple instances by cwd.
- `src/web/auto-dashboard-service.ts` — Uses `resolveBridgeRuntimeConfig()` for project context.
- `src/web/recovery-diagnostics-service.ts` — Uses `resolveBridgeRuntimeConfig()` for project context.

**17 Child-Process Services** (all follow identical pattern):

Each calls `const config = resolveBridgeRuntimeConfig()` to get `projectCwd`, then spawns a child process with the project path as env var. Full list: `auto-dashboard-service.ts`, `captures-service.ts`, `cleanup-service.ts`, `doctor-service.ts`, `export-service.ts`, `forensics-service.ts`, `git-summary-service.ts`, `history-service.ts`, `hooks-service.ts`, `inspect-service.ts`, `knowledge-service.ts`, `recovery-diagnostics-service.ts`, `settings-service.ts`, `skill-health-service.ts`, `undo-service.ts`, `visualizer-service.ts`, `web-auth-storage.ts`. The fix is mechanical: add `projectCwd?: string` parameter to each `collect*()` function, pass it to `resolveBridgeRuntimeConfig()`.

**29 API Routes** (all in `web/app/api/`):

Every route calls bridge/service functions that derive project context from env. Routes need to: (1) read a `?project=` query parameter from the request, (2) pass it through to the service function. Routes: `boot`, `captures`, `cleanup`, `doctor`, `export-data`, `files`, `forensics`, `git`, `history`, `hooks`, `inspect`, `knowledge`, `live-state`, `onboarding`, `recovery`, `session/browser`, `session/command`, `session/events`, `session/manage`, `settings-data`, `shutdown`, `skill-health`, `steer`, `terminal/input`, `terminal/resize`, `terminal/sessions`, `terminal/stream`, `undo`, `visualizer`.

**Browser Store & Components**

- `web/lib/gsd-workspace-store.tsx` (5123 lines) — `GSDWorkspaceStore` class (line 1789). One `EventSource` to `/api/session/events`. One flat `WorkspaceStoreState`. `GSDWorkspaceProvider` (line 4954) creates one store per React tree. Multi-project needs: per-project store instances, project-aware EventSource URLs (append `?project=` to SSE endpoint), and a project-switching mechanism that swaps the active store.
- `web/components/gsd/app-shell.tsx` (356 lines) — `KNOWN_VIEWS` set (line 63). Add `"projects"` view. View persistence already project-keyed via `viewStorageKey(projectCwd)` (line 65).
- `web/components/gsd/sidebar.tsx` (497 lines) — `NavRail` (line 68) with static `navItems` array. Add "Projects" tab between existing items or at top.
- `web/components/gsd/onboarding-gate.tsx` (320 lines) — 5-step wizard. Add dev root selection step (after Welcome, before Provider, or after auth as an early step).
- `web/lib/pty-manager.ts` — Shell terminal sessions read `GSD_WEB_PROJECT_CWD` for working directory. Needs project-parameterized session creation.

**New Files Required**

- `~/.gsd/web-preferences.json` — Cross-project preferences (dev root path, last active project, per-project view state).
- `src/web/project-discovery-service.ts` — Scan dev root, detect projects using `detectProjectKind()` signals, return typed metadata.
- `src/web/bridge-registry.ts` (or inline in bridge-service) — Multi-bridge management with optional eviction.
- `web/app/api/projects/route.ts` — Project list/discovery endpoint.
- `web/app/api/preferences/route.ts` — Dev root and preferences endpoint.
- `web/components/gsd/projects-view.tsx` — Projects list/picker component.
- `web/components/gsd/onboarding/step-dev-root.tsx` — Dev root selection wizard step.

### Build Order

**1. Bridge Registry (foundation — everything depends on this)**

Convert `projectBridgeSingleton` to `Map<string, BridgeService>`. Add `projectCwd` parameter to `resolveBridgeRuntimeConfig()`. Add `getProjectBridgeServiceForCwd(projectCwd)` that creates/returns bridges keyed by project path. Keep `getProjectBridgeService()` as a compatibility shim that reads from env (preserves all existing callsites during migration). Prove two concurrent bridge instances can coexist without interference.

**2. Project-Scoped API Routes**

Add `resolveProjectCwd(request: Request)` helper that reads `?project=` from the URL and falls back to `GSD_WEB_PROJECT_CWD` env var (backward-compatible). Thread through all 29 routes. This is mechanical but touches many files — high-volume, low-risk.

**3. Dev Root & Project Discovery**

Build `project-discovery-service.ts` using `detectProjectKind()`. Scan one level of the dev root. Build `/api/projects` route. Build `/api/preferences` route for dev root persistence.

**4. Store Multi-Project Support**

Build a `ProjectStoreManager` (or similar) that maintains a `Map<string, GSDWorkspaceStore>` keyed by project path. Active project store connects SSE; background stores stay alive but disconnected (or on a slower poll). `GSDWorkspaceProvider` wraps a project-context-aware provider that swaps the active store.

**5. Projects View & NavRail Integration**

Build `projects-view.tsx` showing detected projects with status. Add to `KNOWN_VIEWS` and `navItems`. Wire project click to switch the active project context.

**6. Onboarding Dev Root Step**

Add `step-dev-root.tsx` to wizard. Persist dev root to `~/.gsd/web-preferences.json`. Make subsequent launches skip this step if dev root is already configured.

**7. Context-Aware Launch**

Extend `launchWebMode()` / `cli-web-branch.ts`: if cwd is inside a known project under the dev root → direct entry. If cwd is the dev root or outside → project picker. If no dev root configured → single-project behavior (backward-compatible).

### Verification Approach

- **Bridge registry**: Unit test that creates two `BridgeService` instances for different project paths, verifies they don't interfere, verifies disposal of one doesn't affect the other.
- **Project-scoped routes**: Existing contract tests + new test that sends `?project=` parameter and verifies correct project context resolution.
- **Project discovery**: Unit test scanning a temp directory with mixed project types, verifying detection kinds.
- **Store multi-project**: Contract test that boots two project contexts, switches between them, verifies state isolation.
- **Integration proof**: Packaged-host Playwright test that completes onboarding with dev root, sees two projects in the picker, switches between them, verifies state persists.
- **Regression**: `npm run test:unit`, `npm run test:integration`, `npm run build`, `npm run build:web-host` all pass.

## Constraints

- **All existing single-project behavior must continue working.** A user who never configures a dev root should see zero regression. The `?project=` parameter defaults to env var, every compatibility shim preserves current behavior.
- **Turbopack constraint persists.** All child-process services must stay on the `execFile + resolve-ts.mjs` pattern (D054). No direct imports of extension modules in API routes.
- **One Next.js host process.** Multi-project means multiple bridges inside one process, not multiple host processes. Port management and CORS complexity are avoided.
- **`resolveBridgeRuntimeConfig()` is the choke point.** Every service derives project context through this function. The migration succeeds or fails on making this function accept runtime context while staying backward-compatible.
- **SSE event streams are per-bridge.** Each bridge has its own subscriber set. Multi-project means the browser opens per-project SSE connections (with `?project=` parameter). The SSE route must look up the correct bridge by project.
- **Dev root preference lives outside project `.gsd/` directories.** `~/.gsd/web-preferences.json` is the right location since it's cross-project state.
- **Onboarding service is also a singleton.** `getOnboardingService()` returns one global instance. Since onboarding state (providers, auth) is global (not per-project), the singleton is correct — but the bridge auth refresh lifecycle needs to support multiple bridges.
- **PTY sessions need project-scoping.** `pty-manager.ts` spawns shell sessions with `GSD_WEB_PROJECT_CWD` as cwd. Multi-project means PTY sessions are per-project.

## Common Pitfalls

- **Forgetting a route.** There are 29 API routes. Missing one means that route silently uses the env var default (which is the launch project), creating subtle cross-project data leakage. A mechanical grep-and-fix pass is safer than incremental updates. The verification is: `rg "resolveBridgeRuntimeConfig()" web/app/api/` should return zero matches (all callers should pass explicit project context).
- **SSE connection leak.** Each project opens an SSE connection. If the browser never closes old connections when switching projects, the host accumulates bridge subscribers and event handlers. Store disposal must close the EventSource.
- **Bridge memory pressure.** Each active bridge spawns an RPC subprocess (Node process with loaded agent). With 5+ projects, memory could exceed 2-3 GB. An eviction timeout (e.g., 30 min idle → dispose) is not required for launch but should be designed as an extension point.
- **Store state bleed.** If the same store instance is reused across project switches (swap approach), stale state from project A could leak into project B. Per-project store instances are safer — the constructor resets all state.
- **View persistence collision.** `viewStorageKey()` already uses `projectCwd` as the key, so this is safe. But new project-level preferences need similar keying.
- **Singleton disposal race.** `getProjectBridgeService()` currently disposes the old bridge when the key changes. In a registry, bridges should only be disposed explicitly (eviction or shutdown), not on access — concurrent requests for different projects would race.

## Open Risks

- **Onboarding flow with dev root.** The current onboarding wizard gates the entire workspace. If the dev root step comes early (before auth), the user can't interact with the workspace at all until they pick a dev root. But picking a dev root before auth means the projects view would show projects in an unlocked-but-unauthenticated state. The cleanest ordering is: Welcome → Provider → Auth → Dev Root → Optional → Ready. The dev root step shows after auth succeeds so the workspace is genuinely ready to scan and serve projects.
- **Dev root path portability.** If the user changes their dev root path (renames `~/Projects` to `~/Code`), the stored preference is stale. The UI should handle a missing/invalid dev root gracefully (prompt to reconfigure).
- **Background bridge subprocess management.** When a bridge is idle (user hasn't interacted with that project), should the RPC subprocess stay running? Memory-wise, killing idle subprocesses is better. UX-wise, keeping them alive means instant switching. Starting with keep-alive and adding eviction later is the safer launch strategy.
- **Test suite scope.** The existing 9933 lines of web tests (12 contract test files + 3 integration test files) all assume single-project. The bridge registry change needs to be backward-compatible enough that existing tests pass unchanged, with multi-project behavior covered by new tests.

## Sources

- `src/web/bridge-service.ts` — Bridge singleton pattern, `resolveBridgeRuntimeConfig()`, project context derivation, `BridgeService` class, SSE event system, all exported bridge functions.
- `src/web-mode.ts` — Host launch, instance registry, env var setup, context-aware launch detection.
- `web/lib/gsd-workspace-store.tsx` — Browser store, SSE connection, boot payload, state management, `GSDWorkspaceProvider`.
- `web/components/gsd/app-shell.tsx` — View routing, `KNOWN_VIEWS`, view persistence, workspace chrome.
- `web/components/gsd/sidebar.tsx` — NavRail component, nav items array.
- `web/components/gsd/onboarding-gate.tsx` — 5-step wizard flow, step ordering, gate logic.
- `src/web/onboarding-service.ts` — Onboarding singleton, auth state, bridge auth refresh.
- `src/app-paths.ts` — `~/.gsd/` paths, `appRoot`, `agentDir`.
- All 17 child-process services in `src/web/*.ts` — Project context pattern (`resolveBridgeRuntimeConfig()` → `config.projectCwd`).
- All 29 API routes in `web/app/api/` — Current project context derivation via bridge-service imports.
