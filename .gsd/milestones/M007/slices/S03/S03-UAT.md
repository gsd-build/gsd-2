# S03: TUI Prompt Intercept UI — UAT

**Milestone:** M007
**Written:** 2026-03-17

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The core requirement is that keystrokes forwarded to the PTY cause GSD to advance its session. This can only be verified against a real GSD process with actual prompts. Build-level proof (`npm run build:web-host` exits 0) is necessary but not sufficient — runtime PTY forwarding is the risk being retired in this slice.

## Preconditions

1. `npm run build:web-host` exits 0 (confirmed in CI — do not skip).
2. A working GSD dev environment: `gsd --web` can start and reach the Chat Mode view.
3. If running against a fresh install (no provider configured), the onboarding provider select prompt is the ideal test vehicle for `TuiSelectPrompt`.
4. If already configured, trigger a flow that presents a select prompt (e.g., `gsd provider switch` from the Chat Mode input bar, or any workflow with a model/provider selection step).
5. Power Mode terminal open in a side-by-side window or second tab — optional but useful for confirming PTY state after keystrokes are sent.
6. Chrome DevTools open, Network tab filtered to `terminal/input`.

## Smoke Test

Open Chat Mode (`/chat` nav entry), type anything into the input bar, and confirm a chat bubble appears. If the chat view renders and accepts input, S01/S02 are intact and this slice's rendering layer is live.

---

## Test Cases

### 1. TuiSelectPrompt — Provider/Model Select Renders and Advances PTY

**Goal:** Confirm a GSD arrow-key select menu renders as a native clickable list and that clicking an option sends the correct delta keystrokes + Enter.

1. In Chat Mode, trigger a GSD flow that presents a select prompt. The cleanest trigger: if no provider is configured, start `gsd --web` fresh and proceed through onboarding until the provider select menu appears. Alternatively, use the input bar to run a command that shows a select (e.g., model selection if available).
2. Observe the chat bubble: **Expected:** a styled option list appears with the current selection highlighted (accent background + checkmark). Raw escape sequences should NOT be visible.
3. Open DevTools → Console. Run: `window.__chatParser.getMessages()`. **Expected:** the most recent message has `prompt.kind === 'select'` with a non-empty `options` array.
4. Run in DevTools Console: `document.querySelector('[data-testid="tui-select-prompt"]')`. **Expected:** returns the DOM node (not null).
5. Click an option that is NOT the currently highlighted one (e.g., click the second option when the first is highlighted).
6. In DevTools → Network → filter `/api/terminal/input`, find the POST request triggered by your click. **Expected:** the `data` field in the request body contains `\x1b[B\r` (one step down + Enter) if you clicked the second option.
7. **Expected:** the chat bubble transitions to a static `✓ {selectedOptionLabel}` confirmation. The interactive list is gone.
8. **Expected:** GSD session advances — a new bubble appears with GSD's response to the selection, or the onboarding/flow proceeds to the next step.

### 2. TuiSelectPrompt — Keyboard Navigation (ArrowUp/Down/Enter)

**Goal:** Confirm keyboard navigation works without touching the mouse.

1. Trigger a select prompt as in Test Case 1.
2. Confirm the prompt container has focus (it auto-focuses on mount; if not, click the container to focus).
3. Press `ArrowDown` twice. **Expected:** the selection highlight moves down by two items.
4. Press `ArrowUp` once. **Expected:** selection moves back up one item.
5. Press `Enter`. **Expected:** the currently highlighted option is submitted; DevTools Network shows the correct delta in the POST body; static confirmation appears; GSD advances.

### 3. TuiSelectPrompt — Default Selection (Zero Delta)

**Goal:** Confirm clicking the already-highlighted option sends only `\r` (no arrow keys).

