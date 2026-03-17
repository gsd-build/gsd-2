---
estimated_steps: 6
estimated_files: 4
---

# T03: Build ProjectStoreManager, Projects view, NavRail tab, and verify full regression

**Slice:** S02 — Project discovery, Projects view, and store switching
**Milestone:** M006

## Description

Create the `ProjectStoreManager` class that maintains a `Map<string, GSDWorkspaceStore>` of per-project stores with SSE lifecycle management. Build the `ProjectsView` component that fetches discovered projects from `/api/projects` and the dev root from `/api/preferences`, renders project cards with detection kind badges, and switches projects via the store manager. Add a "Projects" tab to the NavRail and wire the view into `app-shell.tsx`. This task delivers the visible user-facing outcome of S02.

**Relevant skill:** `frontend-design` — for the ProjectsView component styling. Load it before building the component.

## Steps

1. **Create `web/lib/project-store-manager.ts`.** This is the core orchestration class:
   ```ts
   import { GSDWorkspaceStore } from "./gsd-workspace-store";

   export class ProjectStoreManager {
     private stores = new Map<string, GSDWorkspaceStore>();
     private activeProjectCwd: string | null = null;
     private listeners = new Set<() => void>();
     
     // useSyncExternalStore interface
     subscribe = (listener: () => void): (() => void) => {
       this.listeners.add(listener);
       return () => this.listeners.delete(listener);
     };
     
     getSnapshot = (): string | null => this.activeProjectCwd;
     
     getActiveStore(): GSDWorkspaceStore | null {
       if (!this.activeProjectCwd) return null;
       return this.stores.get(this.activeProjectCwd) ?? null;
     }
     
     getActiveProjectCwd(): string | null {
       return this.activeProjectCwd;
     }
     
     switchProject(projectCwd: string): GSDWorkspaceStore {
       // Disconnect SSE on current active store
       if (this.activeProjectCwd && this.activeProjectCwd !== projectCwd) {
         const prev = this.stores.get(this.activeProjectCwd);
         if (prev) prev.disconnectSSE();
       }
       
       // Get or create store for new project
       let store = this.stores.get(projectCwd);
       if (!store) {
         store = new GSDWorkspaceStore(projectCwd);
         this.stores.set(projectCwd, store);
         store.start();
       } else {
         // Reconnect SSE on re-activated store
         store.reconnectSSE();
       }
       
       this.activeProjectCwd = projectCwd;
       this.notify();
       return store;
     }
     
     disposeAll(): void {
       for (const store of this.stores.values()) {
         store.dispose();
       }
       this.stores.clear();
       this.activeProjectCwd = null;
       this.notify();
     }
     
     private notify(): void {
       for (const listener of this.listeners) listener();
     }
   }
   ```
   Also create and export a React context + provider + hook:
   ```ts
   export const ProjectStoreManagerContext = createContext<ProjectStoreManager | null>(null);
   
   export function ProjectStoreManagerProvider({ children }: { children: ReactNode }) {
     const [manager] = useState(() => new ProjectStoreManager());
     useEffect(() => () => manager.disposeAll(), [manager]);
     return (
       <ProjectStoreManagerContext.Provider value={manager}>
         {children}
       </ProjectStoreManagerContext.Provider>
     );
   }
   
   export function useProjectStoreManager(): ProjectStoreManager {
     const mgr = useContext(ProjectStoreManagerContext);
     if (!mgr) throw new Error("useProjectStoreManager must be used within ProjectStoreManagerProvider");
     return mgr;
   }
   ```

