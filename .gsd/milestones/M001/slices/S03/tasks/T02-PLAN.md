---
estimated_steps: 4
estimated_files: 4
---

# T02: Build focused panel component and wire terminal streaming + controls

**Slice:** S03 — Live terminal + focused prompt handling
**Milestone:** M001

## Description

With the store owning typed live-interaction state (T01), the browser needs rendering surfaces. This task builds a focused side panel for blocking UI requests, replaces the terminal's static summary lines with live streaming text, and adds steer/abort controls to the terminal chrome.

## Steps

1. **Create `web/components/gsd/focused-panel.tsx`.** Use the existing Sheet primitive (`web/components/ui/sheet.tsx`). Read `pendingUiRequests` from the workspace store. Auto-open the sheet when one or more blocking requests exist; close when none remain. Render the first blocking request by method type: `select` → radio buttons (single) or checkboxes (allowMultiple) with options list and submit; `confirm` → message text with Confirm/Cancel buttons; `input` → text field with optional prefill/placeholder and submit; `editor` → textarea with prefill, title, and submit. On submit, call `respondToUiRequest(id, response)` from store actions. On cancel/close, call `dismissUiRequest(id)`. Show a queued-request count badge when `pendingUiRequests.length > 1`. Reuse onboarding-gate patterns for disabled-during-submit state and layout structure.

2. **Mount `FocusedPanel` in `app-shell.tsx`.** Add it alongside `OnboardingGate` at the bottom of `WorkspaceChrome`. The panel should render independently of the active view — it is a global overlay like onboarding, not a view-specific surface.

3. **Extend `terminal.tsx` with streaming text and steer/abort controls.** Replace the current approach where all events become static lines with a hybrid: keep terminal lines for system/status events, but add a live streaming section that shows `streamingAssistantText` from the store with a typing indicator while streaming is active. Show `activeToolExecution` as a compact running-tool badge in the terminal header or streaming area. Add an abort button (visible when the agent is streaming/active) and a steer toggle/button in the terminal input area. Wire abort to `sendAbort()` and steer to `sendSteer(message)` from the store. The terminal input should auto-switch between prompt, follow_up, and steer based on session state. When the agent is idle, show completed `liveTranscript` blocks.

4. **Build verification.** Run `npm run build:web-host` and confirm the full web host compiles with the new components. Run the full test suite (`web-live-interaction-contract.test.ts`, `web-bridge-contract.test.ts`, `web-onboarding-contract.test.ts`) to confirm nothing regressed.

## Must-Haves

- [ ] Focused panel renders blocking UI requests (select, confirm, input, editor) from store state
- [ ] Panel auto-opens when blocking requests exist and closes when resolved
- [ ] UI responses flow through `respondToUiRequest` and `dismissUiRequest` store actions
- [ ] Terminal shows live streaming assistant text instead of only summary lines
- [ ] Abort button is visible and functional when agent is active
- [ ] Steer command is accessible from the terminal
- [ ] Web host builds cleanly with all new components

## Verification

- `npm run build:web-host`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-live-interaction-contract.test.ts src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts`

## Observability Impact

- **Focused panel lifecycle:** `pendingUiRequests` array length in store snapshot indicates whether the panel is open (length > 0) and how many requests are queued. Each request's `id` and `method` are inspectable.
- **UI response flow:** `respondToUiRequest` and `dismissUiRequest` set `commandInFlight: "extension_ui_response"` during POST, and errors surface as `lastClientError` and terminal error lines.
- **Streaming text:** `streamingAssistantText` in the store shows in-progress text accumulation. `liveTranscript` shows completed blocks. Both are directly inspectable from the store snapshot.
- **Tool execution badge:** `activeToolExecution` in store state shows the currently running tool's `id` and `name`, or null when idle.
- **Agent activity detection:** The terminal UI uses `boot.bridge.sessionState.isStreaming` to toggle between prompt/follow-up/steer input modes and to show/hide the abort button.
- **Failure inspection:** A future agent can read `lastClientError`, terminal error lines, and `pendingUiRequests` (stuck requests) to diagnose UI response failures.

## Inputs

- `web/lib/gsd-workspace-store.tsx` — T01 output with typed live-interaction state and actions
- `web/components/ui/sheet.tsx` — existing side panel primitive
- `web/components/gsd/onboarding-gate.tsx` — pattern reference for focused-input UX (progress, disabled states, layout)
- `web/components/gsd/app-shell.tsx` — global mount point for overlay surfaces
- `web/components/gsd/terminal.tsx` — current terminal component to extend

## Expected Output

- `web/components/gsd/focused-panel.tsx` — new component rendering blocking UI requests in a Sheet side panel
- `web/components/gsd/terminal.tsx` — extended with streaming text display, tool execution indicator, steer/abort controls
- `web/components/gsd/app-shell.tsx` — updated to mount FocusedPanel globally
- Clean `npm run build:web-host` output
