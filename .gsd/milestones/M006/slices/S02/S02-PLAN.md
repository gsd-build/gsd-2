# S02: Project discovery, Projects view, and store switching

**Goal:** A Projects tab appears in the NavRail. The server discovers projects under a configured dev root. Clicking a project switches all workspace surfaces to that project's context with a per-project SSE connection. Background agent sessions survive project switches. Preferences (dev root) persist across sessions.
**Demo:** Launch web mode, open the Projects tab, see discovered projects with detection kind badges. Click a project — the dashboard, terminal, roadmap, and all other surfaces switch to that project's context. Switch back — the first project's state is preserved.

## Must-Haves

- `project-discovery-service.ts` scans one level of a dev root and returns typed `ProjectMetadata[]` using exported `detectProjectKind()`
- `/api/projects?root=` route returns discovered projects with detection metadata
- `/api/preferences` GET/PUT route persists dev root in `~/.gsd/web-preferences.json`
- `GSDWorkspaceStore` accepts `projectCwd` constructor parameter and appends `?project=<encodedCwd>` to all 28 `fetch()` calls and the `EventSource` URL
- `ProjectStoreManager` maintains `Map<string, GSDWorkspaceStore>` with active store switching and per-project SSE lifecycle
- `ProjectsView` component renders in the NavRail as a "Projects" tab with project cards showing name, path, and detection kind badge
- Switching projects swaps the active store in React context — all consumers re-render with new project state
- Background stores keep last-known state (SSE disconnected, not disposed) for instant switching
- All existing single-project behavior unchanged when `projectCwd` is undefined

## Proof Level

- This slice proves: integration
- Real runtime required: yes (Next.js build must compile all routes; contract test proves discovery logic)
- Human/UAT required: no (deferred to S03 for full end-to-end flow)

## Verification

- `npm run test:unit -- --test-name-pattern "project-discovery"` — proves discovery logic with temp directories containing mixed project types
- `npm run test:unit` — full regression, no existing tests broken (1205+ tests)
- `npm run build` — TypeScript compilation exits 0
- `npm run build:web-host` — Next.js standalone build exits 0 with all routes (including new `/api/projects` and `/api/preferences`)
- `grep -c "projects" web/components/gsd/app-shell.tsx` — confirms KNOWN_VIEWS includes "projects"
- `grep -c "Projects" web/components/gsd/sidebar.tsx` — confirms NavRail has Projects tab

## Observability / Diagnostics

- Runtime signals: `ProjectStoreManager` tracks active project path; each store instance exposes `projectCwd` via its state; SSE connections include `?project=` so server logs show per-project event routing
- Inspection surfaces: `/api/projects?root=<path>` returns project list with kinds; `/api/preferences` returns current dev root; `ProjectStoreManager.getActiveProjectCwd()` returns active project path; each store's `getSnapshot()` includes connection state
- Failure visibility: store `lastClientError` captures per-project fetch failures; `connectionState` tracks SSE lifecycle per store; missing dev root returns empty project list (not error)
- Redaction constraints: project file paths are user-local, no secrets

## Integration Closure

- Upstream surfaces consumed: `detectProjectKind()` and types from `bridge-service.ts` (exported in T01); `resolveProjectCwd(request)` and `getProjectBridgeServiceForCwd()` from S01; all 26 project-scoped API routes from S01
- New wiring introduced in this slice: `ProjectStoreManagerProvider` wraps `GSDWorkspaceProvider` in `GSDAppShell`; `ProjectsView` fetches from `/api/projects` and `/api/preferences`; store instances created with `projectCwd` connect SSE to project-specific event streams
- What remains before the milestone is truly usable end-to-end: S03 adds onboarding dev root step, context-aware launch detection, and final assembled proof

## Tasks

