# M007: Chat Mode — Consumer-Grade GSD Interface

**Gathered:** 2026-03-17
**Status:** Ready for planning

## Project Description

GSD currently has a Power User Mode view: two raw xterm.js terminals side by side, left for the primary GSD session, right for interactive GSD commands. This milestone adds a Chat Mode view — a new nav entry immediately below Power Mode — that exposes the exact same underlying PTY infrastructure but through a consumer-grade chat interface, making GSD accessible to non-technical users who are intimidated by raw terminals.

## Why This Milestone

Non-technical users cannot effectively use GSD through a raw terminal interface. They need:
- AI responses rendered as readable chat bubbles (not scrolling terminal text)
- TUI prompts (arrow-key selects, text inputs, API key fields) rendered as native UI instead of escape-code-driven terminal widgets
- One-click GSD workflow actions (Discuss, Plan, Auto, Stop) that open focused action panels without requiring knowledge of slash commands

The feature mirrors Power Mode's dual-pane DNA: main GSD session always on the left, action panels open on the right when triggered, close automatically when the action completes. Same PTY sessions, consumer-grade skin.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Click the Chat Mode nav entry (below Power Mode in the sidebar) and see the main GSD session rendered as a chat conversation
- Read AI responses as styled markdown chat bubbles — headers, bold, lists, code blocks all rendered properly
- Interact with TUI prompts (provider selection, API key entry, arrow-key selects) through native UI components instead of raw terminal escape sequences
- Click action buttons (Discuss, Plan, Auto, Stop, Step, New Milestone) in the Chat Mode toolbar
- See a right-panel chat instance open when clicking an action button, styled distinctly from the main panel
- Watch the right panel auto-close when the GSD action completes
- Use Chat Mode as a complete alternative to Power Mode with no loss of functionality

### Entry point / environment

- Entry point: New "Chat" nav item in the left sidebar, below Power Mode (Columns2 icon)
- Environment: Browser, same-origin web host
- Live dependencies involved: Existing PTY sessions via /api/terminal/stream SSE + /api/terminal/input POST

## Completion Class

- Contract complete means: Chat view renders, buttons trigger panel open/close, markdown displays correctly, TUI prompt components send correct keystrokes to PTY
- Integration complete means: Underlying PTY sessions behave identically to Power Mode; action panel opens on button click and closes on GSD action completion signal
- Operational complete means: No PTY session leaks; panel lifecycle is clean across multiple open/close cycles

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A user can open Chat Mode, see GSD output as chat bubbles, respond to a TUI select prompt via the native UI, and complete a GSD workflow action end-to-end
- An action button click opens the right panel, the action runs to completion, and the panel closes automatically — with no orphaned PTY sessions
- The main chat pane remains fully usable while the right panel is open

## Risks and Unknowns

- PTY output stream parsing — xterm.js handles ANSI internally; the chat view needs a custom ANSI-strip + message-boundary heuristic layer. GSD's output structure (prompts, responses, system messages) must be reverse-engineered from raw bytes — risk:high
- TUI prompt detection — GSD uses ink/TUI for interactive prompts. The prompt patterns (select lists, text inputs, password fields) must be detected from PTY output byte patterns before the escape sequences are rendered. Miswired keystrokes could corrupt the session — risk:medium
- Action completion detection — determining when a GSD action is "done" (panel auto-close trigger) requires reading terminal output for completion signals rather than relying on a discrete API response — risk:medium

## Existing Codebase / Prior Art

- web/components/gsd/dual-terminal.tsx — Power Mode implementation; the new view mirrors its layout and lifecycle. Read before building.
- web/components/gsd/shell-terminal.tsx — Full PTY session management via xterm.js + SSE. Chat view does NOT use xterm.js — reads same SSE stream directly.
- web/app/api/terminal/stream/route.ts — SSE endpoint; PTY output arrives as raw bytes including ANSI escape sequences.
- web/app/api/terminal/input/route.ts — Input POST endpoint for sending keystrokes to the PTY.
- web/components/gsd/file-content-viewer.tsx — Existing react-markdown + remark-gfm + shiki pattern. Reuse for chat bubble markdown rendering.
- web/components/gsd/sidebar.tsx — NavRail implementation. New "Chat" entry goes after Power Mode.
- web/components/gsd/app-shell.tsx — View routing. New "chat" view wired here.
- web/lib/workflow-actions.ts — deriveWorkflowAction() for toolbar buttons.

## Relevant Requirements

- R001-R004 (core web workflow) — Chat Mode is an alternative UX layer over the existing bridge
- D002 (preserve existing skin) — Chat Mode is additive; does not modify Power Mode or existing views

## Scope

### In Scope

- New "Chat Mode" view accessible via sidebar nav, below Power Mode
- PTY output parser: strips ANSI, segments output into structured chat messages
- Chat bubble rendering with react-markdown + remark-gfm for AI responses
- TUI prompt interceptor: arrow-key select lists, text/password inputs as native UI
- Action toolbar with GSD workflow buttons
- Right panel lifecycle: spawns on button click, auto-closes on action completion
- Right panel styled distinctly from main panel

### Out of Scope / Non-Goals

- Modifying Power Mode or any existing view
- Persisting chat history beyond the PTY session
- Chat export or copy
- Mobile layout optimization
- Multiple simultaneous right panels

## Technical Constraints

- Must reuse existing PTY session infrastructure — no new backend session types
- Main PTY session uses sessionPrefix="gsd-main" (same as Power Mode) so it pre-initializes on boot
- No xterm.js in the chat renderer — Power Mode only. Chat reads SSE directly.
- react-markdown, remark-gfm, and shiki are already installed
- motion library available for panel animations
- Action completion detection must come from PTY output stream, not polling

## Integration Points

- /api/terminal/stream SSE — primary data source
- /api/terminal/input POST — primary sink
- web/lib/workflow-actions.ts — toolbar action derivation
- web/lib/gsd-workspace-store.tsx — workspace state
- Sidebar NavRail — new nav entry
