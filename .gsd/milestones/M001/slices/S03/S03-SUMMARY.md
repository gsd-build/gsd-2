---
id: S03
parent: M001
milestone: M001
provides:
  - Typed live-interaction state on WorkspaceStoreState (pendingUiRequests, streamingAssistantText, liveTranscript, activeToolExecution, statusTexts, widgetContents, titleOverride, editorTextBuffer)
  - Discriminated union ExtensionUiRequestEvent matching all 9 RPC extension UI request methods
  - Store actions for respondToUiRequest, dismissUiRequest, sendSteer, sendAbort
  - FocusedPanel component rendering blocking UI requests (select, confirm, input, editor) in a Sheet side panel
  - Terminal with live streaming text, completed transcript blocks, tool execution badge, steer toggle, abort button
  - Contract test proving the full UI request lifecycle, transcript streaming, command forwarding, and failure paths
requires:
  - slice: S01
    provides: Live bridge transport (SSE events, command route), current-project boot payload
  - slice: S02
    provides: Onboarding completion state and command gating
affects:
  - S04
  - S05
  - S06
  - S07
key_files:
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/focused-panel.tsx
  - web/components/gsd/terminal.tsx
  - web/components/gsd/app-shell.tsx
  - src/tests/web-live-interaction-contract.test.ts
key_decisions:
  - D015 — Blocking methods queue in pendingUiRequests; fire-and-forget methods update state maps directly
  - D016 — All UI responses route through the same /api/session/command endpoint
  - D017 — Steer is a local ephemeral toggle in the terminal, not store state
patterns_established:
  - PendingUiRequest type alias using Extract for blocking methods — consumed by focused panel sub-renderers
  - Turn-boundary pattern — streamingAssistantText accumulates text_delta events, moves to liveTranscript on agent_end/turn_end
  - RequestBody dispatcher — switches on request.method to render typed sub-renderers (SelectRenderer, ConfirmRenderer, InputRenderer, EditorRenderer)
  - Terminal streaming area is additive to existing terminal lines — system/status events still produce lines, streaming text gets its own visual section
observability_surfaces:
  - Store snapshot: pendingUiRequests, streamingAssistantText, liveTranscript, activeToolExecution, statusTexts, widgetContents, titleOverride, editorTextBuffer
  - DOM testids: focused-panel, terminal-streaming-text, terminal-tool-badge, terminal-abort-button, terminal-steer-toggle
  - Failure: lastClientError and terminal error lines surface UI response failures; stale/cancelled requests visible in pending queue
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
duration: 70m
verification_result: passed
completed_at: 2026-03-14
---

# S03: Live terminal + focused prompt handling

**Browser can now send prompts, stream live agent output, answer blocking UI requests in a focused side panel, and steer/abort the agent — all without TUI fallback.**

## What Happened

T01 extended the workspace store with typed live-interaction state. Eight new fields cover the full surface: `pendingUiRequests` (ordered array of typed blocking requests keyed by id), `streamingAssistantText` (current in-progress text), `liveTranscript` (completed text blocks), `activeToolExecution` (id + name), and four fire-and-forget state maps (`statusTexts`, `widgetContents`, `titleOverride`, `editorTextBuffer`). The loose `ExtensionUiRequestEvent` was replaced with a discriminated union of 9 variants matching the authoritative `RpcExtensionUIRequest` type. A `routeLiveInteractionEvent` router classifies SSE events and updates structured state — blocking UI requests queue, fire-and-forget methods update maps, `message_update` events accumulate streaming text, and turn boundaries (`agent_end`, `turn_end`) move streaming text to transcript. Four store actions (`respondToUiRequest`, `dismissUiRequest`, `sendSteer`, `sendAbort`) all route through the existing `/api/session/command` endpoint for consistent command-in-flight tracking.

T02 built the rendering surfaces. `FocusedPanel` uses the Sheet primitive with four typed sub-renderers: select (radio/checkbox with allowMultiple), confirm (message + buttons), input (text field with placeholder), and editor (textarea with prefill). The panel auto-opens when blocking requests exist and shows a queue badge for multiple pending requests. Submit state disables controls via `commandInFlight`. The terminal now renders live `streamingAssistantText` with a cursor animation, completed `liveTranscript` blocks as bordered sections, an `activeToolExecution` badge, an abort button during streaming, and a steer toggle that switches the input mode. Input mode auto-switches between prompt/follow_up/steer based on session state and the local toggle.