- [x] **T01: Create project discovery service, API routes, and contract test** `est:45m`
  - Why: S02 needs a server-side foundation — project scanning, preference persistence, and API endpoints — before the browser can display or switch projects. This is standalone work with no browser dependencies.
  - Files: `src/web/bridge-service.ts`, `src/web/project-discovery-service.ts`, `src/app-paths.ts`, `web/app/api/projects/route.ts`, `web/app/api/preferences/route.ts`, `src/tests/web-project-discovery-contract.test.ts`
  - Do: (1) Export `detectProjectKind` function from `bridge-service.ts` (types already exported). (2) Extend `ProjectDetectionSignals` with `hasCargo`, `hasGoMod`, `hasPyproject` and update `detectProjectKind` to check `Cargo.toml`, `go.mod`, `pyproject.toml` — these feed the "brownfield" kind detection. (3) Add `webPreferencesPath` export to `app-paths.ts`. (4) Create `project-discovery-service.ts` with `discoverProjects(devRootPath)` that reads one level with `readdirSync`, filters to directories, excludes `node_modules`/`.git`/dotfiles, calls `detectProjectKind()` on each, returns `ProjectMetadata[]` (name, path, kind, signals, lastModified via `statSync`). (5) Create `/api/projects/route.ts` GET handler reading `?root=` param. (6) Create `/api/preferences/route.ts` GET/PUT handler reading/writing `~/.gsd/web-preferences.json`. (7) Write `web-project-discovery-contract.test.ts` — create temp dirs with mixed project types (package.json, .git, Cargo.toml, .gsd/, empty), verify discovery returns correct metadata, edge case for nonexistent path returns empty array.
  - Verify: `npm run test:unit -- --test-name-pattern "project-discovery"` passes; `npm run build` exits 0
  - Done when: discovery service returns correct ProjectMetadata[] for mixed project types, both API routes compile, contract test passes, build clean

- [x] **T02: Thread project-scoping through workspace store with SSE lifecycle** `est:45m`
  - Why: The store currently hardcodes all API URLs without project context. Every `fetch()` and the `EventSource` need `?project=` appending when targeting a non-default project. This is the prerequisite for multi-store management — without it, all stores would talk to the same default bridge.
  - Files: `web/lib/gsd-workspace-store.tsx`
  - Do: (1) Add `projectCwd?: string` as a constructor parameter to `GSDWorkspaceStore`. Store it as `private readonly projectCwd`. (2) Create a `private buildUrl(base: string): string` method that uses the `URL` constructor to correctly append `?project=<encodeURIComponent(projectCwd)>` — must handle URLs that already have query params (use `URLSearchParams.set`, not string concatenation). When `projectCwd` is undefined, return the base URL unchanged. (3) Thread `this.buildUrl()` through all 28 `fetch()` calls — every `fetch("/api/X")` becomes `fetch(this.buildUrl("/api/X"))`, and every `fetch("/api/X?param=Y")` becomes `fetch(this.buildUrl("/api/X?param=Y"))`. (4) Update `ensureEventStream()` — `new EventSource("/api/session/events")` becomes `new EventSource(this.buildUrl("/api/session/events"))`. (5) Add `disconnectSSE(): void` method that closes the EventSource and nulls the reference without disposing the store (background stores stay alive). (6) Add `reconnectSSE(): void` method that calls `ensureEventStream()` and triggers a soft boot refresh. (7) Export `buildProjectUrl` as a standalone utility function for testing. Existing single-project behavior is unchanged — when `projectCwd` is undefined, all URLs stay as-is.
  - Verify: `npm run build` exits 0; grep all fetch calls to confirm `this.buildUrl` wrapping; `npm run test:unit` passes (no regression)
  - Done when: `GSDWorkspaceStore` with `projectCwd="/foo/bar"` would generate `fetch("/api/boot?project=%2Ffoo%2Fbar")` and `EventSource("/api/session/events?project=%2Ffoo%2Fbar")`; without `projectCwd`, URLs unchanged; `disconnectSSE()`/`reconnectSSE()` exist; build passes

