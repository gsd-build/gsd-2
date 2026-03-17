# T02: TuiTextPrompt and TuiPasswordPrompt Components

**Slice:** S03
**Milestone:** M007

## Goal

Build `TuiTextPrompt` and `TuiPasswordPrompt` — native input components for GSD's text and password TUI prompts. Wire all three TUI prompt components into `ChatBubble` dispatch logic.

## Must-Haves

### Truths

- `TuiTextPrompt` renders a labeled text input field; submitting sends the input text + `\r` to the PTY
- `TuiPasswordPrompt` renders a masked (type="password") input field; submitting sends the input text + `\r` to the PTY; the entered value is never shown in the chat message history
- Both components auto-focus on render
- After submission, text prompts show "Entered: {value}" (or just "✓" for password); password prompts show "API key entered ✓" (never the value)
- The PTY responds correctly: GSD continues after receiving the input

### Artifacts

- `web/components/gsd/chat-mode.tsx` — `TuiTextPrompt` and `TuiPasswordPrompt` added; `ChatBubble` dispatches to the correct component based on `message.prompt.kind`

### Key Links

- `TuiTextPrompt` props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
- `TuiPasswordPrompt` props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
- `onSubmit(text + "\r")` — the `\r` is the Enter key; PTY expects it to advance

## Steps

1. Build `TuiTextPrompt`:
   - Props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
   - Render: label from `prompt.label`, text input field
   - Auto-focus on mount: `useEffect(() => { inputRef.current?.focus() }, [])`
   - On Enter keypress or submit button: call `onSubmit(value + "\r")`, set `submitted = true`
   - After submission: render label + "✓ Submitted" (don't show the value for cleanliness)
2. Build `TuiPasswordPrompt`:
   - Same pattern but `<input type="password" />`
   - After submission: render `prompt.label + " — entered ✓"` — never show the value
   - Add a small eye-toggle icon to show/hide the password (standard UX)
3. Build `ChatBubble` prompt dispatch:
   - When `message.prompt` is present and `message.complete === false` (active prompt), render the appropriate prompt component below the message content
   - Dispatch: `kind === 'select'` → `TuiSelectPrompt`; `kind === 'text'` → `TuiTextPrompt`; `kind === 'password'` → `TuiPasswordPrompt`
   - The `onSubmit` callback must reach `ChatPane`'s `sendInput` — thread the prop down or use a context/callback pattern
4. Style: input fields should feel native and clean — not terminal-y. Use the existing `Input` component from `@/components/ui/input` if available, otherwise a styled `<input>`.
5. Test both prompt types with live GSD: verify API key entry and text prompt responses advance the session correctly.

## Context

- GSD uses pi coding agent which prompts for API keys during first-run onboarding. The password prompt pattern is critical for non-technical users — it's often the first thing they encounter.
- The `\r` (carriage return, not `\n`) is what PTY terminals expect for "Enter". Using `\n` alone may not work in all terminal modes.
- Auto-focus is important — when a prompt appears, the user should be able to immediately type without clicking. This is especially true for the API key prompt.
- The `onSubmit` callback threading: `ChatPane` provides `sendInput` → needs to reach `TuiSelectPrompt` / `TuiTextPrompt` / `TuiPasswordPrompt` inside `ChatBubble`. Options: pass it as a prop through the chain, or use a React context scoped to the ChatPane. The prop chain is simpler given the depth is only 2-3 levels.
- Import `Input` from `@/components/ui/input` — it already exists in the component library and will have correct theming.
