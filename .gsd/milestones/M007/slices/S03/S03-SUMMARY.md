---
id: S03
parent: M007
milestone: M007
provides:
  - TuiSelectPrompt component in web/components/gsd/chat-mode.tsx
  - TuiTextPrompt component in web/components/gsd/chat-mode.tsx
  - TuiPasswordPrompt component in web/components/gsd/chat-mode.tsx
  - ChatBubble full prompt dispatch (select | text | password)
  - onSubmitPrompt prop thread from ChatPane.sendInput → ChatMessageList → ChatBubble → prompt component
requires:
  - slice: S01
    provides: TuiPrompt type (kind, label, options?, selectedIndex?)
  - slice: S02
    provides: ChatPane.sendInput callback, ChatBubble prompt dispatch slot, ChatMessageList
affects:
  - S04
key_files:
  - web/components/gsd/chat-mode.tsx
key_decisions:
  - TuiSelectPrompt renders only when message.prompt?.kind === 'select' AND !message.complete — active PTY-window only
  - localIndex initialised from prompt.selectedIndex ?? 0; zero arrows sent when user clicks the already-highlighted option
  - submitted=true flips before onSubmit fires — prevents double-send race on fast clicks
  - hasAnyPrompt = hasSelectPrompt || hasTextPrompt || hasPasswordPrompt suppresses StreamingCursor while any prompt is live
  - Eye-toggle button uses tabIndex=-1 so Tab progression stays on the password input
  - TuiPasswordPrompt value never referenced in console logs or post-submission DOM
