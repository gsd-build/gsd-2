---
id: T01
parent: S06
milestone: M001
provides:
  - transcript cap (100 blocks) preventing unbounded memory growth
  - command timeout (90s) clearing stuck commandInFlight with error visibility
  - SSE reconnect triggers soft refreshBoot to resync drifted state
  - visibilitychange listener triggers soft refreshBoot on tab return after ≥30s
key_files:
  - web/lib/gsd-workspace-store.tsx
  - src/tests/web-continuity-contract.test.ts
key_decisions:
  - Exported constants (MAX_TRANSCRIPT_BLOCKS, COMMAND_TIMEOUT_MS, VISIBILITY_REFRESH_THRESHOLD_MS) so downstream code can reference them
  - Command timeout mutates state directly via setTimeout callback (mirrors store's patchState pattern)
  - Visibility listener installed in start() and removed in dispose() for clean lifecycle
patterns_established:
  - Inline-routing contract test pattern for store continuity mechanisms (mirrors S03/S05 pattern with mirrored constants since .tsx can't be directly imported by node --test)
observability_surfaces:
  - Terminal error line "Command timed out — controls re-enabled" on stuck command
  - lastClientError set on command timeout for programmatic inspection
  - Terminal success line "Live event stream reconnected" on SSE reconnect
  - refreshBoot({ soft: true }) called on reconnect and visibility return for state resync
duration: 15m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Harden store continuity and add safety caps

**Added four safety mechanisms to the workspace store: transcript cap, command timeout, reconnect resync, and visibility-return refresh**

## What Happened

Implemented all four continuity/safety mechanisms in `GSDWorkspaceStore`:

1. **Transcript cap** — `MAX_TRANSCRIPT_BLOCKS = 100`. In `handleTurnBoundary`, after appending the new block, slices from the front if the array exceeds the cap. This prevents unbounded memory growth in long sessions.

2. **Command timeout** — When `sendCommand` sets `commandInFlight`, a 90-second `setTimeout` starts. If it fires before the command completes, it clears `commandInFlight`, sets `lastClientError`, and emits an error terminal line "Command timed out — controls re-enabled". The timer is cleared in the `finally` block on normal completion. The timer handle and cleanup are managed via `clearCommandTimeout()` helper, also called in `dispose()`.

3. **Reconnect resync** — In `ensureEventStream`'s `onopen` handler, if the previous stream state was `reconnecting`, `disconnected`, or `error`, calls `void this.refreshBoot({ soft: true })` after setting `connectionState` to `connected`. This resyncs boot/bridge/session state that may have drifted while disconnected.

4. **Visibility return refresh** — A `visibilitychange` listener is installed in `start()` and removed in `dispose()`. Tracks `lastBootRefreshAt` (set at the top of `refreshBoot`). On visibility return, if ≥30s have elapsed since the last refresh, triggers `refreshBoot({ soft: true })`.

Wrote 14-case contract test covering all four mechanisms plus edge cases (boundary conditions, normal completion clearing timer, idle/connected state not triggering refresh).

## Verification

- `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — 14/14 pass ✔
- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — 19/19 pass ✔
- `node --test --experimental-strip-types src/tests/web-live-interaction-contract.test.ts` — 10/10 pass ✔ (file-level cleanup hang is pre-existing)

## Diagnostics

- **Command timeout**: check `commandInFlight` in store snapshot — if non-null for >90s something is wrong. Look for "Command timed out" in terminal lines. `lastClientError` will contain the timeout message.
- **Transcript growth**: check `liveTranscript.length` — should never exceed 100.
- **Reconnect resync**: look for "Live event stream reconnected" terminal line followed by a boot refresh.
- **Visibility refresh**: `lastBootRefreshAt` (private field) tracks when the last refresh occurred. Refresh is skipped if <30s have passed.

## Deviations

- Constants are exported from the store but the test mirrors them inline instead of importing from `.tsx` — node's `--experimental-strip-types` doesn't handle `.tsx` files. The test verifies the mirrored values match expected canonical values.
- Simplified the `onopen` handler — removed the redundant ternary chain (`nextState` was always `"connected"` regardless of input) and replaced with a direct assignment.

## Known Issues

- `web-live-interaction-contract.test.ts` has a pre-existing file-level hang after all tests pass (unresolved promise from bridge cleanup). All 10 individual tests pass. Not introduced by this task.

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — added transcript cap, command timeout, reconnect resync, visibility listener, exported constants
- `src/tests/web-continuity-contract.test.ts` — new contract test with 14 cases covering all four mechanisms
- `.gsd/milestones/M001/slices/S06/S06-PLAN.md` — added diagnostic verification step to slice verification
