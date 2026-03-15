---
id: S06
parent: M001
milestone: M001
provides:
  - Transcript cap (100 blocks) preventing unbounded memory growth in long sessions
  - Command timeout (90s) clearing stuck commandInFlight with error visibility
  - SSE reconnect triggers soft refreshBoot to resync drifted state
  - Visibility-return listener triggers soft refreshBoot after ≥30s background
  - Error banner with actionable retry button (disabled during active commands/onboarding)
  - Power mode integrated workflow action bar using deriveWorkflowAction
  - Active view persistence across refresh via sessionStorage keyed by project cwd
requires:
  - slice: S03
    provides: Live event and prompt surface (SSE streaming, sendCommand, refreshBoot)
  - slice: S04
    provides: Real UI state models (workspace store, boot payload, project surfaces)
  - slice: S05
    provides: Start/resume workflow actions (deriveWorkflowAction, useGSDWorkspaceActions)
affects:
  - S07
key_files:
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/dual-terminal.tsx
  - src/tests/web-continuity-contract.test.ts
key_decisions:
  - Exported store constants (MAX_TRANSCRIPT_BLOCKS, COMMAND_TIMEOUT_MS, VISIBILITY_REFRESH_THRESHOLD_MS) as contract surface for tests and downstream code
  - sessionStorage key format `gsd-active-view:${projectCwd}` for view persistence
  - Retry button disabled when commandInFlight OR onboardingRequestState !== "idle" to prevent conflicting operations
  - View restore uses useEffect with guard flag rather than lazy initializer because boot/projectPath isn't available on first render