1. Trigger a select prompt. Note which option is highlighted (GSD's current cursor position).
2. Click that same option without moving.
3. DevTools → Network → `/api/terminal/input` POST body. **Expected:** `data` is exactly `"\r"` — no `\x1b[A]` or `\x1b[B]` arrows.
4. **Expected:** GSD advances normally (same as pressing Enter in the TUI without moving).

### 4. TuiPasswordPrompt — API Key / Password Input Renders Masked

**Goal:** Confirm a password/API-key prompt renders as a masked input and that the value is never exposed.

1. Trigger a GSD flow that requests an API key or password. If the provider is already configured, temporarily clear the API key via settings to force re-entry, or use a flow that prompts for credentials.
2. Observe the chat bubble. **Expected:** a labeled masked input field appears (dots/bullets, not plaintext). The label text from GSD (e.g., "ANTHROPIC_API_KEY") should appear above the field.
3. Run in DevTools Console: `document.querySelector('[data-testid="tui-password-prompt"]')`. **Expected:** returns the DOM node.
4. Run: `window.__chatParser.getMessages()`. **Expected:** the most recent message has `prompt.kind === 'password'`.
5. Click the eye icon to reveal the value. **Expected:** input switches to plaintext mode. Click again: **Expected:** back to masked.
6. Type a test value (e.g., `sk-test-12345`). Press Enter or click Submit.
7. **Expected:** post-submission shows `"{label} — entered ✓"` — the actual value is NOT displayed.
8. DevTools → Network → `/api/terminal/input` POST body. **Expected:** `data` field is `"sk-test-12345\r"`. (The value IS sent to PTY — that's correct. It's only hidden from the UI.)
9. **Expected:** GSD session advances — accepts the key and continues the flow.
10. DevTools → Console logs: **Expected:** `[TuiPasswordPrompt] submitted label=ANTHROPIC_API_KEY` appears but the value is NOT in any log line.

### 5. TuiTextPrompt — Labeled Text Input Renders and Submits

**Goal:** Confirm a plain text prompt renders as a labeled input and submits correctly.

1. Trigger a GSD flow that requests non-sensitive text input (e.g., a project name prompt, a commit message prompt, or any custom text field GSD presents during a workflow).
2. Observe the chat bubble. **Expected:** a labeled input field with a Submit button appears (not masked).
3. Run: `document.querySelector('[data-testid="tui-text-prompt"]')`. **Expected:** returns the DOM node.
4. The Submit button should be disabled (greyed out) when the input is empty. **Expected:** confirm this visually.
5. Type a value. **Expected:** Submit button becomes active.
6. Press Enter. **Expected:** post-submission shows `✓ Submitted`; DevTools Network confirms `data` field is `"{yourValue}\r"`; GSD advances.

### 6. TuiTextPrompt — Empty Submission Blocked

**Goal:** Confirm the Submit button doesn't fire when the input is empty.

1. Trigger a text prompt.
2. Without typing anything, click the Submit button.
3. **Expected:** nothing happens; button is disabled (CSS `cursor-not-allowed`, muted styling); no POST to `/api/terminal/input`.

### 7. Post-Submission State Is Static (No Double-Send)

**Goal:** Confirm clicking a prompt multiple times only fires one PTY send.

1. Trigger a select prompt.
2. Click an option rapidly twice.
3. DevTools → Network → `/api/terminal/input`. **Expected:** exactly one POST request, not two. The `submitted=true` gate prevents the second click from firing.

---

## Edge Cases

### Long Select List — Scroll Within Prompt

1. Trigger a select prompt with many options (5+).
2. Use ArrowDown to navigate past the visible area if the list has overflow.
3. **Expected:** the prompt container scrolls to keep the highlighted item visible (browser default scroll behaviour within the container).

### Select Prompt Disappears After GSD Advances

1. After clicking an option, if GSD sends more PTY output, the old message should remain with its static `✓ {label}` confirmation.
2. **Expected:** post-submission state persists in the message history; it does not revert to interactive.

### Password Toggle Preserves Value

1. Type a value into a password prompt.
2. Click the eye icon to show it.
3. Click again to hide it.
4. Press Enter.
5. **Expected:** the value that was typed originally is submitted — the show/hide toggle does not clear or corrupt the value.

---

## Failure Signals

- **Raw escape sequences visible in chat bubble**: `PtyChatParser` did not detect the prompt; run `window.__chatParser.getMessages()` — if the message has no `prompt` field, the issue is in the parser (S01), not this slice.
- **Option list renders but GSD does not advance after clicking**: check DevTools Network — if no POST to `/api/terminal/input`, `onSubmitPrompt` prop chain is broken. If POST was sent, inspect the `data` field for incorrect delta (e.g., sending arrows in the wrong direction).
- **`data-testid="tui-select-prompt"` not in DOM but parser shows `prompt.kind === 'select'`**: rendering condition failed — check `!message.complete` (GSD may have already advanced, closing the prompt window before render).
- **Password value appears in console**: redaction regression — `[TuiPasswordPrompt] submitted` log line must contain only `label`, never `value`. File a bug immediately.
- **`tui-prompt-submitted` not in DOM after clicking**: `submitted` state did not flip — check that `submitIndex`/`handleSubmit` callback was reached (add breakpoint).
- **Build fails**: run `npm run build:web-host` and read TypeScript errors; most likely a missing import or type mismatch in `chat-mode.tsx`.

---

## Requirements Proved By This UAT

- R113 — TUI prompt interception: select, text, and password prompts render as native UI components and correctly forward input to the PTY, causing GSD to advance its session.

## Not Proven By This UAT

- Action toolbar and right panel lifecycle (S04 scope).
- Panel auto-close on `CompletionSignal` (S04 scope).
- TUI prompt components inside action panel `ChatPane` instances (functional because they're wired generically, but not explicitly tested here).
- Performance under high-frequency PTY output while a prompt is displayed.

## Notes for Tester

- The `window.__chatParser.getMessages()` console call is the fastest first-pass diagnostic — use it before any other debugging step.
- If you're testing against a fresh install, the onboarding provider select is the most reliable `TuiSelectPrompt` trigger.
- For `TuiPasswordPrompt`, temporarily clearing your provider API key and re-running onboarding is the cleanest trigger in a configured environment.
- The Power Mode terminal (if open in a side-by-side tab) will show the raw PTY response after keystrokes — useful for confirming GSD's actual state change, independent of the Chat Mode rendering layer.
- Do not test with `npm run dev` (Turbopack) if the standalone build has been modified — always verify against `npm run build:web-host` output for final UAT.
