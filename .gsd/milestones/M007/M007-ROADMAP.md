# M007: Chat Mode — Consumer-Grade GSD Interface

**Vision:** A consumer-grade chat interface over the existing GSD PTY sessions — styled chat bubbles with markdown rendering, native UI for TUI prompts, one-click action buttons that spawn auto-closing side panels. Non-technical users get full GSD capability without ever seeing a raw terminal.

## Success Criteria

- New "Chat" nav entry appears below Power Mode in the sidebar
- Main GSD session renders as a chat conversation (user messages + AI responses as styled bubbles)
- AI response markdown (headers, bold, lists, code blocks) renders correctly in chat bubbles
- TUI select prompts (arrow-key lists) render as clickable native UI options; selection sends correct keystroke to PTY
- TUI text/password inputs render as native input fields; submission sends text + Enter to PTY
- Action toolbar buttons (Auto, Stop, Discuss, Plan, Step, New Milestone) are present and state-aware
- Clicking an action button opens a right-panel chat instance, distinctly styled
- Right panel auto-closes when the GSD action completes
- No orphaned PTY sessions after panel close

## Key Risks / Unknowns

- PTY output parsing — GSD output arrives as raw ANSI bytes; segmenting into coherent chat messages requires heuristics — the hardest technical problem in this milestone
- TUI prompt detection — ink/TUI prompt patterns must be reliably identified before the escape sequences corrupt the display
- Action completion detection — "done" signal must come from PTY output, not a discrete API

## Proof Strategy

- PTY parsing risk → retire in S01 by building the parser against live PTY output and verifying message boundaries are clean
- TUI prompt risk → retire in S03 by confirming select + text/password prompts send correct bytes to PTY and the PTY responds correctly
- Action completion risk → retire in S04 by confirming the right panel auto-closes after a real /gsd action completes

## Verification Classes

- Contract verification: TypeScript types clean, React components render without errors, parser unit-testable with fixture strings
- Integration verification: Live PTY session renders as chat, TUI prompts intercepted, panel lifecycle clean
- Operational verification: No session leaks across panel open/close cycles
- UAT / human verification: Visual inspection — chat bubbles look correct, panel animations feel right

## Milestone Definition of Done

This milestone is complete only when all are true:

- Chat Mode view is reachable from the sidebar nav
- Main pane renders live GSD output as chat bubbles with styled markdown
- TUI select and text/password prompts render as native UI and correctly forward input to PTY
- Action buttons reflect live workspace state (disabled when appropriate)
- Right panel opens on button click and auto-closes on action completion
- No regressions in Power Mode, Dashboard, or other existing views
- No orphaned PTY sessions after panel lifecycle

## Requirement Coverage

- Covers: Consumer UX layer over existing PTY/bridge infrastructure
- Partially covers: R001-R004 (adds an alternative interaction surface)
- Leaves for later: None — self-contained new view
- Orphan risks: None

## Slices

- [ ] **S01: PTY output parser and chat message model** `risk:high` `depends:[]`
  > After this: A standalone TypeScript module `pty-chat-parser.ts` accepts raw PTY byte chunks and emits structured `ChatMessage[]` with type (user/assistant/system), text content (ANSI stripped), and detected TUI prompt objects — verified with fixture strings.

- [ ] **S02: Chat Mode view — main pane** `risk:medium` `depends:[S01]`
  > After this: "Chat" appears in the sidebar nav below Power Mode. Clicking it shows the main GSD session rendered as a live chat conversation — scrolling bubbles, assistant responses with styled markdown, user inputs reflected as outgoing bubbles.

- [ ] **S03: TUI prompt intercept UI** `risk:medium` `depends:[S02]`
  > After this: When GSD presents an arrow-key select list or a text/password input prompt, the chat view renders native UI components (radio-list, text field, masked field) instead of raw escape sequences. Submitting the native UI sends the correct keystrokes to the PTY and the PTY advances normally.

- [ ] **S04: Action toolbar and right panel lifecycle** `risk:low` `depends:[S02,S03]`
  > After this: The Chat Mode header has a toolbar with workflow action buttons (Auto, Stop, Discuss, Plan, Step, New Milestone) that mirror Power Mode's action bar logic. Clicking any button spawns a right-panel chat instance with a distinct visual treatment. The panel auto-closes when GSD signals action completion. Panel open/close animates smoothly.

## Boundary Map

### S01 → S02, S03, S04

Produces:
- `web/lib/pty-chat-parser.ts` — stateful `PtyChatParser` class
  - `feed(chunk: string): void` — accepts raw PTY bytes
  - `getMessages(): ChatMessage[]` — returns current message array
  - `onMessage(cb: (msg: ChatMessage) => void): () => void` — subscribe to new/updated messages
  - `ChatMessage` type: `{ id: string; role: 'user' | 'assistant' | 'system'; content: string; prompt?: TuiPrompt; timestamp: number; complete: boolean }`
  - `TuiPrompt` type: `{ kind: 'select' | 'text' | 'password'; label: string; options?: string[]; selectedIndex?: number }`
  - `CompletionSignal` type: emitted when parser detects a GSD action-complete pattern

Consumes:
- nothing (leaf node — reads raw PTY SSE output as input)

### S02 → S03, S04

Produces:
- `web/components/gsd/chat-mode.tsx` — main `ChatMode` component
  - `ChatPane` sub-component: connects to a PTY session via SSE, feeds output to `PtyChatParser`, renders `ChatMessage[]` as bubbles
  - `ChatBubble` sub-component: renders `ChatMessage` as styled bubble; assistant bubbles use react-markdown
  - `sessionId` prop interface for connecting to a specific PTY session
  - `onPromptResponse(data: string): void` callback interface for TUI intercept

Consumes from S01:
- `PtyChatParser` — `feed()`, `getMessages()`, `onMessage()`
- `ChatMessage`, `TuiPrompt` types

### S03 → S04

Produces:
- `TuiSelectPrompt` component: renders select list as clickable radio-style options, sends arrow + Enter keystrokes to PTY
- `TuiTextPrompt` component: renders text input field, sends text + Enter to PTY
- `TuiPasswordPrompt` component: renders masked password field, sends text + Enter to PTY
- All mounted inside `ChatPane` when `ChatMessage.prompt` is present

Consumes from S02:
- `ChatPane` prompt rendering slot
- `onPromptResponse` callback

### S04 → (milestone complete)

Produces:
- `ChatModeHeader` component with action toolbar
- Right panel lifecycle: `ActionPanel` component wrapping a `ChatPane` for a secondary session
- Panel state: open/closed, sessionId, triggered command
- Auto-close logic triggered by `CompletionSignal` from S01 parser

Consumes from S02:
- `ChatPane` — used for both main and action panel instances

Consumes from S03:
- TUI prompt components — used inside action panel's `ChatPane`

Consumes from S01:
- `CompletionSignal` — triggers panel auto-close
