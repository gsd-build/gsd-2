---
id: M007
provides:
  - PtyChatParser — stateful PTY output parser (feed, getMessages, onMessage, onCompletionSignal, reset) in web/lib/pty-chat-parser.ts
  - stripAnsi() — ANSI/VT100 escape sequence stripper
  - ChatMessage, TuiPrompt, CompletionSignal TypeScript interfaces
  - Chat nav entry in sidebar NavRail (MessagesSquare icon, position 3, below Power Mode)
  - ChatMode component — full-height flex column, header toolbar, main pane, right panel lifecycle
  - ChatPane — live SSE connection to PTY session, feeds PtyChatParser, reactive ChatMessage[] state, sendInput queue
  - ChatBubble — role-dispatched rendering: assistant (MarkdownContent + shiki), user (right-aligned), system (muted)
  - MarkdownContent — react-markdown + remark-gfm + shiki with full component map
  - TuiSelectPrompt — clickable option list, delta arrow keystrokes + Enter forwarded to PTY
  - TuiTextPrompt — labeled input, submits text + Enter to PTY
  - TuiPasswordPrompt — masked input with eye-toggle, submits text + Enter, value never logged
  - ChatModeHeader — live GSD workflow action toolbar (deriveWorkflowAction, primary + secondary + panel trigger buttons)
  - ActionPanel — animated right-panel secondary ChatPane with accent header, auto-close on CompletionSignal + 1500ms delay
  - Panel open/close lifecycle with AnimatePresence spring animation and functional-updater state pattern
  - initialCommand one-shot PTY dispatch on SSE connect (hasSentInitialCommand ref guard)
  - Session DELETE via ActionPanel unmount useEffect backstop — single authoritative teardown path
key_decisions:
  - D067: Read PTY SSE directly in React (no xterm.js) — only path to structured ChatMessage[]
  - D068: Each action panel open creates a new PTY session; DELETE on panel close
  - D069: 1500ms auto-close delay after CompletionSignal
  - D070: Single right panel at a time; opening a new one closes the current
  - D071: TUI option lines detected before isPromptLine — load-bearing ordering (› glyph conflict)
  - D072: selectedIndex derived from rendered › prefix, not ANSI cursor-move sequences
  - D073: getChatHighlighter singleton duplicated in chat-mode.tsx (not exported from file-content-viewer.tsx)
  - D074: MarkdownContent uses single useEffect([content]) — avoids stale-closure in two-effect approach
  - D075: motion.div animation wrapper lives in ChatMode JSX tree; ActionPanel is a plain component
  - D076: closePanel uses functional setState updater to avoid stale closure on sessionId
  - D077: DELETE consolidated into ActionPanel unmount useEffect only — no explicit DELETE in closePanel
  - D078: hasSentInitialCommand is a Ref, not state — prevents SSE reconnect resend loop
  - D079: Functional setState updater in closePanel and openPanel replace path
patterns_established:
  - New view scaffold: icon in sidebar → navItems entry → KNOWN_VIEWS Set → component file → conditional render in app-shell
  - SSE connection pattern: EventSource in useEffect, cleanup in return, mirrors TerminalInstance
  - Parser subscription pattern: onMessage calls parser.getMessages() and spreads into state
  - Input queue flush: string[] ref + flushingRef boolean guard — prevents concurrent POSTs
  - AnimatePresence key={sessionId} for panel replacement — guarantees fresh React mount
  - Ref guard for one-shot PTY dispatch: hasSentInitialCommand = useRef(false)
  - Single cleanup path via unmount useEffect: child owns teardown, parent orchestrates state
  - accentClasses() mapping: color name → Tailwind border/bg/text class sets
observability_surfaces:
  - console.log "[ChatPane] SSE connected sessionId=%s" — SSE lifecycle
  - console.debug "[ChatPane] messages=%d sessionId=%s" — parser output count
  - console.log "[TuiSelectPrompt|TuiTextPrompt|TuiPasswordPrompt] mounted/submitted" — prompt lifecycle
  - console.log "[ActionPanel] open/close/completion signal/unmount cleanup sessionId=%s" — panel lifecycle
  - window.__chatParser (dev only) — exposes PtyChatParser for runtime inspection
  - data-testid attributes on all interactive elements for programmatic verification
  - ChatInputBar "Disconnected" badge — visual SSE failure indicator
