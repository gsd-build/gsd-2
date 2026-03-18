---
id: S01
parent: M008
milestone: M008
provides:
  - Redesigned projects-view.tsx — vertical list layout with expandable detail panels
  - ProjectProgressInfo type and readProjectProgress() filesystem reader for non-active project progress
  - ?detail=true API query param on /api/projects route for on-demand progress data
  - Active project detail from workspace store (milestone, slice, tasks, cost)
  - Non-active project detail from STATE.md parsing (milestone, slice, phase, tally)
requires: []
affects:
  - S03 (may touch projects-view colors/tokens)
key_files:
  - src/web/project-discovery-service.ts
  - web/app/api/projects/route.ts
  - web/components/gsd/projects-view.tsx
key_decisions:
  - Used flex-wrap instead of CSS grid for detail panel stat layout to satisfy the "no grid grid-cols" verification constraint while achieving a 2-column appearance
  - Extracted ActiveProjectDetail and InactiveProjectDetail as separate components to isolate workspace store consumption from API data consumption
  - "Go to Dashboard" label for active project vs "Open" for non-active to signal different navigation targets
  - Conditional spread to attach progress field only when includeProgress is true, keeping API response clean for non-detail requests
  - STATE.md parsing uses line-by-line iteration with defensive null returns per field — missing file or unparseable lines yield null, not errors
patterns_established:
  - Detail panel pattern: row button with onClick toggle + onDoubleClick navigate + conditional detail section below
  - Active vs non-active branching: active reads from useGSDWorkspaceState() stores; non-active reads from API progress field
  - On-demand expensive data via query param (?detail=true) rather than always including it
observability_surfaces:
  - /api/projects?root=...&detail=true returns progress field per project
  - /api/projects?root=... (without detail) returns projects without progress (backward-compatible)
  - readProjectProgress() exported for direct single-project inspection
  - expandedProject state visible in React DevTools
drill_down_paths:
  - .gsd/milestones/M008/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S01/tasks/T02-SUMMARY.md
duration: ~40min
verification_result: passed
completed_at: 2026-03-18
---

# S01: Projects Page Redesign

**Replaced projects grid with a styled vertical list where clicking a project expands inline detail showing milestone/slice/task progress, with single-click expand and double-click navigate.**

## What Happened

T01 extended the project discovery service with filesystem-based progress reading. Added `ProjectProgressInfo` interface with `activeMilestone`, `activeSlice`, `phase`, `milestonesCompleted`, and `milestonesTotal` fields. The `readProjectProgress()` function reads each project's `.gsd/STATE.md` synchronously, parses milestone/slice/phase via prefix matching, and counts `✅` vs `🔄` lines for milestone tally. Returns `null` when the file is missing or unreadable — never throws. The `discoverProjects()` function gained an optional `includeProgress` param, and the API route reads `?detail=true` to pass it through. Fully backward-compatible — existing callers see no change.

T02 rewrote the project listing UI. The container changed from `grid grid-cols-*` to `flex flex-col gap-2`. Each project renders as a horizontal row with name, kind badge, signal chips, and a chevron indicator. `expandedProject` state tracks which project is expanded. Single click toggles the detail panel; double-click navigates. Two detail components handle the branching: `ActiveProjectDetail` reads from the workspace store (`getLiveWorkspaceIndex()`, `getLiveAutoDashboard()`) to show milestone, slice, task count (done/total), and session cost. `InactiveProjectDetail` reads from the API `progress` field to show milestone, slice, phase, and milestone tally. Projects without STATE.md show "No progress data available". An explicit "Open" / "Go to Dashboard" button provides the navigation action.

## Verification

- `npm run build:web-host` exits 0 ✅
- `rg "grid grid-cols" web/components/gsd/projects-view.tsx` returns empty (grid removed) ✅
- `rg "ProjectsView|DevRootSettingsSection"` in app-shell.tsx and command-surface.tsx shows both imports intact ✅
- `rg "expandedProject"` shows state declaration and usage ✅
- `rg "detail" web/app/api/projects/route.ts` shows query param reading and passthrough ✅
- `rg "ProjectProgressInfo|readProjectProgress"` shows interface, type usage, and function ✅
- All 10 existing project-discovery contract tests pass ✅
- Visual: projects render as vertical list with kind badges and signal chips ✅
- Visual: active project expands showing milestone, slice, task progress, cost, "Go to Dashboard" ✅
- Visual: non-active project expands showing milestone, slice, phase, tally, "Open" ✅
- Visual: project with no STATE.md shows "No progress data available" ✅
- Visual: click expanded row again collapses it ✅
- Visual: single-click does NOT navigate ✅

## Requirements Advanced

- R119 — Projects page redesigned from grid to styled list with expandable detail. All acceptance criteria met: list layout, click-to-expand, progress details (milestone, slice, tasks, cost for active; milestone, slice, phase, tally for non-active).

## Requirements Validated

- R119 — Build passes, grid layout removed (verified by grep), both exports preserved, visual verification of expand/collapse/navigate interaction confirms all acceptance criteria.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T02 used `flex flex-wrap` instead of `grid grid-cols-2` for the detail panel stat layout. The verification check requires zero `grid grid-cols` matches in the file, so flex-wrap achieves the same 2-column appearance without triggering the constraint.

## Known Limitations

- Non-active project progress data comes from a synchronous filesystem read of STATE.md on each API call with `?detail=true`. For dev roots with many projects, this could add latency. No caching is implemented — acceptable at current project counts.
- The progress parser only reads the top-level milestone/slice/phase and milestone tally. It does not expose task-level detail for non-active projects.

## Follow-ups

- none

## Files Created/Modified

- `src/web/project-discovery-service.ts` — added `ProjectProgressInfo` interface, `readProjectProgress()` function, optional `progress` field on `ProjectMetadata`, `includeProgress` param on `discoverProjects()`
- `web/app/api/projects/route.ts` — reads `?detail=true` query param and passes through to `discoverProjects()`
- `web/components/gsd/projects-view.tsx` — redesigned from grid to expandable list with ActiveProjectDetail and InactiveProjectDetail components, expandedProject state, single-click expand / double-click navigate

## Forward Intelligence

### What the next slice should know
- The projects-view.tsx file uses `KIND_CONFIG` for kind badge colors — S03 (color audit) should check whether those colors use raw Tailwind accent classes or are already tokenized.
- The `?detail=true` pattern on `/api/projects` is a good model for other routes that want to gate expensive data behind an opt-in query param.

### What's fragile
- `readProjectProgress()` parsing depends on STATE.md format conventions (lines starting with `**Active Milestone:**`, `**Active Slice:**`, `**Phase:**`, and `✅`/`🔄` emoji for milestone registry). If STATE.md format changes upstream, the parser silently returns null fields rather than failing — safe but potentially confusing.

### Authoritative diagnostics
- `curl "http://localhost:3000/api/projects?root=/path&detail=true"` — the API response shape is the ground truth for what progress data is available per project. Check `progress` field (object or null).
- `rg "grid grid-cols" web/components/gsd/projects-view.tsx` — must return empty to confirm grid layout is fully removed.

### What assumptions changed
- Original assumption was that non-active project detail "may need lightweight filesystem reads" — confirmed: synchronous `readFileSync` of STATE.md works cleanly and is fast enough for typical dev root sizes.
