# S03: Live terminal + focused prompt handling

**Goal:** The browser can send prompts, stream live agent output, and answer agent questions/confirmations/editor requests in a focused panel without TUI fallback.
**Demo:** Start a GSD session from the browser, see live assistant text streaming in the terminal, trigger an `extension_ui_request` (select, confirm, input, or editor), answer it in the focused side panel, and verify the response reaches the agent. Use steer to redirect and abort to stop the agent mid-run — all from the browser.

## Must-Haves

- The workspace store has typed state for pending UI requests (keyed by request id), live streaming transcript, and steer/abort actions
- SSE events (`extension_ui_request`, `message_update`, `tool_execution_*`) are routed into structured store state, not flattened to summary strings
- Blocking UI requests (`select`, `confirm`, `input`, `editor`) render in a focused side panel using the existing Sheet primitive
- The browser can respond to UI requests by posting `extension_ui_response` through the existing command route
- The terminal renders live assistant text from streaming events and supports steer and abort commands
- Multiple concurrent UI requests are supported (queued by id), not a single global prompt
- Fire-and-forget methods (`notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`) update store state for later rendering
- Contract tests prove the UI request lifecycle (queue → respond → clear) and transcript streaming through the store

## Proof Level

- This slice proves: integration
- Real runtime required: no (contract tests against the existing bridge test infrastructure prove the data lifecycle; rendering is verified by the contract test plus a build pass)
- Human/UAT required: no (but recommended spot-check before S04)

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-live-interaction-contract.test.ts` — passes all assertions for UI request lifecycle, transcript streaming, steer/abort commands, and fire-and-forget state updates
- `npm run build:web-host` — the web host builds cleanly with the new store state, focused panel component, and terminal controls
- Existing bridge/onboarding tests still pass: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts`
- Failure-path diagnostics: contract test verifies that `respondToUiRequest` errors surface as `lastClientError` and terminal error lines, and that stale/cancelled requests are correctly removed from `pendingUiRequests`

## Observability / Diagnostics

- Runtime signals: `extension_ui_request` events are stored as typed pending requests with id, method, and full payload; `extension_ui_response` posts are observable via the existing command route; streaming text accumulation is inspectable via store state
- Inspection surfaces: store snapshot exposes `pendingUiRequests`, `liveTranscript`, `streamingAssistantText`, `statusTexts`, `widgetContents`; existing `/api/boot` and `/api/session/events` surfaces unchanged
- Failure visibility: UI response failures surface as terminal error lines and `lastClientError`; timed-out or cancelled requests become visible in the pending queue state
- Redaction constraints: UI request payloads may contain user text — store captures them for rendering but does not echo them into persistent logs

## Integration Closure

- Existing code surfaces consumed: `src/web/bridge-service.ts` (SSE event forwarding, command route), `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` (authoritative RPC type definitions), `web/components/ui/sheet.tsx` (side panel primitive), `web/components/gsd/onboarding-gate.tsx` (focused-input UX patterns)
- New wiring introduced in this slice: focused panel mounted in app-shell, terminal gains streaming transcript + steer/abort, store gains typed live-interaction state and actions
- What remains before the milestone is truly usable end-to-end: S04 (real view-model wiring for dashboard/roadmap/files/activity), S05 (start/resume workflow controls), S06 (continuity + failure visibility), S07 (final assembly proof)

## Tasks

- [x] **T01: Extend workspace store with live interaction state and contract test** `est:3h`
  - Why: The store currently flattens all SSE events to summary strings and has no typed state for UI requests, transcript streaming, or steer/abort. Every rendering component in T02 depends on this state existing.
  - Files: `web/lib/gsd-workspace-store.tsx`, `src/tests/web-live-interaction-contract.test.ts`
  - Do: (1) Add typed state fields to WorkspaceStoreState: `pendingUiRequests` (Map by request id with discriminated method types), `liveTranscript` (accumulated assistant text blocks), `streamingAssistantText` (current in-progress text), `activeToolExecution` (name + id of running tool), `statusTexts` (keyed map), `widgetContents` (keyed map with placement), `titleOverride`, `editorTextBuffer`. (2) Replace the `ExtensionUiRequestEvent` loose-typed `method: string` with a discriminated union that preserves the protocol's type safety for select/confirm/input/editor/notify/setStatus/setWidget/setTitle/set_editor_text. (3) Extend `handleEvent` to route `extension_ui_request` events into the pending queue by method type — blocking methods queue, fire-and-forget methods update their respective state maps. Route `message_update` events to accumulate streaming assistant text. Route `tool_execution_start`/`tool_execution_end` into `activeToolExecution`. (4) Add store actions: `respondToUiRequest(id, response)` that posts `extension_ui_response` via the command route and removes the request from pending; `dismissUiRequest(id)` that posts a cancel response; `sendSteer(message)` and `sendAbort()` that post the corresponding RPC commands. (5) Write `src/tests/web-live-interaction-contract.test.ts` using the existing FakeRpcChild pattern from `web-bridge-contract.test.ts`: verify UI request queuing from SSE events, response posting via command route, transcript accumulation from message_update events, steer/abort command forwarding, fire-and-forget state updates, and multi-request concurrent handling.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-live-interaction-contract.test.ts`
  - Done when: contract test passes, store has typed live-interaction state, and existing bridge/onboarding tests still pass

- [x] **T02: Build focused panel component and wire terminal streaming + controls** `est:3h`
  - Why: With the store owning typed state (T01), the browser needs rendering surfaces: a focused side panel for blocking UI requests, live streaming text in the terminal, and steer/abort controls. This is the visible half of the slice contract.
  - Files: `web/components/gsd/focused-panel.tsx` (new), `web/components/gsd/terminal.tsx`, `web/components/gsd/app-shell.tsx`
  - Do: (1) Create `focused-panel.tsx` using the Sheet primitive. Read `pendingUiRequests` from the store. Render the first blocking request (select, confirm, input, or editor) in the sheet. For select: radio/checkbox list with allowMultiple support. For confirm: message display with confirm/cancel buttons. For input: text field with optional prefill. For editor: textarea with prefill and title. On submit, call `respondToUiRequest`. On cancel/dismiss, call `dismissUiRequest`. Show a badge/count when multiple requests are queued. Reuse onboarding-gate patterns for progress, disabled/busy handling, and layout. (2) Mount `FocusedPanel` in `app-shell.tsx` alongside `OnboardingGate`. The panel should auto-open when blocking requests exist and close when none remain. (3) Extend `terminal.tsx`: replace the static summary lines with live streaming text from `streamingAssistantText` and `liveTranscript`. Show `activeToolExecution` as a running-tool indicator. Add a steer button (or keyboard shortcut hint) and an abort button in the terminal chrome when the agent is streaming. Wire them to the store's `sendSteer` and `sendAbort` actions. (4) Verify `npm run build:web-host` passes with all new components.
  - Verify: `npm run build:web-host` passes; existing contract tests still pass; the focused panel, terminal streaming, and steer/abort controls are present in the built output
  - Done when: the web host builds cleanly, the focused panel renders blocking UI requests from store state, the terminal shows streaming text and steer/abort controls, and the full verification suite passes

## Files Likely Touched

- `web/lib/gsd-workspace-store.tsx`
- `web/components/gsd/focused-panel.tsx` (new)
- `web/components/gsd/terminal.tsx`
- `web/components/gsd/app-shell.tsx`
- `src/tests/web-live-interaction-contract.test.ts` (new)
