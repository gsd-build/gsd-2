---
id: S02
parent: M006
milestone: M006
provides:
  - project-discovery-service with discoverProjects() scanning one directory level of a dev root
  - /api/projects?root= GET route returning discovered ProjectMetadata[] with detection kind and signals
  - /api/preferences GET/PUT route persisting dev root and last active project in ~/.gsd/web-preferences.json
  - webPreferencesPath export from app-paths.ts
  - detectProjectKind() exported from bridge-service.ts with extended signals (Cargo, Go, Python)
  - GSDWorkspaceStore projectCwd constructor param with buildUrl() threading ?project= through all 26 fetches + EventSource
  - buildProjectUrl() standalone utility for URL construction
  - disconnectSSE() and reconnectSSE() methods for per-project SSE lifecycle management
  - ProjectStoreManager maintaining Map<string, GSDWorkspaceStore> with active store switching
  - ProjectStoreManagerProvider React context wrapping GSDAppShell
  - GSDWorkspaceProvider accepting optional external store prop for manager injection
  - ProjectsView component rendering project cards with kind badges and active indicator
  - "Projects" tab in NavRail with FolderKanban icon
  - Contract test proving discovery logic across mixed project types (10 assertions)
requires:
  - slice: S01
    provides: getProjectBridgeServiceForCwd(), resolveProjectCwd(), all 29 API routes threaded with ?project= param
affects:
  - S03
key_files:
  - src/web/project-discovery-service.ts
  - src/web/bridge-service.ts
  - src/app-paths.ts
  - web/app/api/projects/route.ts
  - web/app/api/preferences/route.ts
  - web/lib/gsd-workspace-store.tsx
  - web/lib/project-store-manager.tsx
  - web/components/gsd/projects-view.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/sidebar.tsx
  - src/tests/web-project-discovery-contract.test.ts
key_decisions:
  - Extended ProjectDetectionSignals with optional fields (hasCargo, hasGoMod, hasPyproject) preserving backward compatibility
  - GSDWorkspaceProvider uses externalStore ?? internalStore pattern — backward compatible, internal store only creates/disposes when no external store provided
  - ProjectStoreManager as useSyncExternalStore-compatible object — subscribe/getSnapshot interface lets React re-render when activeProjectCwd changes
  - Used .tsx for project-store-manager since it contains JSX provider component
  - Event name for view switching is gsd:navigate-view (discovered from existing code, not gsd:change-view)
patterns_established:
  - project-discovery-service pattern: readdirSync one level, filter dirs, exclude dotfiles/node_modules, call detectProjectKind per entry, return sorted ProjectMetadata[]
  - buildUrl pattern: every fetch/EventSource in the store goes through this.buildUrl() which delegates to standalone buildProjectUrl(); undefined projectCwd passes URL through unchanged
  - SSE lifecycle pattern: disconnectSSE() closes stream without disposing store state; reconnectSSE() re-establishes stream and triggers soft boot refresh — designed for project switching without losing in-memory state
  - Store injection pattern: GSDWorkspaceProvider accepts optional store prop, lifecycle managed externally by store manager when injected
  - ProjectAwareWorkspace bridge component: reads active store from manager and passes to provider, decoupling manager from workspace rendering
observability_surfaces:
  - /api/projects?root=<path> returns project list with kind + signals for each discovered project
  - /api/preferences GET returns current dev root and last active project (or {} if not set)
  - All 26 fetch calls and EventSource include ?project=<encoded-cwd> when projectCwd is set — visible in browser network panel and server logs
  - ProjectStoreManager.getActiveProjectCwd() returns active project path
  - useSyncExternalStore(manager.subscribe, manager.getSnapshot) reactively tracks active project
  - Each per-project store has independent connectionState for SSE lifecycle tracking
  - discoverProjects() returns [] for missing/unreadable paths (no throw)
drill_down_paths:
  - .gsd/milestones/M006/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M006/slices/S02/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-17
---

# S02: Project discovery, Projects view, and store switching

**Built the server-side project discovery pipeline, threaded per-project URL scoping through all store API calls, and delivered a Projects tab with kind-badged cards backed by a multi-store manager that switches projects with SSE lifecycle isolation.**