- [x] **T03: Build ProjectStoreManager, Projects view, NavRail tab, and verify full regression** `est:1h`
  - Why: This task delivers the visible outcome of S02 — a Projects tab in the NavRail backed by a store manager that creates, switches, and lifecycle-manages per-project stores. Without this, the URL-scoped stores from T02 and the API routes from T01 have no consumer.
  - Files: `web/lib/project-store-manager.ts`, `web/components/gsd/projects-view.tsx`, `web/components/gsd/app-shell.tsx`, `web/components/gsd/sidebar.tsx`
  - Do: (1) Create `project-store-manager.ts` with `ProjectStoreManager` class: `Map<string, GSDWorkspaceStore>` stores, `activeProjectCwd: string | null`, `getActiveStore()`, `switchProject(projectCwd)` (creates or retrieves store, calls `start()` if new, calls `disconnectSSE()` on previous active store, calls `reconnectSSE()` on new active store, updates `activeProjectCwd`), `getActiveProjectCwd()`, `disposeAll()`. (2) Create `ProjectStoreManagerContext` + `ProjectStoreManagerProvider` + `useProjectStoreManager()` hook. The provider creates one `ProjectStoreManager` instance and provides it via context. (3) Refactor `GSDAppShell` — wrap `GSDWorkspaceProvider` with `ProjectStoreManagerProvider`. Modify `GSDWorkspaceProvider` to accept an optional `projectCwd` prop passed to the `GSDWorkspaceStore` constructor. The store manager's `switchProject()` must trigger React to re-render with the new active store. Approach: the store manager itself is a `useSyncExternalStore`-compatible object (has `subscribe`/`getSnapshot`) so React re-renders when active project changes. (4) Add `"projects"` to `KNOWN_VIEWS` set in `app-shell.tsx`. Add `{activeView === "projects" && <ProjectsView />}` in the view rendering section. (5) Add Projects entry to `navItems` in `sidebar.tsx` with `FolderKanban` icon (from lucide-react), positioned before Dashboard. (6) Create `projects-view.tsx` — fetches `/api/projects?root=<devRoot>` and `/api/preferences` for dev root, renders project cards with name, path, detection kind badge (reuse badge styling from `project-welcome.tsx`), active indicator for current project, click handler calls `switchProject()` from store manager. When no dev root is configured, show a message prompting configuration (S03 adds the actual setup flow).
  - Verify: `npm run test:unit` — all tests pass (1205+, 0 fail); `npm run build` exits 0; `npm run build:web-host` exits 0; `grep "projects" web/components/gsd/app-shell.tsx` shows KNOWN_VIEWS entry; `grep "Projects" web/components/gsd/sidebar.tsx` shows NavRail entry
  - Done when: `KNOWN_VIEWS` includes "projects"; NavRail shows Projects tab; `ProjectsView` renders project cards from `/api/projects`; `ProjectStoreManager` switches stores with SSE lifecycle; both builds pass; full test regression passes

## Files Likely Touched

- `src/web/bridge-service.ts` — export `detectProjectKind`, extend detection signals
- `src/web/project-discovery-service.ts` — new: `discoverProjects()` scanning one level of dev root
- `src/app-paths.ts` — add `webPreferencesPath` export
- `web/app/api/projects/route.ts` — new: GET handler for project discovery
- `web/app/api/preferences/route.ts` — new: GET/PUT handler for dev root persistence
- `web/lib/gsd-workspace-store.tsx` — add `projectCwd` param, `buildUrl()`, thread 28 fetches + EventSource, `disconnectSSE()`/`reconnectSSE()`
- `web/lib/project-store-manager.ts` — new: `ProjectStoreManager` class with store lifecycle
- `web/components/gsd/projects-view.tsx` — new: project list UI component
- `web/components/gsd/app-shell.tsx` — add "projects" to `KNOWN_VIEWS`, wire `ProjectsView`, wrap with store manager provider
- `web/components/gsd/sidebar.tsx` — add Projects entry to `navItems`
- `src/tests/web-project-discovery-contract.test.ts` — new: contract test for discovery logic
