---
phase: 13-session-streaming-hardening
plan: "05"
subsystem: ui-streaming-integration
tags: [react, hooks, auto-mode, streaming, phase-transition, tool-use, interrupt, tdd]

dependency_graph:
  requires:
    - phase: 13-01
      provides: GSD2StreamEvent discriminated union + classifyPiSdkEvent
    - phase: 13-02
      provides: interrupt() on ClaudeProcessManager, process_crashed event emission
  provides:
    - applyGSD2Event pure helper function (exported from useSessionManager.ts)
    - useSessionManager: isAutoMode, isCrashed, interrupt() in return value
    - ChatView: EXECUTING badge (amber), Escape-key interrupt wired
    - ChatPanel: phase_transition divider cards, tool_use structured cards
  affects:
    - 13-06 (WebSocket reconnect — same useSessionManager hook)
    - 14 (Slice integration — uses isAutoMode, phase card rendering)

tech-stack:
  added: []
  patterns:
    - "applyGSD2Event pure state machine: GSD2StreamEvent + state → result + optional ChatMessage insert"
    - "isAutoModeRef/isCrashedRef refs prevent stale closures in handleMessage callback"
    - "Phase/tool message roles stored in ChatMessage.role union extension — no new message type hierarchy"
    - "ChatPanel role-based rendering: phase_transition → PhaseTransitionCard, tool_use → ToolUseCard"
    - "EXECUTING badge rendered in all header variants (multi-session row, preview bar, bare header)"

key-files:
  created:
    - packages/mission-control/tests/auto-mode-indicators.test.ts
    - packages/mission-control/src/components/chat/PhaseTransitionCard.tsx
    - packages/mission-control/src/components/chat/ToolUseCard.tsx
  modified:
    - packages/mission-control/src/hooks/useSessionManager.ts
    - packages/mission-control/src/server/chat-types.ts
    - packages/mission-control/src/components/views/ChatView.tsx
    - packages/mission-control/src/components/chat/ChatPanel.tsx

key-decisions:
  - "applyGSD2Event is a pure exported helper (not inline in hook) — allows unit testing without React rendering"
  - "interrupt() sends session_interrupt WebSocket message rather than calling processManager directly — hook has no direct reference to processManager"
  - "EXECUTING badge rendered in three ChatView header variants to ensure visibility regardless of session count and preview toggle state"
  - "ChatPanel delegates phase_transition/tool_use to dedicated card components rather than extending ChatMessage — clean separation, easier to style/test independently"
  - "isAutoModeRef + isCrashedRef refs used inside handleMessage to avoid stale closures — React state is not readable inside useCallback without refs"

metrics:
  duration_minutes: 8
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 7
---

# Phase 13 Plan 05: Auto Mode Indicators and Stream Event Wiring Summary

**One-liner:** applyGSD2Event pure dispatcher wires GSD2StreamEvent classifications into useSessionManager, surfaces isAutoMode/isCrashed/interrupt, and routes phase/tool events to new card components in ChatPanel.

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-12T20:28:00Z
- **Completed:** 2026-03-12T20:36:00Z
- **Tasks:** 2 (TDD RED+GREEN + UI wiring)
- **Files modified:** 7

## Accomplishments

### Task 1: useSessionManager stream event dispatcher
- Created `applyGSD2Event(event, state): ApplyGSD2EventResult` — pure exported helper for 5 test cases
- Extended `ChatMessage.role` union with `"phase_transition" | "tool_use"` and added `phaseTransition?: { phase: string }` and `toolInput?: unknown` fields to `ChatMessage`
- Added `isAutoMode`, `isCrashed` state to `useSessionManager`; uses refs to prevent stale closures
- Integrated `classifyPiSdkEvent` in `handleMessage`: cost_update → `addCostEvent`, others → `applyGSD2Event` → optional message insert
- Added `process_crashed` raw event handler: `setIsCrashed(true)`, `setIsAutoMode(false)`
- Added `interrupt()` callback: sends `{ type: "session_interrupt", sessionId }` over WebSocket
- `useCostTracker` already existed from plan 13-04; wired via `addCostEvent` in handler
- 5 auto-mode-indicator tests pass GREEN; all 15 existing session manager tests still pass

