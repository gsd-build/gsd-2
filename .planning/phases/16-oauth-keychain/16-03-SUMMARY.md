---
phase: 16-oauth-keychain
plan: "03"
subsystem: auth
tags: [react, tauri, oauth, api-key, keychain, ui]

requires:
  - phase: 16-01
    provides: Rust OAuth backend (startOAuth, completeOAuth, saveApiKey IPC commands)
  - phase: 16-02
    provides: useAuthGuard, useTokenRefresh, auth-api.ts TypeScript hooks

provides:
  - ProviderPickerScreen — full-screen provider picker with 2x2 card grid
  - OAuthConnectFlow — amber spinner waiting screen for OAuth browser flow
  - ApiKeyForm — masked API key input with provider selector and save/cancel
  - App.tsx wired with useAuthGuard + useTokenRefresh — auth gates app shell

affects:
  - 16-04 (e2e verification)
  - 17 (model selection UI may need picker reference)

tech-stack:
  added: []
  patterns:
    - Inline style objects for GSD design system (no Tailwind for auth screens)
    - CSS keyframe injection via <style> tag in component for isolated animations
    - Auth flow state machine in ProviderPickerScreen (idle/oauth-pending/api-key-form)

key-files:
  created:
    - packages/mission-control/src/components/auth/ProviderPickerScreen.tsx
    - packages/mission-control/src/components/auth/OAuthConnectFlow.tsx
    - packages/mission-control/src/components/auth/ApiKeyForm.tsx
    - packages/mission-control/src/components/auth/index.ts
  modified:
    - packages/mission-control/src/App.tsx

key-decisions:
  - "Inline styles used for all auth screen components — GSD design system expressed directly rather than via Tailwind classes to avoid class purging issues and keep design tokens explicit"
  - "OAuthConnectFlow injects CSS keyframes via <style> tag — no external CSS file needed for isolated spin/pulse animations"
  - "ProviderPickerScreen handles both OAuth and API-key flows inline using flowState machine, delegating to sub-components once a flow is initiated"
  - "App.tsx renders null during checking state (not a loading spinner) — avoids flash of loading UI per plan spec"

requirements-completed: [AUTH-01, AUTH-02, AUTH-04]

duration: 4min
completed: 2026-03-13
---

# Phase 16 Plan 03: Provider Picker UI + App Integration Summary

**Full-screen GSD provider picker with OAuth/API-key flow routing and App.tsx auth gate — ProviderPickerScreen (2x2 card grid), OAuthConnectFlow (amber spinner), ApiKeyForm (masked input + Eye toggle) wired into App.tsx via useAuthGuard**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-13T18:15:24Z
- **Completed:** 2026-03-13T18:19:06Z
- **Tasks:** 5
- **Files modified:** 5 (4 created, 1 updated)

## Accomplishments

- `ProviderPickerScreen` renders full-screen (#0F1419) with 2x2 provider grid: Claude Max, GitHub Copilot, OpenRouter, API Key — selected card gets cyan border + 8% tint
- `OAuthConnectFlow` shows amber pulsing spinner with 5-minute auto-timeout via `onError`
- `ApiKeyForm` has masked input with Eye/EyeOff lucide toggle, provider dropdown (locked for openrouter), calls `saveApiKey()` from auth-api
- `App.tsx` renders `null` during keychain check, picker for `needs_picker` / `needsReauth`, and `AppShell` when authenticated
- Test suite improved: 691 pass (up from 671 before this phase's work) with 5 pre-existing failures unrelated to auth UI

## Task Commits

1. **Task 16-03-01: ProviderPickerScreen** - `96ae47e` (feat)
2. **Task 16-03-02: OAuthConnectFlow** - `0fe9cf7` (feat)
3. **Task 16-03-03: ApiKeyForm** - `02b8dfc` (feat)
4. **Task 16-03-04: App.tsx auth wiring** - `bdb8259` (feat)
5. **Task 16-03-05: barrel index.ts + tests** - `e4d3bc4` (feat)

## Files Created/Modified

- `packages/mission-control/src/components/auth/ProviderPickerScreen.tsx` — Full-screen picker, 2x2 grid, OAuth/API-key flow routing
- `packages/mission-control/src/components/auth/OAuthConnectFlow.tsx` — Browser OAuth waiting screen with amber spinner and 5-min timeout
- `packages/mission-control/src/components/auth/ApiKeyForm.tsx` — Masked key input, provider selector, save/cancel actions
- `packages/mission-control/src/components/auth/index.ts` — Barrel export for all three components
- `packages/mission-control/src/App.tsx` — Wired useAuthGuard + useTokenRefresh; conditional render of picker or AppShell

## Decisions Made

- Inline style objects used for all auth screen components rather than Tailwind — keeps GSD design tokens explicit and avoids purging issues with dynamic values like `rgba(91,200,240,0.08)`
- CSS keyframe animations injected via `<style>` tag inside `OAuthConnectFlow` — self-contained, no separate CSS file needed
- `ProviderPickerScreen` manages flow state internally (`idle | oauth-pending | api-key-form`) and swaps child components — avoids prop-drilling through a parent router
- `App.tsx` renders `null` during `"checking"` (not a spinner) per plan spec to prevent flash of loading UI

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all five tasks completed cleanly. 5 failing tests in `deriveSessionMode` and session-perf suite are pre-existing and unrelated to auth UI (present before this plan's execution).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16-04 (e2e verification checkpoint) can now proceed: all UI components exist and App.tsx routes through auth guard
- Test suite healthy at 691 passing; auth components add no new test failures

## Self-Check: PASSED

- All 5 expected files confirmed present on disk
- All 5 task commits (96ae47e, 0fe9cf7, 02b8dfc, bdb8259, e4d3bc4) confirmed in git log
- Final docs commit: c8aa2c9

---
*Phase: 16-oauth-keychain*
*Completed: 2026-03-13*