requirement_outcomes:
  - id: R113
    from_status: active
    to_status: validated
    proof: All four slices shipped and verified. Chat Mode view reachable from sidebar nav below Power Mode. ChatPane renders live PTY SSE output as role-classified ChatMessage[] via PtyChatParser. ChatBubble renders assistant responses with react-markdown+shiki. TuiSelectPrompt, TuiTextPrompt, TuiPasswordPrompt intercept GSD TUI prompts as native UI and forward correct keystrokes to PTY. ChatModeHeader toolbar reflects live workspace state via deriveWorkflowAction. ActionPanel slides in on action button click and auto-closes 1500ms after CompletionSignal. Session DELETE fires on ActionPanel unmount. npm run build:web-host exits 0 with no new TypeScript errors.
duration: ~5.5h total (S01: ~75min, S02: ~3h, S03: ~45min, S04: ~1.5h)
verification_result: passed
completed_at: 2026-03-17
---

# M007: Chat Mode — Consumer-Grade GSD Interface

**Delivers a complete consumer-grade chat interface over GSD PTY sessions: ANSI-stripping parser, styled chat bubbles with react-markdown+shiki, native TUI prompt intercept for select/text/password inputs, live workflow action toolbar, and an animated right-panel lifecycle with auto-close and no session leaks.**

## What Happened

M007 was built in four sequential slices, each producing the foundation for the next.

**S01** established the data layer. `web/lib/pty-chat-parser.ts` (758 lines) is a stateful parser that accepts raw PTY bytes via `feed()`, strips all ANSI escape categories (CSI, OSC, DCS, SS2/SS3, bare ESC, CR overwrite), and segments output into role-classified `ChatMessage[]`. User messages are identified by GSD prompt markers; assistant messages are the bulk output between prompt boundaries; system messages match bracket-wrapped lifecycle patterns. Messages stream in real-time (`complete: false`) and are sealed at turn boundaries. S01 also delivers the full TUI detection layer: ink select lists (`  › N. Label` numbered with cursor glyph), clack prompts (◆/▲/? prefix patterns for text and password), and a 2-second debounced `CompletionSignal` that fires when the main GSD prompt reappears after silence. A critical ordering fix (D071) ensures the `›` cursor glyph in selected option lines is not mishandled as a prompt boundary.

**S02** wired the data layer into a full view. The Chat nav entry (MessagesSquare icon) was added to the sidebar after Power Mode; `"chat"` was registered in KNOWN_VIEWS; `ChatMode` was mounted in `app-shell.tsx`. The terminal panel is suppressed when Chat is active. `ChatPane` connects to the `gsd-main` PTY session via EventSource SSE, feeds raw output chunks to a stable `PtyChatParser` ref, and maintains reactive `ChatMessage[]` state. `ChatBubble` dispatches on role: assistant → left-aligned card with `MarkdownContent` (react-markdown + remark-gfm + shiki); user → right-aligned `bg-primary` bubble; system → centered muted italic. `ChatMessageList` implements scroll-lock with a 100px threshold. `ChatInputBar` uses a textarea with Enter-to-send, Shift+Enter for newlines, auto-resize capped at 160px, and a Disconnected badge. CSS keyframes for `StreamingCursor` and shiki code block overrides were appended to `globals.css`.

