# Phase 9: Live Preview - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a live preview panel to Mission Control that proxies the project's active dev server into an iframe. The panel overlays the current view (sliding in from the right), includes a viewport switcher with device frames for web-based projects, auto-detects the dev server port from Claude Code stdout, and persists relevant state to the session file.

This phase delivers: proxy infrastructure (SERV-06), session persistence (SERV-07), and the full preview UI (PREV-01 through PREV-04). PREV-05 (audit screenshot comparison) is out of scope — screenshots are for Claude's internal feedback, not a user-facing comparison feature.

</domain>

<decisions>
## Implementation Decisions

### Preview Panel Behavior
- **Overlay drawer, not a ViewType**: Cmd+P or the toggle button slides a panel in from the right *over* the current view. Chat, milestones, etc. remain accessible behind it. Cmd+P again dismisses it.
- **Toggle button placement**: Sits on the far right of the session tabs row (same horizontal band as chat session tabs). When preview is open, its width fills all space to the right of Chat column 1 — the first chat column always stays visible and unobstructed.
- **Panel width**: Fills all remaining space after Chat column 1. Chat column 1 is pinned; preview takes everything to its right.

### Dev Server Port Detection
- **Auto-detect via stdout parsing**: The server stream parser watches Claude Code's stdout for `localhost:PORT` or `http://127.0.0.1:PORT` patterns. When detected, extracts the port and auto-opens the preview panel.
- **Auto-open on detection**: Preview panel opens automatically when a dev server URL is detected in Claude Code output — user doesn't need to manually trigger it.
- **Editable port field in preview header**: Small editable field showing the current proxied port. User can click and type a different port to override. Auto-detected port pre-fills it.
- **No periodic scanning**: Stdout parsing only. No background port polling.

### Viewport Switcher
- Four viewport options: **Desktop (1440px)** | **Tablet (768px)** | **Mobile (375px)** | **Dual**
- **Dual mode**: Shows two device frames side by side — one with iPhone 14 chrome, one with Pixel chrome — both pointing to the same URL. Triggered by selecting the "Dual" viewport option.
- **Device frames are web-only**: Device frames (iOS/Android chrome) only appear when a web URL is detected. For native Kotlin/Swift/Flutter apps, the preview shows a clean "No web preview available for native apps" empty state.
- **Active viewport size persists** in session file across restarts.

### Dev Server Offline State
- PREV-04: Clean empty state when dev server is offline — not a broken iframe. Show a message like "Dev server offline — start your dev server to preview" with the last known port displayed.
- No auto-reconnect polling: Preview attempts to load; if it fails, empty state shows. When user manually triggers a refresh or auto-open fires again from new stdout detection, preview retries.

### Audit Comparison
- **PREV-05 is out of scope**: Preview panel is for the user's live view only. Audit screenshots are Claude's internal feedback mechanism, not a user-facing comparison feature.

### Session Persistence (SERV-07)
The `.planning/.mission-control-session.json` file persists:
- **Layout preferences**: Panel sizes from react-resizable-panels
- **Chat history**: Last 50 messages *per session tab* (up to 4 sessions × 50 = 200 messages max)
- **Last viewed state**: Always reopens to Chat view (not whatever was last open)
- **Active viewport size**: Which viewport was selected (Desktop/Tablet/Mobile/Dual) when closed

### Claude's Discretion
- Exact proxy implementation (Bun.serve() fetch forwarding vs dedicated proxy middleware)
- How to handle WebSocket connections through the proxy (dev servers often use HMR WebSockets)
- Device frame SVG/CSS design (iPhone 14 and Pixel chrome aesthetics)
- Error handling for proxy failures (connection refused, timeout)
- Where in the server pipeline stdout URL detection plugs in (mode-interceptor.ts extension or new parser)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mode-interceptor.ts` — already parses Claude Code stdout for XML mode events; extend with URL pattern detection for dev server auto-open
- `ViewType` (`view-types.ts`) — discriminated union; preview panel does NOT add a new ViewType (it's an overlay, not a view)
- `SingleColumnView.tsx` — preview overlay would sit alongside this at the AppShell level, not inside it
- `SettingsView.tsx` + `settings-api.ts` — established pattern for per-project config; preview port/config follows same structure
- `session-manager.ts` + `pipeline.ts` — session metadata persistence patterns; chat history already partially managed here
- `tw-animate-css` — already used for slide animations (Phase 7); use for the preview panel slide-in transition

### Established Patterns
- **WebSocket topic-based pub/sub**: new `preview_open` event broadcast to clients when stdout detection fires
- **Route dispatcher pattern** (`fs-api.ts`): new `/preview` proxy route added to server
- **Pure render + stateful wrapper split**: PreviewPanel (pure) + stateful wrapper with port/viewport state
- **Empty/loading/error state design**: `PanelWrapper` pattern (`error > isLoading > isEmpty > children`) applied to iframe container

### Integration Points
- `packages/mission-control/src/server/server.ts` — add `/preview/*` proxy route that forwards requests to `localhost:{detectedPort}`
- `packages/mission-control/src/server/mode-interceptor.ts` — add URL detection alongside XML mode parsing
- `packages/mission-control/src/server/pipeline.ts` — broadcast `preview_open` event when dev server URL detected; wire to ws-server
- `packages/mission-control/src/components/views/ChatView.tsx` — add preview toggle button to sessions tab row (far right)
- `packages/mission-control/src/components/layout/AppShell.tsx` — render PreviewPanel overlay alongside SingleColumnView
- `packages/mission-control/src/server/chat-types.ts` — add `preview_open` / `preview_close` WebSocket event types
- `.planning/.mission-control-session.json` — new session persistence file; define schema and read/write logic

</code_context>

<specifics>
## Specific Ideas

- Preview toggle button lives on the **sessions tab row**, far right — same visual band as "Chat 1", "Chat 2" tabs
- Preview fills all horizontal space to the right of Chat column 1 — Chat 1 is always pinned and visible
- Dual viewport shows iPhone 14 + Pixel frames side by side with same URL; triggered by "Dual" option in viewport switcher
- Device frames only show for web-based projects; native mobile apps get a clean "no web preview" empty state
- Port field in preview header is editable — click to override the auto-detected port
- Auto-open preview when Claude Code stdout contains a localhost URL pattern

</specifics>

<deferred>
## Deferred Ideas

- **Dual-source Expo preview** (two separate dev server ports for iOS/Android Metro bundlers) — deferred; current phase uses same-URL dual frames. True dual-port setup requires Metro bundler configuration and separate process management.
- **PREV-05 audit screenshot comparison** — removed from scope. Screenshots are Claude's internal feedback tool, not a user-facing preview feature.
- **Auto-reconnect polling** — when dev server goes offline, preview shows empty state. Auto-reconnect (periodic polling) deferred; next stdout detection re-triggers auto-open.

</deferred>

---

*Phase: 09-live-preview*
*Context gathered: 2026-03-12*
