# T01: TuiSelectPrompt Component

**Slice:** S03
**Milestone:** M007

## Goal

Build `TuiSelectPrompt` — renders a GSD arrow-key select list as a native clickable list of options. Clicking an option calculates the required arrow-key delta from the current selection, sends the arrow keystrokes + Enter to the PTY, and marks the prompt as submitted.

## Must-Haves

### Truths

- `TuiSelectPrompt` renders `prompt.options[]` as a styled list of clickable items
- Currently highlighted option (from `prompt.selectedIndex`) is visually distinct
- Clicking an option sends `\x1b[A` (arrow up) or `\x1b[B` (arrow down) the correct number of times, then `\r` (Enter) to the PTY
- After submission, the component shows the selected option as a confirmed choice (not interactive)
- Keyboard navigation works: up/down arrow keys on the component update the local selection; Enter submits

### Artifacts

- `web/components/gsd/chat-mode.tsx` — `TuiSelectPrompt` component added; wired into `ChatBubble` when `message.prompt?.kind === 'select'`

### Key Links

- `TuiSelectPrompt` props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
- `onSubmit` calls `ChatPane`'s `sendInput()` with the keystroke sequence
- Arrow key escape codes: up = `\x1b[A`, down = `\x1b[B`, Enter = `\r`

## Steps

1. Build `TuiSelectPrompt` component:
   - Props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
   - Local state: `localIndex` (starts at `prompt.selectedIndex ?? 0`)
   - Render: a styled list of option items; current `localIndex` item gets a highlighted style (e.g., accent background, checkmark indicator)
   - On option click: calculate delta = `clickedIndex - localIndex`; build keystroke string: if delta > 0, `\x1b[B`.repeat(delta); if delta < 0, `\x1b[A`.repeat(Math.abs(delta)); append `\r`; call `onSubmit(keystrokes)`, set `submitted = true`
   - On keyboard (when component or any option has focus): ArrowUp decrements `localIndex`, ArrowDown increments, Enter submits current `localIndex`
   - After submission: render as static "Selected: {option}" text, no longer interactive
2. Style the list: clean, compact option items with a subtle border, hover states, clear selected state indicator. Should feel like a native menu, not a terminal list.
3. Wire into `ChatBubble`: when `message.prompt?.kind === 'select'`, render `TuiSelectPrompt` below the message content
4. Wire `onSubmit` prop through `ChatPane`'s `sendInput` callback chain
5. Test: navigate to a GSD flow that shows a select prompt; verify clicking options sends correct keystrokes and GSD responds

## Context

- ink's select component internally tracks a cursor position. The PTY sees up/down arrow keypresses and moves its cursor. By sending the exact delta in arrows + Enter, we replicate what the user would do in the raw terminal.
- The `prompt.selectedIndex` from the parser reflects the currently highlighted option in the PTY's state. The local `localIndex` starts there so we don't send unnecessary arrows.
- After submission, `submitted` state prevents re-interaction. The parser will eventually emit a new message (GSD's response to the selection) which takes over the chat naturally.
- Keyboard focus is important for accessibility and for users who prefer keyboard navigation. The component should capture ArrowUp/Down/Enter when focused.
