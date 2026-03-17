---
id: T01
parent: S02
milestone: M007
provides:
  - Chat nav entry in sidebar NavRail (MessagesSquare icon, between Power Mode and Roadmap)
  - "chat" registered in KNOWN_VIEWS and persisted via sessionStorage
  - ChatMode component scaffold (header, placeholder pane, disabled input bar)
  - Bottom terminal panel suppressed when activeView === "chat"
key_files:
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/chat-mode.tsx
key_decisions:
  - ChatMode is not pre-mounted with hidden class — it renders on demand (unlike DualTerminal which needs PTY pre-init); the gsd-main session is already pre-initialized by DualTerminal
  - Terminal panel hidden condition extended from `activeView !== "power"` to `activeView !== "power" && activeView !== "chat"` — chat has its own input bar (T03)
patterns_established:
  - New view scaffold pattern: (1) add icon import to sidebar.tsx, (2) add navItems entry, (3) add to KNOWN_VIEWS Set, (4) create component file, (5) import and conditionally render in app-shell.tsx
observability_surfaces:
  - sessionStorage key "gsd-active-view:<cwd>" stores the active view — assert value "chat" to confirm persistence
  - Browser console: no errors on ChatMode mount means scaffold renders cleanly
  - ChatMode suppresses terminal panel; absence of Terminal textarea in DOM confirms correct condition
duration: ~20m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Nav Entry and View Scaffold

**Added the "Chat" nav entry to the sidebar NavRail, wired `activeView === "chat"` in app-shell.tsx, and scaffolded the `ChatMode` component with header bar, placeholder pane, and disabled input bar.**

## What Happened

1. Added `MessagesSquare` to the lucide-react imports in `sidebar.tsx`.
2. Inserted `{ id: "chat", label: "Chat", icon: MessagesSquare }` into the `navItems` array after `power` and before `roadmap`.
3. Added `"chat"` to the `KNOWN_VIEWS` Set in `app-shell.tsx`.
4. Imported `ChatMode` from `@/components/gsd/chat-mode` in `app-shell.tsx`.
5. Added `{activeView === "chat" && <ChatMode />}` in the view routing block.
6. Extended the terminal panel visibility condition from `activeView !== "power"` to `activeView !== "power" && activeView !== "chat"`.
7. Created `web/components/gsd/chat-mode.tsx` (80 lines): `ChatMode` root (full-height flex column), `ChatModeHeader` (Chat label + GSD-MAIN badge), `ChatPane` (scrollable area + input bar scaffold), `PlaceholderState` (empty state icon + description), `ChatInputBarScaffold` (disabled input, placeholder text "coming in T03").

## Verification

- `npm run build:web-host` exits 0 (7.7s Turbopack build, only pre-existing `@gsd/native` warning).
- Browser: clicked Chat icon (3rd from top in NavRail) → Chat view rendered with header, placeholder, and suppressed terminal panel.
- `sessionStorage.getItem("gsd-active-view:/Users/sn0w/Documents/dev/GSD-2/web")` returned `"chat"` while Chat was active, then `"dashboard"` after switching back — persistence confirmed.
- Switched to Dashboard → renders correctly, Terminal panel returns. No regressions.
- `document.body.innerText.includes("Terminal ▲")` → `false` while in Chat view (terminal suppressed correctly).
- Browser console: 0 errors.

## Diagnostics

- Active view: `sessionStorage.getItem("gsd-active-view:<projectCwd>")` returns `"chat"` when Chat is selected.
- Component mount: ChatMode only mounts when `activeView === "chat"` — no hidden DOM element to inspect otherwise.
- Terminal suppression: absence of `textarea[aria-label="Terminal input"]` in DOM confirms the condition is working.

## Deviations

None — implementation followed the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/sidebar.tsx` — added `MessagesSquare` import; added `{ id: "chat", label: "Chat", icon: MessagesSquare }` to navItems after `power`
- `web/components/gsd/app-shell.tsx` — added `"chat"` to KNOWN_VIEWS; imported and rendered `ChatMode`; extended terminal suppression condition
- `web/components/gsd/chat-mode.tsx` (new) — 80-line scaffold: `ChatMode`, `ChatModeHeader`, `ChatPane`, `PlaceholderState`, `ChatInputBarScaffold`
