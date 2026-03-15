# S06: Power mode + continuity + failure visibility

**Goal:** Richer control surfaces stay attached across refresh/reopen, show recoverable failure states, and keep the experience snappy and fast under normal use.
**Demo:** Refresh the browser → workspace reconnects, resyncs state, and returns to the previous view. A bridge failure shows an actionable retry button instead of passive text. Power mode has workflow controls. Long sessions don't degrade performance.

## Must-Haves

- SSE reconnect triggers a soft boot refresh to resync state that may have drifted while disconnected
- `visibilitychange` listener soft-refreshes on tab return after extended background time (≥30s)
- `commandInFlight` has a timeout safety net (~90s) so controls can't get permanently disabled
- `liveTranscript` is capped to prevent unbounded memory growth in long sessions
- Error banner shows actionable retry/reconnect button instead of passive text
- Power mode has an integrated workflow action bar (same derivation as dashboard/sidebar)
- Active view persists across refresh via sessionStorage (keyed by project cwd)

## Proof Level

- This slice proves: operational + contract
- Real runtime required: yes (build must pass; contract test must pass)
- Human/UAT required: no (S07 will exercise this end-to-end)

## Verification

- `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — all tests pass
- `npm run build:web-host` — builds cleanly with all new/modified components
- Pre-existing tests remain green: `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts`
- Continuity contract test includes failure-path coverage: command timeout clears `commandInFlight` with inspectable `lastClientError` and error terminal line; reconnect from non-connected state triggers `refreshBoot({ soft: true })`

## Observability / Diagnostics

- Runtime signals: terminal lines for reconnect-triggered refresh, visibility-triggered refresh, and command timeout events; `connectionState` transitions logged in terminal
- Inspection surfaces: `data-testid="workspace-error-banner"` (now includes retry button), `data-testid="power-mode-action-bar"`, store snapshot fields (`commandInFlight`, `liveTranscript`, `connectionState`)
- Failure visibility: `getVisibleWorkspaceError()` aggregates all error surfaces; error banner exposes retry action; command timeout clears stuck `commandInFlight` with error line
- Redaction constraints: none (no secrets in these surfaces)

## Integration Closure

- Upstream surfaces consumed: `deriveWorkflowAction` from `web/lib/workflow-actions.ts` (D018), `refreshBoot` / `sendCommand` / `buildPromptCommand` from store, `getVisibleWorkspaceError` / `getStatusPresentation` from store
- New wiring introduced in this slice: visibilitychange listener in store `start()`, reconnect hook in SSE `onopen`, command timeout timer, transcript cap in `handleTurnBoundary`, sessionStorage persistence in app-shell
- What remains before the milestone is truly usable end-to-end: S07 — integrated acceptance proof against a real project

## Tasks

- [x] **T01: Harden store continuity and add safety caps** `est:45m`
  - Why: The store reconnects SSE but doesn't resync state, has no tab-return recovery, lets commandInFlight get permanently stuck, and grows liveTranscript unboundedly. These are the root causes of the R007/R009/R010 gaps.
  - Files: `web/lib/gsd-workspace-store.tsx`, `src/tests/web-continuity-contract.test.ts`
  - Do: (1) Cap `liveTranscript` to 100 blocks in `handleTurnBoundary`. (2) Add command timeout (90s) that clears `commandInFlight` with an error terminal line. (3) In SSE `onopen`, trigger `refreshBoot({ soft: true })` when reconnecting from a non-connected state. (4) Add `visibilitychange` listener in `start()` that calls `refreshBoot({ soft: true })` when returning from ≥30s background. Clean up in `dispose()`. (5) Write contract test covering transcript cap, command timeout, reconnect refresh, and visibility refresh.
  - Verify: `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — all pass
  - Done when: all 4 continuity/safety mechanisms are in the store, contract test passes, pre-existing tests still pass

- [x] **T02: Add recovery affordances, power mode controls, and view persistence** `est:30m`
  - Why: Error banners are passive text with no recovery action, power mode has no workflow controls (just a passive viewer), and refresh always resets to dashboard. These are the visible UI gaps for R010, R005, and R007.
  - Files: `web/components/gsd/app-shell.tsx`, `web/components/gsd/dual-terminal.tsx`
  - Do: (1) In app-shell error banner, add a "Retry" button that calls `refreshBoot()` — hide/disable during onboarding lock. (2) In dual-terminal header, add a workflow action bar using `deriveWorkflowAction` (same pattern as dashboard). (3) In app-shell, persist `activeView` to `sessionStorage` keyed by `gsd-view-${project.cwd}` and restore on mount.
  - Verify: `npm run build:web-host` — builds cleanly; `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — still passes
  - Done when: error banner has retry button, power mode has workflow controls, refresh preserves active view, build passes

## Files Likely Touched

- `web/lib/gsd-workspace-store.tsx`
- `web/components/gsd/app-shell.tsx`
- `web/components/gsd/dual-terminal.tsx`
- `src/tests/web-continuity-contract.test.ts`
