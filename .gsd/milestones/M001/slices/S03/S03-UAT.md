# S03: Live terminal + focused prompt handling — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven contract tests + live-runtime spot-check)
- Why this mode is sufficient: The contract test validates the full data lifecycle (event routing, state mutations, command posting, failure paths) against the real bridge test infrastructure. The build proves the rendering components compile and mount. A live spot-check confirms the assembled pieces work visually in a running browser session.

## Preconditions

- `gsd --web` is able to start and serve the web workspace for a project with valid credentials (S01 + S02 complete)
- Node.js available with `--experimental-strip-types` support
- Project has been built at least once (`npm run build:web-host` succeeds)

## Smoke Test

Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-live-interaction-contract.test.ts` — all 10 cases pass. This confirms the store correctly routes events, queues UI requests, posts responses, accumulates transcript, and handles failures.

## Test Cases

### 1. Select UI request renders in focused panel

1. Start `gsd --web` for a project and open the browser workspace
2. Trigger an agent action that emits an `extension_ui_request` with method `select` (e.g. a multi-choice prompt from the agent)
3. **Expected:** The Sheet side panel opens automatically showing the select options as radio buttons (single) or checkboxes (allowMultiple). The panel title shows the request question. A submit button is visible.
4. Select an option and click submit
5. **Expected:** The panel closes, the selection is posted to the agent via `/api/session/command`, and the agent continues with the selected value

### 2. Confirm UI request renders and responds

1. Trigger an agent action that emits an `extension_ui_request` with method `confirm`
2. **Expected:** The focused panel opens showing the confirmation message with Confirm and Cancel buttons
3. Click Confirm
4. **Expected:** The response `{ value: true }` is posted, the panel closes, and the agent continues

### 3. Input UI request with placeholder

1. Trigger an agent action that emits an `extension_ui_request` with method `input`
2. **Expected:** The focused panel opens showing a text input field. If the request included a `placeholder`, it is shown in the field
3. Type a response and submit
4. **Expected:** The typed text is posted as the value, the panel closes, and the agent continues

### 4. Editor UI request with prefill

1. Trigger an agent action that emits an `extension_ui_request` with method `editor`
2. **Expected:** The focused panel opens showing a textarea. If the request included `prefill` text, it is pre-populated in the textarea. The request title is shown as a label
3. Edit the text and submit
4. **Expected:** The edited text is posted as the value, the panel closes, and the agent continues

### 5. Live streaming text appears in terminal

1. Send a prompt to the agent from the terminal input
2. **Expected:** As the agent responds, streaming text appears in the terminal's streaming section with a cursor animation indicating active output
3. Wait for the agent to finish responding
4. **Expected:** The streaming text moves to a completed transcript block (bordered section). The cursor animation stops. The streaming text area clears

### 6. Tool execution badge shows during tool use

1. Send a prompt that causes the agent to use a tool (e.g. "read package.json")
2. **Expected:** While the tool is executing, a badge in the terminal header shows the tool name (e.g. "read")
3. When the tool completes
4. **Expected:** The badge disappears

### 7. Abort stops the agent mid-run

1. Send a prompt that triggers a long agent response
2. While the agent is streaming, click the abort button in the terminal chrome
3. **Expected:** The abort command is posted via `/api/session/command`, the agent stops responding, and the streaming text area reflects the interrupted state

### 8. Steer redirects the agent

1. Send a prompt that triggers agent streaming
2. While the agent is streaming, click the steer toggle
3. **Expected:** The terminal input switches to steer mode (visual indicator changes)
4. Type a steer message and submit
5. **Expected:** The steer command is posted via `/api/session/command` and the agent adjusts its response based on the steer input

### 9. Multiple concurrent UI requests show queue badge

1. Trigger two blocking UI requests in rapid succession (e.g. two `select` requests before responding to the first)
2. **Expected:** The focused panel shows the first request. A badge shows "2" indicating two pending requests
3. Respond to the first request
4. **Expected:** The panel immediately shows the second request. The badge disappears (or shows "1")

### 10. Dismiss/cancel a UI request

1. Trigger a blocking UI request (any method)
2. Instead of submitting, click the overlay backdrop or press Escape
3. **Expected:** The request is dismissed with `{ cancelled: true }` posted to the agent. The panel closes. The agent handles the cancellation

## Edge Cases

### UI response failure surfaces as error

1. Trigger a blocking UI request
2. Simulate or cause a network failure on the response POST (e.g. kill the bridge mid-response)
3. **Expected:** `lastClientError` is set in the store, an error line appears in the terminal, and the pending request remains visible in the focused panel (not silently removed)

### Fire-and-forget events update status without panel

1. Trigger an agent action that emits `setStatus`, `setWidget`, `setTitle`, or `set_editor_text` events
2. **Expected:** No focused panel opens. The respective store state maps (`statusTexts`, `widgetContents`, `titleOverride`, `editorTextBuffer`) are updated. Status text surfaces wherever consumed downstream

### Steer toggle resets when streaming stops

1. Enable steer toggle while the agent is streaming
2. Wait for the agent to finish
3. **Expected:** The steer toggle resets to off. The input mode returns to prompt/follow_up

## Failure Signals

- Focused panel does not open when a blocking UI request is emitted — check `pendingUiRequests` in store snapshot
- Terminal shows no streaming text during agent response — check `streamingAssistantText` in store snapshot and SSE event delivery
- Abort/steer buttons not visible during streaming — check `isStreaming` session state
- UI response POST fails silently — check `lastClientError` in store snapshot and terminal error lines
- Contract test failures — check `web-live-interaction-contract.test.ts` output for specific assertion failures

## Requirements Proved By This UAT

- R006 — Agent interruptions (select, confirm, input, editor) are handled in a focused web panel with typed rendering, multi-request queue, and dismiss/cancel support
- R004 (partial) — Live terminal can send prompts, stream agent output, steer, and abort — but full end-to-end workflow completion is proven in S07
- R005 (partial) — Terminal and focused panel are wired to real store state rather than mock data — but dashboard/roadmap/files/activity surfaces are proven in S04

## Not Proven By This UAT

- Full end-to-end GSD workflow completion in-browser (R004 — closes in S07)
- Real view-model wiring for dashboard, roadmap, files, activity (R005 — closes in S04)
- Session continuity across refresh/reopen (R007 — closes in S06)
- Failure visibility for bridge disconnects and recovery (R010 — partial here, closes in S06)
- Performance under sustained streaming load (R009 — spot-checked here, formally closes in S06)

## Notes for Tester

- The contract test (smoke test) validates the data lifecycle rigorously — the live spot-check is primarily about visual/interaction quality
- The steer and abort buttons only appear when the agent is actively streaming — you need an in-progress response to test them
- Multiple concurrent UI requests require triggering two blocking requests before responding to the first — this is easier to test via the contract test than manually
- Fire-and-forget state maps (statusTexts, widgetContents) are populated but don't have dedicated rendering components yet — verify via store inspection, not visual output
