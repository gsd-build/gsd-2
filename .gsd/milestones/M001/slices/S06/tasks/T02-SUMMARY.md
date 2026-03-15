---
id: T02
parent: S06
milestone: M001
provides:
  - Error banner retry button calling refreshBoot() with disabled state during commandInFlight or active onboarding
  - Power mode workflow action bar using deriveWorkflowAction (mirrors dashboard pattern)
  - sessionStorage-based active view persistence keyed by project cwd
key_files:
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/dual-terminal.tsx
key_decisions:
  - sessionStorage key uses `gsd-active-view:${projectCwd}` format (matches plan; differs from slice plan's `gsd-view-` prefix — used the more descriptive key from task plan)
  - View restore uses a `viewRestored` guard flag + useEffect (not lazy initializer) because boot/projectPath isn't available on first render
  - Retry button disabled when commandInFlight OR onboardingRequestState !== "idle" (covers both command-in-progress and setup flows)
patterns_established:
  - Compact inline action bar pattern for power mode (smaller padding/font than dashboard's full-width bar)
observability_surfaces:
  - data-testid="workspace-error-banner" — now contains retry button child element
  - data-testid="power-mode-action-bar" — new test ID on power mode workflow controls
  - sessionStorage key `gsd-active-view:${projectCwd}` — inspectable for view persistence verification
duration: 10m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Add recovery affordances, power mode controls, and view persistence

**Added retry button to error banner, workflow action bar to power mode, and sessionStorage view persistence across refresh**

## What Happened

1. **Error banner retry button** — Extended the error banner in `app-shell.tsx` from passive text to an actionable flex layout: error text on the left, "Retry" button on the right. The button calls `refreshBoot()` and is disabled when `commandInFlight` is set or `onboardingRequestState !== "idle"`. Styled as a small secondary button (`text-xs`, border, `bg-background`) matching the existing destructive banner skin.

2. **Power mode workflow action bar** — Added a compact inline action bar to `dual-terminal.tsx`'s header, between the "Power User Mode" label and the left/right terminal labels. Uses `deriveWorkflowAction` with the same input shape as dashboard. Primary button with destructive variant support, secondary buttons, commandInFlight spinner, disabled state. Compact sizing (`text-xs`, `py-1`, `h-3` icons) since power mode space is at a premium.

3. **View persistence** — Added sessionStorage-based persistence in `app-shell.tsx`:
   - Key: `gsd-active-view:${projectCwd}` where `projectCwd` comes from `workspace.boot?.project.cwd`
   - Restore: `useEffect` fires once when `projectPath` becomes available, reads stored view, validates against `KNOWN_VIEWS` set, sets state
   - Persist: second `useEffect` writes `activeView` to sessionStorage on every change
   - Guard: `viewRestored` flag prevents re-reading after initial restore

## Verification

- `npm run build:web-host` — builds cleanly ✔
- `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — 14/14 pass ✔
- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — 19/19 pass ✔

All slice-level verification checks pass. This is the final task of S06 — all checks green.

## Diagnostics

- **Error banner retry**: inspect `data-testid="workspace-error-banner"` for a button child. Button's `disabled` attribute reflects `commandInFlight` and `onboardingRequestState` from store.
- **Power mode action bar**: inspect `data-testid="power-mode-action-bar"` for workflow buttons. Same derivation as `data-testid="dashboard-action-bar"`.
- **View persistence**: read `sessionStorage.getItem("gsd-active-view:" + projectCwd)` to verify stored view. On refresh, the view should restore to the stored value.

## Deviations

- Task plan step 3 suggested a lazy initializer for `useState` for the read side, but `boot`/`projectPath` isn't available on first render, making a lazy initializer insufficient. Used a `useEffect` with a `viewRestored` guard flag instead — this is noted in the plan as an alternative approach ("start with dashboard and update once boot loads").
- sessionStorage key uses `gsd-active-view:` prefix (from task plan) rather than `gsd-view-` (from slice plan). The task plan is authoritative.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/app-shell.tsx` — added error banner retry button, view persistence via sessionStorage, useGSDWorkspaceActions import
- `web/components/gsd/dual-terminal.tsx` — added compact workflow action bar in header using deriveWorkflowAction
- `.gsd/milestones/M001/slices/S06/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
