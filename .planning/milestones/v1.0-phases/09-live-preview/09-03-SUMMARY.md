---
phase: 09-live-preview
plan: 03
subsystem: ui
tags: [react, preview, session-persistence, usePreview, AppShell, ChatView]

# Dependency graph
requires:
  - phase: 09-live-preview plan 01
    provides: session-persistence-api (readSession, writeSession)
  - phase: 09-live-preview plan 02
    provides: usePreview hook, PreviewPanelWithState component
provides:
  - AppShell wired with usePreview, PreviewPanelWithState, and session persistence lifecycle
  - ChatView preview toggle button (Monitor icon) on session tabs row
  - End-to-end live preview feature: Cmd+P toggle, viewport restore on reload
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sessionRef pattern: useRef holds last MissionControlSession for partial viewport writes without re-reading"
    - "Absolute overlay at left-[340px] z-30 to render PreviewPanel without overlapping Chat column 1"
    - "Dual toggle button approach: absolute positioned within SessionTabs row (multi-session) or standalone bar (single session)"

key-files:
  created: []
  modified:
    - packages/mission-control/src/components/layout/AppShell.tsx
    - packages/mission-control/src/components/layout/SingleColumnView.tsx
    - packages/mission-control/src/components/views/ChatView.tsx

key-decisions:
  - "PLANNING_DIR constant fallback to '.planning' — usePlanningState does not expose planningDir"
  - "sessionRef pattern for viewport writes — writeSession requires full MissionControlSession, ref caches last read to avoid repeated disk reads on every viewport change"
  - "Absolute positioned preview panel at left-[340px] z-30 — preserves Chat column 1 visibility without changing flex layout"
  - "Dual preview button rendering: absolute within SessionTabs row when sessions exist, standalone bar row when single session"

patterns-established:
  - "Preview overlay: absolute inset-0 left-[340px] z-30 pattern for right-side overlays preserving left column"
  - "sessionRef: useRef cache for last-read session data, updated on read and on write"

requirements-completed:
  - PREV-01
  - PREV-02
  - PREV-03
  - PREV-04
  - SERV-07

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 09 Plan 03: Live Preview Wiring Summary

**usePreview and PreviewPanelWithState wired into AppShell with session persistence read/write lifecycle, and Monitor toggle button added to ChatView session tabs row**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-12T07:48:13Z
- **Completed:** 2026-03-12T07:55:09Z
- **Tasks:** 3 of 3 complete (2 auto + 1 human checkpoint, approved)
- **Files modified:** 3

## Accomplishments

- AppShell calls `usePreview()` at top level; `open`, `port`, `viewport`, and setters all available
- `PreviewPanelWithState` rendered absolutely at `left-[340px] z-30` so Chat column 1 remains fully visible when preview is open
- Session persistence wired: `readSession` on mount restores `activeViewport`; `writeSession` on viewport change and `beforeunload` event
- `onTogglePreview` and `previewOpen` prop-drilled through `SingleColumnView` to `ChatView`
- Monitor icon toggle button on far right of session tabs row (absolute within tabs when multi-session, standalone bar when single session)
- Cyan accent when preview is open, muted slate when closed
- Human verification passed: Cmd+P toggle, Monitor button, viewport switcher (Desktop/Tablet/Mobile/Dual), offline state, and session persistence across reload all confirmed

## Task Commits

Each task was committed atomically:

1. **Task 1: AppShell wiring — usePreview, PreviewPanelWithState, session persistence** - `bd10053` (feat)
2. **Task 2: ChatView preview toggle button** - `bb2fac9` (feat)
3. **Task 3: Checkpoint — human verification approved** - `489d535` (chore)

**Plan metadata:** _(docs commit to follow)_

## Files Created/Modified

- `packages/mission-control/src/components/layout/AppShell.tsx` — usePreview wired, PreviewPanelWithState rendered, session persistence lifecycle, onTogglePreview/previewOpen passed to SingleColumnView
- `packages/mission-control/src/components/layout/SingleColumnView.tsx` — onTogglePreview and previewOpen props added, passed through to ChatView
- `packages/mission-control/src/components/views/ChatView.tsx` — Monitor toggle button on far right of session tabs row, onTogglePreview/previewOpen props added

## Decisions Made

- **PLANNING_DIR fallback:** `usePlanningState` does not expose `planningDir` — used `".planning"` constant as the plan specified
- **sessionRef pattern:** `writeSession` requires a full `MissionControlSession` object. A `useRef` caches the last-read session data; viewport writes merge into this cache and persist the full object. This avoids repeated async reads on every viewport change
- **Absolute overlay approach:** `PreviewPanelWithState` rendered with `absolute inset-0 left-[340px] z-30` — preserves Chat column 1 without modifying the flex layout
- **Dual toggle button rendering:** When sessions are active, the Monitor button is absolutely positioned within the relative container wrapping SessionTabs (far right, vertically centered). When no sessions, a standalone border-b bar renders with the Monitor button on the right. This avoids double-border conflicts since SessionTabs renders its own border-b

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added SingleColumnView prop-drilling for onTogglePreview/previewOpen**
- **Found during:** Task 1 (AppShell wiring)
- **Issue:** Plan showed AppShell passing props directly to ChatView, but ChatView is rendered inside SingleColumnView — props must go through SingleColumnView first
- **Fix:** Added `onTogglePreview` and `previewOpen` to `SingleColumnViewProps`, destructured them, and passed to ChatView
- **Files modified:** `packages/mission-control/src/components/layout/SingleColumnView.tsx`
- **Verification:** TypeScript compiled with no new errors
- **Committed in:** `bd10053` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — missing prop-drilling layer)
**Impact on plan:** Required by existing architecture (ChatView rendered inside SingleColumnView). No scope creep.

## Issues Encountered

- Bun test runner crashes (segfault/panic) are intermittent and pre-existing — not caused by this plan's changes. 8-9 pre-existing test failures (TaskExecuting, ClaudeProcessManager, sidebar-tree ChatView) remain unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Live preview feature complete end-to-end: proxy (Plan 01), hook+components (Plan 02), wiring (Plan 03)
- Human verification passed: Cmd+P toggle, viewport switcher, session persistence, offline state all confirmed working
- All preview requirements (PREV-01 through PREV-04, SERV-07) satisfied
- Phase 09 is fully done — ready to continue to next planned phase

---
*Phase: 09-live-preview*
*Completed: 2026-03-12*
