---
id: M006
provides:
  - Map-based bridge registry replacing singleton — concurrent BridgeService instances keyed by resolved project path
  - resolveProjectCwd(request) — stateless ?project= query parameter resolution with env-var fallback
  - All 26 project-scoped API routes threaded with resolveProjectCwd, all 16 service files accept projectCwdOverride
  - project-discovery-service with discoverProjects() scanning one directory level with smart detection (Git, Node, Rust, Go, Python)
  - /api/projects?root= and /api/preferences GET/PUT routes for discovery and preference persistence
  - GSDWorkspaceStore with projectCwd constructor param, buildUrl() threading ?project= through all 27 call sites
  - ProjectStoreManager with Map<string, GSDWorkspaceStore>, active store switching, per-project SSE lifecycle
  - ProjectsView component in NavRail with kind badges, signal chips, and active indicator
  - step-dev-root.tsx onboarding wizard step at position 3 with text input, suggestion chips, and skip
  - resolveContextAwareCwd() — CLI launch detection routing cwd-inside-project to project dir
  - BootProjectInitializer — browser auto-registration of boot project with store manager
  - webPreferencesPath export from app-paths.ts for ~/.gsd/web-preferences.json
  - 25 new contract test cases (8 multi-bridge coexistence, 10 project discovery, 7 context-aware launch)
key_decisions:
  - "D061: Bridge registry keyed by resolve(projectCwd) with Map<string, BridgeService> — explicit disposal only"
  - "D062: resolveProjectCwd reads ?project= query parameter with env-var fallback — stateless, SSE-compatible"
  - "D063: Per-project store instances via ProjectStoreManager — SSE lifecycle isolation, background stores survive switches"
  - "D064: Dev root persists in ~/.gsd/web-preferences.json — user-level, separate from project .gsd/"
  - "D065: Onboarding order Welcome→Provider→Auth→Dev Root→Optional→Ready — dev root after auth, skippable"
  - "D066: projectCwdOverride parameter name avoids TypeScript redeclaration in services that destructure config"
patterns_established:
  - "resolveProjectCwd(request) at top of every route handler, passed downstream to services and bridge functions"
  - "functionName(existingParams, projectCwdOverride?: string) — optional trailing param, backward compatible by construction"
  - "this.buildUrl(url) wrapping all fetch/EventSource calls in the workspace store for project-scoped URL construction"
  - "ProjectStoreManager with useSyncExternalStore-compatible subscribe/getSnapshot for reactive project switching"
  - "disconnectSSE/reconnectSSE lifecycle methods for clean project switching without losing store state"
  - "Null-render bridge components (BootProjectInitializer) inside provider tree for cross-context wiring"
observability_surfaces:
  - "/api/projects?root=<path> returns discovered ProjectMetadata[] with kind and signals per project"
  - "/api/preferences GET returns current dev root and last active project"
  - "All 27 fetch/EventSource calls include ?project=<encoded-cwd> — visible in browser network panel"
  - "Each registered bridge exposes BridgeRuntimeSnapshot via getSnapshot() with per-project context"
  - "npm run test:unit -- --test-name-pattern 'multi-project' re-verifies 8 bridge coexistence claims"
  - "npm run test:unit -- --test-name-pattern 'project-discovery' re-verifies 10 discovery claims"
  - "npm run test:unit -- --test-name-pattern 'resolveContextAwareCwd' re-verifies 7 launch detection claims"
requirement_outcomes:
  - id: R020
    from_status: active
    to_status: validated
    proof: "Bridge registry manages concurrent instances (8-case contract test). 26 API routes accept ?project= with env-var fallback. Project discovery scans dev root (10-case contract test). Projects view renders in NavRail with kind badges. Per-project store isolation with SSE lifecycle. Onboarding dev root step at position 3 with skip. Context-aware launch detection (7-case contract test). 1222 tests pass, both builds green."
duration: ~2h35m
verification_result: passed
completed_at: 2026-03-17
---

# M006: Multi-Project Workspace

**Replaced the single-project-per-launch architecture with a multi-project workspace: bridge registry managing concurrent project instances, project-scoped API surface across 26 routes, Projects NavRail tab with smart discovery, per-project store isolation with SSE lifecycle, onboarding dev root selection, and context-aware launch detection — proven by 25 new contract tests and full regression (1222 tests, both builds green).**

## What Happened

Three slices built bottom-up from server infrastructure to browser assembly:

**S01 — Bridge registry and project-scoped API surface (~1h30m).** Replaced the bridge singleton (`projectBridgeSingleton`) with a `Map<string, BridgeService>` registry keyed by resolved project path. Added `getProjectBridgeServiceForCwd(projectCwd)` for registry-based lookup/creation and `resolveProjectCwd(request)` for stateless `?project=` query parameter resolution with `GSD_WEB_PROJECT_CWD` env-var fallback. Threaded `projectCwdOverride?: string` through all 15 child-process service functions, all 8 bridge-level aggregate functions, and all 26 project-scoped API routes. Three routes were intentionally excluded: `terminal/input` and `terminal/resize` (operate on pre-created session IDs where project context is baked in), and `shutdown` (process-level with no project context). An 8-case contract test proves distinct instances, idempotent lookup, independent command routing, subscriber isolation, URL parameter decoding, env-var fallback, backward-compatible shim, and registry reset.

**S02 — Project discovery, Projects view, and store switching (~45m).** Created `project-discovery-service.ts` with `discoverProjects()` scanning one directory level under a dev root, detecting project kind via `.git`, `.gsd`, `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, and returning sorted `ProjectMetadata[]`. Added `/api/projects?root=` and `/api/preferences` GET/PUT routes. Extended `GSDWorkspaceStore` with a `projectCwd` constructor parameter and `buildUrl()` method that threads `?project=` through all 27 call sites (26 fetches + 1 EventSource). Created `ProjectStoreManager` maintaining a `Map<string, GSDWorkspaceStore>` with `switchProject()` managing SSE disconnect/reconnect lifecycle. Built `ProjectsView` with kind badges, signal chips, and active indicator, wired into `KNOWN_VIEWS` and the NavRail with a `FolderKanban` icon. A 10-case contract test proves discovery across mixed project types, exclusion behavior, sort order, and edge cases.

**S03 — Onboarding dev root step, context-aware launch, and final assembly (~20m).** Created `step-dev-root.tsx` as onboarding wizard step 3 (after auth, before optional integrations) with text input, four suggestion chips (`~/Projects`, `~/Developer`, `~/Code`, `~/dev`), continue (persists via `PUT /api/preferences`), and skip (proceeds without saving). Added `resolveContextAwareCwd()` to `cli-web-branch.ts` — reads `web-preferences.json`, extracts `devRoot`, and when cwd is inside a one-level-deep project under that root, returns the project directory. All failure paths return cwd unchanged. Added `BootProjectInitializer` — a null-render component inside `GSDWorkspaceProvider` that auto-registers the boot project with the store manager. Seven contract tests prove all context-aware resolution edge cases.

The three slices connect cleanly: S01's `resolveProjectCwd(request)` in every route means S02's store `buildUrl()` just works — append `?project=` and the server routes to the right bridge. S02's `ProjectStoreManager` with per-project stores means S03's `BootProjectInitializer` just calls `manager.switchProject(bootProjectCwd)`. The full flow is: CLI resolves project cwd → host launches with project-scoped bridge → browser auto-registers boot project → user switches via Projects view → each project gets independent store + SSE.

## Cross-Slice Verification

**Success criterion: Projects tab in NavRail, click between projects, all surfaces switch.**
- `"projects"` in `KNOWN_VIEWS`, `FolderKanban` in NavRail sidebar, `ProjectsView` renders on selection — verified by grep.
- `ProjectStoreManager.switchProject()` swaps active store, `GSDWorkspaceProvider` re-renders all consumers — proven by `ProjectAwareWorkspace` bridge component.
- All 27 store call sites go through `buildUrl()` with `?project=` — verified: `grep -c 'this.buildUrl' gsd-workspace-store.tsx` → 27, `grep -c 'fetch("/api' gsd-workspace-store.tsx` → 0.

**Success criterion: Switching preserves background agent sessions.**
- `disconnectSSE()` closes the stream without disposing store state. `reconnectSSE()` re-establishes the stream and triggers soft boot refresh. Background stores keep last-known state.
- Bridge registry keeps all created bridges alive — no eviction on switch.
- Subscriber isolation proven by contract test: SSE events from bridge A don't appear on bridge B.

**Success criterion: Context-aware launch (inside project → direct, outside → picker).**
- `resolveContextAwareCwd()` defined at line 120, called at line 258 of `cli-web-branch.ts`.
- 7 contract tests cover: inside project dir, at dev root, outside root, no prefs file, no devRoot key, stale path, deeply nested cwd — all return correct result.

**Success criterion: Dev root selection in onboarding persists across sessions.**
- `step-dev-root.tsx` at wizard position 3 (6-step wizard: Welcome→Provider→Auth→DevRoot→Optional→Ready).
- Continue calls `PUT /api/preferences` with `{ devRoot: path }`, persists to `~/.gsd/web-preferences.json`.
- Skip calls `onNext()` without persisting — single-project backward compatibility preserved.

**Success criterion: No regression for single-project users.**
- All parameters are optional trailing params — backward compatible by construction.
- `resolveProjectCwd()` falls back to `GSD_WEB_PROJECT_CWD` env var. `buildUrl()` passes URLs through unchanged when `projectCwd` is undefined.
- Full test suite: 1222 pass, 0 fail (includes all pre-existing tests).

**Success criterion: Builds and tests pass.**
- `npm run build` — exits 0 ✅
- `npm run build:web-host` — exits 0, `/api/projects` and `/api/preferences` in route manifest ✅
- `npm run test:unit` — 1222 pass, 0 fail, 0 cancelled ✅

## Requirement Changes

- R020: active → validated — Bridge registry manages concurrent instances (8-case contract test). 26 API routes accept `?project=` with env-var fallback. Project discovery scans dev root (10-case contract test). Projects view renders in NavRail with kind badges. Per-project store isolation with SSE lifecycle. Onboarding dev root step with skip. Context-aware launch detection (7-case contract test). Boot auto-initialization. 1222 tests pass, both builds green.

## Forward Intelligence

### What the next milestone should know
- The multi-project architecture layers cleanly: CLI resolves cwd → host launches with bridge → browser auto-registers boot project → user switches via Projects view → each project gets independent store + SSE. All API requests include `?project=` when a non-default project is active.
- `~/.gsd/web-preferences.json` stores `devRoot` and `lastActiveProject`. The `/api/preferences` PUT currently overwrites the entire file — a read-modify-write pattern is needed if any other feature adds preferences.
- `ProjectStoreManager` is available via `useProjectStoreManager()` hook. `useSyncExternalStore` drives reactive project switching in React.
- 25 new contract tests (8 multi-bridge, 10 discovery, 7 context-aware launch) provide fast targeted verification for the multi-project subsystem.

### What's fragile
- **Preference file PUT is a full overwrite** — concurrent writes from different sources would conflict. Currently safe (single writer: onboarding step), but adding more preference consumers requires migrating to read-modify-write.
- **One-level-deep project resolution** — `resolveContextAwareCwd` and `discoverProjects` both scan one level under dev root. Users with `~/Projects/org/repo` structures won't get automatic detection of `repo` as a distinct project.
- **No bridge lifecycle management** — created bridges stay alive until process exit. No idle eviction, no max-instance cap. Acceptable for a handful of projects but could accumulate memory with large dev roots.
- **`buildUrl()` uses dummy base `http://x` for URL parsing** — all current URLs are relative (`/api/...`). If any fetch URL becomes absolute, `buildUrl()` would double-host.