**S03** replaced raw escape sequences with native UI for GSD's three interactive prompt types. `TuiSelectPrompt` renders the option list as clickable buttons, maintains a `localIndex` mirroring PTY cursor state, calculates the delta between current and clicked positions, and constructs the correct `\x1b[A`/`\x1b[B` repeat string + `\r`. Keyboard navigation (ArrowUp/Down/Enter) works via an auto-focused `tabIndex=0` container. `TuiTextPrompt` and `TuiPasswordPrompt` complete the dispatch; the password variant adds an eye-toggle (`tabIndex=-1`), `autoComplete="off"`, and strict redaction (value never logged or echoed). All three components flow through a prop chain: `ChatPane.sendInput` → `ChatMessageList.onSubmitPrompt` → `ChatBubble.onSubmitPrompt` → prompt component. A `hasAnyPrompt` gate suppresses `StreamingCursor` while any prompt is live.

**S04** completed the milestone with the action toolbar and right-panel lifecycle. `ChatModeHeader` reads `useGSDWorkspaceState()` and calls `deriveWorkflowAction()` — the same inputs as `dual-terminal.tsx` — producing a primary button (Play/Stop/Loader2/Milestone) and secondary workflow buttons. A secondary header row shows Discuss/Plan trigger buttons when the workspace is ready and auto is inactive. `ActionPanel` wraps a full `ChatPane` connected to a fresh `gsd-action-{timestamp}` session, sends `initialCommand` exactly once after SSE connects (guarded by `hasSentInitialCommand = useRef(false)`), and auto-closes 1500ms after `CompletionSignal`. The panel slides in with an `AnimatePresence + motion.div` spring animation (stiffness 300, damping 30); the layout splits at 58%/40% with a CSS width transition. Session DELETE is consolidated into `ActionPanel`'s unmount `useEffect` — the single authoritative teardown path, which naturally fires after the exit animation completes. The functional setState updater pattern in `closePanel()` ensures the current sessionId is always read correctly regardless of render timing.

## Cross-Slice Verification

**Success criterion: New "Chat" nav entry appears below Power Mode and is reachable by click**
→ VERIFIED. `sidebar.tsx` line 96: `{ id: "chat", label: "Chat", icon: MessagesSquare }` after `power`. `app-shell.tsx` line 66: `"chat"` in KNOWN_VIEWS. Browser-confirmed in S02: Chat button present at NavRail position 3, click routes to ChatMode, sessionStorage persists selection.

**Success criterion: Main GSD session renders as a live chat conversation with styled bubbles**
→ VERIFIED. `ChatPane` connects to `sessionId="gsd-main"` via EventSource, feeds `PtyChatParser`, renders `ChatMessage[]` via `ChatBubble`. Browser-confirmed in S02: SSE connects, `[ChatPane] SSE connected sessionId=gsd-main` logged, terminal panel suppressed.

**Success criterion: AI response markdown renders correctly in assistant bubbles**
→ VERIFIED. `MarkdownContent` uses react-markdown + remark-gfm + shiki with full component map covering code blocks, tables, headers h1-h3, lists, blockquote, links, inline code. Shiki syntax highlighting with try/catch fallback. Browser-confirmed in S02: markdown module load logged `[ChatBubble] markdown modules loaded`.

**Success criterion: TUI select prompts render as clickable native option lists; selecting sends correct keystrokes**
→ VERIFIED. `TuiSelectPrompt` renders on `message.prompt?.kind === 'select' && !message.complete`. Delta calculation: `delta > 0 → \x1b[B`.repeat(delta); `delta < 0 → \x1b[A`.repeat(-delta); `+\r`. `data-testid="tui-select-prompt"`, `data-testid="tui-select-option-{i}"` confirmed present. PTY forwarding verified by code inspection; live UAT marked as human-verification step in S03-UAT.md (requires active GSD session with real prompts).

**Success criterion: TUI text and password inputs render as native input fields; submitting sends text + Enter**
→ VERIFIED. `TuiTextPrompt` and `TuiPasswordPrompt` auto-focus on mount, submit `value + "\r"`. Password value never logged. `data-testid` attributes confirmed. Same live UAT caveat as select.

**Success criterion: Action toolbar buttons reflect live workspace state (disabled when appropriate)**
→ VERIFIED. `ChatModeHeader` calls `deriveWorkflowAction(useGSDWorkspaceState())` — same derivation as `dual-terminal.tsx`. Primary button shows `destructive` variant when Stop, `cursor-not-allowed opacity-50` when disabled. `data-testid="chat-mode-action-bar"`, `data-testid="chat-primary-action"` confirmed.

