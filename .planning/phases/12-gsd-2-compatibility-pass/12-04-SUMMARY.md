---
phase: 12-gsd-2-compatibility-pass
plan: "04"
subsystem: ui
tags: [slash-commands, autocomplete, migration-banner, react, gsd2, chat]

# Dependency graph
requires:
  - phase: 12-03
    provides: state-deriver buildFullState with needsMigration and .gsd/ path support
provides:
  - GSD_COMMANDS array with 9 GSD 2 space-separated subcommand entries only
  - MigrationBanner React component (amber border, dismiss + run migration buttons)
  - ChatView wired to render MigrationBanner when planningState.needsMigration is true
affects: [ChatInput, ChatView, slash-commands, autocomplete, migration-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GSD_COMMANDS uses space-separated syntax (/gsd auto) not colon-syntax (/gsd:*)"
    - "Banner component takes onRunMigration and onDismiss callbacks; no internal state"
    - "ChatView tracks migrationDismissed with useState — banner hidden after dismiss or migration run"

key-files:
  created:
    - packages/mission-control/src/components/MigrationBanner.tsx
  modified:
    - packages/mission-control/src/lib/slash-commands.ts
    - packages/mission-control/src/components/views/ChatView.tsx

key-decisions:
  - "GSD_COMMANDS rewritten to exactly 9 GSD 2 entries; all 22 v1 /gsd:* entries removed"
  - "MigrationBanner uses inline style for amber border token (#F59E0B) and surface background (#131C2B); Tailwind classes for all other layout/typography"
  - "ChatView calls handleChatSend('/gsd migrate') — reuses existing message-send path including attachment prefix handling"
  - "migration-banner.test.ts tests buildFullState needsMigration logic (already GREEN from 12-03); no separate React component test written as test file was pre-written for state-deriver contract"

patterns-established:
  - "Pattern: GSD 2 /gsd subcommand entries in GSD_COMMANDS use args: '' and source: 'gsd'"
  - "Pattern: MigrationBanner is stateless — dismissal tracked at ChatView level via useState"

requirements-completed: [COMPAT-04, COMPAT-06]

# Metrics
duration: 12min
completed: 2026-03-12
---

# Phase 12 Plan 04: Slash Command Registry + Migration Banner Summary

**Replaced 22 v1 /gsd:* slash command entries with 9 GSD 2 space-syntax commands and added inline MigrationBanner component wired to ChatView for v1 project detection.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T18:40:00Z
- **Completed:** 2026-03-12T18:52:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- GSD_COMMANDS now has exactly 9 GSD 2 entries: `/gsd`, `/gsd auto`, `/gsd stop`, `/gsd discuss`, `/gsd status`, `/gsd queue`, `/gsd prefs`, `/gsd migrate`, `/gsd doctor`
- No v1 `/gsd:*` colon-syntax entries remain anywhere in slash-commands.ts
- MigrationBanner.tsx created with amber design token border, "Run migration" button, and dismiss button
- ChatView renders MigrationBanner above task status bar when `planningState.needsMigration === true` and user hasn't dismissed

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace GSD_COMMANDS with 9 GSD 2 entries** - `4ad8213` (feat)
2. **Task 2: Create MigrationBanner.tsx and wire into ChatView** - `0bf59d6` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `packages/mission-control/src/lib/slash-commands.ts` — GSD_COMMANDS replaced: 22 v1 entries removed, 9 GSD 2 entries added; JSDoc updated
- `packages/mission-control/src/components/MigrationBanner.tsx` — New component: amber #F59E0B border, #131C2B background, Run migration + dismiss buttons
- `packages/mission-control/src/components/views/ChatView.tsx` — Import MigrationBanner; add `migrationDismissed` state; render banner when `planningState?.needsMigration && !migrationDismissed`

## Decisions Made

- GSD_COMMANDS rewritten to exactly 9 GSD 2 entries; all 22 v1 `/gsd:*` entries removed
- MigrationBanner uses inline style for amber border token (#F59E0B) and surface background (#131C2B); Tailwind classes for all other layout/typography, consistent with ChatView
- ChatView calls `handleChatSend('/gsd migrate')` — reuses the existing message-send path which handles attachment prefixes correctly
- The `migration-banner.test.ts` test file was pre-written to test `buildFullState`'s `needsMigration` logic in `state-deriver.ts` (already implemented in 12-03). These 4 tests were GREEN before Task 2 began and remained GREEN. No separate React component render tests were written since the test file's scope was the state-deriver contract.

## Deviations from Plan

None — plan executed exactly as written. The migration-banner tests being already GREEN (not RED) was noted in STATE.md from plan 12-01 context; this was expected behavior.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Slash command autocomplete shows GSD 2 syntax to all users; no v1 commands visible in UI
- MigrationBanner ready to surface for any v1 project detected by state-deriver
- Phase 12-05 (or next wave) can proceed: all COMPAT-04 and COMPAT-06 requirements satisfied

---
*Phase: 12-gsd-2-compatibility-pass*
*Completed: 2026-03-12*

## Self-Check: PASSED

- FOUND: packages/mission-control/src/lib/slash-commands.ts
- FOUND: packages/mission-control/src/components/MigrationBanner.tsx
- FOUND: packages/mission-control/src/components/views/ChatView.tsx
- FOUND: .planning/phases/12-gsd-2-compatibility-pass/12-04-SUMMARY.md
- COMMIT 4ad8213: feat(12-04): replace v1 GSD_COMMANDS with 9 GSD 2 subcommand entries
- COMMIT 0bf59d6: feat(12-04): create MigrationBanner component and wire into ChatView
- COMMIT 71d48a6: docs(12-04): complete slash command registry and migration banner plan
