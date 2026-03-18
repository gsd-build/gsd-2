# S01: Projects Page Redesign — UAT

**Milestone:** M008
**Written:** 2026-03-18

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The slice involves UI layout changes and API data flow that require visual verification in a running browser against real project data.

## Preconditions

- GSD web host is running: `npm run build:web-host && npm run gsd:web`
- At least one dev root is configured with 2+ projects (one active, one non-active)
- At least one non-active project has a `.gsd/STATE.md` file with milestone data
- At least one project has no `.gsd/STATE.md` (or a corrupt one) to test null progress

## Smoke Test

Open the browser, navigate to the Projects view. Projects should render as a vertical list (not a grid). Click any project — a detail section should expand below it.

## Test Cases

### 1. Projects render as vertical list

1. Open the GSD web UI in browser
2. Navigate to the Projects view (click Projects in sidebar)
3. **Expected:** Projects render as a vertical list with one project per row. Each row shows the project name, a kind badge (e.g. "app", "library"), and signal chips. No grid layout — all items are stacked vertically with consistent spacing.

### 2. Single-click expands detail panel

1. From the Projects view, click once on any project row
2. **Expected:** A detail section expands below the clicked row showing progress information. A chevron indicator on the row changes to indicate expanded state. The URL does NOT change (no navigation occurred).

### 3. Click again collapses detail

1. With a project expanded, click the same project row again
2. **Expected:** The detail section collapses. The row returns to its default state.

### 4. Active project shows workspace store data

1. Click on the currently active project (the one GSD is running in)
2. **Expected:** The expanded detail shows:
   - Current milestone name (e.g. "M008: Web Polish")
   - Active slice name (e.g. "S01: Projects Page Redesign")
   - Task progress as "X / Y done"
   - Session cost (e.g. "$0.00")
   - A "Go to Dashboard" button

### 5. Non-active project shows STATE.md data

1. Click on a non-active project that has a `.gsd/STATE.md`
2. **Expected:** The expanded detail shows:
   - Active milestone name
   - Active slice name
   - Phase (e.g. "executing", "planning")
   - Milestones completed tally (e.g. "4 / 5")
   - An "Open" button

### 6. Double-click navigates to project

1. Double-click on any project row (non-active)
2. **Expected:** The application switches to that project's workspace. The Projects view closes and the dashboard or appropriate view for the selected project loads.

### 7. "Open" / "Go to Dashboard" button navigates

1. Expand a non-active project by single-clicking
2. Click the "Open" button in the detail section
3. **Expected:** The application navigates to that project (same as double-click)

### 8. API returns progress data with detail=true

1. Open browser DevTools Network tab
2. Navigate to Projects view
3. **Expected:** A request to `/api/projects?root=...&detail=true` is visible. The response JSON includes a `progress` field on each project object.

## Edge Cases

### Project with no STATE.md

1. Ensure at least one project in the dev root has no `.gsd/` directory or no `STATE.md` file
2. Navigate to Projects view and click that project
3. **Expected:** Detail section shows "No progress data available" and an "Open" button. No console errors.

### Only one project in dev root

1. If only one project exists, navigate to Projects view
2. **Expected:** Single project renders as a list item (not fullscreen). Click expands detail normally.

### Switching expanded projects

1. Expand project A by clicking it
2. Click project B (without collapsing A first)
3. **Expected:** Project A's detail collapses and project B's detail expands. Only one project is expanded at a time.

### API without detail param (backward compatibility)

1. In browser DevTools console, run: `fetch('/api/projects?root=' + encodeURIComponent('<your-dev-root>')).then(r => r.json()).then(console.log)`
2. **Expected:** Response contains project objects WITHOUT a `progress` field. No errors.

## Failure Signals

- Projects rendering in a grid layout (multiple columns) instead of a vertical list
- Single click navigating to a project instead of expanding detail
- Detail section showing empty or error state for the active project
- Console errors related to `ProjectProgressInfo`, `expandedProject`, or workspace store access
- Network request to `/api/projects` missing `detail=true` parameter
- API response missing `progress` field when `detail=true` is specified
- Build failure: `npm run build:web-host` does not exit 0

## Requirements Proved By This UAT

- R119 — Projects page renders as styled list with expandable detail showing milestone, slice, task progress, and cost. All interaction modes (single-click expand, double-click navigate, button navigate) verified.

## Not Proven By This UAT

- Performance under large dev roots (50+ projects) — not tested
- Progress data accuracy for edge-case STATE.md formats (only standard format tested)
- Color/theme consistency of the projects view (deferred to S03 color audit)

## Notes for Tester

- The active project is always the one GSD is currently running in — it's distinguished by the "Go to Dashboard" label and workspace store data.
- KIND_CONFIG colors (kind badges) may use raw Tailwind accent classes — this is expected and will be addressed in S03.
- If a project's STATE.md has an unusual format, the parser gracefully returns null for unparseable fields. This is by design.
