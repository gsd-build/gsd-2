---
id: T02
parent: S03
milestone: M001
provides:
  - FocusedPanel component rendering blocking UI requests (select, confirm, input, editor) in a Sheet side panel
  - Terminal with live streaming text, completed transcript blocks, tool execution badge, steer toggle, and abort button
  - FocusedPanel globally mounted in app-shell alongside OnboardingGate
key_files:
  - web/components/gsd/focused-panel.tsx
  - web/components/gsd/terminal.tsx
  - web/components/gsd/app-shell.tsx
key_decisions:
  - FocusedPanel uses Sheet (radix dialog) with auto-open controlled by pendingUiRequests.length > 0 — overlay click or escape while not submitting dismisses via dismissUiRequest
  - Terminal steer mode is a local toggle (not store state) that resets when streaming stops — steer is an ephemeral input context, not a persistent mode
  - Completed liveTranscript blocks render as bordered sections below terminal lines; streamingAssistantText renders as a live block with cursor animation
  - Input mode auto-switches between prompt/follow_up/steer based on session streaming state and local steer toggle
patterns_established:
  - RequestBody dispatcher component pattern — switches on request.method to render typed sub-renderers (SelectRenderer, ConfirmRenderer, InputRenderer, EditorRenderer) with proper form handling
  - Terminal streaming area is additive to existing terminal lines — system/status events still produce lines, streaming text gets its own visual section
observability_surfaces:
  - Store snapshot: pendingUiRequests (array length = panel open state), streamingAssistantText, liveTranscript, activeToolExecution
  - Terminal UI: data-testid="focused-panel" for panel, data-testid="terminal-streaming-text" for streaming area, data-testid="terminal-tool-badge" for active tool, data-testid="terminal-abort-button" for abort, data-testid="terminal-steer-toggle" for steer
  - Failure: UI response errors surface as lastClientError and terminal error lines; commandInFlight === "extension_ui_response" during in-flight requests
duration: 25m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Build focused panel component and wire terminal streaming + controls

**Built the FocusedPanel side panel for blocking UI requests and extended the terminal with live streaming text, tool execution badge, steer toggle, and abort button — all wired to the T01 store actions.**

## What Happened

Created `focused-panel.tsx` with four typed sub-renderers matching the blocking UI request methods: `select` (radio buttons for single, checkboxes for multi with count badge), `confirm` (message display with Confirm/Cancel), `input` (text field with placeholder), and `editor` (textarea with prefill). Each renderer calls `respondToUiRequest` on submit and `dismissUiRequest` on cancel. The Sheet auto-opens when `pendingUiRequests.length > 0` and shows a queue count badge when multiple requests are pending. Submit state disables all controls via `commandInFlight === "extension_ui_response"`.

Mounted `FocusedPanel` globally in `app-shell.tsx` alongside `OnboardingGate` — it renders independently of the active view as a global overlay.

Extended `terminal.tsx` with: (1) live streaming section showing `streamingAssistantText` from the store with a cursor animation while text is accumulating; (2) completed `liveTranscript` blocks rendered as bordered sections below terminal lines; (3) `activeToolExecution` badge in the terminal header showing the running tool name; (4) abort button visible when the agent is streaming, wired to `sendAbort()`; (5) steer toggle button that switches the input mode to "steer" and sends via `sendSteer()` instead of `sendCommand()`. The input mode auto-switches between prompt/follow_up/steer based on session state and the local steer toggle.

## Verification

- `npm run build:web-host` — builds cleanly (Next.js 16.1.6 Turbopack, static pages generated, standalone staged)
- `web-live-interaction-contract.test.ts` — 14/14 pass (UI request lifecycle, transcript streaming, steer/abort, fire-and-forget state, failure paths)
- `web-bridge-contract.test.ts` — 4/4 pass
- `web-onboarding-contract.test.ts` — 6/6 pass (API key validation, unlock flow, bridge refresh)

Slice-level verification status:
- ✅ Live interaction contract test passes
- ✅ Web host builds cleanly with focused panel and terminal controls
- ✅ Existing bridge/onboarding tests pass
- ✅ Failure-path diagnostics verified (from T01)

## Diagnostics

- `pendingUiRequests` array in store snapshot — length indicates whether focused panel is open, each entry carries typed payload for inspection
- `data-testid="focused-panel"` — panel DOM presence confirms rendering
- `data-testid="terminal-streaming-text"` — streaming text section visibility
- `data-testid="terminal-abort-button"` — abort button visibility when agent is active
- `data-testid="terminal-steer-toggle"` — steer toggle visibility when agent is streaming
- `data-testid="terminal-tool-badge"` — active tool execution badge
- `lastClientError` and terminal error lines surface UI response failures

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/focused-panel.tsx` — New component rendering blocking UI requests (select, confirm, input, editor) in a Sheet side panel with typed sub-renderers and queue badge
- `web/components/gsd/terminal.tsx` — Extended with live streaming text section, completed transcript blocks, tool execution badge, steer toggle, abort button, and auto-switching input mode
- `web/components/gsd/app-shell.tsx` — Added FocusedPanel import and mount alongside OnboardingGate
- `.gsd/milestones/M001/slices/S03/tasks/T02-PLAN.md` — Added Observability Impact section