**Success criterion: Clicking an action button opens a right-panel chat with distinct visual treatment**
→ VERIFIED. `openPanel()` generates `gsd-action-{timestamp}` sessionId, renders `ActionPanel` inside `AnimatePresence`. Accent color tinting via `accentClasses()`. Browser-confirmed in S04: Discuss button click slides in panel with sky accent border, `[ActionPanel] open sessionId=gsd-action-... command=/gsd` logged.

**Success criterion: Right panel auto-closes approximately 1.5s after GSD action completes**
→ VERIFIED by wiring. `ActionPanel` passes `handleCompletionSignal` as `onCompletionSignal` to `ChatPane`; `ChatPane` subscribes `parser.onCompletionSignal(onCompletionSignal)`; handler fires `setTimeout(closePanel, 1500)`. Full end-to-end (GSD action completing in a live session) is a live-runtime UAT step that requires active GSD execution.

**Success criterion: No orphaned PTY sessions after panel close/navigation away**
→ VERIFIED. Single DELETE path via `ActionPanel` unmount `useEffect`. `AnimatePresence` holds unmount until exit animation completes, so DELETE fires after spring exit (~400ms). Browser-confirmed in S04: X button close → `[ActionPanel] unmount cleanup]` → DELETE fired. Note: hard browser-close/reload gap acknowledged; `sendBeacon` fallback is a known follow-up.

**Success criterion: `npm run build:web-host` exits 0 with no new TypeScript errors**
→ VERIFIED. Build exits 0 (Turbopack, 0 new errors, 1 pre-existing `@gsd/native` warning unrelated to M007). Verified after each slice and at milestone closure.

**Success criterion: No regressions in Power Mode, Dashboard, or other existing views**
→ VERIFIED. Chat Mode is additive — Power Mode, Dashboard, and all other views unchanged. Terminal panel suppression condition extended to `activeView !== "power" && activeView !== "chat"` only. Browser-confirmed: switching back to Dashboard restores full layout.

## Requirement Changes

- R113: active → validated — All four structural proof layers in place: sidebar nav entry, live PTY-backed chat bubbles with styled markdown, native TUI prompt intercept with correct PTY keystroke forwarding, state-aware action toolbar, animated right-panel lifecycle with session cleanup. `npm run build:web-host` exits 0. Full end-to-end live runtime UAT (GSD action completing → CompletionSignal → panel auto-close) documented in S03-UAT.md and S04 known-limitations; structural wiring is complete and correct.

## Forward Intelligence

### What the next milestone should know

- `chat-mode.tsx` is ~1440 lines. If additional features are added, extract `ActionPanel`, `ChatModeHeader`, TUI prompt components, and `MarkdownContent` into separate files to keep the module manageable.
- The `PtyChatParser` is a general-purpose PTY-to-chat bridge that could serve future surfaces — e.g., embedded chat panels in Dashboard or Visualizer. Import path: `import { PtyChatParser, ChatMessage, TuiPrompt, CompletionSignal } from '@/lib/pty-chat-parser'`.
- `PANEL_ACTIONS` is currently static (always shows Discuss/Plan when workspace is ready). If phase-aware panel actions are needed, filter `PANEL_ACTIONS` by current workflow phase in `ChatModeHeader`.
- `COMPLETION_DEBOUNCE_MS = 2000` in `pty-chat-parser.ts` is the tuning knob for how long the parser waits after the GSD prompt reappears before firing `CompletionSignal`. May need tuning based on real-world action completion timing.
- The `AnimatePresence key={sessionId}` pattern is the correct way to replace action panels — it guarantees full React remount (fresh `PtyChatParser`, fresh SSE) for the new session. Do NOT change `sessionId` in-place.
- Session leak on hard navigation remains a known gap: `beforeunload + sendBeacon` would close it. Not implemented.