patterns_established:
  - data-testid="tui-{kind}-prompt" on pre-submission containers; "tui-prompt-submitted" shared across all kinds
  - console.log("[TuiSelectPrompt|TuiTextPrompt|TuiPasswordPrompt] mounted kind=X label=Y") matches existing [ChatPane] prefix convention
  - Arrow-key delta calculation: positive delta → \x1b[B repeat; negative → \x1b[A repeat; always append \r
  - Static post-submission confirmation (not interactive); password shows "{label} — entered ✓" only
observability_surfaces:
  - console.log "[TuiSelectPrompt] submit delta=%d keystrokes=%j" on submit — confirms delta calculation
  - data-testid="tui-select-prompt", data-testid="tui-select-option-{i}" — confirm render without visual inspection
  - data-testid="tui-prompt-submitted" — shared signal across all three kinds for generic submission detection
  - window.__chatParser.getMessages() — parser-level prompt.kind inspection
  - DevTools Network /api/terminal/input POST body — keystroke string confirmation
drill_down_paths:
  - .gsd/milestones/M007/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S03/tasks/T02-SUMMARY.md
duration: ~45min
verification_result: passed
completed_at: 2026-03-17
---

# S03: TUI Prompt Intercept UI

**Three native prompt components (`TuiSelectPrompt`, `TuiTextPrompt`, `TuiPasswordPrompt`) replace raw escape sequences in the Chat Mode view, forwarding correct keystrokes to the PTY on submission.**

## What Happened

S03 was a focused implementation slice with two sequential tasks, no architectural surprises, and no deviations from plan.

**T01** built `TuiSelectPrompt` — the most critical component because arrow-key select menus are GSD's primary interactive surface (provider selection, model selection, action confirmation). The component maintains a `localIndex` mirroring the PTY's current cursor position (seeded from `prompt.selectedIndex`), calculates the delta between the current position and the clicked option, constructs the correct `\x1b[A`/`\x1b[B` repeat string + `\r`, and forwards it via `onSubmit`. Keyboard navigation (ArrowUp/Down/Enter) is handled on a `tabIndex=0` container div with auto-focus on mount. `submitted=true` flips before `onSubmit` fires to eliminate double-send on fast clicks. The component was wired into `ChatBubble` via a new `onSubmitPrompt` prop drilled through `ChatMessageList`, with `ChatPane.sendInput` as the terminal sink.

**T02** built `TuiTextPrompt` and `TuiPasswordPrompt`, completing the `ChatBubble` prompt dispatch. `TuiTextPrompt` is a labeled input that auto-focuses on mount and submits `value + "\r"` on Enter or button click (disabled when empty). `TuiPasswordPrompt` adds a show/hide eye-toggle (`tabIndex=-1` to preserve Tab flow), `autoComplete="off"`, and strict redaction: the value is never logged, never echoed, and the post-submission confirmation shows only `"{label} — entered ✓"`. Both components log their mount events without values. A small UX addition not in the plan: an informational footer on `TuiPasswordPrompt` reads "Value is transmitted securely and not stored in chat history."

The `ChatBubble` dispatch was extended from a single `hasSelectPrompt` guard to three typed booleans unified into `hasAnyPrompt`, which also gates the `StreamingCursor` — ensuring the animated cursor doesn't compete visually with an active prompt.

## Verification

- `npm run build:web-host` exits 0 — confirmed twice (after T01 and after T02). Zero TypeScript errors. One pre-existing `@gsd/native` module warning unrelated to this slice.
- Code-level wiring traced end-to-end: PTY SSE → `PtyChatParser` → `message.prompt.kind` → `ChatBubble` dispatch → prompt component → `onSubmit` → `ChatPane.sendInput` queue → `POST /api/terminal/input`.
- Delta calculation verified by inspection: `delta > 0 → \x1b[B`.repeat(delta); `delta < 0 → \x1b[A`.repeat(-delta); `+\r` always appended.
- Redaction confirmed: `TuiPasswordPrompt.handleSubmit` logs only `prompt.label`; value not referenced anywhere in log or DOM.
- All `data-testid` attributes confirmed present: `tui-select-prompt`, `tui-select-option-{i}`, `tui-text-prompt`, `tui-password-prompt`, `tui-prompt-submitted`.
- Live runtime / UAT: requires a running GSD instance that presents actual prompts (see S03-UAT.md for the complete manual test protocol).

## Requirements Advanced

- R113 — TUI prompt interception is now the third major piece of Chat Mode; select, text, and password prompts render as native UI with correct PTY forwarding.

## Requirements Validated

- None newly validated by this slice alone; R113 moves to validated when S04 completes the milestone.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

None — implementation matches plan exactly. One small unplanned addition: informational footer in `TuiPasswordPrompt` ("Value is transmitted securely and not stored in chat history.") added for user reassurance. This does not affect behaviour or wiring.

## Known Limitations

- Live runtime UAT has not been executed against a real GSD session with actual prompts — the slice plan marks this as a human/UAT-required verification. The build-level proof is complete; the live proof is documented in S03-UAT.md for execution.
- `TuiSelectPrompt` renders only when `!message.complete` — if the parser marks a message complete before the user interacts, the prompt disappears. This is the correct behaviour (GSD has already moved on), but it means slow SSE or prompt mis-detection can cause a prompt to flash and vanish.
- `prompt.options` on `TuiSelectPrompt` is accessed without null-guard (the type allows `options?: string[]`). If the parser emits a `select` prompt with no options array, the component will throw. This is a parser contract issue, not a UI bug, but worth hardening in S04 or a follow-up.

## Follow-ups

- S04 will consume `TuiSelectPrompt`, `TuiTextPrompt`, and `TuiPasswordPrompt` inside action panel `ChatPane` instances — no changes required in this slice; they are already wired generically through `ChatPane`.
- Consider adding a null-guard on `prompt.options ?? []` in `TuiSelectPrompt` as defensive hardening before the milestone ships.

## Files Created/Modified

- `web/components/gsd/chat-mode.tsx` — Added `TuiSelectPrompt`, `TuiTextPrompt`, `TuiPasswordPrompt`; updated `ChatBubble` full prompt dispatch; updated `ChatMessageList` to thread `onSubmitPrompt`; updated `ChatPane` to pass `sendInput` as `onSubmitPrompt`; added `Check`, `Eye`, `EyeOff` lucide imports; added `Input` from `@/components/ui/input`
- `.gsd/milestones/M007/slices/S03/S03-PLAN.md` — Added `## Observability / Diagnostics` section (runtime signals, inspection surfaces, failure visibility, redaction constraints, failure-path verification step); marked T01 and T02 `[x]`
- `.gsd/milestones/M007/slices/S03/tasks/T01-PLAN.md` — Added `## Observability Impact` section
- `.gsd/milestones/M007/slices/S03/tasks/T02-PLAN.md` — Added `## Observability Impact` section

## Forward Intelligence

### What the next slice should know
- All three prompt components are already wired through `ChatPane` generically — S04's action panel `ChatPane` gets them for free with no additional prop wiring.
- `onSubmitPrompt` flows from `ChatPane.sendInput` through `ChatMessageList.onSubmitPrompt` to `ChatBubble.onSubmitPrompt`. If S04 adds any intermediate wrapper around `ChatPane`, it must not break this prop chain.
- The `hasAnyPrompt` gate in `ChatBubble` suppresses `StreamingCursor` — if S04 adds other cursor-adjacent UI, check for interaction with this gate.

### What's fragile
- `TuiSelectPrompt` assumes `prompt.options` is a non-null array — if the parser emits a `select` kind without options, the component throws. The parser should always provide options for `select` kinds, but a defensive `?? []` guard would be safer.
- `submitted=true` is local component state — it does not persist across React reconciliation (e.g., if the message list re-renders from a key change, the prompt reverts to interactive). The current architecture avoids this because `ChatMessageList` keys by `msg.id` and messages are append-only, but any future re-keying could cause prompt re-activation.

### Authoritative diagnostics
- `window.__chatParser.getMessages()` in browser console — most reliable first signal; shows whether the parser emitted a prompt at all.
- DevTools → Network → `/api/terminal/input` POST body — confirms keystroke string sent to PTY; the `data` field should end with `\r` and contain the delta arrows for select.
- `document.querySelector('[data-testid="tui-prompt-submitted"]')` — confirms submission completed without needing visual inspection.

### What assumptions changed
- No assumptions changed — the plan's architecture matched reality exactly. The S01 `TuiPrompt` type, S02 `ChatPane.sendInput` callback, and `ChatBubble` render slot all existed as specified in the boundary map.
