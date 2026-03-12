---
phase: 08-discuss-review-modes
plan: "04"
subsystem: ui
tags: [react, websocket, discuss-mode, review-mode, hooks, overlay]

requires:
  - phase: 08-02
    provides: QuestionCard, DecisionLogDrawer, ChatPanel overlay slot
  - phase: 08-03
    provides: ReviewView, SingleColumnView review ViewType routing

provides:
  - useChatMode hook managing discuss/review state from raw WebSocket mode events
  - Discuss overlay (QuestionCard + DecisionLogDrawer) flows from hook to ChatPanelView
  - Review mode auto-switches ViewType via AppShell useEffect on chatModeState.mode
  - Fix button handler in hook dispatches pre-drafted message and dismisses ReviewView

affects:
  - Any future phase consuming useChatMode or discuss/review mode state

tech-stack:
  added: []
  patterns:
    - Raw WebSocket in hook (not useReconnectingWebSocket) when ws ref not exposed
    - onChatSendRef useRef pattern to avoid stale closures in callbacks
    - overlay React.ReactNode prop flowing through 4-component chain (AppShell -> SingleColumnView -> ChatView -> ChatPanel -> ChatPanelView)
    - TDD test file (.test.ts) testing pure state logic without React hook mounting

key-files:
  created:
    - packages/mission-control/src/hooks/useChatMode.tsx
    - packages/mission-control/tests/useChatMode.test.ts
  modified:
    - packages/mission-control/src/components/layout/AppShell.tsx
    - packages/mission-control/src/components/layout/SingleColumnView.tsx
    - packages/mission-control/src/components/views/ChatView.tsx
    - packages/mission-control/src/components/chat/ChatPanel.tsx

key-decisions:
  - "useChatMode uses raw WebSocket (not useReconnectingWebSocket) because useReconnectingWebSocket does not expose ws ref — avoids modifying stable hook"
  - "useChatMode file is .tsx not .ts because it computes JSX overlay React node inline"
  - "onChatSendRef pattern (useRef) for stable callbacks without stale closure risk"
  - "TDD state machine tests use pure helper function (applyModeEvent) to test transitions without mounting React hooks"

patterns-established:
  - "Discuss overlay chain: useChatMode.overlay -> AppShell.discussOverlay -> SingleColumnView.discussOverlay -> ChatView.discussOverlay -> ChatPanel.overlay -> ChatPanelView.overlay"
  - "Review ViewType sync: useEffect on chatModeState.mode with setActiveView"

requirements-completed: [DISC-01, DISC-06, REVW-01, REVW-04]

duration: 15min
completed: 2026-03-11
---

# Phase 08 Plan 04: useChatMode Integration Summary

**useChatMode hook wires WebSocket mode events to discuss overlay (QuestionCard + DecisionLogDrawer) and review ViewType auto-switch via AppShell — human verified**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-11T21:20:39Z
- **Completed:** 2026-03-11T21:33:04Z
- **Tasks:** 3 of 3 (COMPLETE — human verification approved)
- **Files modified:** 6

## Accomplishments

- Created `useChatMode.tsx` hook: handles all 6 ModeEventType WebSocket events, computes QuestionCard+DecisionLogDrawer overlay, exposes answerQuestion/dismissReview/handleFix callbacks
- Wired useChatMode into AppShell alongside useSessionManager, with useEffect syncing review ViewType on mode change
- Overlay prop chain established through 4 components: AppShell -> SingleColumnView -> ChatView -> ChatPanel -> ChatPanelView
- All 27 discuss/review mode tests green

## Task Commits

1. **TDD RED: useChatMode tests** - `a02661c` (test)
2. **Task 1: useChatMode hook** - `8fe26aa` (feat)
3. **Task 2: AppShell + ChatPanel wiring** - `f1c19d0` (feat)
4. **Task 3: Human verification approval** - `fbbe51c` (chore)

## Files Created/Modified

- `packages/mission-control/src/hooks/useChatMode.tsx` - WebSocket mode event hook with overlay computation
- `packages/mission-control/tests/useChatMode.test.ts` - 12 TDD tests for state machine transitions
- `packages/mission-control/src/components/layout/AppShell.tsx` - useChatMode call + useEffect + new SingleColumnView props
- `packages/mission-control/src/components/layout/SingleColumnView.tsx` - discussOverlay prop added
- `packages/mission-control/src/components/views/ChatView.tsx` - discussOverlay prop added, passed to ChatPanel
- `packages/mission-control/src/components/chat/ChatPanel.tsx` - overlay prop added, forwarded to ChatPanelView

## Decisions Made

- `useChatMode` uses raw WebSocket instead of `useReconnectingWebSocket` because the latter does not expose the `ws` ref — choosing not to modify the stable hook
- Hook file extension is `.tsx` (not `.ts`) because the overlay computation returns JSX directly
- `onChatSendRef` pattern used to keep stable callbacks without stale closure risk
- TDD tests use a pure `applyModeEvent` helper to test all 6 state transitions without mounting React hooks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] useChatMode file renamed to .tsx**
- **Found during:** Task 1 (implement useChatMode hook)
- **Issue:** Hook returns JSX overlay node; Bun test runner rejected JSX in a `.ts` file with parse errors
- **Fix:** Renamed file to `useChatMode.tsx`; updated test import accordingly
- **Files modified:** `packages/mission-control/src/hooks/useChatMode.tsx`
- **Verification:** All 12 useChatMode tests pass
- **Committed in:** 8fe26aa (Task 1 commit)

**2. [Rule 2 - Missing] Added overlay prop to ChatPanel stateful wrapper**
- **Found during:** Task 2 (wire overlay to ChatView)
- **Issue:** Plan said ChatPanel needed overlay wiring but ChatPanel's stateful wrapper didn't accept `overlay` prop — only ChatPanelView did
- **Fix:** Added `overlay?: React.ReactNode` to ChatPanelProps and forwarded to ChatPanelView
- **Files modified:** `packages/mission-control/src/components/chat/ChatPanel.tsx`
- **Verification:** TypeScript clean, tests pass
- **Committed in:** f1c19d0 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking file extension, 1 missing prop forwarding)
**Impact on plan:** Both fixes were necessary for correctness. No scope creep.

## Issues Encountered

- Full `bun test tests/` crashes with a Bun internal assertion failure on this machine (CPU lacks AVX support — known Bun 1.3.10 bug). Workaround: run test files individually. All relevant test files pass.

## Next Phase Readiness

- All 4 Phase 08 plans complete — discuss and review modes fully integrated and human verified
- useChatMode hook available for future mode extensions (add new ModeEventType cases to switch)
- AppShell is the single wiring point — future mode changes only require updates to useChatMode and new SingleColumnView props

## Self-Check: PASSED

- `packages/mission-control/src/hooks/useChatMode.tsx` — exists
- `packages/mission-control/tests/useChatMode.test.ts` — exists
- Commits a02661c, 8fe26aa, f1c19d0, fbbe51c — all present in git log
- Human verification: APPROVED 2026-03-11T21:33:04Z

---
*Phase: 08-discuss-review-modes*
*Completed: 2026-03-11*
