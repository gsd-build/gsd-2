# S02: Project discovery, Projects view, and store switching — Research

**Date:** 2026-03-17
**Status:** Complete

## Summary

S02 builds the browser-facing half of multi-project: project discovery on the server, a `/api/projects` route, a `/api/preferences` route for dev root persistence, a `ProjectsView` component in the NavRail, and a `ProjectStoreManager` that maintains per-project `GSDWorkspaceStore` instances with independent SSE connections. The server-side foundation is fully in place from S01 — all 26 API routes accept `?project=`, `getProjectBridgeServiceForCwd()` creates bridges lazily, and the SSE route subscribes to the correct bridge per `?project=` parameter.

The main work is in four areas: (1) a standalone `project-discovery-service.ts` that scans one level of a dev root and reuses the existing `detectProjectKind()` detection signals from `bridge-service.ts`, (2) two new API routes (`/api/projects` and `/api/preferences`), (3) a `ProjectStoreManager` class wrapping `Map<string, GSDWorkspaceStore>` with active-store switching and SSE lifecycle management, and (4) a `ProjectsView` component added to `KNOWN_VIEWS` and the NavRail. All API `fetch()` calls (28 in the store) and the `EventSource` URL need `?project=` appending when targeting a non-default project.

## Recommendation

**Build bottom-up: project discovery service → API routes → store multi-project manager → Projects view + NavRail integration.**

The project discovery service is standalone (no dependencies on other S02 work) and the API routes are simple GET/PUT wrappers. Build those first so the browser has endpoints to call. Then build the `ProjectStoreManager` which is the architectural center of the browser-side multi-project work — it manages store lifecycle, SSE connections, and the `?project=` URL threading. The `ProjectsView` component is leaf UI that calls `/api/projects` and uses the store manager to switch projects. Build it last.

## Implementation Landscape

### Key Files

**Existing files to modify:**

- `web/lib/gsd-workspace-store.tsx` (5123 lines) — The `GSDWorkspaceStore` class needs a constructor parameter for `projectCwd` so it can append `?project=<cwd>` to all 28 `fetch()` calls and the `EventSource` URL. Currently all URLs are hardcoded (e.g. `fetch("/api/boot")`, `new EventSource("/api/session/events")`). The store also needs a `dispose()` path that cleanly closes the EventSource. `GSDWorkspaceProvider` (line 4954) currently creates one store — it needs to be replaced or wrapped by a project-context-aware provider that gets the active store from the `ProjectStoreManager`. Exported hooks `useGSDWorkspaceState()` and `useGSDWorkspaceActions()` read from a single `WorkspaceStoreContext` — this context must point to the active project's store.
- `web/components/gsd/app-shell.tsx` (356 lines) — `KNOWN_VIEWS` set (line 63) gets `"projects"` added. The `WorkspaceChrome` component's view switch (`activeView === "projects"`) renders the new `ProjectsView`. `GSDAppShell` (line 338) currently wraps everything in `GSDWorkspaceProvider` — this is where the `ProjectStoreManager` provider goes, wrapping the existing provider.
- `web/components/gsd/sidebar.tsx` (497 lines) — The `navItems` array (line 77) gets a "Projects" entry. The `NavRail` component renders the tab. Position: top of the list (before Dashboard) or as a distinct section.
- `src/web/bridge-service.ts` (2138 lines) — `detectProjectKind()` (line 491) and its types (`ProjectDetectionKind`, `ProjectDetectionSignals`, `ProjectDetection`, lines 471-488) are currently non-exported internal functions. The project discovery service needs to call `detectProjectKind()` — either export it or copy the logic. Exporting is cleaner since it's already well-tested via `collectBootPayload()`. Also needs addition of more detection signals: `Cargo.toml` (Rust), `go.mod` (Go), `pyproject.toml` (Python), `Gemfile` (Ruby), `composer.json` (PHP), `CMakeLists.txt` (C++).
- `src/app-paths.ts` (8 lines) — Add a `webPreferencesPath` export pointing to `join(appRoot, 'web-preferences.json')` for the preferences file path.

**New files to create:**

- `src/web/project-discovery-service.ts` — `discoverProjects(devRootPath: string): ProjectMetadata[]`. Reads one level of `devRootPath` with `readdirSync()`, filters to directories, calls `detectProjectKind()` on each, returns typed metadata (name, path, kind, signals, lastModified). Excludes `node_modules`, `.git`, and other non-project dirs.
- `web/app/api/projects/route.ts` — GET handler: reads `?root=` query param, calls `discoverProjects()`, returns JSON array. Follows existing route patterns (`export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`).
- `web/app/api/preferences/route.ts` — GET handler: reads `~/.gsd/web-preferences.json`, returns JSON. PUT handler: validates input, writes to file. Schema: `{ devRoot?: string, lastActiveProject?: string }`.
- `web/components/gsd/projects-view.tsx` — React component showing project list with name, path, detection kind badge, active-session indicator. Calls `/api/projects?root=<devRoot>`. Click handler switches active project via `ProjectStoreManager`.
- `web/lib/project-store-manager.ts` (or inline in `gsd-workspace-store.tsx`) — `ProjectStoreManager` class with `Map<string, GSDWorkspaceStore>`, `switchProject(projectCwd)`, `getActiveStore()`, `disposeAll()`. When switching: disconnect SSE on background store, connect SSE on new active store, swap React context.

