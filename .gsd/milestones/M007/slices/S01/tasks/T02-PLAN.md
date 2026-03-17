# T02: TUI Prompt Detector and Completion Signal Emitter

**Slice:** S01
**Milestone:** M007

## Goal

Extend `PtyChatParser` with two capabilities: (1) detect ink/TUI interactive prompts in the PTY output stream and attach a `TuiPrompt` object to the current message, and (2) detect GSD action completion patterns and emit `CompletionSignal` to subscribers.

## Must-Haves

### Truths

- When PTY output contains an ink select list pattern, `getMessages()` returns a message with `prompt.kind === 'select'` and `prompt.options[]` populated
- When PTY output contains a text input prompt, `getMessages()` returns a message with `prompt.kind === 'text'` and `prompt.label` set
- When PTY output contains a password/API-key prompt, `getMessages()` returns a message with `prompt.kind === 'password'`
- `onCompletionSignal(cb)` fires when the parser detects a GSD action-complete pattern; returns an unsubscribe function
- Existing T01 behavior (ANSI strip, segmentation, role assignment) is not broken

### Artifacts

- `web/lib/pty-chat-parser.ts` — extended with TUI detection + completion signals (min 200 lines total)

### Key Links

- `ChatMessage.prompt?: TuiPrompt` — optional; only set when a TUI interactive prompt is the active state
- `CompletionSignal` triggers panel auto-close in S04

## Steps

1. Research GSD/ink TUI prompt patterns: run `gsd` in a terminal and capture raw output with `script` or by reading the SSE stream directly; note the ANSI patterns for select lists (highlighted option, arrow navigation), text prompts (cursor at end of label), and password fields (masked input)
2. Define `TuiPrompt` interface: `{ kind: 'select' | 'text' | 'password'; label: string; options?: string[]; selectedIndex?: number }`
3. Define `CompletionSignal` interface: `{ source: string; timestamp: number }` — emitted when parser detects completion
4. Implement select prompt detector: ink select lists use a pattern of multiple lines each prefixed with `◯` or `●` (or similar unicode bullets) — detect this pattern after ANSI stripping
5. Implement text prompt detector: look for a line ending with `: ` or `> ` that is followed by cursor positioning (suggesting an input field)
6. Implement password/API-key detector: look for patterns like `API key:`, `Enter key:`, `Password:` followed by masked input indicators
7. Implement completion signal patterns: GSD action completion appears as the main prompt returning after a `/gsd` command finishes (e.g., the `❯` prompt reappears after auto mode stops, or after discuss/plan phases conclude)
8. Add `onCompletionSignal(cb)` to `PtyChatParser` with subscriber/unsubscribe pattern
9. Add `selectedIndex` tracking: when the parser sees cursor-up/down in a select context, update `prompt.selectedIndex`
10. Test with fixture strings for each prompt type and for completion signal

## Context

- GSD uses the ink library for TUI rendering. Ink renders interactive components using ANSI cursor positioning and color codes. After ANSI stripping, select lists look like lists of text options with a highlighted current selection.
- The completion detection heuristic: after a `/gsd` command (discuss, plan, auto, etc.), the action panel should close when the main GSD prompt reappears and the action-specific output has stopped. The signal is the return of the input prompt after a period of output.
- For password fields, GSD's pi agent asks for API keys during onboarding. These look like: `? Anthropic API key: ` with the cursor at the end. The password kind should mask display but pass input through.
- Be conservative with completion signals — false positives (premature close) are worse than false negatives (panel stays open slightly too long). Require at least 2 seconds of no output + prompt reappearance before emitting.
- `selectedIndex` is updated reactively so the TUI select UI in S03 can show the current highlighted option as the user navigates with keyboard arrows.