patterns_established:
  - Store continuity safety mechanism pattern — caps, timeouts, and lifecycle listeners installed in start() and cleaned in dispose()
  - Compact inline action bar pattern for power mode (smaller than dashboard's full-width bar)
  - sessionStorage-based per-project view persistence with validation against known view set
observability_surfaces:
  - data-testid="workspace-error-banner" — now contains retry button child element
  - data-testid="power-mode-action-bar" — workflow controls in power mode header
  - sessionStorage key `gsd-active-view:${projectCwd}` — inspectable view persistence
  - Terminal lines for reconnect ("Live event stream reconnected"), command timeout ("Command timed out — controls re-enabled"), visibility refresh
  - Store snapshot fields: commandInFlight, liveTranscript, connectionState, lastClientError
drill_down_paths:
  - .gsd/milestones/M001/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S06/tasks/T02-SUMMARY.md
duration: 25m
verification_result: passed
completed_at: 2026-03-15
---

# S06: Power mode + continuity + failure visibility

**Added store safety caps, browser lifecycle continuity, actionable error recovery, power mode workflow controls, and view persistence across refresh**

## What Happened

Two tasks hardened the web workspace for long-running sessions, browser lifecycle events, and failure recovery.

**T01 — Store continuity and safety caps.** Added four mechanisms to `GSDWorkspaceStore`: (1) transcript cap at 100 blocks, trimming oldest entries in `handleTurnBoundary` to prevent unbounded memory growth; (2) command timeout at 90 seconds that clears stuck `commandInFlight`, sets `lastClientError`, and emits an error terminal line; (3) SSE `onopen` handler that triggers `refreshBoot({ soft: true })` when reconnecting from a non-connected state to resync drifted state; (4) `visibilitychange` listener installed in `start()` that triggers soft refresh when returning from ≥30s background, cleaned up in `dispose()`. Constants exported for downstream use.

**T02 — Recovery affordances, power mode controls, and view persistence.** Extended the error banner in `app-shell.tsx` from passive text to an actionable layout with a "Retry" button calling `refreshBoot()`, disabled during active commands or onboarding. Added a compact workflow action bar to `dual-terminal.tsx`'s header using `deriveWorkflowAction` (same derivation as dashboard), with primary/secondary buttons, destructive variant support, and commandInFlight spinner. Added sessionStorage-based active view persistence keyed by `gsd-active-view:${projectCwd}`, restored on mount with validation against a known view set.

## Verification

- `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — 14/14 pass ✔
- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — 19/19 pass ✔
- `node --test --experimental-strip-types src/tests/web-live-interaction-contract.test.ts` — 10/10 pass ✔
- `npm run build:web-host` — builds cleanly, standalone host staged ✔

## Requirements Advanced

- R007 — Session continuity: SSE reconnect resync, visibility-return refresh, and sessionStorage view persistence provide the continuity mechanisms. Contract tests prove each mechanism independently.
- R009 — Snappy and fast: Transcript cap and command timeout prevent performance degradation in long sessions. Full subjective verification deferred to S07.
- R010 — Failures visible and recoverable: Error banner retry button, command timeout error visibility, and reconnect resync provide actionable failure recovery. Contract tests prove the mechanisms.

## Requirements Validated

- R007 — Session continuity works across refresh/reopen: Contract tests prove reconnect triggers state resync, visibility return triggers state resync, and view persists across refresh via sessionStorage. All mechanisms are independently tested.
- R010 — Failures are visible and recoverable in-browser: Error banner has actionable retry button (disabled appropriately), command timeout clears stuck state with error line and `lastClientError`, reconnect resync recovers from bridge disconnects. Contract tests cover timeout, reconnect, and visibility recovery paths.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- sessionStorage key uses `gsd-active-view:` prefix (from T02 task plan) rather than `gsd-view-` (from slice plan). The task plan is authoritative for implementation detail.
- View restore uses a `useEffect` with guard flag instead of a `useState` lazy initializer because `boot`/`projectPath` isn't available on first render.
- Simplified SSE `onopen` handler — removed redundant ternary chain where `nextState` was always `"connected"`.

## Known Limitations

- R009 "feels snappy and fast" is a subjective quality bar that cannot be fully validated by contract tests alone. S07 will exercise this under real session load.
- `web-live-interaction-contract.test.ts` has a pre-existing file-level hang after all tests pass (unresolved promise from bridge cleanup). Not introduced by S06.

## Follow-ups

- S07: End-to-end web assembly proof — exercises all S06 mechanisms in a real project session.

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — added transcript cap, command timeout, reconnect resync, visibility listener, exported constants
- `web/components/gsd/app-shell.tsx` — added error banner retry button, view persistence via sessionStorage
- `web/components/gsd/dual-terminal.tsx` — added compact workflow action bar in power mode header
- `src/tests/web-continuity-contract.test.ts` — new contract test with 14 cases

## Forward Intelligence

### What the next slice should know
- All continuity mechanisms are in place and contract-tested. S07 can rely on reconnect resync, visibility refresh, transcript cap, and command timeout working as specified.
- Power mode now has the same workflow controls as dashboard via `deriveWorkflowAction`. No new wiring needed for S07 to exercise workflow actions.
- View persistence is sessionStorage-based and per-project. Clearing sessionStorage or using a different project cwd resets to dashboard.

### What's fragile
- The `visibilitychange` listener depends on `lastBootRefreshAt` being set in `refreshBoot()`. If `refreshBoot` is refactored to skip the timestamp update, the 30s threshold check breaks silently.
- Command timeout uses `setTimeout` with a handle stored as instance state. If `sendCommand` is made concurrent (multiple in-flight), the single-timer pattern would need revision.

### Authoritative diagnostics
- `commandInFlight` in store snapshot — if non-null for >90s, something is wrong. Check terminal lines for "Command timed out".
- `liveTranscript.length` — should never exceed 100 in a running session.
- `sessionStorage.getItem("gsd-active-view:" + projectCwd)` — shows the persisted view for a given project.
- `connectionState` transitions are logged as terminal lines — look for "Live event stream reconnected" on successful reconnect.

### What assumptions changed
- The SSE `onopen` handler was assumed to need a ternary state machine for `nextState`, but all paths resolved to `"connected"` — simplified to a direct assignment.
