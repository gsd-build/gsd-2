# T02: Right Panel Component and Lifecycle

**Slice:** S04
**Milestone:** M007

## Goal

Build `ActionPanel` — a right-side chat pane that opens when an action button is clicked, displays a secondary GSD session with distinct visual treatment, and closes automatically when the action completes.

## Must-Haves

### Truths

- Clicking an action button (Discuss, Plan, etc.) opens `ActionPanel` with a slide-in animation
- The panel has a distinct header: action name as title, a close button, and a distinct accent color treatment (e.g., tinted header border or background)
- `ActionPanel` contains a `ChatPane` connected to a fresh secondary PTY session
- The secondary session receives the triggered command automatically on connection
- `onCompletionSignal` from the `ChatPane`'s parser triggers the panel to animate closed
- Manual close (X button) also works at any time
- After close: the secondary PTY session is destroyed via DELETE to `/api/terminal/sessions?id=...`
- Only one panel open at a time: opening a new one closes the current one first
- Animation uses the motion library (`motion.div` with `AnimatePresence`)

### Artifacts

- `web/components/gsd/chat-mode.tsx` — `ActionPanel` component, `actionPanelState` in `ChatMode`, panel trigger buttons

### Key Links

- `ActionPanel` props: `{ action: ActionPanelConfig; onClose: () => void }`
- `ActionPanelConfig`: `{ label: string; command: string; sessionId: string; accentColor: string }`
- Secondary session ID: generated as `"gsd-action-" + Date.now()` for uniqueness
- Destroy session: `fetch("/api/terminal/sessions?id=...", { method: "DELETE" })`

## Steps

1. Define `ActionPanelConfig` type and `actionPanelState: ActionPanelConfig | null` in `ChatMode`
2. Define the set of action trigger buttons — these are NOT the workflow buttons from T01, they are additional GSD phase buttons:
   - "Discuss" → command: `/gsd` (triggers discuss flow)
   - "Plan" → command: `/gsd` (when in planning phase)
   - "New Milestone" → opens NewMilestoneDialog (not a panel)
   These can be derived from the current phase or presented as always-available
3. Build action trigger button rendering in `ChatModeHeader` — a secondary row or group of buttons with a lighter style
4. Build `ActionPanel` component:
   - Props: `{ config: ActionPanelConfig; onClose: () => void }`
   - Renders a right-side pane (fixed width ~40-45% of container, or resize handle) with:
     - Distinct header: `config.label`, X close button, colored top border or tinted header using `config.accentColor`
     - `ChatPane` with `sessionId={config.sessionId}` and `command="pi"`
   - On `CompletionSignal` from the ChatPane's parser: call `onClose()` after a short delay (1.5s) so the user sees the completion
   - X button: call `onClose()` immediately
5. Implement panel animation with motion:
   ```
   <AnimatePresence>
     {actionPanelState && (
       <motion.div
         initial={{ x: "100%", opacity: 0 }}
         animate={{ x: 0, opacity: 1 }}
         exit={{ x: "100%", opacity: 0 }}
         transition={{ type: "spring", stiffness: 300, damping: 30 }}
       >
         <ActionPanel config={actionPanelState} onClose={closePanel} />
       </motion.div>
     )}
   </AnimatePresence>
   ```
6. Implement `closePanel` in `ChatMode`:
   - Capture current `actionPanelState.sessionId`
   - Set `actionPanelState = null` (triggers exit animation)
   - After animation (300ms), DELETE the session: `fetch("/api/terminal/sessions?id=...", { method: "DELETE" })`
7. Implement `openPanel(action)` in `ChatMode`:
   - If panel already open: call `closePanel()`, wait for close, then open new
   - Generate fresh `sessionId`
   - Set `actionPanelState = { ...action, sessionId }`
8. Wire the layout: when `actionPanelState !== null`, the main `ChatPane` and `ActionPanel` split the horizontal space (main gets ~55-60%, panel gets 40-45%). Use flexbox or a CSS grid.

## Context

- The accent color per action gives each panel a visual identity: `discuss` could use sky/blue, `plan` could use amber/orange, `auto` could use green. These map to lucide icon colors already in use across GSD.
- The auto-close delay (1.5s after CompletionSignal) is intentional — it lets the user see the completion message before the panel disappears. Instant close feels jarring.
- Session cleanup on close is important. Each panel open creates a new PTY session. Without explicit DELETE, sessions accumulate over time.
- "Only one panel at a time" keeps the layout simple. The replace behavior (close old, open new) means the user never has to manage multiple panels.
