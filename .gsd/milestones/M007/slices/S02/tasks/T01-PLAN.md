# T01: Nav Entry and View Scaffold

**Slice:** S02
**Milestone:** M007

## Goal

Add the "Chat" nav entry to the sidebar below Power Mode, wire the `chat` view into `app-shell.tsx`, and build the structural skeleton of `ChatMode` (layout, header, pane placeholder) without live data yet.

## Must-Haves

### Truths

- A "Chat" (or "Chat Mode") icon appears in the sidebar NavRail between Power Mode and Roadmap
- Clicking it sets `activeView === "chat"` and renders the ChatMode component
- The chat view persists across tab switches (view stored in sessionStorage like other views)
- `ChatMode` renders a header bar and a left-pane area (content placeholder acceptable at this stage)
- No regressions in existing nav items or views

### Artifacts

- `web/components/gsd/sidebar.tsx` — new nav item added (MessageSquare or MessagesSquare icon, label "Chat")
- `web/components/gsd/app-shell.tsx` — `"chat"` added to KNOWN_VIEWS; ChatMode imported and rendered when `activeView === "chat"`; DualTerminal mount strategy preserved
- `web/components/gsd/chat-mode.tsx` (new) — ChatMode component with layout skeleton (min 60 lines)

### Key Links

- `app-shell.tsx` KNOWN_VIEWS Set → `"chat"` entry added
- `sidebar.tsx` navItems array → `{ id: "chat", label: "Chat", icon: MessagesSquare }` after the `power` entry
- `chat-mode.tsx` exported `ChatMode` → imported into `app-shell.tsx`

## Steps

1. Read `web/components/gsd/sidebar.tsx` navItems array to find the exact insertion point after Power Mode
2. Read `web/components/gsd/app-shell.tsx` to understand KNOWN_VIEWS, view routing, and how DualTerminal is handled (always mounted but hidden)
3. Add `MessagesSquare` (or `MessageSquare`) from lucide-react to sidebar navItems after `power` entry
4. Add `"chat"` to the KNOWN_VIEWS Set in app-shell.tsx
5. Create `web/components/gsd/chat-mode.tsx` with a `ChatMode` component — layout: header bar at top, left pane takes full remaining height, placeholder content in pane
6. Import `ChatMode` into `app-shell.tsx`; add `{activeView === "chat" && <ChatMode />}` in the view routing section — do NOT apply the "hidden" pattern (unlike DualTerminal, ChatMode doesn't need pre-initialization at this stage)
7. Verify the nav item renders, clicking switches views, and sessionStorage persistence works

## Context

- The sidebar NavRail in `sidebar.tsx` has a `navItems` array that feeds a map of icon buttons. Add to this array — don't duplicate the rendering logic.
- DualTerminal is special-cased to always mount (for PTY pre-init). Chat Mode does NOT need this — the "gsd-main" session is already pre-initialized by DualTerminal.
- The terminal panel at the bottom of the workspace is hidden when `activeView === "power"`. Add `activeView === "chat"` to that same condition — chat mode has its own input bar, it doesn't need the bottom terminal.
- Use `MessagesSquare` from lucide-react for the chat icon — it's already in the lucide-react dependency.