## What Happened

Three tasks built bottom-up from server to browser:

**T01 — Server foundation (12m).** Exported `detectProjectKind` from `bridge-service.ts` and extended `ProjectDetectionSignals` with optional `hasCargo`, `hasGoMod`, `hasPyproject` fields for broader brownfield detection. Created `project-discovery-service.ts` with `discoverProjects()` — scans one directory level, excludes dotfiles/node_modules/.git, calls `detectProjectKind` per directory, returns sorted `ProjectMetadata[]` with name, path, kind, signals, and lastModified. Added `webPreferencesPath` to `app-paths.ts`. Created `/api/projects` (GET, reads `?root=` param) and `/api/preferences` (GET/PUT, persists to `~/.gsd/web-preferences.json` with `mkdirSync` safety). Built a 10-assertion contract test proving detection across mixed project types (brownfield, empty-gsd, brownfield-cargo, blank), exclusion behavior, sort order, and nonexistent path edge case.

**T02 — Store URL scoping (8m).** Added `projectCwd?: string` constructor parameter to `GSDWorkspaceStore`. Created `buildProjectUrl()` standalone export using `URL` constructor with `searchParams.set()` to safely append `?project=` to any URL (handles existing query params). Wrapped all 26 `fetch()` calls and the `EventSource` URL through `this.buildUrl()`. Added `disconnectSSE()` (closes stream without disposing state) and `reconnectSSE()` (re-establishes stream + soft boot refresh) for project switching. When `projectCwd` is undefined, all URLs pass through unchanged — zero regression for single-project behavior.

**T03 — Store manager, Projects view, NavRail tab (25m).** Created `ProjectStoreManager` class maintaining `Map<string, GSDWorkspaceStore>` — `switchProject()` disconnects SSE on previous store, creates or retrieves the target store, reconnects SSE, and notifies React via `useSyncExternalStore`-compatible `subscribe`/`getSnapshot` interface. Refactored `GSDWorkspaceProvider` to accept an optional `store` prop (external lifecycle management when provided, internal store creation when omitted). Wrapped `GSDAppShell` with `ProjectStoreManagerProvider` and `ProjectAwareWorkspace` bridge component. Added `"projects"` to `KNOWN_VIEWS`. Created `ProjectsView` — fetches `/api/preferences` for dev root, then `/api/projects?root=` for projects, renders a responsive grid of project cards with name, path, kind badge (Active/Initialized/Existing/Legacy v1/Blank with color-coded styling), signal chips (Git/Node.js/Rust/Go/Python), and active indicator with pulse dot. Three empty states: no dev root configured, no projects found, and fetch error. Added Projects entry to NavRail at position 0 with `FolderKanban` icon.

## Verification

- `npm run test:unit -- --test-name-pattern "project-discovery"` — 10/10 pass ✅
- `npm run test:unit` — 1215 pass, 0 fail, 0 cancelled ✅
- `npm run build` — TypeScript compilation exits 0 ✅
- `npm run build:web-host` — Next.js standalone build exits 0, `/api/projects` and `/api/preferences` in route manifest ✅
- `grep '"projects"' web/components/gsd/app-shell.tsx` — KNOWN_VIEWS entry confirmed ✅
- `grep 'FolderKanban\|"projects"' web/components/gsd/sidebar.tsx` — NavRail entry confirmed ✅
- `grep 'ProjectStoreManagerProvider' web/components/gsd/app-shell.tsx` — provider wiring confirmed ✅
- `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` → 27 (26 fetches + 1 EventSource) ✅
- `grep -c 'fetch("/api\|fetch(\`/api' web/lib/gsd-workspace-store.tsx` → 0 (no unwrapped fetches) ✅

## Requirements Advanced

- R020 (multi-project workspace) — S02 delivers the browser-side multi-project infrastructure: project discovery, per-project store isolation with SSE lifecycle, and the Projects view. Combined with S01's bridge registry, two of the three major risk areas (bridge registry and SSE/store isolation) are architecturally resolved.

## Requirements Validated

