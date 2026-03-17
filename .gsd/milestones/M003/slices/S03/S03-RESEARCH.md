# S03 — Research: Workflow Visualizer Page

**Date:** 2026-03-16

## Summary

S03 builds a browser-native workflow visualizer with 7 tabbed sections (Progress, Deps, Metrics, Timeline, Agent, Changes, Export) backed by the upstream `loadVisualizerData()` function via a new `/api/visualizer` route. The work is straightforward: a new API route, a new React component (the "visualizer view"), wiring into the existing app-shell view system and sidebar, and connecting the `/gsd visualize` dispatch to navigate to it.

Upstream already provides a complete data layer (`visualizer-data.ts`), rich type definitions (`VisualizerData`, `VisualizerMilestone`, `VisualizerSlice`, etc.), and TUI view renderers (`visualizer-views.ts`) that define exactly what each tab should show. The browser version translates these TUI text renderers into React components. S02 already wired `"gsd-visualize"` as a surface dispatch — this slice needs to make that dispatch navigate to the visualizer view instead of showing the generic placeholder in the command surface panel.

One serialization concern: `CriticalPathInfo.milestoneSlack` and `CriticalPathInfo.sliceSlack` are `Map<string, number>` — these must be converted to `Record<string, number>` in the API route since `JSON.stringify()` turns Maps into `{}`.

## Recommendation

Add the visualizer as a new app-shell view (like dashboard/roadmap/files/activity), not a separate Next.js route. The app is a single-page layout managed by `activeView` state in `WorkspaceChrome`. Add a "Visualize" entry to the sidebar NavRail, a new `VisualizerView` component, and a `/api/visualizer` route that calls `loadVisualizerData()`.

Build order: API route first (proves data flows), then React component with all 7 tabs, then wire into app-shell + sidebar + dispatch integration.

## Implementation Landscape

### Key Files

**Upstream data layer (read-only, do not modify):**
- `src/resources/extensions/gsd/visualizer-data.ts` — `loadVisualizerData(basePath)` returns `VisualizerData` with milestones, phase, totals, byPhase, bySlice, byModel, units, criticalPath, remainingSliceCount, agentActivity, changelog. **Critical:** `CriticalPathInfo.milestoneSlack` and `.sliceSlack` are `Map<string, number>` — must convert to plain objects for JSON serialization.
- `src/resources/extensions/gsd/visualizer-views.ts` — TUI renderers (`renderProgressView`, `renderDepsView`, `renderMetricsView`, `renderTimelineView`, `renderAgentView`, `renderChangelogView`, `renderExportView`) — reference for what each tab should display. Not imported in browser code, just used as design reference.
- `src/resources/extensions/gsd/metrics.ts` — Exports `ProjectTotals`, `PhaseAggregate`, `SliceAggregate`, `ModelAggregate`, `UnitMetrics`, `TokenCounts`, `formatCost`, `formatTokenCount`, `classifyUnitPhase`. The visualizer component needs browser-local formatting utils that mirror these.
- `src/resources/extensions/gsd/types.ts` — `Phase` type (string union of 14 values: `'pre-planning' | 'needs-discussion' | ... | 'complete' | 'paused' | 'blocked'`).

