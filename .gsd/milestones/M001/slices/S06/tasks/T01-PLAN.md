---
estimated_steps: 6
estimated_files: 2
---

# T01: Harden store continuity and add safety caps

**Slice:** S06 — Power mode + continuity + failure visibility
**Milestone:** M001

## Description

The workspace store reconnects SSE automatically (browser `EventSource` behavior) but doesn't resync any state on reconnect — so a bridge restart or session change during a disconnect leaves the UI stale. There's no recovery when a tab is backgrounded for a long time. `commandInFlight` can get permanently stuck if a command response never arrives (S05 flagged this). `liveTranscript` grows unboundedly (S03 flagged this). This task adds four safety mechanisms to the store and proves them with a contract test.

## Steps

1. Add `MAX_TRANSCRIPT_BLOCKS = 100` constant. In `handleTurnBoundary`, slice `liveTranscript` from the front when it exceeds the cap after appending.
2. Add a command timeout mechanism: when `commandInFlight` is set in `sendCommand`, start a 90-second timer. If the timer fires before `commandInFlight` is cleared, set it to `null`, log an error terminal line "Command timed out — controls re-enabled", and set `lastClientError`. Clear the timer in `finally` when a command completes normally. Store the timer handle as a private field. Clean up in `dispose()`.
3. In `ensureEventStream`'s `onopen` handler: when the previous stream state was `reconnecting`, `disconnected`, or `error`, call `void this.refreshBoot({ soft: true })` after setting `connectionState` to `connected`. This resyncs boot/bridge/session state that may have changed while disconnected.
4. Add a `visibilitychange` listener in `start()`. Track `lastBootRefreshAt` as a private timestamp field (set in `refreshBoot` on entry). On `visibilitychange` with `document.visibilityState === 'visible'`, if at least 30 seconds have elapsed since `lastBootRefreshAt`, call `void this.refreshBoot({ soft: true })`. Remove the listener in `dispose()`.
5. Write `src/tests/web-continuity-contract.test.ts` following the established inline-routing pattern from S03/S05 tests. Test cases:
   - Transcript cap: push 110 blocks, verify length ≤ 100 and oldest blocks are dropped
   - Command timeout: simulate a stuck command, verify commandInFlight is cleared after timeout and error line is emitted
   - Reconnect triggers soft refresh: verify that an SSE reconnect from a non-connected state triggers a boot refresh call
   - Visibility return triggers soft refresh: verify that returning from ≥30s background triggers a boot refresh call
   - Visibility return skipped when recent: verify that returning from <30s background does not trigger a refresh
6. Run all pre-existing web tests to confirm no regressions.

## Must-Haves

- [ ] `liveTranscript` is capped at 100 blocks, oldest dropped first
- [ ] `commandInFlight` is cleared after 90s timeout with error visibility
- [ ] SSE reconnect from non-connected state triggers `refreshBoot({ soft: true })`
- [ ] `visibilitychange` return from ≥30s background triggers `refreshBoot({ soft: true })`
- [ ] Contract test proves all four mechanisms
- [ ] Pre-existing tests remain green

## Verification

- `node --test --experimental-strip-types src/tests/web-continuity-contract.test.ts` — all tests pass
- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — still passes
- `node --test --experimental-strip-types src/tests/web-live-interaction-contract.test.ts` — still passes

## Observability Impact

- Signals added: terminal error line on command timeout, terminal success line on reconnect-triggered refresh (existing reconnect line), `lastClientError` set on timeout
- How a future agent inspects this: check `commandInFlight` in store snapshot for stuck state, check `liveTranscript.length` for growth, check terminal lines for timeout/reconnect events
- Failure state exposed: stuck `commandInFlight` now self-heals with visible error; stale-after-reconnect now self-heals with soft refresh

## Inputs

- `web/lib/gsd-workspace-store.tsx` — the singleton store class with `handleTurnBoundary`, `ensureEventStream`, `sendCommand`, `start`, `dispose`
- S03 forward intelligence: `liveTranscript` unbounded growth warning, `commandInFlight` concurrency note
- S05 forward intelligence: `commandInFlight` can leave controls permanently disabled, `refreshBoot` after session switch has no error handling

## Expected Output

- `web/lib/gsd-workspace-store.tsx` — updated with transcript cap, command timeout, reconnect refresh, and visibility listener
- `src/tests/web-continuity-contract.test.ts` — new contract test with ≥5 cases covering the four mechanisms