- None newly validated — R020 validation requires S03's end-to-end assembled proof.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- Plan specified `project-store-manager.ts` — used `.tsx` extension since the file contains JSX for the provider component
- Plan referenced `gsd:change-view` custom event — actual event name is `gsd:navigate-view` per existing code
- Plan estimated 28 fetch calls in the store — actual count is 26 (plan was based on older file version). All actual call sites are wrapped.

## Known Limitations

- ProjectsView shows an informational message when no dev root is configured — the actual dev root setup flow (onboarding wizard step) is deferred to S03
- Background stores keep last-known state but SSE is disconnected — reconnecting triggers a full soft boot refresh, not a delta sync
- No bridge eviction policy — all project bridges created stay alive until host shutdown. Memory pressure from many simultaneous projects is theoretically possible but unlikely in practice

## Follow-ups

- S03 adds onboarding dev root step, context-aware launch detection, and full end-to-end assembled proof
- Background store SSE reconnection could be optimized with delta sync if switching latency proves noticeable

## Files Created/Modified

- `src/web/bridge-service.ts` — exported `detectProjectKind`, extended signals with hasCargo/hasGoMod/hasPyproject
- `src/web/project-discovery-service.ts` — new: `ProjectMetadata` interface, `discoverProjects()` function
- `src/app-paths.ts` — added `webPreferencesPath` export
- `web/app/api/projects/route.ts` — new: GET handler for project discovery
- `web/app/api/preferences/route.ts` — new: GET/PUT handler for dev root persistence
- `web/lib/gsd-workspace-store.tsx` — added `buildProjectUrl` export, constructor with `projectCwd`, `buildUrl()`, wrapped 26 fetches + EventSource, `disconnectSSE()`/`reconnectSSE()`, accepts optional external `store` prop in provider
- `web/lib/project-store-manager.tsx` — new: ProjectStoreManager class, React context, provider, hook
- `web/components/gsd/projects-view.tsx` — new: project picker UI with kind badges, signal chips, active indicator
- `web/components/gsd/app-shell.tsx` — KNOWN_VIEWS includes "projects", wrapped with ProjectStoreManagerProvider, ProjectAwareWorkspace bridge, ProjectsView rendering
- `web/components/gsd/sidebar.tsx` — FolderKanban import, Projects entry at position 0
- `src/tests/web-project-discovery-contract.test.ts` — new: 10-case contract test for discovery logic

## Forward Intelligence

### What the next slice should know
- `ProjectStoreManager` is available via `useProjectStoreManager()` hook — S03 needs this for wiring context-aware launch (auto-switching to the project matching the launch cwd)
- `/api/preferences` already supports `lastActiveProject` field — S03's context-aware launch can read this to restore the last active project on relaunch
- `GSDWorkspaceProvider` now accepts an optional `store` prop — when present, the provider skips internal store creation and lifecycle management. This is the injection point the store manager uses.
- The `gsd:navigate-view` custom event is how ProjectsView navigates back to dashboard after switching — S03's onboarding completion should use the same pattern

### What's fragile
- `buildUrl()` relies on browser-side `URL` constructor with a dummy base (`http://x`) to safely parse relative paths — if any fetch URL changes from relative to absolute, `buildUrl()` would double-host. All current URLs are relative (`/api/...`), so this is safe now.
- `ProjectStoreManager` notification uses a simple Set of callbacks — if React concurrent mode causes double-subscribe, the Map lookup is idempotent so it's safe, but the listener set could grow. Standard `useSyncExternalStore` behavior handles this.

### Authoritative diagnostics
- `grep -c 'this.buildUrl' web/lib/gsd-workspace-store.tsx` — must return 27 (26 fetches + 1 EventSource). If it's lower, a fetch was added without project scoping.
- `npm run test:unit -- --test-name-pattern "project-discovery"` — 10 assertions covering all detection kinds and edge cases. If a new project kind is added, this test must be extended.
- `/api/projects?root=<path>` and `/api/preferences` are the two new server contracts. Both are exercised by contract test and confirmed in the Next.js build route manifest.

### What assumptions changed
- Plan assumed 28 fetch calls in the store — actual count is 26. The plan was based on a slightly older file version. No functional impact.
- Plan assumed `gsd:change-view` event name — actual name is `gsd:navigate-view`. Discovered from existing sidebar code during T03.