### Authoritative diagnostics
- `npm run test:unit -- --test-name-pattern "multi-project"` — 8 tests proving bridge registry identity, command independence, subscriber isolation, project resolution (~10s)
- `npm run test:unit -- --test-name-pattern "project-discovery"` — 10 tests proving discovery across mixed project types, exclusion, sort, edge cases
- `npm run test:unit -- --test-name-pattern "resolveContextAwareCwd"` — 7 tests proving all context-aware launch edge cases
- `rg "resolveProjectCwd" web/app/api/ --files-with-matches | wc -l` → 26 confirms route threading coverage
- `rg "projectCwdOverride" src/web/ --files-with-matches | wc -l` → 16 confirms service threading coverage
- `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` → 27 confirms store URL wrapping

### What assumptions changed
- Plan estimated 28–29 routes needed threading — actual count is 26. `terminal/input`, `terminal/resize` operate on pre-created session IDs (no project context needed), `shutdown` is process-level.
- Plan estimated 28 fetch calls in the store — actual count is 26. The plan was based on an older file version.
- T02 in S01 was a no-op commit (summary written, source files unchanged). T03 discovered this and completed both T02 and T03 work together. The work is complete but attributed to T03.

## Files Created/Modified

- `src/web/bridge-service.ts` — replaced singleton with Map registry, added getProjectBridgeServiceForCwd, resolveProjectCwd, extended resolveBridgeRuntimeConfig, exported detectProjectKind with extended signals
- `src/web/project-discovery-service.ts` — new: discoverProjects() with ProjectMetadata interface
- `src/app-paths.ts` — added webPreferencesPath export
- `src/cli-web-branch.ts` — added resolveContextAwareCwd() and wired into runWebCliBranch()
- `src/web/captures-service.ts` — added projectCwdOverride parameter
- `src/web/cleanup-service.ts` — added projectCwdOverride parameter
- `src/web/doctor-service.ts` — added projectCwdOverride parameter
- `src/web/export-service.ts` — added projectCwdOverride parameter
- `src/web/forensics-service.ts` — added projectCwdOverride parameter
- `src/web/git-summary-service.ts` — added projectCwdOverride parameter
- `src/web/history-service.ts` — added projectCwdOverride parameter
- `src/web/hooks-service.ts` — added projectCwdOverride parameter
- `src/web/inspect-service.ts` — added projectCwdOverride parameter
- `src/web/knowledge-service.ts` — added projectCwdOverride parameter
- `src/web/recovery-diagnostics-service.ts` — added projectCwdOverride parameter
- `src/web/settings-service.ts` — added projectCwdOverride parameter
- `src/web/skill-health-service.ts` — added projectCwdOverride parameter
- `src/web/undo-service.ts` — added projectCwdOverride parameter
- `src/web/visualizer-service.ts` — added projectCwdOverride parameter
- `web/app/api/projects/route.ts` — new: GET handler for project discovery
- `web/app/api/preferences/route.ts` — new: GET/PUT handler for dev root persistence
- `web/app/api/boot/route.ts` — added resolveProjectCwd
- `web/app/api/captures/route.ts` — added resolveProjectCwd
- `web/app/api/cleanup/route.ts` — added resolveProjectCwd
- `web/app/api/doctor/route.ts` — added resolveProjectCwd
- `web/app/api/export-data/route.ts` — added resolveProjectCwd
- `web/app/api/files/route.ts` — replaced local getProjectCwd with resolveProjectCwd
- `web/app/api/forensics/route.ts` — added resolveProjectCwd
- `web/app/api/git/route.ts` — added resolveProjectCwd
- `web/app/api/history/route.ts` — added resolveProjectCwd
- `web/app/api/hooks/route.ts` — added resolveProjectCwd
- `web/app/api/inspect/route.ts` — added resolveProjectCwd
- `web/app/api/knowledge/route.ts` — added resolveProjectCwd
- `web/app/api/live-state/route.ts` — added resolveProjectCwd
- `web/app/api/onboarding/route.ts` — added resolveProjectCwd
- `web/app/api/recovery/route.ts` — added resolveProjectCwd
- `web/app/api/session/browser/route.ts` — added resolveProjectCwd
- `web/app/api/session/command/route.ts` — added resolveProjectCwd
- `web/app/api/session/events/route.ts` — switched to getProjectBridgeServiceForCwd
- `web/app/api/session/manage/route.ts` — added resolveProjectCwd
- `web/app/api/settings-data/route.ts` — added resolveProjectCwd
- `web/app/api/skill-health/route.ts` — added resolveProjectCwd
- `web/app/api/steer/route.ts` — added resolveProjectCwd
- `web/app/api/terminal/sessions/route.ts` — added resolveProjectCwd
- `web/app/api/terminal/stream/route.ts` — added resolveProjectCwd
- `web/app/api/undo/route.ts` — added resolveProjectCwd
- `web/app/api/visualizer/route.ts` — added resolveProjectCwd
- `web/lib/gsd-workspace-store.tsx` — added projectCwd, buildUrl/buildProjectUrl, disconnectSSE/reconnectSSE, external store prop
- `web/lib/pty-manager.ts` — added projectCwd to getOrCreateSession
- `web/lib/project-store-manager.tsx` — new: ProjectStoreManager, React context, provider, hook
- `web/components/gsd/projects-view.tsx` — new: project picker with kind badges and signal chips
- `web/components/gsd/app-shell.tsx` — KNOWN_VIEWS includes "projects", ProjectStoreManagerProvider, ProjectAwareWorkspace, BootProjectInitializer
- `web/components/gsd/sidebar.tsx` — FolderKanban import, Projects NavRail entry
- `web/components/gsd/onboarding/step-dev-root.tsx` — new: onboarding wizard step for dev root
- `web/components/gsd/onboarding-gate.tsx` — expanded from 5 to 6 wizard steps
- `src/tests/web-multi-project-contract.test.ts` — new: 8-case bridge coexistence contract test
- `src/tests/web-project-discovery-contract.test.ts` — new: 10-case discovery contract test
- `src/tests/web-mode-cli.test.ts` — added 7 context-aware launch detection tests