### Task 2: UI — EXECUTING badge, Escape interrupt, phase/tool cards
- `ChatView`: added `isAutoMode?: boolean` and `onInterrupt?: () => void` to `ChatViewProps`
- `ChatViewConnected`: `useEffect` adds global `keydown` listener for `Escape` when `isAutoMode` — calls `onInterrupt`
- EXECUTING badge rendered in all three header variants (session tabs row, preview toggle bar, bare header) — amber `#F59E0B` background, Share Tech Mono, pulse animation
- `ChatPanel`: imports and conditionally renders `PhaseTransitionCard` (phase_transition role) and `ToolUseCard` (tool_use role)
- `PhaseTransitionCard`: amber divider with `◆ {phase}` in Share Tech Mono, navy border lines
- `ToolUseCard`: bordered mono card, tool name + streaming ellipsis or done checkmark

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | Failing auto-mode-indicators tests | (import error — expected RED) | tests/auto-mode-indicators.test.ts |
| 1 GREEN | applyGSD2Event + useSessionManager extension | 0399e3b | useSessionManager.ts, chat-types.ts, auto-mode-indicators.test.ts |
| 2 | EXECUTING badge, Escape, phase/tool cards | 602474d | PhaseTransitionCard.tsx, ToolUseCard.tsx |
| 2 fix | Stage ChatPanel + ChatView missed changes | 8b42fd3 | ChatPanel.tsx, ChatView.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing dependency] useCostTracker already existed from plan 13-04**
- **Found during:** Task 1
- **Issue:** Plan 13-04 (cost tracker) had not been formally executed in this session, but `useCostTracker.ts` already existed in the working tree from a prior session (plan 13-04 had been run)
- **Fix:** No action needed — file was already present with correct `computeCostState` and `useCostTracker` exports; simply imported it
- **Impact:** None — useCostTracker was available as expected

**2. [Rule 2 - Missing functionality] interrupt() sends via WebSocket, not direct processManager call**
- **Found during:** Task 1
- **Issue:** Plan specified "calls activeSession.processManager.interrupt()" but useSessionManager has no direct reference to processManager (sessions are managed server-side)
- **Fix:** interrupt() sends `{ type: "session_interrupt", sessionId }` over WebSocket — server routes to processManager.interrupt(). This is consistent with all other session operations (session_create, session_close, etc.)

**3. [Rule 2 - Missing functionality] EXECUTING badge rendered in three header variants**
- **Found during:** Task 2
- **Issue:** Plan only specified badge placement for "session tabs row" and "no sessions/preview toggle" cases; didn't address case where both sessions=0 and no preview toggle
- **Fix:** Added third badge variant for bare header case (no sessions, no preview toggle)

## Self-Check: PASSED

- [x] `tests/auto-mode-indicators.test.ts` created — 5 tests pass
- [x] `src/components/chat/PhaseTransitionCard.tsx` created
- [x] `src/components/chat/ToolUseCard.tsx` created
- [x] `src/hooks/useSessionManager.ts` — applyGSD2Event, isAutoMode, isCrashed, interrupt added
- [x] `src/server/chat-types.ts` — ChatMessage.role extended with phase_transition | tool_use
- [x] `src/components/views/ChatView.tsx` — isAutoMode, onInterrupt, EXECUTING badge, Escape useEffect
- [x] `src/components/chat/ChatPanel.tsx` — phase/tool card routing
- [x] Commit 0399e3b exists
- [x] Commit 602474d exists
- [x] Commit 8b42fd3 exists
- [x] bun build of all 3 entry points: 51 modules bundled cleanly
- [x] All 33 tests pass (5 new + 15 session manager + 13 chat-message)
