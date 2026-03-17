---
id: S03
parent: M003
milestone: M003
provides:
  - GET /api/visualizer endpoint returning serialized VisualizerData with Map→Record conversion
  - VisualizerView React component with 7 tabbed sections (Progress, Deps, Metrics, Timeline, Agent, Changes, Export)
  - Browser-safe TypeScript interfaces for all visualizer types in web/lib/visualizer-types.ts
  - Sidebar NavRail "Visualize" entry with BarChart3 icon
  - /gsd visualize slash-command dispatch navigating to visualizer view via view-navigate kind
  - Client-side markdown/JSON export download from Export tab
  - gsd:navigate-view CustomEvent pattern for slash-command→view navigation
requires:
  - slice: S01
    provides: loadVisualizerData() available from merged upstream code, VisualizerData interface, Turbopack-incompatible .js extension imports requiring child-process pattern
affects:
  - S08
key_files:
  - src/web/visualizer-service.ts
  - web/app/api/visualizer/route.ts
  - web/lib/visualizer-types.ts
  - web/components/gsd/visualizer-view.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/sidebar.tsx
  - web/lib/browser-slash-command-dispatch.ts
  - web/lib/gsd-workspace-store.tsx
key_decisions:
  - Child-process pattern (execFile + resolve-ts.mjs) for calling loadVisualizerData() because upstream .js extension imports break Turbopack (D054)
  - Client-side blob downloads for Export tab — no server-side export endpoint needed (D052)
  - view-navigate dispatch kind with gsd:navigate-view CustomEvent for /gsd visualize instead of opening command surface (D053)
patterns_established:
  - Tab-per-section pattern — each visualizer tab is a named function component receiving full VisualizerData
  - gsd:navigate-view CustomEvent channel for slash-command→view navigation — reusable for any /gsd subcommand that should navigate to a full view instead of opening a surface
  - StatCell reusable card component for metric display (label/value/sub layout)
  - Map→Record serialization in child-process scripts for JSON-safe transport of Map-typed upstream data
observability_surfaces:
  - GET /api/visualizer — returns full serialized VisualizerData or { error } with 500 status
  - Terminal system line "Navigating to visualize view" on /gsd visualize dispatch
  - Component shows loading spinner, error banner with retry, stale-data warning on refresh failure
drill_down_paths:
  - .gsd/milestones/M003/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T03-SUMMARY.md
duration: ~49m
verification_result: passed
completed_at: 2026-03-16
---

# S03: Workflow Visualizer Page

**Dedicated visualizer page with 7 tabbed sections (Progress, Deps, Metrics, Timeline, Agent, Changes, Export) backed by live upstream data via API route, reachable from sidebar and /gsd visualize dispatch.**

## What Happened

Three tasks built the full visualizer data pipeline and UI:

**T01 — Data pipeline.** Created `src/web/visualizer-service.ts` using the established child-process pattern (execFile + resolve-ts.mjs) to call upstream's `loadVisualizerData()`. The child script converts `criticalPath.milestoneSlack` and `criticalPath.sliceSlack` from `Map<string, number>` to `Record<string, number>` via `Object.fromEntries()` before JSON serialization. Created `web/app/api/visualizer/route.ts` as a GET endpoint (nodejs runtime, force-dynamic, Cache-Control: no-store) and `web/lib/visualizer-types.ts` with browser-safe interfaces mirroring all upstream types plus formatting utilities.

**T02 — UI component.** Built `web/components/gsd/visualizer-view.tsx` (~700 lines) implementing all 7 tabs from the TUI renderer translated to React+Tailwind: Progress (risk heatmap, milestone/slice/task tree), Deps (dependency arrows, critical path visualization, slack values), Metrics (cost/token/duration cards, by-phase and by-model breakdowns, projections), Timeline (last 30 units with duration bars), Agent (active/idle status, session stats, recent units), Changes (completed slice changelog with files), Export (client-side Blob download for markdown/JSON). Component fetches from `/api/visualizer` on mount with 10-second auto-refresh. Shows loading spinner, error banner with retry, and stale-data warning.

**T03 — Wiring.** Connected the visualizer to the rest of the app: added "visualize" to KNOWN_VIEWS and VisualizerView render branch in app-shell; added BarChart3 icon and Visualize entry to sidebar NavRail; added "view-navigate" dispatch result kind to browser-slash-command-dispatch that intercepts the "visualize" subcommand; added case handler in workspace store that emits gsd:navigate-view CustomEvent; added event listener in app-shell that calls handleViewChange.

## Verification

