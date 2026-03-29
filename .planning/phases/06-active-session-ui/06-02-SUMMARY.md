---
phase: 06-active-session-ui
plan: "02"
subsystem: web-ui
tags: [auto-mode, workflow-button, spinner, live-state, ux]
dependency_graph:
  requires:
    - 06-01 (getLiveAutoDashboard from store)
    - 05-02 (session_state SSE events)
  provides:
    - Three-state workflow button (Start/Stop/Resume) in dashboard, sidebar
    - Live auto state in chat-mode placeholder CTA
  affects:
    - web/components/gsd/dashboard.tsx
    - web/components/gsd/sidebar.tsx
    - web/components/gsd/chat-mode.tsx
tech_stack:
  added: []
  patterns:
    - pendingAction + useRef timer pattern for optimistic spinner with 3s revert
    - useEffect on [isAutoActive, autoPaused] to clear spinner on SSE confirmation
key_files:
  created: []
  modified:
    - web/components/gsd/chat-mode.tsx
    - web/components/gsd/dashboard.tsx
    - web/components/gsd/sidebar.tsx
decisions:
  - chat-mode ChatInputBar also fixed to use getLiveAutoDashboard (pre-existing stale read found during Task 1)
  - Dashboard action button added to header (was not rendered before, only handler existed)
  - CollapsedMilestoneSidebar and MilestoneExplorer both get independent pendingAction state
metrics:
  duration_minutes: 5
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_modified: 3
requirements:
  - AUTO-01
  - AUTO-02
  - AUTO-03
---

# Phase 06 Plan 02: Three-State Workflow Button Summary

Three dashboard surfaces (dashboard.tsx, sidebar.tsx, chat-mode.tsx) now read live auto-mode state from `getLiveAutoDashboard()` and show a three-state action button (Start Auto / Stop Auto / Resume Auto) with a 3s-revert spinner on click.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix chat-mode.tsx stale boot reads | 9f51ff12 | web/components/gsd/chat-mode.tsx |
| 2 | Three-state button + spinner to dashboard and sidebar | be1b563d | web/components/gsd/dashboard.tsx, web/components/gsd/sidebar.tsx |

## What Was Built

### Task 1: chat-mode.tsx Live State Fix

- Imported `getLiveAutoDashboard` from `gsd-workspace-store`
- Replaced `state.boot?.auto?.active` and `state.boot?.auto?.paused` reads in `deriveWorkflowAction` call (lines ~2024-2025) with `getLiveAutoDashboard(state)?.active/paused`
- Replaced same stale reads in `placeholderCTA` useMemo
- Updated useMemo dependency array to include `state.live.auto`
- Fixed `ChatInputBar` component's `autoActive` read (for `disabledDuringAuto` logic) to also use `getLiveAutoDashboard`

### Task 2: Three-State Button with Spinner

**dashboard.tsx:**
- Added `useRef` to React imports, `Loader2` to lucide imports, `Button` from `@/components/ui/button`
- Added `autoPaused` local variable alongside existing `isAutoActive`
- Added `pendingAction` state and `pendingTimerRef` ref
- Replaced bare `handlePrimaryAction` with spinner-aware version that sets `pendingAction` and starts 3s timer
- Added `useEffect([isAutoActive, autoPaused])` to clear spinner when SSE confirms state change
- Added primary action `Button` to dashboard header JSX with `variant={workflowAction.primary.variant}` (red for Stop Auto)
- Button shows `Loader2` spinner when `pendingAction !== null`

**sidebar.tsx:**
- Added `useRef` and `useEffect` to React imports
- Applied same `pendingAction` + `pendingTimerRef` + `useEffect` pattern to `MilestoneExplorer`
- Applied same pattern to `CollapsedMilestoneSidebar`
- Both components: replaced `workspace.commandInFlight` spinner condition with `pendingAction !== null`
- Both components: updated `disabled` and opacity class to include `pendingAction !== null`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Fix] Fixed ChatInputBar stale boot read for disabledDuringAuto**
- **Found during:** Task 1
- **Issue:** `ChatInputBar` at line 1172 read `useGSDWorkspaceState().boot?.auto?.active` directly, causing action buttons to not disable correctly when auto mode starts via SSE (without a page reload)
- **Fix:** Changed to `getLiveAutoDashboard(useGSDWorkspaceState())?.active`
- **Files modified:** web/components/gsd/chat-mode.tsx
- **Commit:** 9f51ff12

**2. [Rule 2 - Missing Feature] Added primary action button to dashboard header**
- **Found during:** Task 2
- **Issue:** dashboard.tsx had `workflowAction` derivation and `handlePrimaryAction` defined but the button was never rendered in the JSX — users couldn't start/stop auto mode from the dashboard view
- **Fix:** Added `Button` component rendering with variant and spinner to the dashboard header, next to the Auto Mode Active/Inactive label
- **Files modified:** web/components/gsd/dashboard.tsx
- **Commit:** be1b563d

## Known Stubs

None — all state is wired to live store via `getLiveAutoDashboard()`.

## Verification Results

- `grep -n "boot?.auto?.active|boot?.auto?.paused" web/components/gsd/chat-mode.tsx`: 0 matches
- `grep -n "pendingAction" web/components/gsd/dashboard.tsx`: 4 matches
- `grep -n "pendingAction" web/components/gsd/sidebar.tsx`: 10 matches
- `grep -n "variant.*workflowAction" web/components/gsd/dashboard.tsx`: 1 match
- TypeScript: 0 errors in target files (4 pre-existing errors in unrelated auth/tailscale route files)

## Self-Check: PASSED

- FOUND: web/components/gsd/chat-mode.tsx (modified)
- FOUND: web/components/gsd/dashboard.tsx (modified)
- FOUND: web/components/gsd/sidebar.tsx (modified)
- FOUND commit: 9f51ff12 (chat-mode fix)
- FOUND commit: be1b563d (dashboard + sidebar)

---
*Phase: 06-active-session-ui*
*Completed: 2026-03-29*
