# S01: PTY Output Parser and Chat Message Model

**Goal:** Build a stateful parser that accepts raw PTY byte chunks and emits structured `ChatMessage[]` — the foundational data model that all chat rendering and TUI intercept logic depends on.

**Demo:** A standalone `PtyChatParser` class with fixture-verified output: given a sequence of raw PTY chunks (ANSI escape codes, cursor moves, GSD prompt/response patterns), it returns clean structured messages with roles, stripped text, detected TUI prompts, and completion signals.

## Must-Haves

- `web/lib/pty-chat-parser.ts` exports `PtyChatParser`, `ChatMessage`, `TuiPrompt`, `CompletionSignal`
- `PtyChatParser.feed(chunk)` accepts raw PTY bytes (string with ANSI escapes)
- `PtyChatParser.getMessages()` returns `ChatMessage[]` with ANSI stripped, roles assigned
- `PtyChatParser.onMessage(cb)` returns an unsubscribe function
- `TuiPrompt` detected for: ink select lists (arrow-key menus), text input prompts, password prompts
- `CompletionSignal` emitted on GSD action-complete patterns (e.g., prompt returning, "done" markers)
- All types exported and consumed cleanly from TypeScript without errors

## Tasks

- [ ] **T01: ANSI stripper, message segmenter, and role classifier**
  Build the core parser: strip ANSI escape codes from PTY output, segment the stream into discrete message units, and classify each as `user | assistant | system` based on GSD's output structure.

- [ ] **T02: TUI prompt detector and completion signal emitter**
  Extend the parser with TUI prompt pattern detection (ink select, text input, password) and action completion signal emission. Validate against realistic GSD output samples.

## Files Likely Touched

- `web/lib/pty-chat-parser.ts` (new)
