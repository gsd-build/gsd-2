# S04: Action Toolbar and Right Panel Lifecycle

**Goal:** Add the GSD workflow action toolbar to Chat Mode and implement the right-panel lifecycle — spawning a secondary chat instance when the user clicks an action button, and auto-closing it when the GSD action completes.

**Demo:** In Chat Mode, a toolbar at the top shows state-aware workflow buttons (Auto, Stop, Plan, Discuss, Step, New Milestone). Clicking "Plan" opens a right-panel chat with a distinct header color. The panel runs the `/gsd` command in a fresh PTY session. When the plan phase completes (GSD returns to idle prompt), the panel automatically slides closed. The main chat remains live throughout.

## Must-Haves

- Chat Mode header has a toolbar with GSD workflow buttons mirroring Power Mode's action bar
- Buttons are state-aware: disabled when appropriate (matching `deriveWorkflowAction` logic)
- Clicking any action button opens the right `ActionPanel` with a distinct visual treatment (accent color, action label in header)
- The right panel contains a `ChatPane` connected to a new secondary PTY session (not the main gsd-main session)
- The new secondary session runs the triggered command automatically on connect (e.g., `/gsd` for plan/discuss, `/gsd auto` for auto)
- `CompletionSignal` from S01's parser triggers the right panel to animate closed
- After close, the secondary PTY session is destroyed (no leaks)
- The panel open/close animates using the motion library
- Only one right panel at a time — clicking a new button while one is open replaces it (closes old, opens new)
- New Milestone button opens the existing `NewMilestoneDialog` (reuse from dual-terminal.tsx)

## Tasks

- [ ] **T01: Action toolbar**
  Build `ChatModeHeader` with the workflow action toolbar — state-derived buttons, disabled states, New Milestone dialog trigger.

- [ ] **T02: Right panel component and lifecycle**
  Build `ActionPanel` — wraps a `ChatPane` for a secondary session, distinct styling, motion open/close animation, auto-close on `CompletionSignal`.

- [ ] **T03: Panel session lifecycle and completion detection**
  Wire the secondary PTY session creation on panel open, destruction on close, and the completion signal subscription that triggers auto-close.

## Files Likely Touched

- `web/components/gsd/chat-mode.tsx` — ChatModeHeader, ActionPanel, lifecycle state
- `web/components/gsd/new-milestone-dialog.tsx` — imported and reused (no changes)