**New files to create:**
- `src/web/visualizer-service.ts` — Thin service calling `loadVisualizerData()` and serializing Maps to Records. Follows the pattern of `src/web/recovery-diagnostics-service.ts`.
- `web/app/api/visualizer/route.ts` — GET endpoint returning serialized `VisualizerData`. Follows the pattern of `web/app/api/recovery/route.ts`.
- `web/lib/visualizer-types.ts` — Browser-safe TypeScript interfaces mirroring `VisualizerData` with `Record<string, number>` instead of `Map<string, number>` for slack fields. Also includes formatting utility functions.
- `web/components/gsd/visualizer-view.tsx` — Main visualizer component with 7 tabbed sections using the existing `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `web/components/ui/tabs.tsx` (Radix UI).

**Files to modify:**
- `web/components/gsd/app-shell.tsx` — Add `"visualize"` to `KNOWN_VIEWS`, import `VisualizerView`, render it when `activeView === "visualize"`. (~5 lines changed)
- `web/components/gsd/sidebar.tsx` — Add visualizer entry to `navItems` array in `NavRail`. Use `BarChart3` or `Eye` icon from lucide-react. (~3 lines changed)
- `web/components/gsd/command-surface.tsx` — Change the `"gsd-visualize"` case from the generic placeholder to trigger a view navigation (emit a custom event or close the surface and switch view). (~10 lines changed)

**Existing patterns to follow:**
- `web/app/api/recovery/route.ts` — API route pattern: `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`, try/catch with error JSON response, `Cache-Control: no-store`.
- `src/web/recovery-diagnostics-service.ts` — Service layer pattern: imports `resolveBridgeRuntimeConfig` from `bridge-service.ts` to get `projectCwd`.
- `web/components/gsd/dashboard.tsx` — Component pattern: uses `useGSDWorkspaceState()` for workspace data, direct `useState`/`useEffect` for local data fetching.
- `web/components/ui/tabs.tsx` — Radix UI Tabs components: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

### Build Order

1. **API route + service layer** — Create `src/web/visualizer-service.ts` and `web/app/api/visualizer/route.ts`. Prove data flows by hitting the endpoint with curl. This is the riskiest part: it exercises the upstream data loader in the web host context for the first time.

2. **Browser types + visualizer component** — Create `web/lib/visualizer-types.ts` (browser-safe interfaces + formatting utils), then `web/components/gsd/visualizer-view.tsx` with all 7 tabs. The component fetches from `/api/visualizer` on mount and on a 5-second interval (matching the TUI's 2-second refresh but less aggressive for browser). Each tab renders a section of the VisualizerData:
   - **Progress** (tab 0): Risk heatmap + milestone/slice/task tree with status icons
   - **Deps** (tab 1): Milestone dependency graph + slice dependency graph + critical path
   - **Metrics** (tab 2): Cost/token summary + by-phase bars + by-model bars + projections
   - **Timeline** (tab 3): Gantt-style unit execution timeline
   - **Agent** (tab 4): Active status, progress bar, rate, session cost, recent units
   - **Changes** (tab 5): Completed slice changelog with files modified
   - **Export** (tab 6): Markdown/JSON/snapshot export buttons (POST to a new export endpoint or client-side download)

3. **App-shell + sidebar + dispatch integration** — Wire the `VisualizerView` into `app-shell.tsx`'s view rendering, add to sidebar NavRail, and make `/gsd visualize` dispatch navigate to the view. The dispatch integration needs a mechanism to switch the app-shell's `activeView` — the existing pattern uses `window.dispatchEvent(new CustomEvent("gsd:open-file"))` for cross-component navigation; a similar `gsd:open-view` event or store action would work.

### Verification Approach

1. `npm run build:web-host` passes — proves all new TypeScript compiles
2. `curl http://localhost:3000/api/visualizer` returns valid JSON with `milestones`, `phase`, `totals`, `criticalPath` fields (criticalPath.milestoneSlack/sliceSlack must be objects, not empty)
3. Browser: navigate to visualizer view via sidebar icon — all 7 tabs render without errors
4. Browser: type `/gsd visualize` in terminal — navigates to visualizer view
5. Browser: visualizer shows real project data (milestones with slices, metrics if available)
6. No console errors when switching between tabs

## Constraints

- **Map serialization**: `CriticalPathInfo.milestoneSlack` and `sliceSlack` are `Map<string, number>`. `JSON.stringify(new Map())` produces `"{}"`. The service layer must convert these to `Record<string, number>` via `Object.fromEntries()`.
- **No direct imports from GSD extension modules in browser code**: Per S01 forward intelligence, web code cannot import from `src/resources/extensions/gsd/`. The browser types must be duplicated in `web/lib/visualizer-types.ts`, and data flows through the API route.
- **Export tab**: The TUI's Export tab calls `writeExportFile()` which writes to disk. The browser version should either: (a) POST to a new `/api/visualizer/export` endpoint that calls `writeExportFile()` and returns the path, or (b) generate the export client-side as a download blob. Option (a) is simpler and consistent with the TUI behavior.

## Common Pitfalls

- **Map → JSON silent failure** — `JSON.stringify({ slack: new Map([["M001", 0]]) })` produces `{"slack":{}}`. The service must explicitly convert Maps before returning. Test by checking the serialized output has keys.
- **`loadVisualizerData` fs access in Next.js** — The function uses `statSync`, `readFileSync`, and dynamic `import('node:fs')`. This only works with `runtime = "nodejs"` on the API route (not edge runtime). The recovery route already sets this correctly — follow the same pattern.
- **View navigation from command surface** — The command surface and app-shell are siblings under `WorkspaceChrome`. The `/gsd visualize` dispatch currently opens the command surface with a generic placeholder. To navigate to the visualizer view instead, the dispatch should either: skip the command surface entirely and emit a view-change event, or have the command surface detect `"gsd-visualize"` and close itself while triggering the navigation. The cleanest approach is to make `"gsd-visualize"` dispatch as a `"local"` action type that triggers `setActiveView("visualize")` rather than opening the command surface at all.