### Build Order

**T01 — Project discovery service and API routes.**

1. Export `detectProjectKind()` and its types from `bridge-service.ts` (currently internal).
2. Extend detection signals with `Cargo.toml`, `go.mod`, `pyproject.toml`.
3. Create `project-discovery-service.ts`: `discoverProjects(devRootPath)` scans one level, calls `detectProjectKind()` on each directory, returns `ProjectMetadata[]`.
4. Add `webPreferencesPath` to `app-paths.ts`.
5. Create `/api/projects/route.ts` — GET with `?root=` param.
6. Create `/api/preferences/route.ts` — GET/PUT for dev root persistence.

This is standalone work with no browser dependencies. Proves the server can discover projects and persist preferences.

**T02 — Store project-scoping (URL threading).**

1. Add a `projectCwd?: string` constructor parameter to `GSDWorkspaceStore`.
2. Create a helper `buildProjectUrl(base: string, projectCwd?: string): string` that appends `?project=<encodedCwd>` when `projectCwd` is set.
3. Thread this through all 28 `fetch()` calls and the `EventSource` URL in `ensureEventStream()`.
4. Existing single-project behavior is unchanged — when `projectCwd` is undefined, URLs stay as-is.

This is mechanical but touches many call sites in the 5123-line store file. The pattern is consistent: every `fetch("/api/X")` becomes `fetch(buildProjectUrl("/api/X", this.projectCwd))` and `new EventSource("/api/session/events")` becomes `new EventSource(buildProjectUrl("/api/session/events", this.projectCwd))`.

**T03 — ProjectStoreManager and provider refactor.**

1. Create `ProjectStoreManager` — `Map<string, GSDWorkspaceStore>`, active project tracking, store lifecycle.
2. `switchProject(projectCwd)`: create or retrieve store for the project, call `start()` on it if new, swap active store in React context.
3. `disconnectBackground(store)` / `reconnectForeground(store)`: manage SSE connections — background stores close EventSource, foregrounded store reconnects. Stores themselves stay alive (keep last state for instant switching).
4. Wrap `GSDWorkspaceProvider` with a `ProjectStoreManagerProvider` that exposes the active store via context. `useGSDWorkspaceState()` and `useGSDWorkspaceActions()` continue reading from the same `WorkspaceStoreContext` — only the value changes when the active project switches.
5. Expose `useProjectStoreManager()` hook for the `ProjectsView` to call `switchProject()`.

**T04 — Projects view, NavRail tab, and integration.**

1. Add `"projects"` to `KNOWN_VIEWS` in `app-shell.tsx`.
2. Add "Projects" tab to `navItems` in `sidebar.tsx` (with `Layers` or `FolderKanban` lucide icon).
3. Create `ProjectsView` component: fetches `/api/projects?root=<devRoot>`, fetches `/api/preferences` for dev root, renders project cards with detection kind badges and active indicator.
4. Click handler calls `switchProject(projectCwd)` from the store manager — triggers store swap, SSE reconnection, view change back to dashboard.
5. Wire view rendering in `WorkspaceChrome`: `activeView === "projects" && <ProjectsView />`.

**T05 — Contract test and regression.**

1. Write `web-project-discovery-contract.test.ts`: create temp directories with mixed project types, verify `discoverProjects()` returns correct metadata.
2. Test store project-scoping: verify `buildProjectUrl()` correctly appends `?project=` parameter.
3. Full regression: `npm run test:unit`, `npm run build`, `npm run build:web-host`.

### Verification Approach

- **Project discovery:** Unit test creating a temp dir with subdirectories containing `.git`, `package.json`, `Cargo.toml`, `.gsd/`, empty dirs — verify `discoverProjects()` returns correct `ProjectMetadata[]` with accurate kinds and signals.
- **Preferences persistence:** Test that `/api/preferences` GET/PUT round-trips correctly, handles missing file, validates input.
- **Store URL threading:** Verify that `GSDWorkspaceStore` with `projectCwd="/foo/bar"` generates `fetch("/api/boot?project=%2Ffoo%2Fbar")` and `EventSource("/api/session/events?project=%2Ffoo%2Fbar")`.
- **Store switching:** Verify that `ProjectStoreManager.switchProject()` creates a new store, starts it, and the active store's state is accessible via hooks.
- **NavRail integration:** `KNOWN_VIEWS` includes `"projects"`, `navItems` has the Projects entry, `app-shell.tsx` renders `ProjectsView` when `activeView === "projects"`.
- **Regression:** `npm run test:unit` all pass, `npm run build` exits 0, `npm run build:web-host` exits 0.
- **Authoritative commands:**
  - `npm run test:unit -- --test-name-pattern "project-discovery"` — proves discovery logic
  - `npm run build` — TypeScript compilation
  - `npm run build:web-host` — Next.js standalone build with all routes

