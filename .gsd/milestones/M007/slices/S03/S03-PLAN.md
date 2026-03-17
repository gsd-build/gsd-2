# S03: TUI Prompt Intercept UI

**Goal:** When GSD presents an interactive TUI prompt (arrow-key select list, text input, or password/API-key field), the chat view renders native UI components instead of raw escape sequences. Submitting via the native UI sends the correct keystrokes to the PTY and the session advances normally.

**Demo:** Start GSD in Chat Mode. When GSD asks to select a provider (arrow-key select), a native radio-style list appears in the chat. Clicking an option sends the correct arrow + Enter keystrokes to the PTY and the selection is registered. When GSD asks for an API key, a native masked input field appears; typing and pressing Enter sends the key correctly.

## Must-Haves

- When `ChatMessage.prompt.kind === 'select'`, a `TuiSelectPrompt` component renders instead of/above the raw text
- Clicking an option in `TuiSelectPrompt` sends the correct number of arrow-up/down keystrokes + Enter to the PTY
- When `ChatMessage.prompt.kind === 'text'`, a `TuiTextPrompt` renders with a text input; submitting sends text + Enter
- When `ChatMessage.prompt.kind === 'password'`, a `TuiPasswordPrompt` renders with a masked input; submitting sends text + Enter (never shown in chat history)
- After submission, the prompt component unmounts (or is replaced by the answer text)
- The PTY responds correctly to the sent keystrokes (session advances — verified by GSD continuing its output)

## Tasks

- [ ] **T01: TuiSelectPrompt component**
  Build the select prompt UI: renders options as clickable items, tracks highlighted option, sends arrow keystrokes + Enter on selection.

- [ ] **T02: TuiTextPrompt and TuiPasswordPrompt components**
  Build text and password input prompt UIs; wire into ChatBubble alongside the select prompt.

## Files Likely Touched

- `web/components/gsd/chat-mode.tsx` — add TuiSelectPrompt, TuiTextPrompt, TuiPasswordPrompt; wire into ChatBubble
