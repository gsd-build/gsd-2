# S03: Workflow Visualizer Page — UAT

**Milestone:** M003
**Written:** 2026-03-16

## UAT Type

- UAT mode: mixed (artifact-driven for compile checks + live-runtime for API and browser)
- Why this mode is sufficient: The compile checks prove all wiring exists. Live runtime confirms the API route serves real data and the UI renders correctly in-browser.

## Preconditions

- `npm run build:web-host` exits 0 (already verified)
- Dev server running: `npm run dev:web-host` or the packaged host launched via `gsd --web`
- The project directory contains `.gsd/` with real milestone/slice/task state files (any GSD-managed project)

## Smoke Test

Open `http://localhost:3000` in a browser. The sidebar NavRail should show a "Visualize" icon (bar chart). Click it — a tabbed page with 7 tabs should appear.

## Test Cases

### 1. API route returns valid VisualizerData

1. With the dev server running, execute: `curl -s http://localhost:3000/api/visualizer | jq .`
2. **Expected:** JSON response with top-level keys: `milestones`, `phase`, `totals`, `byPhase`, `bySlice`, `byModel`, `units`, `criticalPath`, `agentActivity`, `changelog`
3. Execute: `curl -s http://localhost:3000/api/visualizer | jq '.criticalPath.milestoneSlack'`
4. **Expected:** A JSON object with string keys and number values (e.g. `{ "M001": 0, "M003": 2 }`), NOT an empty `{}` (which would indicate Map serialization failure)
5. Execute: `curl -s http://localhost:3000/api/visualizer | jq '.criticalPath.sliceSlack'`
6. **Expected:** Same — populated object with string keys and number values

### 2. Sidebar NavRail shows Visualize entry

1. Open the app in browser
2. Look at the left sidebar NavRail
3. **Expected:** A "Visualize" icon (BarChart3 — looks like a bar chart) appears after "Activity"
4. Hover over it
5. **Expected:** Tooltip or label shows "Visualize"

### 3. Clicking Visualize navigates to visualizer view

1. Click the "Visualize" icon in the sidebar
2. **Expected:** Main content area switches to the visualizer page with a tab bar showing 7 tabs: Progress, Deps, Metrics, Timeline, Agent, Changes, Export
3. **Expected:** The "Visualize" sidebar icon appears selected/active

### 4. Progress tab renders milestone/slice tree

1. Click the "Progress" tab (should be default)
2. **Expected:** Risk heatmap grid with colored blocks for each milestone
3. **Expected:** Milestone tree with status icons (✓ for done, ▸ for active, ○ for pending)
4. **Expected:** Active slices expand to show task lists with individual status
5. **Expected:** No console errors in browser DevTools

### 5. Deps tab shows critical path

1. Click the "Deps" tab
2. **Expected:** Milestone dependency arrows/listing
3. **Expected:** Critical path visualization with milestone chain and slice chain as badge pills
4. **Expected:** Slack values displayed for milestones and slices
5. **Expected:** If any critical slice hasn't started, a bottleneck warning appears

### 6. Metrics tab shows cost and token data

1. Click the "Metrics" tab
2. **Expected:** Summary stat cards showing units completed, total cost, total duration, total tokens
3. **Expected:** By-phase breakdown with progress bars
4. **Expected:** By-model breakdown with progress bars
5. **Expected:** Projections section with avg cost/slice and projected remaining
6. **Expected:** All numbers formatted (e.g. "$1.23", "1.2K tokens", "2h 15m")

### 7. Timeline tab shows execution units

1. Click the "Timeline" tab
2. **Expected:** List of recent execution units (up to 30) with time, status, type, ID, duration bar, and cost
3. **Expected:** Most recent units appear first

### 8. Agent tab shows session state

1. Click the "Agent" tab
2. **Expected:** Active/idle status indicator (dot with label)
3. **Expected:** If agent is active: current unit card, completion progress bar
4. **Expected:** Session stats grid (completion rate, session cost, etc.)
5. **Expected:** Recent completed units list

### 9. Changes tab shows changelog

1. Click the "Changes" tab
2. **Expected:** Completed slice entries with milestone/slice ID, title, one-liner, files modified
3. **Expected:** Most recent slices appear first
4. **Expected:** Relative timestamps (e.g. "2 hours ago")

### 10. Export tab generates downloads

1. Click the "Export" tab
2. Click "Download Markdown" button
3. **Expected:** Browser downloads a file named `gsd-report.md` containing a structured report with milestones, metrics, critical path, and changelog
4. Click "Download JSON" button
5. **Expected:** Browser downloads a file named `gsd-report.json` containing the raw VisualizerData as formatted JSON

### 11. /gsd visualize dispatch navigates to view

1. Click the terminal area in the browser app
2. Type `/gsd visualize` and press Enter
3. **Expected:** Terminal shows system line "Navigating to visualize view"
4. **Expected:** Main content area switches to the visualizer page (same as clicking sidebar icon)
5. **Expected:** Does NOT open a generic command surface placeholder

### 12. Auto-refresh updates data

1. Navigate to the visualizer view
2. Open browser DevTools → Network tab
3. Wait 10+ seconds
4. **Expected:** Periodic `GET /api/visualizer` requests appear every ~10 seconds
5. **Expected:** No errors in console from refresh cycles

## Edge Cases

### Empty project (no .gsd directory)

1. Run the dev server in a directory without `.gsd/`
2. Navigate to visualizer view
3. **Expected:** Error banner appears with a descriptive error message and a "Retry" button — NOT a blank page or unhandled exception

### API route failure

1. Navigate to visualizer view
2. In DevTools, block `api/visualizer` requests (Network → Block request URL)
3. Wait for refresh cycle
4. **Expected:** If data was previously loaded, a stale-data warning appears but tabs still show the old data
5. **Expected:** If no data was ever loaded, error banner with retry appears

### Tab switching is smooth

1. Navigate to visualizer view with data loaded
2. Rapidly click through all 7 tabs in sequence
3. **Expected:** Each tab switches instantly without flicker, loading spinners, or console errors
4. **Expected:** No additional API requests triggered by tab switches (data is shared across tabs)

## Failure Signals

- Empty `{}` for `criticalPath.milestoneSlack` or `criticalPath.sliceSlack` in API response → Map→Record conversion failed
- 500 error from `/api/visualizer` → child-process script failed (check server logs for details)
- Missing "Visualize" in sidebar → sidebar.tsx navItems not updated
- `/gsd visualize` opens a generic "gsd-visualize" placeholder instead of the visualizer view → dispatch intercept not wired or view-navigate kind not handled
- Console errors mentioning `TabsTrigger` or `TabsContent` → Radix UI tabs not properly imported or configured
- Blank tabs with no data → API fetch succeeds but data shape doesn't match component expectations

## Requirements Proved By This UAT

- R102 — All 7 tabbed sections render with real project data, API route serves upstream VisualizerData, sidebar and dispatch provide navigation

## Not Proven By This UAT

- Performance under very large projects (hundreds of milestones/slices)
- Concurrent multi-user access (not applicable — local dev tool)
- Mobile/responsive layout behavior
- Accessibility (keyboard navigation, screen reader) for the visualizer tabs

## Notes for Tester

- The visualizer data quality depends on the project's `.gsd/` state files. A fresh project with few milestones will show sparse data — this is expected.
- The risk heatmap in the Progress tab uses colored blocks — colors may be subtle in some monitor profiles.
- Export downloads use browser Blob URLs, which may behave differently in Safari vs Chrome. Both should work but filename may vary.
- The agent tab will show "idle" unless an agent session is actively running.