## Constraints

- **`detectProjectKind()` is internal to `bridge-service.ts`.** It must be exported (or its logic duplicated) for the discovery service. Exporting is preferred — it's a pure function with no side effects beyond `readdirSync`/`existsSync`.
- **Turbopack constraint (D054).** The project discovery service uses `readdirSync`/`existsSync`/`statSync` from `node:fs` — it runs in the API route handler, not as a child-process service. This is fine because project scanning is a simple filesystem operation, not an extension module import.
- **28 `fetch()` calls in the store.** Each needs `?project=` threading. The URL-building helper must handle URLs that already have query parameters (e.g. `/api/doctor?scope=X` → `/api/doctor?scope=X&project=Y`).
- **`EventSource` URL.** The SSE constructor accepts a URL string. `?project=` must be appended. `EventSource` doesn't support custom headers, which is why the query parameter approach (D062) is correct.
- **Single `GSDWorkspaceProvider` at the top of the React tree.** All components read from it. The store manager must swap the context value, not create nested providers — otherwise consumers would need to re-mount.
- **View persistence is already project-keyed.** `viewStorageKey(projectCwd)` in `app-shell.tsx` (line 65) uses `projectCwd` as the key. This works correctly with multi-project — each project remembers its own active view.
- **`project-welcome.tsx` already exists.** It renders based on `ProjectDetection` kind. This component is reused in the dashboard for per-project welcome. The `ProjectsView` is a different component — it's the project picker/switcher, not the individual project's welcome screen.

## Common Pitfalls

- **URL parameter double-encoding.** `resolveProjectCwd()` on the server calls `decodeURIComponent()`. The store must use `encodeURIComponent()` when building URLs. If the path contains special characters (spaces, `#`), correct encoding/decoding is critical.
- **URLs with existing query params.** Some store `fetch()` calls already have query params (e.g. `/api/doctor?scope=${encodeURIComponent(scope)}`). The `buildProjectUrl` helper must use `&project=` not `?project=` when the URL already has a `?`. Using the `URL` constructor is safest.
- **EventSource reconnection after project switch.** When switching from project A to B, project A's `EventSource` must be closed (not left dangling). If the store's `dispose()` is called, it closes the EventSource. But background stores should stay alive (keep state) — so a `disconnectSSE()` method (closes EventSource without full dispose) is needed, separate from `dispose()`.
- **React context update triggers re-render cascade.** Swapping the store in context causes all consumers to re-render. This is intentional — the UI should update to show the new project's state. But if switching is too expensive, it could cause a visible flash. The stores keep last-known state, so the re-render should show stale-but-real data while the new boot payload loads.
- **Missing dev root handling.** If no dev root is configured, the Projects view should show a prompt to configure one. The `/api/preferences` GET returns `{}` or `null` for dev root — the component must handle both gracefully.

## Open Risks

- **Store memory with many projects.** Each `GSDWorkspaceStore` instance holds terminal lines, transcript blocks, live state, command surfaces, and other state. With 10+ project stores alive, memory could be significant. Starting with no eviction (keep all stores alive) is correct for the initial implementation — add eviction in S03 or later if needed.
- **Background store staleness.** When a project's store is backgrounded (SSE disconnected), its state freezes. When re-foregrounded, a `refreshBoot({ soft: true })` and SSE reconnect bring it current. There may be a brief window where the UI shows stale data. This is acceptable — the reconnect happens quickly.

## Sources

- `src/web/bridge-service.ts` — `detectProjectKind()` (line 491), `ProjectDetection` types (lines 471-488), `resolveProjectCwd()` (line 1644), `getProjectBridgeServiceForCwd()` (line 1632)
- `web/lib/gsd-workspace-store.tsx` — `GSDWorkspaceStore` class (line 1789), 28 `fetch()` calls, `EventSource` at line 4734, `GSDWorkspaceProvider` (line 4954), `useGSDWorkspaceState` (line 4977)
- `web/components/gsd/app-shell.tsx` — `KNOWN_VIEWS` (line 63), `GSDAppShell` (line 338), `WorkspaceChrome` view rendering
- `web/components/gsd/sidebar.tsx` — `NavRail` (line 68), `navItems` array (line 77)
- `web/components/gsd/project-welcome.tsx` — existing per-project welcome using `ProjectDetection` types
- `src/app-paths.ts` — `appRoot` at `~/.gsd/`, path exports pattern
- `web/app/api/boot/route.ts` — canonical route pattern (`resolveProjectCwd`, `runtime`, `dynamic`)
- `web/app/api/session/events/route.ts` — SSE route using `getProjectBridgeServiceForCwd(projectCwd)`