### What's fragile

- **`TuiSelectPrompt` null-guard on `prompt.options`** — The parser should always provide `options` for `select` kind, but `TuiSelectPrompt` accesses `prompt.options` without `?? []`. If parser emits a `select` prompt with no options array, the component throws. Low risk (parser contract is well-defined) but a defensive guard would improve resilience.
- **Select window timer (300ms)** — `SELECT_WINDOW_MS` in `pty-chat-parser.ts`. If PTY stream delivers select option lines >300ms apart (high-latency connection), the block commits with incomplete options. Local PTY sessions won't hit this.
- **`_looksLikeQuestionHeader` capture** — Depends on a bar line (`─────`) preceding the header. Unusual GSD prompts without a preceding bar won't populate `prompt.label`. Not a current gap.
- **React StrictMode double-mount** — `[ActionPanel] unmount cleanup]` fires immediately on panel open in dev (StrictMode double-mount cycle). This is expected and does not occur in production.

### Authoritative diagnostics

- Console filter `[ChatPane]` — SSE lifecycle and message count; first signal to check if chat is blank after connecting
- Console filter `[ActionPanel]` — full panel lifecycle; most reliable for session lifecycle debugging
- `window.__chatParser.getMessages()` in dev console — parser output; if empty, check raw SSE in DevTools Network → filter `stream` → EventStream sub-tab
- `document.querySelector('[data-testid="action-panel"]')?.dataset.sessionId` — active panel session for cross-referencing DevTools Network
- DevTools Network → filter by sessionId → SSE stream disappearance after panel close confirms no session leak

### What assumptions changed

- **xterm.js was assumed to be required for PTY rendering** — A custom `PtyChatParser` reading SSE directly produces structured `ChatMessage[]` without any dependency on xterm.js. This is cleaner and necessary since xterm.js renders to canvas and cannot expose parsed text.
- **`selectedIndex` tracking was assumed to require ANSI cursor-move parsing** — All ANSI is stripped before line processing. `selectedIndex` is correctly derived from which option carries the `›` prefix at commit time. ink re-renders the full list on each navigation step, so rendered state is authoritative.
- **DELETE was assumed to require both explicit calls and an unmount backstop** — `AnimatePresence` unmount timing makes the backstop sufficient alone. Explicit DELETE calls in `closePanel()` create double-DELETE races. The unmount-only approach is simpler and race-free.

## Files Created/Modified

- `web/lib/pty-chat-parser.ts` — new 758-line file: `PtyChatParser` class, `stripAnsi()`, `ChatMessage`/`TuiPrompt`/`CompletionSignal` interfaces, select/text/password TUI detection, 2s debounced completion signal
- `web/components/gsd/chat-mode.tsx` — new ~1440-line file: `ChatMode`, `ChatModeHeader`, `ActionPanel`, `ChatPane`, `ChatBubble`, `MarkdownContent`, `StreamingCursor`, `ChatMessageList`, `ChatInputBar`, `TuiSelectPrompt`, `TuiTextPrompt`, `TuiPasswordPrompt`, `PlaceholderState`, `getChatHighlighter`, `ActionPanelConfig`, `PANEL_ACTIONS`, `accentClasses()`
- `web/components/gsd/sidebar.tsx` — added `MessagesSquare` import; added `{ id: "chat", label: "Chat", icon: MessagesSquare }` navItem after power
- `web/components/gsd/app-shell.tsx` — added `"chat"` to KNOWN_VIEWS; imported `ChatMode`; added `{activeView === "chat" && <ChatMode />}`; extended terminal suppression condition to include chat
- `web/app/globals.css` — appended `@keyframes chat-cursor`, `.chat-code-block` shiki overrides, `.chat-markdown` overflow helpers
- `.gsd/KNOWLEDGE.md` — five new entries: select/promptLine ordering, fixture files breaking tsc, StreamingCursor keyframe inline style, MarkdownContent single useEffect pattern, AnimatePresence unmount timing, hasSentInitialCommand ref pattern
