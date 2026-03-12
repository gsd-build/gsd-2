---
phase: 08-discuss-review-modes
plan: "01"
subsystem: ui
tags: [typescript, tdd, chat-types, view-types, discuss, review, mode-events]

# Dependency graph
requires:
  - phase: 07-session-flow-animation
    provides: ViewType discriminated union and session state foundation that this extends
provides:
  - ModeEvent, ModeEventType, QuestionCardPayload, DecisionEntry, PillarScore, FixAction, ReviewResults types in chat-types.ts
  - review variant in ViewType discriminated union in view-types.ts
  - Failing test scaffolds for parseStreamForModeEvents (mode-interceptor.test.ts)
  - Failing test scaffolds for QuestionCardView, DecisionLogDrawer, ReviewView (discuss-review.test.tsx)
affects:
  - 08-02 (Wave 2: mode-interceptor.ts, QuestionCard, DecisionLogDrawer, ReviewView implementations must satisfy these contracts)
  - 08-03 (useChatMode hook integrates ModeEvent types)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD Red phase: type contracts defined before implementations, tests fail at import"
    - "ModeEvent discriminated union with optional payload fields (not nested variants)"
    - "ViewType extended without payload on review variant — ReviewResults lives in hook state"

key-files:
  created:
    - packages/mission-control/tests/mode-interceptor.test.ts
    - packages/mission-control/tests/discuss-review.test.tsx
  modified:
    - packages/mission-control/src/server/chat-types.ts
    - packages/mission-control/src/lib/view-types.ts

key-decisions:
  - "ModeEvent uses optional fields (total?, question?, decision?, results?) rather than a discriminated union per type — simpler to parse from XML stream"
  - "review ViewType variant carries no payload — ReviewResults lives in useChatMode hook state (avoids routing complexity per RESEARCH.md pitfall 3)"
  - "TDD Red phase: test files reference non-existent modules, confirming contract-first approach before Wave 2 implementations"

patterns-established:
  - "Mode event XML stream tags map 1:1 to ModeEventType string literals"
  - "parseStreamForModeEvents signature: (text, buffer) => { events, stripped, remainder } — enables stateful streaming"

requirements-completed:
  - DISC-01
  - DISC-02
  - DISC-03
  - DISC-04
  - DISC-05
  - DISC-06
  - REVW-01
  - REVW-02
  - REVW-03
  - REVW-04

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 8 Plan 01: Discuss + Review Mode Types and TDD Red Phase Summary

**TypeScript type contracts for discuss/review modes — ModeEvent, QuestionCardPayload, ReviewResults, PillarScore, FixAction, DecisionEntry — plus failing test scaffolds for Wave 2 implementations**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-11T21:00:32Z
- **Completed:** 2026-03-11T21:03:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended chat-types.ts with all mode event types (ModeEventType union, ModeEvent interface, QuestionCardPayload, DecisionEntry, PillarScore, FixAction, ReviewResults)
- Added `{ kind: "review" }` variant to ViewType discriminated union in view-types.ts
- Created mode-interceptor.test.ts with 6 failing tests covering discuss_mode_start stripping, discuss_mode_end detection, normal text passthrough, partial XML buffering, question_card parsing, and review_mode_start with pillar data
- Created discuss-review.test.tsx with failing tests for QuestionCardView (question text, button group, text input, N-of-M label), DecisionLogDrawer (key-value rendering, visibility), and ReviewView (pillar scores, fix cards)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend chat-types.ts and view-types.ts** - `30c2b05` (feat)
2. **Task 2: Write failing test scaffolds** - `9c9626e` (test)

## Files Created/Modified

- `packages/mission-control/src/server/chat-types.ts` - Appended 55 lines of mode event type definitions after ChatResponse
- `packages/mission-control/src/lib/view-types.ts` - Added `| { kind: "review" }` to ViewType union
- `packages/mission-control/tests/mode-interceptor.test.ts` - 6 tests for parseStreamForModeEvents (all fail: module not found)
- `packages/mission-control/tests/discuss-review.test.tsx` - Tests for QuestionCardView, DecisionLogDrawer, ReviewView (all fail: modules not found)

## Decisions Made

- ModeEvent uses optional payload fields rather than a full discriminated union per event type — simpler XML parsing in Wave 2
- review ViewType variant carries no payload — ReviewResults lives in useChatMode hook state per RESEARCH.md pitfall 3
- parseStreamForModeEvents signature established as `(text: string, buffer: string) => { events: ModeEvent[], stripped: string, remainder: string }` enabling stateful streaming

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors (Bun type definitions, PanelShell layout) unrelated to new types. New type definitions in chat-types.ts and view-types.ts produce zero tsc errors.

## Next Phase Readiness

- All type contracts defined — Wave 2 (08-02) can implement mode-interceptor.ts, QuestionCard, DecisionLogDrawer, ReviewView against these interfaces
- Test scaffolds are wired and ready — once implementations exist, tests will run green
- No blockers

---
*Phase: 08-discuss-review-modes*
*Completed: 2026-03-11*
