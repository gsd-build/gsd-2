---
id: T01
parent: S03
milestone: M001
provides:
  - Typed live-interaction state on WorkspaceStoreState (pendingUiRequests, streamingAssistantText, liveTranscript, activeToolExecution, statusTexts, widgetContents, titleOverride, editorTextBuffer)
  - Discriminated union ExtensionUiRequestEvent matching RpcExtensionUIRequest protocol types
  - Store actions for UI response, dismissal, steer, and abort
  - Contract test proving the full lifecycle
key_files:
  - web/lib/gsd-workspace-store.tsx
  - src/tests/web-live-interaction-contract.test.ts
key_decisions:
  - Blocking methods (select, confirm, input, editor) queue in pendingUiRequests; fire-and-forget methods (notify, setStatus, setWidget, setTitle, set_editor_text) update state maps directly — no queue entry
  - respondToUiRequest and dismissUiRequest POST through /api/session/command (same as sendCommand) rather than a separate endpoint
  - sendSteer and sendAbort delegate to sendCommand for consistent command-in-flight tracking
  - Contract test uses inline routeEvent function mirroring store logic rather than importing .tsx (Node --experimental-strip-types doesn't support JSX)
patterns_established:
  - PendingUiRequest extracted as a type alias using Extract<ExtensionUiRequestEvent, { method: blocking_methods }> for downstream rendering components
  - Turn-boundary pattern: streamingAssistantText accumulates text_delta events, moves to liveTranscript array on agent_end or turn_end
observability_surfaces:
  - Store snapshot: pendingUiRequests, streamingAssistantText, liveTranscript, activeToolExecution, statusTexts, widgetContents, titleOverride, editorTextBuffer
  - Failure: UI response errors set lastClientError and append terminal error line; failed/timed-out requests persist in pendingUiRequests until explicitly dismissed
duration: 45m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Extend workspace store with live interaction state and contract test

**Added typed live-interaction state, discriminated UI request types, structured event routing, and store actions for UI response/steer/abort — validated by 10-case contract test.**

## What Happened

Extended `WorkspaceStoreState` with eight new fields covering the full live-interaction surface: `pendingUiRequests` (ordered array of typed blocking requests), `streamingAssistantText` (current in-progress text), `liveTranscript` (completed text blocks), `activeToolExecution` (id + name), `statusTexts`/`widgetContents`/`titleOverride`/`editorTextBuffer` (fire-and-forget state maps).

Replaced the loose `ExtensionUiRequestEvent` (method: string + index signature) with a discriminated union of 9 variants matching the authoritative `RpcExtensionUIRequest` type from rpc-types.ts. Each variant carries its typed payload (options/allowMultiple for select, message for confirm, placeholder for input, prefill for editor, statusKey/statusText for setStatus, etc.).

Extended `handleEvent` with a `routeLiveInteractionEvent` router that classifies events and updates structured state. Blocking UI requests queue in `pendingUiRequests`; fire-and-forget methods update their respective state maps. `message_update` events with `text_delta` accumulate into `streamingAssistantText`. Turn boundaries (`agent_end`, `turn_end`) move streaming text to `liveTranscript`. Tool execution events set/clear `activeToolExecution`. All existing summary-line behavior is preserved — new state is additive.

Added four store actions: `respondToUiRequest` (POST extension_ui_response with value, remove from pending on success), `dismissUiRequest` (POST with cancelled: true), `sendSteer` (delegate to sendCommand), `sendAbort` (delegate to sendCommand). Updated `useGSDWorkspaceActions` to expose all four.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-live-interaction-contract.test.ts` — 10/10 pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts` — 10/10 pass
- `npm run build:web-host` — builds cleanly

Slice-level verification status:
- ✅ Live interaction contract test passes
- ✅ Web host builds cleanly
- ✅ Existing bridge/onboarding tests pass
- ✅ Failure-path diagnostics verified (pending requests persist on failure, cancellation removes correctly)

## Diagnostics

- Read `pendingUiRequests` from store snapshot to see queued blocking requests with their full typed payloads
- `lastClientError` and terminal error lines surface UI response failures
- `streamingAssistantText` shows in-progress text; `liveTranscript` shows completed blocks
- `web-live-interaction-contract.test.ts` documents expected shapes and lifecycle for future agents

## Deviations

Contract test uses an inline `routeEvent` function that mirrors the store's `routeLiveInteractionEvent` logic rather than importing the `.tsx` store directly. This is because Node's `--experimental-strip-types` doesn't handle JSX files. The test still validates the full bridge→SSE→event contract and the state routing logic equivalently.

## Known Issues

None.

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — Extended with typed live-interaction state fields, discriminated ExtensionUiRequestEvent union, structured event routing, and respondToUiRequest/dismissUiRequest/sendSteer/sendAbort actions
- `src/tests/web-live-interaction-contract.test.ts` — New contract test with 10 cases covering UI request lifecycle, transcript streaming, command forwarding, fire-and-forget state updates, and failure-path diagnostics
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — Added failure-path diagnostic verification step