- `npm run build:web-host` exits 0 — route listed as `ƒ /api/visualizer`
- `npm run build` exits 0 — no regressions
- 7 TabsTrigger + 7 TabsContent confirmed in visualizer-view.tsx (progress, deps, metrics, timeline, agent, changes, export)
- Object.fromEntries for Map→Record conversion confirmed in service layer
- Record<string, number> for slack fields confirmed in browser types
- BarChart3 icon and Visualize navItem confirmed in sidebar
- KNOWN_VIEWS inclusion, VisualizerView import/render, gsd:navigate-view listener confirmed in app-shell
- view-navigate kind and visualize intercept confirmed in dispatch
- Blob/createObjectURL export mechanism confirmed in component

## Requirements Advanced

- R102 — Visualizer page with all 7 tabbed sections is built, API route serves data, sidebar and dispatch entry provide navigation. Remaining: live runtime verification with real project data.

## Requirements Validated

- None — R102 needs live runtime verification to fully validate.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

**Child-process pattern instead of direct import (T01).** The plan specified direct `import { loadVisualizerData }` from upstream. This fails because `visualizer-data.ts` uses `.js` import extensions that Turbopack cannot resolve to `.ts` files. Switched to the established execFile + resolve-ts.mjs pattern. This was a known risk documented in KNOWLEDGE.md and matches D054.

## Known Limitations

- **No live runtime test.** All verification is compile-time. `curl /api/visualizer` and browser tab rendering require a running dev server with a real `.gsd` project directory. The API route will return a 500 error in projects without GSD state files.
- **10-second polling.** The auto-refresh uses setInterval rather than server-sent events — acceptable for a local dev tool but won't scale to collaborative use.
- **Export is snapshot-only.** The Export tab downloads whatever data is currently loaded in the browser. There's no server-side export with historical data.

## Follow-ups

- S08 parity audit should verify all 7 tabs render correctly with real project data and compare content fidelity against TUI visualizer output.
- If any future /gsd subcommand should navigate to a full view, reuse the view-navigate dispatch kind and gsd:navigate-view event pattern established here.

## Files Created/Modified

- `src/web/visualizer-service.ts` — new; child-process service wrapping loadVisualizerData() with Map→Record conversion
- `web/app/api/visualizer/route.ts` — new; GET endpoint with nodejs runtime, force-dynamic, Cache-Control: no-store
- `web/lib/visualizer-types.ts` — new; browser-safe interfaces for all visualizer types + formatting utilities
- `web/components/gsd/visualizer-view.tsx` — new; ~700-line VisualizerView with 7 tabbed sections
- `web/components/gsd/app-shell.tsx` — modified; added "visualize" to KNOWN_VIEWS, VisualizerView import/render, gsd:navigate-view listener
- `web/components/gsd/sidebar.tsx` — modified; added BarChart3 icon and Visualize navItem
- `web/lib/browser-slash-command-dispatch.ts` — modified; added "view-navigate" kind, intercepted "visualize" subcommand
- `web/lib/gsd-workspace-store.tsx` — modified; added "view-navigate" case with gsd:navigate-view event emission

## Forward Intelligence

### What the next slice should know
- The visualizer is the first full app-shell view added since the original dashboard/roadmap/files/activity set. The pattern is: add to KNOWN_VIEWS, add render branch in app-shell, add navItem in sidebar. If S04-S07 surfaces should be full views instead of command surfaces, follow this exact pattern.
- The gsd:navigate-view CustomEvent pattern is now established — any dispatch result that returns `kind: "view-navigate"` will trigger app-shell navigation. S04-S07 can use this if their surfaces are full views.

### What's fragile
- The child-process script in visualizer-service.ts embeds JavaScript as a string literal. Syntax errors in that embedded script only surface at runtime (500 from the API route), not at compile time. If upstream changes loadVisualizerData() signature or the Map fields, the failure is silent until runtime.
- The 7-tab component at ~700 lines is the largest single component in the web app. If multiple tabs need significant expansion, consider splitting into separate files.

### Authoritative diagnostics
- `GET /api/visualizer` is the single diagnostic endpoint — if it returns valid JSON with populated `milestones`, `criticalPath.milestoneSlack` (as a non-empty object), the full pipeline works.
- `npm run build:web-host` output listing `ƒ /api/visualizer` confirms the route compiles.

### What assumptions changed
- Original plan assumed direct import of loadVisualizerData() — actually requires child-process pattern due to .js extension imports (same as auto-dashboard-service and recovery-diagnostics-service). This is now a stable pattern, not a workaround.
