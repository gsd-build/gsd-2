# S02: Chat Mode View — Main Pane

**Goal:** Build the Chat Mode view as a new nav entry below Power Mode. The main pane connects to the primary GSD PTY session, feeds output through `PtyChatParser`, and renders the conversation as styled chat bubbles with markdown-rendered assistant responses.

**Demo:** Click "Chat" in the sidebar. The main GSD session appears as a chat conversation — AI responses as styled markdown bubbles on the left, user messages on the right. Scrollable, live-updating, visually distinct from the terminal view.

## Must-Haves

- "Chat" nav entry appears in the sidebar NavRail, below Power Mode (below the Columns2 icon)
- Clicking it navigates to `activeView === "chat"` in app-shell
- `ChatMode` component renders with a left pane showing the main GSD PTY session as chat bubbles
- Assistant messages render with react-markdown + remark-gfm: headers, bold, lists, code blocks (syntax highlighted via shiki), tables
- User messages render as plain text in an outgoing bubble style
- System/status messages render in a muted inline style (not as a bubble)
- Chat scrolls to bottom on new messages; user can scroll up to read history without being yanked back
- A text input at the bottom allows the user to type and send messages (sends text + Enter to PTY)
- The main PTY session is the same `"gsd-main"` session pre-initialized by the app shell (no duplicate session creation)

## Tasks

- [ ] **T01: Nav entry and view scaffold**
  Add "Chat" to the sidebar NavRail, wire `activeView === "chat"` in app-shell, and build the `ChatMode` component skeleton with layout structure.

- [ ] **T02: ChatPane SSE connection and parser integration**
  Build `ChatPane` — the core component that connects to a PTY session via SSE, feeds output to `PtyChatParser`, and exposes `ChatMessage[]` as state.

- [ ] **T03: Chat bubble rendering and markdown**
  Build `ChatBubble` — renders a `ChatMessage` as a styled bubble. Assistant bubbles use react-markdown. User bubbles are plain outgoing style. System messages are muted inline. Add the text input bar at the bottom.

## Files Likely Touched

- `web/components/gsd/sidebar.tsx` — add "Chat" nav item
- `web/components/gsd/app-shell.tsx` — add `chat` to KNOWN_VIEWS, wire ChatMode component
- `web/components/gsd/chat-mode.tsx` (new) — ChatMode, ChatPane, ChatBubble
