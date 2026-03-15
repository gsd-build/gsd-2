# S06: Power mode + continuity + failure visibility — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All mechanisms are exercised by contract tests (14 cases covering caps, timeouts, reconnect, visibility). The build compiles all new UI components. S07 will exercise these under real runtime conditions.

## Preconditions

- Repository checked out at the S06 completion state
- Node.js ≥22 available
- `npm install` completed in both root and `web/` directories

## Smoke Test

Run `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — all 14 tests pass.

## Test Cases

### 1. Transcript cap prevents unbounded growth

1. Run `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts`
2. Check tests "Transcript cap: pushing 110 blocks keeps only the last 100" and "exactly at cap does not trim"
3. **Expected:** Both pass — 110 blocks are trimmed to 100 (oldest dropped), exactly 100 blocks remain untrimmed.

### 2. Command timeout clears stuck commands

1. Run the continuity contract test suite
2. Check test "Command timeout: stuck command is cleared after timeout with error visibility"
3. **Expected:** After 90s simulated timeout: `commandInFlight` is null, `lastClientError` contains "Command timed out", terminal lines include an error line with "Command timed out — controls re-enabled".

### 3. Normal command completion clears timeout timer

1. Run the continuity contract test suite
2. Check test "Command timeout: normal completion clears the timer before it fires"
3. **Expected:** Command completes normally, timeout timer does not fire, `commandInFlight` is null, no timeout error in `lastClientError`.

### 4. SSE reconnect triggers state resync

1. Run the continuity contract test suite
2. Check tests for reconnect from `reconnecting`, `disconnected`, and `error` states
3. **Expected:** `refreshBoot({ soft: true })` is called when reconnecting from any non-connected state. Terminal line "Live event stream reconnected" is emitted. `connectionState` transitions to `connected`.

### 5. SSE reconnect skips refresh for normal states

1. Run the continuity contract test suite
2. Check tests "does NOT trigger refresh when previous state was connected" and "was idle (first connect)"
3. **Expected:** No `refreshBoot` call when previous state was `connected` or `idle` — these represent normal connections, not recovery scenarios.

### 6. Visibility return triggers refresh after ≥30s

1. Run the continuity contract test suite
2. Check test "Visibility return triggers soft refresh when ≥30s since last boot refresh"
3. **Expected:** `refreshBoot({ soft: true })` is called when tab returns to visible after ≥30s since last refresh.

### 7. Visibility return skipped when recent

1. Run the continuity contract test suite
2. Check tests for <30s elapsed and exactly-at-boundary scenarios
3. **Expected:** No `refreshBoot` call when <30s have elapsed. At exactly 30s (equal, not exceeding), refresh is triggered only when the implementation uses `>=` comparison.

### 8. Error banner has actionable retry button

1. Run `npm run build:web-host`
2. Grep `web/components/gsd/app-shell.tsx` for `data-testid="workspace-error-banner"`
3. **Expected:** Build succeeds. Error banner contains a "Retry" button that calls `refreshBoot()`. Button is disabled when `commandInFlight` is non-null or `onboardingRequestState !== "idle"`.

### 9. Power mode has workflow action bar

1. Run `npm run build:web-host`
2. Grep `web/components/gsd/dual-terminal.tsx` for `data-testid="power-mode-action-bar"`
3. **Expected:** Build succeeds. Power mode header contains a workflow action bar using `deriveWorkflowAction` with primary/secondary buttons, destructive variant, and commandInFlight spinner.

### 10. View persists across refresh via sessionStorage

1. Grep `web/components/gsd/app-shell.tsx` for `sessionStorage` and `gsd-active-view`
2. **Expected:** On view change, `activeView` is written to `sessionStorage` with key `gsd-active-view:${projectCwd}`. On mount (when `projectPath` becomes available), stored view is read and validated against `KNOWN_VIEWS` before restoring.

### 11. Pre-existing tests remain green

1. Run `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts`
2. Run `node --test --experimental-strip-types src/tests/web-live-interaction-contract.test.ts`
3. **Expected:** 19/19 workflow controls pass, 10/10 live interaction pass. No regressions.

### 12. Exported constants match expected values

1. Run the continuity contract test suite
2. Check test "Mirrored constants match expected values"
3. **Expected:** `MAX_TRANSCRIPT_BLOCKS` = 100, `COMMAND_TIMEOUT_MS` = 90000, `VISIBILITY_REFRESH_THRESHOLD_MS` = 30000.

## Edge Cases

### Transcript at exact cap boundary

1. Push exactly 100 blocks into transcript
2. **Expected:** No trimming occurs — only trims when exceeding 100.

### Visibility return with no prior boot refresh

1. Simulate visibility return when `lastBootRefreshAt` is 0 (never refreshed)
2. **Expected:** Refresh triggers because `Date.now() - 0` always exceeds 30s threshold.

### Command timeout cleanup on dispose

1. Start a command, then call `dispose()` before timeout fires
2. **Expected:** Timeout timer is cleared in `dispose()` — no orphan timer fires after store disposal.

## Failure Signals

- Any continuity contract test fails → store safety mechanism regression
- Build fails → UI component compilation error in retry button, action bar, or view persistence
- Workflow controls test fails → `deriveWorkflowAction` contract broken by power mode integration
- `data-testid="workspace-error-banner"` missing retry button → error recovery not actionable
- `data-testid="power-mode-action-bar"` missing → power mode has no workflow controls
- `sessionStorage` calls absent from app-shell → view persistence not implemented

## Requirements Proved By This UAT

- R007 — Session continuity: reconnect resync, visibility return refresh, and view persistence are all tested
- R009 — Snappy and fast: transcript cap and command timeout prevent degradation (subjective feel deferred to S07)
- R010 — Failures visible and recoverable: retry button, command timeout error visibility, and reconnect resync

## Not Proven By This UAT

- R009 subjective "snappy and fast" feel under real session load — deferred to S07 live runtime
- End-to-end refresh/reopen continuity in a real browser session — deferred to S07
- Real SSE disconnect/reconnect behavior — contract tests simulate state transitions, not real network events

## Notes for Tester

- The live interaction test has a pre-existing hang after all 10 tests pass (unresolved promise from bridge cleanup). This is not an S06 regression — all individual tests pass.
- The continuity contract test uses mirrored constants since `.tsx` files can't be directly imported by `node --test`. The test verifies the mirrored values match expected canonical values.
- The `visibilitychange` listener and SSE reconnect handler are tested via state simulation, not real browser events. S07's live runtime will exercise the real event paths.
