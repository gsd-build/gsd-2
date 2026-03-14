---
phase: 18-builder-mode
plan: "01"
subsystem: interface-mode
tags: [builder-mode, react-context, vocab-map, settings, chat-input]
dependency_graph:
  requires: []
  provides: [InterfaceModeContext, useBuilderMode, BUILDER_VOCAB, DEVELOPER_VOCAB, interface_mode-setting]
  affects: [App.tsx, AppShell.tsx, SingleColumnView.tsx, ChatView.tsx, ChatPanel.tsx, ChatInput.tsx, SettingsView.tsx]
tech_stack:
  added: [React.createContext, InterfaceModeProvider pattern]
  patterns: [context-provider-wrapper, prop-threading, tdd-forward-looking-tests]
key_files:
  created:
    - packages/mission-control/src/lib/builder-vocab.ts
    - packages/mission-control/src/context/InterfaceModeContext.tsx
    - packages/mission-control/src/hooks/useBuilderMode.ts
    - packages/mission-control/tests/builder-mode.test.ts
  modified:
    - packages/mission-control/src/App.tsx
    - packages/mission-control/src/components/layout/AppShell.tsx
    - packages/mission-control/src/components/layout/SingleColumnView.tsx
    - packages/mission-control/src/components/views/ChatView.tsx
    - packages/mission-control/src/components/views/SettingsView.tsx
    - packages/mission-control/src/components/chat/ChatPanel.tsx
    - packages/mission-control/src/components/chat/ChatInput.tsx
decisions:
  - "AppShellWithMode thin wrapper pattern: reads interface_mode from useSettings, wraps AppShell in InterfaceModeProvider — provider above full tree without requiring App.tsx to call useSettings"
  - "useBuilderMode reads InterfaceModeContext via useContext — AppShell calls it after InterfaceModeProvider is in tree; brief flash (Developer mode while settings load) acceptable"
  - "CommandPalette gated via open={builderMode ? false : paletteOpen} — simpler than modifying useCommandPalette; keyboard listener fires but palette stays closed"
  - "Cost badge and budget warning wrapped with {!builderMode && ...} guards in ChatView; not deleted — Developer mode continues to show all elements"
  - "SettingsView Interface Mode toggle uses two-button pattern (Developer/Builder) matching existing SelectRow style; writes interface_mode via handleUpdate → PUT /api/settings existing flow"
metrics:
  duration_seconds: 547
  completed_date: "2026-03-14"
  tasks_completed: 3
  files_created: 4
  files_modified: 7
---

# Phase 18 Plan 01: Builder Mode Foundation Summary

Builder mode context layer — InterfaceModeContext, vocab maps, Settings toggle, ChatInput placeholder/autocomplete control, cost badge suppression — establishing the propagation infrastructure all downstream Phase 18 plans depend on.

## What Was Built

### Task 1: InterfaceModeContext + vocab map + useBuilderMode hook + tests

Created the three core foundation files:

- `builder-vocab.ts`: Exports `VocabMap` type, `DEVELOPER_VOCAB` (Milestone/Slice/Task/Must-haves/UAT/Decisions), and `BUILDER_VOCAB` (Version/Feature/Step/Goals/Testing/Your decisions so far).
- `InterfaceModeContext.tsx`: React Context with `{ builderMode: boolean; vocab: VocabMap }` default value. `InterfaceModeProvider` computes vocab from builderMode and supplies both.
- `useBuilderMode.ts`: Thin hook calling `useContext(InterfaceModeContext)`.
- `tests/builder-mode.test.ts`: 14 tests — vocab field assertions (12 GREEN immediately), SettingsView static analysis tests (2 RED at commit, forward-looking TDD).

### Task 2: Settings toggle + App.tsx provider + ChatInput builderMode prop

- Added "Interface Mode" section to SettingsView between Provider and Build Permissions sections. Two-button Developer/Builder toggle writing `interface_mode: 'developer' | 'builder'` via `handleUpdate` → `PUT /api/settings` (no new route needed).
- `AppShellWithMode` wrapper added to AppShell.tsx: calls `useSettings()`, derives `builderMode`, wraps `<AppShell>` in `<InterfaceModeProvider>`.
- App.tsx updated to render `<AppShellWithMode />` instead of `<AppShell />`.
- AppShell reads `useBuilderMode()`, gates CommandPalette with `open={builderMode ? false : paletteOpen}`.
- `builderMode` prop threaded: AppShell → SingleColumnView → ChatView → ChatPanel → ChatInput.
- ChatInput: `builderMode=true` → `filtered=[]` (no slash autocomplete), placeholder = "What do you want to build or change?".
- All 14 builder-mode.test.ts tests GREEN after Task 2 (SettingsView static analysis now passes).

### Task 3: Hide cost badge, token count, and model name in Builder mode

- Cost badge in ChatView wrapped: `{!builderMode && costState && costState.totalCost > 0 && ...}`.
- Budget warning banner in ChatView wrapped: `{!builderMode && costState?.level === "critical" && ...}`.
- No model name is currently rendered in the chat header area (it was searched — not present), so no additional changes needed for that element.
- Developer mode: all cost/token elements continue to render as before.

## Deviations from Plan

None — plan executed exactly as written. The only adaptation was confirming no model name display exists in the chat header, so the model name suppression step was a no-op (correct behavior, not a gap).

## Test Results

- `tests/builder-mode.test.ts`: 14/14 pass
- Full suite: 739 pass, 3 todo, 2 fail (both pre-existing: pipeline latency + server SERV-01 timeout)
- TypeScript build: 244 modules bundled successfully

## Commits

| Hash | Message |
|------|---------|
| b2f2b28 | feat(18-01): InterfaceModeContext + vocab map + useBuilderMode hook + tests |
| 40f2192 | feat(18-01): Settings toggle + App.tsx provider + ChatInput builderMode prop |
| 2f4021b | feat(18-01): Hide cost badge, token count, and budget warning in Builder mode |

## Self-Check

Files created:
- `packages/mission-control/src/lib/builder-vocab.ts` ✓
- `packages/mission-control/src/context/InterfaceModeContext.tsx` ✓
- `packages/mission-control/src/hooks/useBuilderMode.ts` ✓
- `packages/mission-control/tests/builder-mode.test.ts` ✓

## Self-Check: PASSED