2. **Refactor `GSDWorkspaceProvider` in `gsd-workspace-store.tsx`.** Currently (line 4954):
   ```ts
   export function GSDWorkspaceProvider({ children }: { children: ReactNode }) {
     const [store] = useState(() => new GSDWorkspaceStore())
     ...
   }
   ```
   Change to accept optional `store` prop so the store manager can inject its own:
   ```ts
   export function GSDWorkspaceProvider({ children, store: externalStore }: { children: ReactNode; store?: GSDWorkspaceStore }) {
     const [internalStore] = useState(() => new GSDWorkspaceStore())
     const store = externalStore ?? internalStore
     
     useEffect(() => {
       // Only start/dispose if using internal store (not externally managed)
       if (!externalStore) {
         store.start()
         return () => store.dispose()
       }
     }, [store, externalStore])
     
     return <WorkspaceStoreContext.Provider value={store}>{children}</WorkspaceStoreContext.Provider>
   }
   ```
   This preserves backward compatibility — existing single-project behavior creates its own store. When a `store` is provided (by the store manager), lifecycle is managed externally.

3. **Refactor `GSDAppShell` in `app-shell.tsx`.** Currently (line 348):
   ```tsx
   export function GSDAppShell() {
     return (
       <GSDWorkspaceProvider>
         <DevOverridesProvider>
           <WorkspaceChrome />
         </DevOverridesProvider>
       </GSDWorkspaceProvider>
     )
   }
   ```
   Change to wrap with `ProjectStoreManagerProvider` and use the active store from the manager:
   ```tsx
   export function GSDAppShell() {
     return (
       <ProjectStoreManagerProvider>
         <ProjectAwareWorkspace />
       </ProjectStoreManagerProvider>
     )
   }
   
   function ProjectAwareWorkspace() {
     const manager = useProjectStoreManager();
     const activeProjectCwd = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
     const activeStore = activeProjectCwd ? manager.getActiveStore() : null;
     
     // Render with the active store or fall back to default single-project behavior
     return (
       <GSDWorkspaceProvider store={activeStore ?? undefined}>
         <DevOverridesProvider>
           <WorkspaceChrome />
         </DevOverridesProvider>
       </GSDWorkspaceProvider>
     );
   }
   ```
   Import `ProjectStoreManagerProvider`, `useProjectStoreManager` from `@/lib/project-store-manager` and `useSyncExternalStore` from `react`.

4. **Add "projects" to `KNOWN_VIEWS` and wire view rendering.** In `app-shell.tsx`:
   - Line 63: Add `"projects"` to `KNOWN_VIEWS` set.
   - In the view rendering section (after line 285), add:
     ```tsx
     {activeView === "projects" && <ProjectsView />}
     ```
   - Import `ProjectsView` from `@/components/gsd/projects-view`.

5. **Add Projects tab to NavRail in `sidebar.tsx`.** In the `navItems` array (line 71), add a new entry at position 0 (before Dashboard):
   ```ts
   { id: "projects", label: "Projects", icon: FolderKanban },
   ```
   Import `FolderKanban` from `lucide-react`.

6. **Create `web/components/gsd/projects-view.tsx`.** Build a project picker component:
   - **State:** `projects: ProjectMetadata[]`, `devRoot: string | null`, `loading: boolean`, `error: string | null`.
   - **Fetch on mount:** GET `/api/preferences` to get `devRoot`. If set, GET `/api/projects?root=<encodeURIComponent(devRoot)>` to get project list.
   - **Layout:** Header with "Projects" title and dev root path display. Grid of project cards.
   - **Each project card shows:**
     - Project name (directory name) — bold heading
     - Full path — muted small text
     - Detection kind badge — use similar badge styling to `project-welcome.tsx`: "active-gsd" (green), "empty-gsd" (blue), "brownfield" (amber), "v1-legacy" (orange), "blank" (gray)
     - Active indicator — highlight border/background when this project matches `activeProjectCwd`
     - Click handler: call `manager.switchProject(project.path)` then navigate to dashboard view
   - **Empty states:**
     - No dev root configured: show a message like "No development root configured. Set up a dev root in Settings to discover projects." (S03 adds the actual onboarding step)
     - Dev root configured but no projects found: show "No projects found in {devRoot}"
     - Error fetching: show error message
   - **Type imports:** Import `ProjectMetadata` type. Define it locally or import from the discovery service (since the component runs in browser, define locally matching the server type).
   - **Store manager:** Use `useProjectStoreManager()` hook. Use `useSyncExternalStore` to read `activeProjectCwd` for the active indicator.
   - **View switching:** After `switchProject()`, dispatch a `gsd:change-view` event with `detail: { view: "dashboard" }` to navigate to the dashboard for the switched project.

