---
estimated_steps: 5
estimated_files: 2
---

# T01: Extend workspace store with live interaction state and contract test

**Slice:** S03 — Live terminal + focused prompt handling
**Milestone:** M001

## Description

The workspace store currently flattens all SSE events to summary terminal lines and has no typed state for UI requests, transcript streaming, steer, abort, or fire-and-forget extension methods. This task extends the store with structured live-interaction state and validates the full lifecycle through a contract test using the existing FakeRpcChild test infrastructure.

## Steps

1. **Add typed live-interaction state to WorkspaceStoreState.** Add fields: `pendingUiRequests` (ordered array of typed UI request objects keyed by `id` and discriminated by `method`), `streamingAssistantText` (current in-progress assistant text string, reset on turn boundaries), `liveTranscript` (array of completed assistant text blocks), `activeToolExecution` (`{ id, name } | null`), `statusTexts` (Record keyed by status key), `widgetContents` (Record keyed by widget key, with content and optional placement), `titleOverride` (string or null), `editorTextBuffer` (string or null). Initialize all to empty/null in `createInitialState`.

2. **Replace the loose `ExtensionUiRequestEvent` type with a discriminated union.** Currently `method: string` with `[key: string]: unknown`. Replace with a union that matches the authoritative `RpcExtensionUIRequest` type from `rpc-types.ts` — preserving typed payloads for `select` (options, allowMultiple), `confirm` (message), `input` (message, prefill, placeholder), `editor` (title, prefill), `notify` (message, notifyType), `setStatus` (key, text), `setWidget` (key, lines, placement), `setTitle` (title), and `set_editor_text` (text). The `WorkspaceEvent` union should still accept unrecognized event types gracefully.

3. **Extend `handleEvent` to route events into structured state.** For `extension_ui_request`: classify by method. Blocking methods (`select`, `confirm`, `input`, `editor`) push into `pendingUiRequests`. Fire-and-forget methods update their respective state maps (`statusTexts`, `widgetContents`, `titleOverride`, `editorTextBuffer`). `notify` still produces a terminal line (keep existing behavior) but also updates structured state. For `message_update`: append `assistantMessageEvent` text deltas to `streamingAssistantText`. For `agent_end` / `turn_end`: move `streamingAssistantText` into `liveTranscript` and reset it. For `tool_execution_start`: set `activeToolExecution`. For `tool_execution_end`: clear it. Keep existing summary-line behavior for events that already produce terminal lines — the new state is additive, not a replacement.

4. **Add store actions for UI response, steer, and abort.** `respondToUiRequest(id, response)`: post `extension_ui_response` via the existing `sendCommand` mechanism, remove the matching request from `pendingUiRequests` on success. `dismissUiRequest(id)`: post `extension_ui_response` with `cancelled: true`, remove from queue. `sendSteer(message)`: post `{ type: "steer", message }` command. `sendAbort()`: post `{ type: "abort" }` command. All actions should set/clear `commandInFlight` appropriately and produce terminal lines on error.

5. **Write contract test `src/tests/web-live-interaction-contract.test.ts`.** Reuse the FakeRpcChild test pattern from `web-bridge-contract.test.ts`. Test cases: (a) SSE emits `extension_ui_request` with `method: "select"` → request appears in `pendingUiRequests` with typed options/allowMultiple. (b) Multiple concurrent UI requests queue correctly keyed by id. (c) Responding to a request posts `extension_ui_response` with correct id and value to the bridge, then removes it from pending. (d) Dismissing a request posts `cancelled: true` and removes from pending. (e) SSE emits `message_update` with text delta → `streamingAssistantText` accumulates. (f) SSE emits `agent_end` → streaming text moves to transcript, streaming text resets. (g) `setStatus`/`setWidget`/`setTitle`/`set_editor_text` fire-and-forget events update the correct store state. (h) `steer` and `abort` commands post the correct RPC command type.

## Must-Haves

- [ ] `pendingUiRequests` stores typed UI requests keyed by id with discriminated method types
- [ ] Blocking UI requests (`select`, `confirm`, `input`, `editor`) are queued; fire-and-forget methods update state maps
- [ ] `message_update` events accumulate streaming text; turn boundaries move it to transcript
- [ ] `respondToUiRequest` posts `extension_ui_response` via command route and clears the pending request
- [ ] `sendSteer` and `sendAbort` post the correct RPC command types
- [ ] Contract test passes all assertions
- [ ] Existing bridge and onboarding contract tests still pass

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-live-interaction-contract.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts`

## Observability Impact

- Signals added/changed: store snapshot now exposes `pendingUiRequests`, `streamingAssistantText`, `liveTranscript`, `activeToolExecution`, `statusTexts`, `widgetContents`, `titleOverride`, `editorTextBuffer`
- How a future agent inspects this: read store state directly or check `web-live-interaction-contract.test.ts` for the expected shapes and lifecycle
- Failure state exposed: UI response errors surface as `lastClientError` and terminal error lines; timed-out requests remain in `pendingUiRequests` until explicitly dismissed

## Inputs

- `web/lib/gsd-workspace-store.tsx` — current store with summary-only event handling
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — authoritative protocol types for UI requests and responses
- `src/tests/web-bridge-contract.test.ts` — test infrastructure pattern (FakeRpcChild, JSON line reader, route imports)
- `src/web/bridge-service.ts` — bridge event forwarding and command routing

## Expected Output

- `web/lib/gsd-workspace-store.tsx` — extended with typed live-interaction state, structured event routing, and new actions
- `src/tests/web-live-interaction-contract.test.ts` — contract test covering the full UI request lifecycle, transcript streaming, and command forwarding