## Verification

- `web-live-interaction-contract.test.ts` — 10/10 pass (UI request lifecycle, transcript streaming, steer/abort commands, fire-and-forget state updates, failure-path diagnostics)
- `web-bridge-contract.test.ts` — 4/4 pass
- `web-onboarding-contract.test.ts` — 6/6 pass
- `npm run build:web-host` — builds cleanly with all new components (Next.js 16.1.6 Turbopack, static + dynamic routes, standalone staged)

## Requirements Advanced

- R006 — Agent interruptions are now handled in a focused web panel (select, confirm, input, editor) using the Sheet side panel, with typed sub-renderers and multi-request queue support
- R004 — Live terminal can now send prompts, stream agent output, and handle steer/abort — advancing the primary workflow toward full browser execution
- R005 — Terminal and focused panel are wired to real store state from SSE events rather than mock/static data
- R009 — Streaming text accumulation and cursor animation support snappy real-time feel
- R010 — UI response failures surface as lastClientError and terminal error lines; stale requests persist visibly in the pending queue

## Requirements Validated

- R006 — Contract test proves the full UI request lifecycle (queue → respond → clear), focused panel rendering for all 4 blocking methods, multi-request concurrent handling, and failure/cancellation paths. Build proves the components compile and mount in the app shell.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

Contract test uses an inline `routeEvent` function mirroring the store's `routeLiveInteractionEvent` logic rather than importing the `.tsx` store directly. Node's `--experimental-strip-types` doesn't handle JSX files. The test validates the same state-routing contract equivalently.

## Known Limitations

- Focused panel renders the first pending blocking request — additional queued requests show via badge count but are not individually navigable until the first is resolved
- Terminal steer toggle is ephemeral local state that resets when streaming stops — no persistence across component remounts
- Fire-and-forget surfaces (statusTexts, widgetContents, titleOverride, editorTextBuffer) have store state but no dedicated rendering components yet — those are wired in S04/S05

## Follow-ups

- S04 should consume `liveTranscript`, `activeToolExecution`, `statusTexts`, and `widgetContents` when wiring the activity/dashboard surfaces to real state
- S05 should consume the terminal's prompt/steer/abort surface for start/resume workflow controls
- S06 should add failure visibility for disconnected bridge state and request timeouts

## Files Created/Modified

- `web/lib/gsd-workspace-store.tsx` — Extended with typed live-interaction state, discriminated ExtensionUiRequestEvent union, structured event routing, and UI response/steer/abort actions
- `web/components/gsd/focused-panel.tsx` — New component rendering blocking UI requests in a Sheet side panel with typed sub-renderers and queue badge
- `web/components/gsd/terminal.tsx` — Extended with streaming text section, transcript blocks, tool badge, steer toggle, and abort button
- `web/components/gsd/app-shell.tsx` — Added FocusedPanel import and mount alongside OnboardingGate
- `src/tests/web-live-interaction-contract.test.ts` — New contract test with 10 cases covering the full live-interaction lifecycle

## Forward Intelligence

### What the next slice should know
- The store's `pendingUiRequests` is an ordered array, not a Map — iterate with index, look up by id with `.find()`
- `respondToUiRequest` and `dismissUiRequest` both POST through `/api/session/command` with `{ type: 'extension_ui_response', ... }` — the bridge treats these as regular commands
- Fire-and-forget state maps (`statusTexts`, `widgetContents`) are keyed by the extension's chosen key — the store doesn't namespace or scope them
- The `liveTranscript` array grows unboundedly within a session — S04/S06 should consider truncation or virtualization for long sessions

### What's fragile
- The inline `routeEvent` in the contract test mirrors the store's `routeLiveInteractionEvent` — if the store routing logic changes, the test must be manually synced
- `commandInFlight` is a single string, so rapid concurrent UI responses could collide if the bridge doesn't serialize them — not tested under real concurrency yet

### Authoritative diagnostics
- `src/tests/web-live-interaction-contract.test.ts` — documents expected event shapes, state transitions, and lifecycle for all UI request types
- Store snapshot fields `pendingUiRequests` and `streamingAssistantText` — the source of truth for what the browser thinks is happening

### What assumptions changed
- Original plan expected `pendingUiRequests` as a Map — implemented as an ordered array for simpler iteration and first-pending-wins rendering in the focused panel