## Must-Haves

- [ ] `ProjectStoreManager` creates, switches, and SSE-lifecycle-manages per-project stores
- [ ] `GSDWorkspaceProvider` accepts optional external `store` prop
- [ ] `GSDAppShell` wraps with `ProjectStoreManagerProvider` and uses active store from manager
- [ ] `KNOWN_VIEWS` includes `"projects"`
- [ ] NavRail has "Projects" tab with `FolderKanban` icon
- [ ] `ProjectsView` fetches projects from `/api/projects` and renders cards with kind badges
- [ ] Clicking a project card calls `switchProject()` and navigates to dashboard
- [ ] Active project has visual indicator in the project list
- [ ] Empty state when no dev root configured
- [ ] Both builds pass, all existing tests pass

## Verification

- `npm run test:unit` — all tests pass (1205+, 0 fail, 0 new regression)
- `npm run build` — TypeScript compilation exits 0
- `npm run build:web-host` — Next.js standalone build exits 0
- `grep '"projects"' web/components/gsd/app-shell.tsx` — confirms KNOWN_VIEWS entry
- `grep 'FolderKanban\|Projects' web/components/gsd/sidebar.tsx` — confirms NavRail entry
- `grep 'ProjectStoreManagerProvider' web/components/gsd/app-shell.tsx` — confirms provider wiring

## Observability Impact

- Signals added/changed: `ProjectStoreManager` tracks `activeProjectCwd`; each per-project store emits independent `connectionState` changes; SSE connections include `?project=` for server-side logging
- How a future agent inspects this: `useSyncExternalStore(manager.subscribe, manager.getSnapshot)` returns the active project path; each store's `getSnapshot().connectionState` shows its SSE status; browser DevTools Network tab shows per-project SSE streams with `?project=` parameter
- Failure state exposed: store `lastClientError` surfaces per-project API failures; `connectionState` tracks SSE lifecycle states (idle/connected/reconnecting/disconnected/error) per store

## Inputs

- `web/lib/gsd-workspace-store.tsx` — `GSDWorkspaceStore` class at line 1789 with `projectCwd` constructor param, `disconnectSSE()`/`reconnectSSE()` methods, `GSDWorkspaceProvider` at line 4954, `WorkspaceStoreContext`, `useGSDWorkspaceState`/`useGSDWorkspaceActions` hooks (from T02)
- `web/components/gsd/app-shell.tsx` — `KNOWN_VIEWS` at line 63, `GSDAppShell` at line 348, `WorkspaceChrome` view rendering at lines 275-285
- `web/components/gsd/sidebar.tsx` — `navItems` array at line 71, `NavRail` component
- `web/components/gsd/project-welcome.tsx` — badge styling reference for detection kinds
- `web/app/api/projects/route.ts` — endpoint returning `ProjectMetadata[]` (from T01)
- `web/app/api/preferences/route.ts` — endpoint returning `{ devRoot?: string }` (from T01)
- S01 Forward Intelligence — `?project=` parameter accepted by all routes; bridges created lazily on first access

## Expected Output

- `web/lib/project-store-manager.ts` — new: `ProjectStoreManager` class, context, provider, hook
- `web/lib/gsd-workspace-store.tsx` — modified: `GSDWorkspaceProvider` accepts optional `store` prop
- `web/components/gsd/projects-view.tsx` — new: project picker UI component
- `web/components/gsd/app-shell.tsx` — modified: `KNOWN_VIEWS` includes "projects", `GSDAppShell` wrapped with store manager, view rendering includes `ProjectsView`
- `web/components/gsd/sidebar.tsx` — modified: `navItems` includes Projects entry
