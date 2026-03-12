---
phase: 10-keyboard-shortcuts-accessibility
plan: "01"
subsystem: keyboard-hooks
tags: [keyboard, accessibility, tdd, pure-functions, hooks]
dependency_graph:
  requires: []
  provides:
    - useCommandPalette hook with shouldOpenCommandPalette predicate
    - usePanelFocus hook with shouldSwitchPanel predicate
    - keyboard-accessibility.test.ts scaffold (KEYS-01 through KEYS-06)
  affects:
    - AppShell (wires useCommandPalette and usePanelFocus in future plans)
    - CommandPalette component (plan 03 wires cmdk to open state)
tech_stack:
  added: []
  patterns:
    - Pure function extraction for hook testability (shouldOpenCommandPalette, shouldSwitchPanel)
    - Plain object cast to KeyboardEvent for bun test environment compatibility
    - test.todo() for structural stub tests (KEYS-03/04/05)
key_files:
  created:
    - packages/mission-control/tests/keyboard-accessibility.test.ts
    - packages/mission-control/src/hooks/useCommandPalette.ts
    - packages/mission-control/src/hooks/usePanelFocus.ts
  modified: []
decisions:
  - "shouldOpenCommandPalette uses uppercase 'P' (Shift held changes key value) — inverse of shouldTogglePreview which uses lowercase 'p'"
  - "shouldSwitchPanel requires !shiftKey to distinguish Ctrl+1–5 from Ctrl+Shift+P palette shortcut"
  - "VIEW_SHORTCUTS excludes 'review' — review view activates via useChatMode, not keyboard shortcut"
  - "Relative import path for view-types in usePanelFocus — avoids @/ alias resolution issues in bun test"
requirements-completed: [KEYS-01, KEYS-02, KEYS-06]
metrics:
  duration: "2min"
  completed_date: "2026-03-12"
  tasks_completed: 3
  files_changed: 3
---

# Phase 10 Plan 01: Keyboard Accessibility Test Scaffold and Pure Predicates Summary

**One-liner:** TDD keyboard predicates with Ctrl+Shift+P command palette and Ctrl+1–5 panel switching via extracted pure functions and test scaffold covering KEYS-01 through KEYS-06.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 test scaffold — keyboard-accessibility.test.ts | 4aa6c85 | tests/keyboard-accessibility.test.ts |
| 2 | useCommandPalette hook with shouldOpenCommandPalette pure function | a4df3ae | src/hooks/useCommandPalette.ts |
| 3 | usePanelFocus hook with shouldSwitchPanel pure function | 3bd255d | src/hooks/usePanelFocus.ts |

## Test Results

```
bun test tests/keyboard-accessibility.test.ts
 11 pass
 3 todo
 0 fail
Ran 14 tests across 1 file.
```

- KEYS-01: shouldOpenCommandPalette — 4 tests green
- KEYS-02: shouldSwitchPanel — 4 tests green
- KEYS-01: command registry smoke test — 1 test green
- KEYS-01: useCommandPalette module export — 1 test green
- KEYS-06: usePanelFocus module export — 1 test green
- KEYS-03/04/05: 3 todo stubs (expected — structural checks deferred)

## Decisions Made

1. **Uppercase "P" for Ctrl+Shift+P** — When Shift is held, browsers report key as "P" (uppercase), not "p". `shouldOpenCommandPalette` checks `e.key === "P"`. This is the documented inverse of `shouldTogglePreview` which uses lowercase "p" (no Shift).

2. **Shift guard in shouldSwitchPanel** — `!e.shiftKey` check distinguishes Ctrl+1–5 panel shortcuts from Ctrl+Shift+P palette shortcut. Without it, Ctrl+Shift+1 would incorrectly trigger a panel switch.

3. **"review" excluded from VIEW_SHORTCUTS** — The review view activates automatically via `useChatMode` when a review mode event fires. It is not a user-navigable keyboard target.

4. **Relative import path for view-types** — `usePanelFocus.ts` uses `"../lib/view-types"` rather than `"@/lib/view-types"` to avoid bun test path resolution issues with the `@/` alias.

## Deviations from Plan

None — plan executed exactly as written.

The only notable TDD adaptation: Task 2 verification with `--filter "shouldOpenCommandPalette"` still failed while `usePanelFocus` was absent, because top-level imports in the test file prevented module loading. This is expected behavior (Wave 0 state) and was resolved by implementing Task 3 in sequence before running final verification. No architectural changes needed.

## Self-Check: PASSED

All files created and all commits exist:
- FOUND: packages/mission-control/tests/keyboard-accessibility.test.ts
- FOUND: packages/mission-control/src/hooks/useCommandPalette.ts
- FOUND: packages/mission-control/src/hooks/usePanelFocus.ts
- FOUND: commit 4aa6c85 (test scaffold)
- FOUND: commit a4df3ae (useCommandPalette)
- FOUND: commit 3bd255d (usePanelFocus)
