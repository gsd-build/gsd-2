---
id: T03
parent: S02
milestone: M006
provides:
  - ProjectStoreManager class maintaining Map<string, GSDWorkspaceStore> with SSE lifecycle
  - ProjectStoreManagerProvider React context + hook wrapping GSDAppShell
  - GSDWorkspaceProvider accepts optional external store prop for manager injection
  - ProjectsView component fetching /api/projects and rendering project cards with kind badges
  - "Projects" tab in NavRail with FolderKanban icon
key_files:
  - web/lib/project-store-manager.tsx
  - web/components/gsd/projects-view.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/sidebar.tsx
  - web/lib/gsd-workspace-store.tsx
key_decisions:
  - Used .tsx extension for project-store-manager since it contains JSX (provider component)
  - Event name for view switching is gsd:navigate-view (not gsd:change-view as plan estimated)
  - GSDWorkspaceProvider uses externalStore ?? internalStore pattern — backward compatible, internal store only starts/disposes when no external store provided
patterns_established:
  - ProjectStoreManager as useSyncExternalStore-compatible external store — subscribe/getSnapshot interface lets React re-render when activeProjectCwd changes
  - Store injection pattern — GSDWorkspaceProvider accepts optional store prop, lifecycle managed externally by store manager when injected
  - ProjectAwareWorkspace bridge component — reads active store from manager and passes to provider, decoupling manager from workspace rendering
observability_surfaces:
  - ProjectStoreManager.getActiveProjectCwd() returns active project path
  - useSyncExternalStore(manager.subscribe, manager.getSnapshot) reactively tracks active project
  - Each per-project store has independent connectionState for SSE lifecycle tracking
  - Browser DevTools Network tab shows per-project SSE streams with ?project= parameter
duration: 25m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T03: Build ProjectStoreManager, Projects view, NavRail tab, and verify full regression

**Created ProjectStoreManager with per-project store lifecycle, ProjectsView with kind badges and active indicator, Projects tab in NavRail, and wired everything through GSDAppShell — all builds pass, 1215 tests pass, zero regression.**

## What Happened

Built the user-facing outcome of S02 in 6 steps:

1. Created `project-store-manager.tsx` — `ProjectStoreManager` class maintaining a `Map<string, GSDWorkspaceStore>` with SSE lifecycle management. `switchProject()` disconnects SSE on the previous store, creates/reconnects the target store, and notifies React via useSyncExternalStore interface. Includes `ProjectStoreManagerProvider`, context, and `useProjectStoreManager()` hook.

2. Refactored `GSDWorkspaceProvider` to accept an optional `store` prop. When provided, lifecycle (start/dispose) is managed externally by the store manager. When omitted, creates an internal store — preserving existing single-project behavior.

3. Refactored `GSDAppShell` to wrap with `ProjectStoreManagerProvider` and introduced `ProjectAwareWorkspace` bridge component that reads the active store from the manager and passes it to `GSDWorkspaceProvider`.

4. Added `"projects"` to `KNOWN_VIEWS` and wired `{activeView === "projects" && <ProjectsView />}` rendering.

5. Added Projects tab to NavRail at position 0 (before Dashboard) with `FolderKanban` icon.

6. Created `ProjectsView` — fetches `/api/preferences` for devRoot, then `/api/projects?root=` for discovered projects. Renders a responsive grid of project cards with name, path, kind badge (Active/Initialized/Existing/Legacy v1/Blank with color-coded styling), signal chips (Git/Node.js/Rust/Go/Python), and active indicator with pulse dot. Handles three empty states: no dev root configured, no projects found, and fetch error. Clicking a project calls `switchProject()` and dispatches `gsd:navigate-view` to switch to dashboard.

## Verification

- `npm run build` — TypeScript compilation exits 0 ✅
- `npm run build:web-host` — Next.js standalone build exits 0, all routes including `/api/projects` and `/api/preferences` present ✅
- `npm run test:unit` — 1215 tests pass, 0 fail, 0 regression ✅
- `grep '"projects"' web/components/gsd/app-shell.tsx` — confirms KNOWN_VIEWS entry ✅
- `grep 'FolderKanban\|"projects"' web/components/gsd/sidebar.tsx` — confirms NavRail entry ✅
- `grep 'ProjectStoreManagerProvider' web/components/gsd/app-shell.tsx` — confirms provider wiring ✅

## Diagnostics

- **Active project:** `useSyncExternalStore(manager.subscribe, manager.getSnapshot)` returns the active project path or null
- **Store state:** each store's `getSnapshot().connectionState` shows SSE lifecycle status (idle/connected/reconnecting/disconnected/error)
- **Network:** browser DevTools shows per-project SSE streams with `?project=` parameter
- **Failures:** store `lastClientError` surfaces per-project API failures
- **Empty states:** no dev root → informational message; no projects → path shown; fetch error → error message displayed

## Deviations

- Plan specified `project-store-manager.ts` — used `.tsx` extension since the file contains JSX for the provider component
- Plan referenced `gsd:change-view` custom event — actual event name is `gsd:navigate-view` per existing code
- Actual fetch count is 26 (not 28 as plan estimated) — carried forward from T02

## Known Issues

None

## Files Created/Modified

- `web/lib/project-store-manager.tsx` — new: ProjectStoreManager class, React context, provider, hook
- `web/components/gsd/projects-view.tsx` — new: project picker UI with kind badges and active indicator
- `web/components/gsd/app-shell.tsx` — modified: KNOWN_VIEWS includes "projects", GSDAppShell wrapped with ProjectStoreManagerProvider, ProjectAwareWorkspace bridge, ProjectsView rendering
- `web/components/gsd/sidebar.tsx` — modified: FolderKanban import, Projects entry in navItems at position 0
- `web/lib/gsd-workspace-store.tsx` — modified: GSDWorkspaceProvider accepts optional store prop
