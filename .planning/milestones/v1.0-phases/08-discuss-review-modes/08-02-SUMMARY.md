---
phase: 08-discuss-review-modes
plan: "02"
subsystem: ui+server
tags: [typescript, tdd, mode-interceptor, xml-streaming, question-card, decision-log, review-view, discuss, review]

# Dependency graph
requires:
  - phase: 08-01
    provides: ModeEvent types, QuestionCardPayload, DecisionEntry, ReviewResults type contracts and failing test scaffolds
provides:
  - parseStreamForModeEvents pure function in mode-interceptor.ts
  - mode-interceptor.ts wired into pipeline.ts wireSessionEvents
  - QuestionCardView (pure) + QuestionCard (stateful) in QuestionCard.tsx
  - DecisionLogDrawer pure render in DecisionLogDrawer.tsx
  - ReviewView pure render in ReviewView.tsx
  - ChatPanelView with optional overlay prop in ChatPanel.tsx
affects:
  - 08-03 (useChatMode hook integrates QuestionCard, DecisionLogDrawer via overlay prop)
  - 08-04 (ReviewView wired into useChatMode and review ViewType)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD Green phase: mode-interceptor.ts and UI components implement against contracts defined in Wave 1"
    - "Buffer-based streaming XML parsing: remainder passed between chunks via per-session modeBuffer in pipeline"
    - "Pure function extraction for all UI components enables direct test calls without React rendering infrastructure"
    - "Template literal string for React children avoids JSON serialization as array elements in test assertions"

key-files:
  created:
    - packages/mission-control/src/server/mode-interceptor.ts
    - packages/mission-control/src/components/chat/QuestionCard.tsx
    - packages/mission-control/src/components/chat/DecisionLogDrawer.tsx
    - packages/mission-control/src/components/views/ReviewView.tsx
  modified:
    - packages/mission-control/src/server/pipeline.ts
    - packages/mission-control/src/components/chat/ChatPanel.tsx

key-decisions:
  - "Template literal used for Question N of M label to produce single string child (not JSX expression array) — required for JSON.stringify test assertion to match"
  - "isPartialModeTag helper detects incomplete tag prefixes to hold in remainder buffer, preventing partial XML from appearing as plain text"
  - "modeBuffer is per-session local variable in wireSessionEvents closure — each session has its own streaming state"
  - "Blank delta suppression only when stripped.trim() is empty AND events were emitted — avoids suppressing legitimate whitespace-only text"

requirements-completed:
  - DISC-01
  - DISC-02
  - DISC-03
  - DISC-04
  - DISC-05
  - DISC-06

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 8 Plan 02: Stream Interceptor and Discuss Mode Client Components Summary

**Server stream interceptor strips XML mode markers from Claude stdout and emits per-session ModeEvents; QuestionCard, DecisionLogDrawer, and ReviewView pure components complete the discuss/review mode UI layer**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-11T21:05:42Z
- **Completed:** 2026-03-11T21:10:03Z
- **Tasks:** 2
- **Files modified:** 6 (2 modified, 4 created)

## Accomplishments

- Created `mode-interceptor.ts` with `parseStreamForModeEvents` pure function handling all known XML mode tag patterns (discuss_mode_start, discuss_mode_end, decision, question block, review_mode_start block) with stateful streaming buffer support
- Wired mode interceptor into `pipeline.ts` `wireSessionEvents` — per-session modeBuffer, broadcasts mode events only to triggering session's active client, suppresses blank text_delta when content is entirely mode tags
- Created `QuestionCard.tsx` with `QuestionCardView` (pure, no hooks) and `QuestionCard` (stateful wrapper) supporting both multiple_choice and free_text question types
- Created `DecisionLogDrawer.tsx` — pure render, returns null when not visible, key-value area+answer rows when visible
- Created `ReviewView.tsx` — pure render with pillar score bars, findings lists, and top fix cards with Fix button
- Extended `ChatPanel.tsx` `ChatPanelView` with optional `overlay` prop — dims message list and hides ChatInput when active, backward compatible when undefined

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mode-interceptor.ts and wire into pipeline.ts** - `02d84c9` (feat)
2. **Task 2: Create QuestionCard, DecisionLogDrawer, ReviewView, extend ChatPanelView** - `410e980` (feat)

## Files Created/Modified

- `packages/mission-control/src/server/mode-interceptor.ts` — 150 lines, parseStreamForModeEvents with regex parsing for all mode tag types
- `packages/mission-control/src/server/pipeline.ts` — Added parseStreamForModeEvents import and per-session modeBuffer wiring in wireSessionEvents
- `packages/mission-control/src/components/chat/QuestionCard.tsx` — QuestionCardView pure render + QuestionCard stateful wrapper
- `packages/mission-control/src/components/chat/DecisionLogDrawer.tsx` — Pure sidebar render
- `packages/mission-control/src/components/views/ReviewView.tsx` — Pure results view with pillar scores and fix cards
- `packages/mission-control/src/components/chat/ChatPanel.tsx` — Extended with overlay prop and relative positioning

## Decisions Made

- Template literal `{\`Question ${question.questionNumber} of ${question.totalQuestions}\`}` used instead of JSX expression interpolation to produce a single string child — required for JSON.stringify in test assertions to find "Question 1 of 3" as a contiguous string
- `isPartialModeTag` helper checks if tail starts with a prefix of a known mode tag to buffer partial XML at chunk boundaries — prevents `<discuss_mode_s` from being emitted as plain text
- Per-session `modeBuffer` declared as closure variable inside `wireSessionEvents` — each session maintains independent streaming state
- Blank delta suppression condition: `stripped.trim() === "" && events.length > 0` — ensures whitespace-only content is still forwarded if no mode events were found

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed JSX expression interpolation for "Question N of M" label**
- **Found during:** Task 2 — DISC-05 test failure
- **Issue:** JSX `Question {question.questionNumber} of {question.totalQuestions}` renders as React array `["Question ", 1, " of ", 3]` — JSON.stringify produces separate elements, not the string "Question 1 of 3"
- **Fix:** Changed to template literal `` {`Question ${question.questionNumber} of ${question.totalQuestions}`} `` which produces a single string child
- **Files modified:** packages/mission-control/src/components/chat/QuestionCard.tsx
- **Commit:** 410e980 (included in task commit)

## Self-Check: PASSED

All created files exist. Both task commits found in git log. All 15 DISC tests pass (6 mode-interceptor + 9 discuss-review). Zero TypeScript errors in new files.
