// GSD-2 Web UI — Multi-Project/Session/Team PRD
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# GSD Web UI — Multi-Project / Multi-Session / Multi-Client PRD

**Version:** 1.0.0
**Date:** 2026-03-20
**Author:** Jeremy McSpadden
**Status:** Draft — Implementation Ready

---

## 1. Overview

### 1.1 Problem Statement

The GSD web UI was designed for a single active project in a single terminal session. As GSD usage grows — multiple projects running simultaneously, developers monitoring from phones or secondary machines, and small teams sharing a GSD instance — the current architecture creates hard blockers:

- **One project at a time.** `activeBasePath` is a single module-level variable. Opening a second GSD process on a different project produces a second server on a different port, with no shared routing or cross-project aggregation.
- **No session identity on the wire.** Every `log_line` WS event carries `{ level, message, timestamp }` — no project hash, no session ID. Clients cannot filter, correlate, or display logs from more than one session simultaneously.
- **No multi-client differentiation.** `const clients = new Set<WebSocket>()` broadcasts all events to every client with no subscription filtering. A browser tab watching Project A receives all events for Project B.
- **No session lifecycle control from the browser.** `start_auto` returns HTTP 501 by design. There is no UI surface for this constraint, leaving users confused about why the start button appears to fail.
- **No reconnect-aware state machine.** The current WS client exposes three states (`connected | connecting | disconnected`), but the UX requires five to properly represent reconnecting-with-backoff and degraded (connected but stale) states.
- **Localhost-only.** The server binds to `127.0.0.1`. Developers on a secondary machine on the same LAN cannot access the dashboard without SSH tunneling.
- **No human team presence.** There is no mechanism to know how many browser clients are viewing the dashboard simultaneously, nor which project/session they are observing.
- **No notification system.** Critical events (budget ceiling hit, worker error, auto-mode stopped) are silently logged. No toast, badge, or push mechanism surfaces them to the user.

### 1.2 Opportunity

GSD is evolving from a solo developer tool into a team-observable platform. The web UI is its only graphical surface. Investing in multi-session routing, a disciplined WS subscription model, LAN access, team presence, and a notification layer transforms GSD from a monitoring dashboard into an operational control plane that scales from one developer to a small engineering team observing parallel AI workers across multiple active projects.

### 1.3 Release Scope Summary

| Phase | Theme | Key Deliverables |
|-------|-------|-----------------|
| Phase 1 | Multi-Session Routing Foundation | Session-tagged WS events, per-client subscription filtering, 5-state WS machine, configurable server URL, session switcher UI |
| Phase 2 | Multi-Project Dashboard | Cross-project aggregation view, multi-watcher server, project switcher UI, session lifecycle surface (start_auto UX) |
| Phase 3 | Team Coordination Features | Presence awareness, notification system, human team member visibility, cross-session dashboard layout |

---

## 2. Goals

1. **G-01** — Any number of connected browser clients can each independently subscribe to a specific project+session and receive only the events for their chosen context.
2. **G-02** — The WS client implements a 5-state machine (`disconnected | connecting | connected | reconnecting | degraded`) with exponential backoff, visible in the UI connection status indicator.
3. **G-03** — The server URL is configurable at runtime from the UI (input field → localStorage → reconnects without page reload), enabling LAN access without rebuilding the app.
4. **G-04** — `log_line` WS events carry `projectHash` and `sessionId` so clients can filter by subscribed context.
5. **G-05** — The web server optionally binds to `0.0.0.0` (LAN-accessible) via an explicit config flag, defaulting to `127.0.0.1` (localhost-only).
6. **G-06** — A cross-project dashboard aggregates high-level status (active session, phase, cost, worker count) across all known projects.
7. **G-07** — A notification system surfaces critical events (budget alerts, worker errors, auto-stop events) as in-app toasts and a persistent notification drawer.
8. **G-08** — The UI correctly represents the `start_auto` constraint (requires CLI terminal context) rather than silently returning 501.
9. **G-09** — Team presence indicators show how many browser clients are observing the same project+session, pushed by the server — no polling.
10. **G-10** — All new features are browser-observable only; no new CLI commands are required.

---

## 3. Non-Goals

| Non-Goal | Rationale |
|----------|-----------|
| **Implementing `start_auto` via the web UI** | `start_auto` requires a terminal context to spawn the GSD process. The server already returns 501 by design. Circumventing this would require spawning a detached child process from the web server, which adds significant complexity, lifecycle management risk, and security surface. The correct UX is to inform the user clearly, not to work around the constraint. |
| **Full authentication and authorization system (JWT, OAuth, RBAC)** | Out of scope for Phase 1–3. The intended audience is small teams on trusted LANs. Full auth adds significant backend complexity. See Open Question OQ-01 for the short-term LAN auth approach. |
| **Multi-machine GSD orchestration (running workers across different hosts)** | GSD workers are child processes on the same machine. Cross-machine orchestration is a fundamentally different architecture (distributed job queue). Not addressable by web-server.ts changes alone. |
| **Mobile-native app** | The web UI is a responsive web app. Native iOS/Android is out of scope. |
| **AI agent worker management UI (start/stop individual workers)** | Workers are managed by the parallel orchestrator internally. The web UI can observe worker state but direct worker manipulation via UI is not in scope for these phases — it would require new `parallel-orchestrator.ts` API surface. |
| **Historical session replay** | Log replay from past sessions requires persistent storage (database or log files per session). Current architecture uses an in-memory ring buffer (`getRecentLogs()`). Session persistence is a separate infrastructure concern. |
| **Dark/light theme switching** | Theme tokens exist (`/web/src/lib/theme/tokens.ts`) but theme switching is a UX polish task, not a blocker for multi-session functionality. |

---

## 4. Users and Use Cases

### 4.1 User Personas

**P1 — Solo Developer (Primary)**
A developer running one or two GSD projects on a single machine. Uses the web UI to monitor auto-mode progress, inspect worker costs, and review decisions. Wants zero-config access from `http://127.0.0.1:4242`. Occasionally wants to check in from a phone on the same WiFi.

**P2 — Developer + Secondary Device**
Same as P1 but wants to view the dashboard on a tablet or secondary laptop on the same LAN without SSH tunnel setup. Needs configurable server URL and optional LAN binding.

**P3 — Small Engineering Team (2–5 people)**
A team where one member owns the GSD machine but others want read-only visibility into project status, cost burn, and milestone progress. Members may have different projects active simultaneously. Needs presence awareness and notifications so team members know who is watching.

**P4 — Multi-Project Power User**
A developer running 3–4 GSD projects in parallel (separate terminals, separate ports, or a shared server). Wants a unified dashboard to see aggregate cost, which projects are actively running auto, and which have errors — without switching tabs.

### 4.2 User Stories

| # | As a [persona] | I want [action] | So that [outcome] |
|---|---------------|-----------------|-------------------|
| US-01 | Solo Developer (P1) | To see which WebSocket state I am in (connecting, reconnecting, degraded) | I know immediately whether the dashboard data is live or stale |
| US-02 | Solo Developer (P1) | To understand why the "Start Auto" button is unavailable | I don't waste time clicking it and getting a silent error |
| US-03 | Developer + Secondary Device (P2) | To type a custom server URL into the UI and have it connect without a page reload | I can monitor GSD from my tablet without editing config files |
| US-04 | Developer + Secondary Device (P2) | To have the UI reconnect automatically if I walk away and my device sleeps | I don't need to manually refresh the page |
| US-05 | Small Team (P3) | To see a "2 others are watching this session" indicator | I know my teammates are already looking at the same dashboard |
| US-06 | Small Team (P3) | To receive an in-app toast notification when auto-mode stops unexpectedly | I catch problems immediately without keeping the browser tab focused |
| US-07 | Multi-Project Power User (P4) | To view a cross-project summary showing all known projects, their current phase, and cost | I don't have to switch between four browser tabs to check status |
| US-08 | Multi-Project Power User (P4) | To select a specific project and session from a switcher in the nav | I can drill into any active project without changing the server URL |
| US-09 | Small Team (P3) | To filter the logs view to only show logs for my currently subscribed session | I don't see interleaved log output from other team members' sessions |
| US-10 | Solo Developer (P1) | To receive a budget ceiling warning notification before costs are exceeded | I can pause or stop auto before hitting the budget limit |
| US-11 | Developer + Secondary Device (P2) | To have my server URL and selected project persist across page refreshes via localStorage | I don't have to reconfigure every time I open the dashboard |
| US-12 | Small Team (P3) | To see parallel AI workers listed per session with their milestone, state, and cost | I understand which AI processes are running and how much they cost |

---

## 5. Feature Specifications

### 5.1 Multi-Project Management

**Problem Statement**
The server maintains a single `activeBasePath` and a `hashToBasePath` Map that is populated only for the one project that called `startWebServer()`. Browsing to `/api/state?project=<otherHash>` returns 404 because `resolveBasePath()` only knows about the single active project.

**Proposed Solution**
`[web-server.ts]` Extend the server to maintain a registry of all projects discovered via `discoverProjects()`, not just the one that started the server. Add a background watcher that re-scans `~/.gsd/projects/` every 60 seconds and on startup. Populate `hashToBasePath` for all discovered projects that have a `.gsd/` directory on disk (i.e., the project has been initialized). The `activeBasePath` concept is retained but relabeled as the "primary session project" — the one that called `startWebServer()`.

`[web-server.ts]` Add a `GET /api/sessions` endpoint that returns the list of all known project hashes with their session state (active session running or not, based on `isParallelActive()` context per project — initially only valid for the primary project).

`[/web]` The project switcher (see Section 9.2) reads from `GET /api/projects` and `GET /api/sessions`. When the user selects a project, the `connectionStore` sets `activeProjectHash`, which propagates to all hooks via their `useActiveProjectHash()` selector.

**API Dependencies**
- `GET /api/projects` — already exists, returns `{ hash, name }[]`
- `GET /api/sessions` — new endpoint (see Section 7)
- `GET /api/state?project=<hash>` — must work for non-primary projects (currently returns 404)

**UX Behavior**
- Project list is always visible in the left sidebar under a "Projects" section header.
- Active project is highlighted with a left border accent.
- Projects with no active session show a gray dot indicator; active sessions show a green pulsing dot.
- Selecting a project updates the route to `/?project=<hash>` and re-fetches all data hooks.

**Acceptance Criteria**
- AC-5.1.1: `GET /api/projects` returns all projects found in `~/.gsd/projects/`, not only the one that started the server.
- AC-5.1.2: `GET /api/state?project=<hash>` returns valid state for any discovered project (not 404).
- AC-5.1.3: Selecting a project in the UI causes all views (dashboard, milestones, logs, metrics) to display data for that project without a page reload.
- AC-5.1.4: Project switcher correctly marks the primary session project as "active session" and others as "no active session."
- AC-5.1.5: Selected project hash persists in `localStorage` and is restored on page load.

---

### 5.2 Multi-Session Monitoring and Control

**Problem Statement**
A "Session" is one running GSD process (one terminal, one `startWebServer()` call). Currently the server conflates Project and Session — there is no session identity. The web UI cannot distinguish between "this project had auto-mode running 10 minutes ago" and "this project has auto-mode running right now in a different terminal."

Additionally, `start_auto` returns HTTP 501 but the UI has no affordance to explain this — users see a generic API error.

**Proposed Solution**
`[web-server.ts]` Introduce a session identity concept. On `startWebServer()`, generate a `sessionId = crypto.randomUUID()`. Expose it on `GET /api/sessions` and include it in all WS events. This allows the browser to correlate events to the correct running process.

`[web-server.ts]` The `POST /api/command` endpoint already correctly handles `start_auto` with a 501. No change to the server behavior is needed.

`[/web]` Add a `SessionStatusBanner` component in the dashboard header area. When `autoStatus.active === false`, the banner renders: _"Auto-mode is not running. Start a new session from your terminal: `gsd auto`"_ with a copy-to-clipboard button for the command. When `autoStatus.active === true`, the banner renders the elapsed time, current unit, and a Pause / Stop control (which call `POST /api/command` with `pause_auto` / `stop_auto`).

`[/web]` The "Start Auto" button (if it existed in any form in the UI) must be either: disabled with a tooltip explaining the CLI requirement, or hidden entirely. See Open Question OQ-03.

`[/web]` Pause / Stop buttons are shown conditionally on `autoStatus.active && !autoStatus.paused` (for pause) and `autoStatus.active` (for stop). These call `postCommand('pause_auto')` and `postCommand('stop_auto')` respectively. On success, they trigger a `state_change` broadcast which the dashboard re-fetches.

**API Dependencies**
- `GET /api/sessions` — new (see Section 7)
- `POST /api/command` — existing, handles `stop_auto` and `pause_auto`
- `GET /api/state?project=<hash>` — `autoStatus` field is the source of truth

**UX Behavior**
- Dashboard header always shows current session state: a pill labeled `IDLE`, `RUNNING`, or `PAUSED`.
- When RUNNING: elapsed time ticks in real-time using client-side clock from `autoStatus.startTime`.
- When IDLE: a dismissible info banner shows the terminal command to start a session.
- Pause and Stop buttons have a loading state (spinner replaces icon) while the command request is in-flight.
- Optimistic update: immediately set `autoStatus.paused = true` (pause) or `autoStatus.active = false` (stop) in local store; rollback if the API returns an error.

**Acceptance Criteria**
- AC-5.2.1: Dashboard header shows `RUNNING` pill when `autoStatus.active === true`.
- AC-5.2.2: Dashboard header shows `PAUSED` pill when `autoStatus.paused === true`.
- AC-5.2.3: Dashboard header shows `IDLE` pill when `autoStatus.active === false`.
- AC-5.2.4: The IDLE state renders a banner with the CLI command `gsd auto` and a copy-to-clipboard affordance.
- AC-5.2.5: Pause button is disabled (and not shown) when session is not active or already paused.
- AC-5.2.6: Stop button calls `POST /api/command` with `{ command: "stop_auto" }`; on success the pill transitions to `IDLE` within 2 seconds via `state_change` WS event.
- AC-5.2.7: A session has a stable `sessionId` UUID visible in `GET /api/sessions` for the lifetime of the running GSD process.

---

### 5.3 Parallel Worker Visibility (per-session)

**Problem Statement**
`workerStatuses` is already returned in `GET /api/state`. The dashboard currently renders this data but it is not associated with a session ID in WS events, so when viewing multiple projects it is ambiguous which workers belong to which session.

**Proposed Solution**
`[web-server.ts]` Tag `state_change` and any future `worker_update` WS events with `{ projectHash, sessionId }` in the event data payload.

`[/web]` Create a `WorkerPanel` component (new primitive group, not a full view) that renders inside the Dashboard or Milestones view. Displays a table row per worker with: milestone title, PID, state badge (`running | paused | stopped | error`), completed units count, cost (formatted as `$0.0000`), and elapsed time since `startedAt`.

`[/web]` Workers in `error` state display a red badge and a tooltip with the last log message for that milestone (if available from the logs store filtered by milestone ID).

`[/web]` If `workerStatuses` is empty (non-parallel mode), the `WorkerPanel` is not rendered (no empty state, no heading).

**API Dependencies**
- `GET /api/state?project=<hash>` — `workerStatuses: WebWorkerInfo[]` field
- WS `state_change` event — needs `sessionId` tag added

**UX Behavior**
- Worker panel appears below the auto-mode status banner on the dashboard when `workerStatuses.length > 0`.
- State badge colors: `running` = green, `paused` = yellow, `stopped` = gray, `error` = red.
- Cost updates in real-time via `state_change` events (re-fetches state on each `state_change`).
- Workers are sorted: running first, then paused, then stopped, then error.

**Acceptance Criteria**
- AC-5.3.1: WorkerPanel renders when `workerStatuses.length > 0` in the state response.
- AC-5.3.2: Worker rows display milestone title, PID, state badge, completed units, formatted cost, and elapsed time.
- AC-5.3.3: Error state badge is visually distinct (red) and includes a tooltip.
- AC-5.3.4: WorkerPanel is absent (no DOM element) when `workerStatuses` is empty or undefined.
- AC-5.3.5: WS `state_change` event payload includes `{ project: string, sessionId: string }`.

---

### 5.4 Team / Multi-User Coordination

**Problem Statement**
There is no mechanism to distinguish human browser clients from each other. Multiple people can be watching the same GSD session but no one knows others are present. There is no shared annotation, no "who is watching" indicator, and log events don't identify which viewer triggered a UI action.

**Important Distinction:** GSD "workers" are AI agent child processes managed by `parallel-orchestrator.ts`. "Team members" in this section refers to human browser clients connected to the web UI. These are entirely separate concepts and must never be conflated in the UI.

**Proposed Solution**
`[web-server.ts]` Track connected WS client count per `(projectHash, sessionId)` subscription pair. When a client subscribes (sends a `subscribe` WS message) or disconnects, broadcast a `presence_update` event to all clients subscribed to the same pair: `{ type: 'presence_update', data: { projectHash, sessionId, clientCount } }`.

`[web-server.ts]` Maintain a `Map<string, Set<WebSocket>>` keyed by `"${projectHash}:${sessionId}"` for subscription-aware broadcasting. The existing `clients` Set is replaced by this scoped map.

`[/web]` Add a `PresencePill` component to the Shell header: renders a person icon + count of human viewers for the current project+session. Tooltip: _"N person(s) viewing this session"_. Updates reactively from `presence_update` WS events (stored in a new `presenceStore`).

`[/web]` The `presenceStore` holds `{ [key: string]: number }` mapping `"${projectHash}:${sessionId}"` → `clientCount`. Updated on `presence_update` events.

**API Dependencies**
- WS `subscribe` message (client → server): `{ type: 'subscribe', projectHash: string, sessionId: string }`
- WS `presence_update` event (server → client): new event type (see Section 7)

**UX Behavior**
- `PresencePill` in the top-right of the Shell header, after the connection status indicator.
- Shows "1" (just you) when no other clients are subscribed to the same context.
- Animates (brief scale pulse) when the count changes.
- Tooltip lists no names (anonymous — see Non-Goals: no auth).

**Acceptance Criteria**
- AC-5.4.1: Server tracks connected client count per `(projectHash, sessionId)` subscription key.
- AC-5.4.2: `presence_update` WS event is broadcast to all subscribers of the same key when a client joins or leaves.
- AC-5.4.3: `PresencePill` displays the correct clientCount within 1 second of a client connecting or disconnecting.
- AC-5.4.4: `PresencePill` is not labeled "Workers" or "Agents" — it is clearly a human viewer count.
- AC-5.4.5: Client sends `subscribe` message immediately after the WS `connected` handshake.

---

### 5.5 Cross-Project / Cross-Session Dashboard

**Problem Statement**
There is no view that shows all known projects simultaneously. A developer running 3 projects must open 3 tabs or switch the project switcher repeatedly to check status across projects.

**Proposed Solution**
`[/web]` Add a new route `/overview` and `OverviewView` component. This view renders a grid of `ProjectSummaryCard` components — one per discovered project. Each card shows:
- Project name and hash (abbreviated, 8 chars)
- Session status pill (`IDLE | RUNNING | PAUSED`)
- Current phase string
- Total cost (from `GET /api/metrics?project=<hash>`)
- Worker count (if parallel active)
- Last activity timestamp

`[/web]` The OverviewView fetches data for all projects in parallel using `Promise.allSettled`. Failed fetches (e.g., project not initialized) render a `ProjectSummaryCard` in a degraded state with an error badge.

`[web-server.ts]` The `GET /api/sessions` endpoint (new) returns a list of `{ projectHash, sessionId, active, paused, startTime }` for all known projects. The server returns an empty session entry for projects with no active session.

`[/web]` Clicking a `ProjectSummaryCard` navigates to `/?project=<hash>` (sets active project in connectionStore) and routes to the Dashboard view.

**API Dependencies**
- `GET /api/projects` — existing
- `GET /api/sessions` — new
- `GET /api/state?project=<hash>` — called in parallel for all projects
- `GET /api/metrics?project=<hash>` — called in parallel for all projects

**UX Behavior**
- Overview is the default landing page when more than one project exists and no project is active in localStorage. If `activeProjectHash` is set in localStorage, the app navigates directly to the dashboard for that project.
- Card grid is 1-column on narrow viewports, 2-column on medium, 3-column on wide.
- Cards auto-refresh every 30 seconds (polling) — WS events for individual projects also trigger card data refresh.
- A "Back to Overview" breadcrumb link appears in the Shell header when a specific project is selected.

**Acceptance Criteria**
- AC-5.5.1: `/overview` route renders one `ProjectSummaryCard` per project in `GET /api/projects`.
- AC-5.5.2: Each card shows session status, phase, total cost, and worker count.
- AC-5.5.3: Failed project data fetches render a degraded card state, not an uncaught error.
- AC-5.5.4: Clicking a card navigates to the Dashboard view for that project.
- AC-5.5.5: Cards auto-refresh every 30 seconds without full page reload.

---

### 5.6 Notification System

**Problem Statement**
Critical events — budget ceiling approach, worker entering error state, auto-mode stopping unexpectedly, a milestone completing — produce no visible alert. The user must actively be watching the logs view to notice them.

**Proposed Solution**
`[/web]` Implement a notification system with two surfaces:

1. **Toast layer** — transient pop-up (bottom-right corner, 5 second auto-dismiss, dismissible by click). For: auto-stop events, worker errors, budget warnings.
2. **Notification drawer** — persistent panel accessible via a bell icon in the Shell header. Stores up to 50 notifications in a new `notificationStore` (Zustand, in-memory, cleared on page reload). Unread count badge on the bell icon.

`[/web]` The `notificationStore` subscribes to WS events and HTTP command responses and maps them to `Notification` objects:

| Trigger | Notification Type | Severity |
|---------|-------------------|----------|
| `state_change` → `autoStatus.active` transitions `true → false` | Auto-mode stopped | Warning |
| `state_change` → `workerStatuses[n].state === 'error'` | Worker error: `<milestoneTitle>` | Error |
| `state_change` → `autoStatus.totalCost >= budgetCeiling * 0.9` | Budget at 90%: `$X.XX` | Warning |
| `state_change` → `autoStatus.totalCost >= budgetCeiling` | Budget ceiling reached | Error |
| `unit_complete` → milestone completion | Milestone completed: `<title>` | Info |
| WS status transitions to `degraded` | Connection degraded | Warning |

`[/web]` Add a `NotificationDrawer` component (slide-in panel from the right). Bell icon in Shell header with unread badge count.

`[web-server.ts]` No new server-side changes required for notifications — all logic is derived client-side from existing WS events and API responses.

**API Dependencies**
- WS `state_change`, `unit_complete` events — existing
- WS connection state machine — new 5-state model from 5.8

**UX Behavior**
- Toast appears for severity `Warning` and `Error` only. Info notifications go directly to drawer.
- Toasts have a progress bar for the 5-second auto-dismiss.
- Notification drawer shows timestamp, message, severity icon, and project name.
- "Mark all as read" button clears the unread badge.
- Clicking a notification in the drawer navigates to the relevant view (e.g., budget notification → /metrics).

**Acceptance Criteria**
- AC-5.6.1: A toast appears within 2 seconds of `autoStatus.active` transitioning from `true` to `false`.
- AC-5.6.2: A toast appears within 2 seconds of any worker entering `error` state.
- AC-5.6.3: Budget at 90% warning fires exactly once per session (debounced — does not re-fire on every `state_change` after threshold is crossed).
- AC-5.6.4: Notification drawer is accessible from the bell icon in the Shell header.
- AC-5.6.5: Unread badge on bell icon shows correct count and clears to zero on drawer open.
- AC-5.6.6: No new server endpoints are required for the notification system.

---

### 5.7 Navigation and UX Patterns

**Problem Statement**
The current Shell has a fixed left sidebar with 9 flat nav items and no concept of project context in the URL. Adding multi-project, multi-session, and overview features requires a new navigation information architecture without breaking existing routes.

**Proposed Solution**
`[/web]` Restructure navigation into three tiers:

**Tier 1 — Global (always visible, top of sidebar):**
- Overview (new `/overview` route)
- Connection Config (new `/settings` route, icon: settings gear)

**Tier 2 — Project-scoped (visible below a `ProjectSwitcher` component):**
- Dashboard `/`
- Milestones `/milestones`
- Visualizer `/visualizer`
- Metrics `/metrics`
- Health `/health`

**Tier 3 — Project data (visible below a "Data" section heading):**
- Logs `/logs`
- Decisions `/decisions`
- Requirements `/requirements`
- Preferences `/preferences`

`[/web]` All project-scoped routes include `?project=<hash>` as a URL search param. TanStack Router's `useSearch()` provides the hash to child components. This allows deep-linking to a specific project's dashboard.

`[/web]` Shell header (top bar) contains:
- Left: GSD logo + current project name (truncated to 24 chars)
- Center: Session status pill (`IDLE | RUNNING | PAUSED`) + elapsed time
- Right: PresencePill, notification bell + badge, connection status indicator (5-state), user/machine label

**API Dependencies**
- No new server endpoints. URL routing is client-side.

**UX Behavior**
- Sidebar collapse/expand state is persisted in `uiStore.sidebarCollapsed` (existing).
- On mobile-width viewports, sidebar collapses to icon-only mode automatically.
- Project switcher dropdown opens inline within the sidebar (not a modal).

**Acceptance Criteria**
- AC-5.7.1: Overview route `/overview` is accessible from the sidebar and renders the cross-project dashboard.
- AC-5.7.2: All existing routes (`/`, `/milestones`, `/metrics`, `/visualizer`, `/health`, `/logs`, `/decisions`, `/requirements`, `/preferences`) remain functional.
- AC-5.7.3: Active project hash is reflected in the URL search param `?project=<hash>` for all project-scoped routes.
- AC-5.7.4: Shell header displays session status pill and elapsed time in center position.
- AC-5.7.5: PresencePill and notification bell are visible in the Shell header right section.

---

### 5.8 Network-Accessible Multi-Client WebSocket

**Problem Statement**
The WS client is a module-level singleton that connects to a URL derived from `VITE_API_URL` at build time. It cannot switch servers at runtime. The server binds to `127.0.0.1` only. The status model is 3 states, not 5. There is no subscription filtering — all events go to all clients. After reconnect, the client has no mechanism to re-subscribe to the session it was watching.

**Proposed Solution**

#### 5.8.1 Configurable Server URL at Runtime [/web]

`[/web]` Add a `/settings` route containing `ConnectionConfigView`. This view includes:
- A text input pre-populated with the current server URL (from `localStorage.getItem('gsd.serverUrl')` or `window.location.origin`).
- A "Connect" button that calls `wsClient.reconfigure(newUrl)`.
- A connection status indicator showing current state.

`[/web]` The WS client module (`/web/src/lib/ws/client.ts`) gains a `reconfigure(url: string): void` export. On call: disconnect current connection without reconnect, update the stored URL, write to `localStorage.setItem('gsd.serverUrl', url)`, then call `connect()`. The API client (`BASE_URL`) must also be updated to match the new server URL — expose `setBaseUrl(url: string)` in `api/client.ts`.

`[/web]` On app init (`main.tsx`), read `localStorage.getItem('gsd.serverUrl')` and call `reconfigure()` before `initConnection()`. This ensures the stored URL is used on every page load without user input.

#### 5.8.2 Exponential Backoff Reconnect [/web]

The current `ws/client.ts` already implements exponential backoff (1s, 2s, 4s... cap 30s) and `shouldReconnect` flag. This is correct. What is missing is exposing the `reconnecting` state to the 5-state machine.

`[/web]` Extend `WsStatus` type from `'connected' | 'connecting' | 'disconnected'` to:
```
'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'degraded'
```

State transitions:
- `disconnected` → `connect()` called → `connecting`
- `connecting` → WS opens → `connected`
- `connected` → WS closes, `reconnectAttempt > 0` → `reconnecting`
- `reconnecting` → WS opens → `connected` (reset `reconnectAttempt = 0`)
- `connected` → last `state_change` event is > 60 seconds ago → `degraded` (data may be stale)
- `degraded` → new `state_change` received → `connected`
- Any state → `disconnect()` called → `disconnected`

`[/web]` Replace the 500ms polling shim in `connectionStore.ts` (lines 97–112 of current code) with a proper `onStatusChange` callback registration in `ws/client.ts`:
```ts
export function onStatusChange(cb: (status: WsStatus) => void): () => void
```
The connection store subscribes to this instead of polling.

#### 5.8.3 Client-Side Session Subscription [/web] [web-server.ts]

`[web-server.ts]` On WS connection, do NOT push all events immediately. Instead:
- Send `connected` handshake event with `{ sessionId, serverVersion }`.
- Wait for client to send a `subscribe` message: `{ type: 'subscribe', projectHash: string, sessionId: string }`.
- Add the client's WS socket to the subscription map `Map<"${projectHash}:${sessionId}", Set<WebSocket>>`.
- After subscribe acknowledgment, send a `subscribed` event back to only that client.
- Subsequent events are routed only to subscribed clients.

`[web-server.ts]` A client that sends no `subscribe` message receives only `connected`, `ping`, and `presence_update` events (for the global scope). It does NOT receive `state_change`, `log_line`, `unit_start`, `unit_complete`, or `metric_update`.

`[/web]` The WS client sends a `subscribe` message immediately in the `ws.onopen` handler, using `connectionStore.activeProjectHash` and `connectionStore.activeSessionId`. On project or session switch, send a new `subscribe` message (the server updates the client's subscription mapping).

#### 5.8.4 Optimistic Command Updates with Rollback [/web]

`[/web]` In `useCommand.ts` hook (currently `postCommand()` is a thin wrapper), add optimistic update logic:

```ts
// Before API call:
const snapshot = cloneCurrentState()
applyOptimisticUpdate(command) // e.g., set autoStatus.paused = true

// On API error:
rollbackToSnapshot(snapshot)
showErrorToast(`Command failed: ${error.message}`)
```

`[/web]` The optimistic state is held in a new `optimisticStore` (Zustand) that overlays the real state from `connectionStore`. The real state is authoritative and wins on the next `state_change` event (which arrives within ~500ms due to the chokidar broadcast).

#### 5.8.5 Presence Awareness (clientCount from server push) [web-server.ts] [/web]

`[web-server.ts]` Maintain `subscriptionCounts: Map<string, number>` (key: `"${projectHash}:${sessionId}"`). Increment on subscribe, decrement on WS close. Broadcast `presence_update` to all subscribers of the same key on every change:
```json
{ "type": "presence_update", "data": { "projectHash": "...", "sessionId": "...", "clientCount": 3 } }
```
This is push-only. Clients must NOT poll `/api/presence` — no such endpoint exists.

`[/web]` `presenceStore` subscribes to `presence_update` WS events and updates its count map. `PresencePill` reads from the store.

#### 5.8.6 5-State Connection Machine UI [/web]

`[/web]` The `ConnectionStatusIndicator` component in the Shell header renders the current `WsStatus`:

| State | Visual | Label |
|-------|--------|-------|
| `disconnected` | Gray circle | "Disconnected" |
| `connecting` | Yellow pulsing circle | "Connecting..." |
| `connected` | Green circle | "Live" |
| `reconnecting` | Orange pulsing circle | "Reconnecting (attempt N, next in Xs)" |
| `degraded` | Yellow circle with warning icon | "Degraded — no updates in 60s" |

`[/web]` In the `degraded` state, the last-received-at timestamp is shown in a tooltip: "Last update: 2m 14s ago."

**API Dependencies**
- WS `subscribe` message (client → server): new client message type
- WS `subscribed` event (server → client): new server event type
- WS `presence_update` event: new server event type
- `POST /api/command` with optimistic update overlay
- `localStorage.getItem/setItem('gsd.serverUrl')` — client-side only

**UX Behavior**
- All 5 connection states are visually distinct in the Shell header.
- Server URL input in `/settings` accepts any valid URL (`http://` or `https://`).
- Connecting to a new URL causes the WS to close, re-open, and re-subscribe to the last active project+session — all within the existing backoff logic.
- On reconnect after `reconnecting`, the subscribe message is sent automatically.

**Acceptance Criteria**
- AC-5.8.1: Typing a new server URL in `/settings` and clicking "Connect" establishes a WS connection to the new URL without a page reload.
- AC-5.8.2: The new server URL is written to `localStorage` and restored on the next page load.
- AC-5.8.3: After a WS close, the UI transitions to `reconnecting` state and shows the attempt count and next-retry countdown.
- AC-5.8.4: On reconnect, the client automatically sends a `subscribe` message for the last active `(projectHash, sessionId)`.
- AC-5.8.5: A client subscribed to project A does NOT receive `log_line` or `state_change` events for project B.
- AC-5.8.6: `PresencePill` count updates within 1 second of a second browser tab connecting to the same project+session.
- AC-5.8.7: Optimistic pause update is visible in the UI within 50ms of clicking Pause; rollback is visible within 200ms of a failed API call.
- AC-5.8.8: The `degraded` state triggers when no `state_change` WS event has been received in 60 seconds while `connected`.
- AC-5.8.9: The 500ms polling shim in `connectionStore.ts` is replaced by an `onStatusChange` callback — no `setInterval` remains in the connection store.

---

## 6. Technical Architecture

### 6.1 Current Architecture Limitations

| Layer | Limitation | Impact |
|-------|-----------|--------|
| `web-server.ts` | `activeBasePath: string \| null` — single project variable | Cannot serve state for multiple projects without running multiple server instances |
| `web-server.ts` | `clients = new Set<WebSocket>()` — flat broadcast | All clients receive all events regardless of subscribed project/session |
| `web-server.ts` | `log_line` payload is `{ level, message, timestamp }` — no project/session tag | Cannot route logs to correct subscribers |
| `web-server.ts` | Binds to `127.0.0.1` only in `server.listen(port, "127.0.0.1", ...)` | LAN access requires SSH tunnel |
| `web-server.ts` | Single `chokidar` watcher on `gsdRoot(basePath)` | Only the primary project's filesystem changes trigger `state_change` |
| `ws/client.ts` | `WsStatus` is 3-state | Cannot surface `reconnecting` or `degraded` to UX |
| `ws/client.ts` | URL derived from `VITE_API_URL` at module load | Cannot switch servers at runtime |
| `connection.ts` store | 500ms `setInterval` polling `getStatus()` | Inefficient; introduces up to 500ms status update lag |
| `connection.ts` store | No `onStatusChange` hook in ws client | Store-client coupling via polling |
| All routes | No `?project=<hash>` in URL | Deep-linking and multi-tab use are impossible |

### 6.2 WebSocket Server + Client Redesign (both sides)

**Server-side subscription model:**

```
Before:  clients = Set<WebSocket>  →  broadcast to ALL
After:   subscriptions = Map<"${projectHash}:${sessionId}", Set<WebSocket>>
         unsubscribed = Set<WebSocket>  (connected but not yet subscribed)
```

**Client-side state machine:**

```
         connect()         ws.onopen          ws.onclose (attempt > 0)
disconnected ────> connecting ────> connected ──────────────────────> reconnecting
                                        │                                    │
                        60s no events   │                    ws.onopen       │
                       ─────────────────┘ degraded           ───────────────┘ connected
                                        │
                        disconnect()    │
                       ─────────────────┘ disconnected
```

**Event routing rules:**

| Event Type | Routing |
|-----------|---------|
| `connected`, `ping` | Unicast to initiating client only |
| `subscribed` | Unicast to subscribing client only |
| `presence_update` | Multicast to all subscribers of same `(projectHash, sessionId)` |
| `state_change`, `log_line`, `unit_start`, `unit_complete`, `metric_update`, `phase_change`, `health_change` | Multicast to subscribed clients for matching `(projectHash, sessionId)` |

### 6.3 web-server.ts Changes

**Module-level state changes:**

```ts
// REMOVE:
let activeBasePath: string | null = null
const clients = new Set<WebSocket>()

// ADD:
let primaryBasePath: string | null = null   // project that called startWebServer()
let currentSessionId: string | null = null   // crypto.randomUUID() on startWebServer()
const subscriptions = new Map<string, Set<WebSocket>>()  // key: "hash:sessionId"
const unsubscribed = new Set<WebSocket>()   // connected but not yet subscribed
const subscriptionCounts = new Map<string, number>()     // key: "hash:sessionId"
```

**New exports needed:**
- `getSessionId(): string | null`
- `broadcastToSession(projectHash: string, sessionId: string, type: string, data?: unknown): void`
- `broadcastToAll(type: string, data?: unknown): void` — replaces current `broadcast()`, only used for global events

**New HTTP endpoints (see Section 7):**
- `GET /api/sessions`

**Bind address change:**
- Add `GSD_BIND_ADDRESS` environment variable check: `const bindAddr = process.env['GSD_BIND_ADDRESS'] ?? '127.0.0.1'`
- `server.listen(port, bindAddr, ...)` — replaces hardcoded `'127.0.0.1'`
- Document: `GSD_BIND_ADDRESS=0.0.0.0 gsd auto` enables LAN access (see OQ-02)

**Chokidar expansion:**
- On `discoverProjects()` refresh, start a new chokidar watcher for each project's `.gsd/` directory that isn't already watched.
- Watcher map: `watchers = new Map<string, FSWatcher>()` keyed by project hash.

**log_line tagging:**
- `[web-server.ts]` The `onLog` callback in `startWebServer()` currently calls `broadcast("log_line", entry)`. Change to `broadcastToSession(primaryProjectHash, currentSessionId, "log_line", { ...entry, projectHash: primaryProjectHash, sessionId: currentSessionId })`.

### 6.4 Frontend State Management Changes

**connectionStore.ts changes:**
- Add `activeSessionId: string | null` field
- Add `serverUrl: string` field (initialized from `localStorage.getItem('gsd.serverUrl') ?? window.location.origin`)
- Add `setServerUrl(url: string): void` action — calls `wsClient.reconfigure(url)` and persists to `localStorage`
- Add `wsStatusDetail: { attempt: number; nextRetryMs: number } | null` field for `reconnecting` state UI
- Replace 500ms `setInterval` polling with `wsClient.onStatusChange()` subscription

**New stores:**
- `presenceStore.ts` — holds `Map<string, number>` for viewer counts
- `notificationStore.ts` — holds `Notification[]`, `unreadCount`, actions for mark-read/dismiss
- `optimisticStore.ts` — overlays optimistic command state over real state

**logsStore.ts changes:**
- Add `projectHash` and `sessionId` fields to `ActivityEntry` type
- Filter `addEntry()` to only add entries matching `connectionStore.activeProjectHash` and `connectionStore.activeSessionId`

### 6.5 New Primitive Components Required

| Component | Description | Owner |
|-----------|-------------|-------|
| `ConnectionStatusIndicator` | 5-state visual with color, pulse animation, tooltip | `/web` |
| `SessionStatusBanner` | IDLE/RUNNING/PAUSED banner with elapsed timer and action buttons | `/web` |
| `WorkerPanel` | Table of AI worker statuses per session | `/web` |
| `PresencePill` | Human viewer count with person icon | `/web` |
| `Toast` | Transient notification with progress bar and severity | `/web` |
| `NotificationDrawer` | Slide-in panel with persistent notification list | `/web` |
| `ProjectSummaryCard` | Card for cross-project overview grid | `/web` |
| `ProjectSwitcher` | Inline dropdown in sidebar for project selection | `/web` |
| `SessionSwitcher` | Inline dropdown or pill for session selection within a project | `/web` |
| `ServerUrlInput` | Text input + connect button in ConnectionConfigView | `/web` |

---

## 7. API Contracts

### 7.1 New REST Endpoints [web-server.ts]

```ts
// GET /api/sessions
// Returns session state for all known projects.
// A project with no running GSD process has active: false, sessionId: null.

interface SessionInfo {
  projectHash: string
  sessionId: string | null   // null if no active session
  active: boolean            // autoStatus.active for the primary project; false for others
  paused: boolean
  startTime: number | null   // null if not active
  clientCount: number        // WS subscribers for this session
}

// Response: SessionInfo[]
```

```ts
// GET /api/state?project=<hash>
// CHANGE: Add sessionId to response root

interface GSDStateResponse extends GSDState {
  sessionId: string | null   // NEW: the current session UUID
  projectHash: string        // NEW: echoed back for client verification
}
```

### 7.2 Changed WS Events [web-server.ts]

```ts
// CHANGED: log_line — add projectHash and sessionId tags
type LogLineEvent = {
  type: 'log_line'
  data: {
    level: string
    message: string
    timestamp: number
    projectHash: string    // NEW
    sessionId: string      // NEW
  }
  timestamp: number
}

// CHANGED: state_change — add sessionId
type StateChangeEvent = {
  type: 'state_change'
  data: {
    project: string        // projectHash (existing field name preserved)
    sessionId: string      // NEW
  }
  timestamp: number
}

// CHANGED: connected — add sessionId and serverVersion
type ConnectedEvent = {
  type: 'connected'
  data: {
    project: string | null
    sessionId: string | null    // NEW
    serverVersion: string       // NEW: semver string from package.json
    clientCount: number         // NEW: current client count for this session
  }
  timestamp: number
}
```

### 7.3 New WS Events [web-server.ts]

```ts
// NEW: subscribed — unicast acknowledgment after client sends subscribe message
type SubscribedEvent = {
  type: 'subscribed'
  data: {
    projectHash: string
    sessionId: string
    clientCount: number  // current count including this client
  }
  timestamp: number
}

// NEW: presence_update — broadcast to all subscribers of same (projectHash, sessionId)
type PresenceUpdateEvent = {
  type: 'presence_update'
  data: {
    projectHash: string
    sessionId: string
    clientCount: number
  }
  timestamp: number
}
```

### 7.4 New WS Client Messages [/web]

```ts
// Client → Server messages (client-initiated, sent via ws.send())

// NEW: subscribe — sent after 'connected' handshake
interface SubscribeMessage {
  type: 'subscribe'
  projectHash: string
  sessionId: string   // the sessionId received in the 'connected' event
}
```

### 7.5 Updated StudioEvent Union [/web]

```ts
// /web/src/lib/api/types.ts — extend StudioEvent discriminated union

export type StudioEvent =
  | { type: 'connected'; data: { project: string | null; sessionId: string | null; serverVersion: string; clientCount: number }; timestamp: number }
  | { type: 'subscribed'; data: { projectHash: string; sessionId: string; clientCount: number }; timestamp: number }
  | { type: 'state_change'; data: { project: string; sessionId: string }; timestamp: number }
  | { type: 'presence_update'; data: { projectHash: string; sessionId: string; clientCount: number }; timestamp: number }
  | { type: 'phase_change'; data: { project: string; phase: string; sessionId: string }; timestamp: number }
  | { type: 'unit_start'; data: { project: string; unitId: string; unitType: string; sessionId: string }; timestamp: number }
  | { type: 'unit_complete'; data: { project: string; unitId: string; unitType: string; sessionId: string }; timestamp: number }
  | { type: 'metric_update'; data: { project: string; sessionId: string }; timestamp: number }
  | { type: 'log_line'; data: { level: string; message: string; timestamp: number; projectHash: string; sessionId: string }; timestamp: number }
  | { type: 'health_change'; data: { project: string; sessionId: string }; timestamp: number }
  | { type: 'ping'; data: Record<string, never>; timestamp: number }

// NEW: Client message (sent from browser to server)
export interface WsClientMessage {
  type: 'subscribe'
  projectHash: string
  sessionId: string
}
```

### 7.6 Updated ActivityEntry [/web]

```ts
// /web/src/lib/api/types.ts

export interface ActivityEntry {
  level: string
  message: string
  timestamp: number
  projectHash: string   // NEW
  sessionId: string     // NEW
}
```

### 7.7 New Client-Side Types [/web]

```ts
// /web/src/lib/api/types.ts — new additions

export type WsStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'degraded'

export interface WsStatusDetail {
  state: WsStatus
  attempt: number          // reconnect attempt count, 0 when connected
  nextRetryMs: number      // ms until next reconnect attempt
  lastEventAt: number | null  // timestamp of last state_change event
}

export interface Notification {
  id: string               // uuid
  type: 'info' | 'warning' | 'error'
  title: string
  message: string
  projectHash: string | null
  timestamp: number
  read: boolean
  route?: string           // optional deep-link route
}

export interface SessionSummary {
  projectHash: string
  sessionId: string | null
  active: boolean
  paused: boolean
  startTime: number | null
  clientCount: number
}
```

---

## 8. New Frontend Modules

### 8.1 Stores (new files under `/web/src/stores/`)

| File | Purpose |
|------|---------|
| `presence.ts` | `presenceStore` — `Map<string, number>` of viewer counts per `"${projectHash}:${sessionId}"` |
| `notifications.ts` | `notificationStore` — `Notification[]` ring buffer (max 50), unread count, actions |
| `optimistic.ts` | `optimisticStore` — overlays optimistic command state, rolled back on next `state_change` |
| `sessions.ts` | `sessionStore` — `SessionSummary[]` list from `GET /api/sessions`, refreshed on `state_change` |

### 8.2 Hooks (new files under `/web/src/hooks/`)

| File | Purpose |
|------|---------|
| `useSessions.ts` | Fetches `GET /api/sessions` on mount and on `state_change`, returns `SessionSummary[]` |
| `usePresence.ts` | Reads from `presenceStore` for current `(projectHash, sessionId)`, returns `clientCount: number` |
| `useNotifications.ts` | Returns `{ notifications, unreadCount, markAllRead, dismiss }` from `notificationStore` |
| `useSessionStatus.ts` | Derives `{ status: 'IDLE' | 'RUNNING' | 'PAUSED', elapsed: number }` from `autoStatus` |
| `useWsStatusDetail.ts` | Returns full `WsStatusDetail` (5-state + attempt + nextRetryMs + lastEventAt) |
| `useOverview.ts` | Fetches state + metrics for ALL projects in parallel, returns `ProjectSummaryData[]` |

### 8.3 Components (new files under `/web/src/components/`)

**Primitives** (`/web/src/components/primitives/`):
| File | Purpose |
|------|---------|
| `Toast.tsx` | Single transient notification with progress bar, severity icon, dismiss button |
| `ToastContainer.tsx` | Fixed-position container for active toasts (bottom-right) |

**Layout** (`/web/src/components/layout/`):
| File | Purpose |
|------|---------|
| `ConnectionStatusIndicator.tsx` | 5-state dot indicator with label and tooltip |
| `PresencePill.tsx` | Human viewer count pill |
| `NotificationBell.tsx` | Bell icon with unread badge — opens NotificationDrawer |
| `NotificationDrawer.tsx` | Slide-in panel with notification list |
| `ProjectSwitcher.tsx` | Inline dropdown in sidebar — lists all projects |
| `SessionSwitcher.tsx` | Inline session selector (within a project) |

**Dashboard-specific** (`/web/src/components/dashboard/`):
| File | Purpose |
|------|---------|
| `SessionStatusBanner.tsx` | IDLE/RUNNING/PAUSED banner with action buttons (Pause/Stop) |
| `WorkerPanel.tsx` | Table of AI worker statuses |
| `ProjectSummaryCard.tsx` | Card for overview grid |

### 8.4 Views / Routes (new files under `/web/src/views/`)

| Directory | File | Route | Purpose |
|-----------|------|-------|---------|
| `overview/` | `index.tsx` | `/overview` | Cross-project summary grid |
| `connection/` | `index.tsx` | `/settings` | Server URL config and WS diagnostics |

### 8.5 Lib Changes (`/web/src/lib/`)

| File | Change |
|------|--------|
| `ws/client.ts` | Add `reconfigure(url: string): void`, `onStatusChange(cb): () => void`, 5-state machine, `degraded` detection timer |
| `api/client.ts` | Add `setBaseUrl(url: string): void`, read initial `BASE_URL` from `localStorage.getItem('gsd.serverUrl')` |

---

## 9. UX / Navigation Design

### 9.1 Navigation Structure (before vs. after)

**Before (flat sidebar, 9 items):**
```
Dashboard
Milestones
Metrics
Visualizer
Health
Logs
Decisions
Requirements
Preferences
```

**After (tiered sidebar):**
```
[GLOBAL]
  Overview              /overview
  Settings              /settings

[PROJECT: <ProjectSwitcher>]
  Dashboard             /?project=<hash>
  Milestones            /milestones?project=<hash>
  Visualizer            /visualizer?project=<hash>
  Metrics               /metrics?project=<hash>
  Health                /health?project=<hash>

[DATA]
  Logs                  /logs?project=<hash>
  Decisions             /decisions?project=<hash>
  Requirements          /requirements?project=<hash>
  Preferences           /preferences?project=<hash>
```

### 9.2 Project Switcher

**Component:** `ProjectSwitcher` in sidebar, below the `[PROJECT]` section label.

**Behavior:**
- Renders a button showing current project name (24 char max, ellipsis truncation).
- Click opens an inline dropdown list of all projects from `projectStore`.
- Each list item: project name, session status dot (green = active, gray = idle).
- Selecting a project calls `connectionStore.setActiveProject(hash)` and sends a `subscribe` WS message.
- Active project is highlighted with a checkmark icon.
- Dropdown closes on selection or click-outside.

**State persistence:** Selected `projectHash` written to `localStorage.setItem('gsd.activeProject', hash)`.

### 9.3 Session Switcher

**Context:** A "session" maps one-to-one with a running GSD process on the current machine. In most cases there will be only one session per project (the current running process). The session switcher is primarily future-proofing for when the server supports multiple concurrent sessions per project.

**Component:** `SessionSwitcher` — a small pill below the project name in the sidebar.

**Phase 1 behavior:** Shows current `sessionId` (first 8 chars of UUID, e.g., `sess:3f4a1b2c`) if active, or "No active session" if idle. No switching functionality in Phase 1 (only one session per project).

**Phase 2+ behavior:** If multiple session IDs are available via `GET /api/sessions`, the pill expands to a dropdown.

### 9.4 Team Presence Indicators

**Component:** `PresencePill` in Shell header right section, before the notification bell.

**Visual spec:**
- Icon: `👤` person silhouette (or equivalent SVG icon)
- Count: integer (your own connection counts as 1)
- Color: gray when 1 (only you), blue when > 1 (others present)
- Tooltip on hover: "N person(s) viewing this session"
- Animation: brief scale-up pulse (CSS transform, 300ms) on count change

**Empty/error state:** Hide the pill entirely if `clientCount === null` (before first `presence_update` received) — do not show "0".

### 9.5 Notification Surface

**Toast stack** (fixed, bottom-right, z-index: 9999):
- Max 3 toasts visible simultaneously; queue additional toasts.
- Each toast: severity icon (info/warning/error), title, short message, dismiss X button, progress bar (5s auto-dismiss).
- Severity colors: info = blue, warning = amber, error = red.
- Toast stack entrance animation: slide up from bottom-right.

**NotificationDrawer** (slide-in from right, full-height panel):
- Header: "Notifications" title, "Mark all read" button, close button.
- List: newest first. Each row: severity icon, title, message (truncated to 2 lines), timestamp relative (e.g., "2m ago"), project name badge, click-to-navigate link if `route` is set.
- Empty state: `EmptyState` primitive with message "No notifications yet."
- Separator between read and unread notifications.

### 9.6 Cross-Session Dashboard Layout

**Route:** `/overview`

**Layout:** Responsive CSS grid:
- `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`
- Gap: `1.5rem`

**ProjectSummaryCard spec:**
```
┌─────────────────────────────────┐
│ ● RUNNING  [project name]       │  ← status dot + name
│ Phase: planning                 │  ← current phase
│ Cost: $2.3412    Workers: 3     │  ← cost + worker count
│ Last update: 42s ago            │  ← relative timestamp
│                          [→]    │  ← navigate button
└─────────────────────────────────┘
```

Cards with no active session show status dot as gray and "Phase: —". Cards that failed to load show an error badge and "Data unavailable."

**Refresh strategy:**
- On mount: fetch all cards in parallel via `useOverview()`.
- On WS `state_change` or `metric_update` for any project: invalidate and re-fetch that project's card only.
- Polling fallback: re-fetch all cards every 30 seconds (for projects without an active WS subscription).

### 9.7 Connection Configuration UI

**Route:** `/settings`

**Layout:** Single-column form, max-width 480px, centered.

**Sections:**

1. **Server Connection**
   - Label: "GSD Server URL"
   - Input: text input, placeholder `http://127.0.0.1:4242`
   - Helper text: "For LAN access, enter the IP of the machine running GSD, e.g., `http://192.168.1.42:4242`. Requires the GSD server to be started with LAN binding enabled."
   - Button: "Connect" (calls `connectionStore.setServerUrl(inputValue)`)
   - Status: current `WsStatusDetail` displayed below the input

2. **Connection Diagnostics**
   - Current state: badge showing 5-state value
   - Last connected at: timestamp or "Never"
   - Reconnect attempt: count (when in `reconnecting` state)
   - Next retry in: countdown (when in `reconnecting` state)
   - Server version: `serverVersion` from `connected` event

3. **Reset**
   - "Reset to default" link: clears `localStorage.getItem('gsd.serverUrl')` and reconnects to `window.location.origin`

---

## 10. Success Metrics

| Metric | Baseline (current) | Target | Measurement Method |
|--------|-------------------|--------|-------------------|
| WS event delivery to correct subscriber | 100% (no filtering — wrong clients also get events) | 100% delivery to subscribed clients; 0% delivery to non-subscribed clients | Browser console log inspection in test with 2 clients |
| Status update lag after WS disconnect | Up to 500ms (polling interval) | < 50ms (event-driven via `onStatusChange`) | `performance.now()` before/after state update in devtools |
| `reconnecting` state visibility | Not displayed (missing state) | Shown within 100ms of WS close with attempt count | Manual QA: kill server, observe UI within 100ms |
| Cross-project overview load time (3 projects) | N/A (not built) | < 2s for all cards rendered | `performance.now()` in `useOverview()` hook |
| Notification delivery for auto-stop | Not implemented | Toast within 2s of `state_change` where `active: false` | Manual QA: stop auto via CLI, observe toast |
| LAN access (P2 persona) | Impossible without SSH tunnel | Accessible via IP after `GSD_BIND_ADDRESS=0.0.0.0` | Access from separate device on same network |
| `start_auto` UX clarity | Silent 501 error | IDLE banner with CLI command shown | Manual QA: open UI with no session running |
| `PresencePill` accuracy | Not implemented | Updates within 1s of second tab connecting | Manual QA: open 2 tabs, observe count |
| Budget notification (90% threshold) | Not implemented | Fires exactly once per session after threshold | Manual QA with mocked totalCost |
| localStorage URL persistence | Not implemented | Server URL and project hash restored on page reload | Manual QA: set URL, refresh, verify |

---

## 11. Phasing and Milestones

### 11.1 Phase 1 — Multi-Session Routing Foundation

**Goal:** Every WS event is session-tagged. Per-client subscription filtering is working. The 5-state WS machine is live. Connection config UI exists. `start_auto` UX is correct.

**Duration estimate:** 2–3 engineering weeks

**Deliverables:**

`[web-server.ts]`
- Replace `clients = Set<WebSocket>` with `subscriptions = Map<string, Set<WebSocket>>`
- Add `currentSessionId` (UUID on `startWebServer()`)
- Add `subscribe` WS message handling and `subscribed` unicast response
- Add `presence_update` broadcast on subscribe/unsubscribe
- Tag `log_line` and all scoped WS events with `projectHash` + `sessionId`
- Add `GET /api/sessions` endpoint (single session — the active one)
- Add `GSD_BIND_ADDRESS` env var support

`[/web]`
- Extend `WsStatus` to 5 states
- Replace polling shim with `onStatusChange` callback in `ws/client.ts`
- Add `reconfigure(url)` and `setBaseUrl()` exports
- Add `presenceStore`, `notificationStore`
- Add `SessionStatusBanner` component with IDLE/RUNNING/PAUSED states and correct `start_auto` treatment
- Add `ConnectionStatusIndicator` with 5-state visual
- Add `PresencePill`
- Add `Toast` + `ToastContainer` primitives
- Add `/settings` route and `ConnectionConfigView`
- Add `?project=<hash>` URL param propagation to all routes
- Wire `notificationStore` to `state_change` events for auto-stop and worker error notifications

**Phase 1 Exit Criteria:**
- Two browser tabs connected to same project+session each receive their own `subscribed` event.
- Tab A does not receive log events from Project B when subscribed only to Project A.
- `PresencePill` shows "2" when both tabs are open.
- UI shows correct IDLE/RUNNING/PAUSED banner for session state.
- `/settings` allows changing server URL and reconnecting without page reload.

---

### 11.2 Phase 2 — Multi-Project Dashboard

**Goal:** The overview route exists and shows all projects. Project switcher in sidebar works. Non-primary projects are queryable via the API.

**Duration estimate:** 2–3 engineering weeks

**Deliverables:**

`[web-server.ts]`
- Background project discovery re-scan every 60s
- `hashToBasePath` populated for all initialized projects (not just the primary)
- Per-project chokidar watchers (`watchers = Map<string, FSWatcher>`)
- `GET /api/state`, `GET /api/metrics`, etc. work for non-primary projects
- `GET /api/sessions` updated to return entries for all known projects

`[/web]`
- `ProjectSwitcher` component in sidebar
- `/overview` route and `OverviewView` with `ProjectSummaryCard` grid
- `useOverview()` hook with `Promise.allSettled` parallel fetch
- `sessionStore` with `useSessions()` hook
- `sessionStore` data shown in `ProjectSwitcher` (active dot indicators)
- `localStorage` persistence for `activeProjectHash`
- URL param routing: all project-scoped routes include `?project=<hash>`

**Phase 2 Exit Criteria:**
- Opening `/overview` shows all projects in `~/.gsd/projects/` with correct status.
- Selecting a different project in the sidebar switches all views to that project's data.
- API returns valid data for any project (not just the one that called `startWebServer()`).

---

### 11.3 Phase 3 — Team Coordination Features

**Goal:** Full notification system wired to all event types. Cross-session dashboard polished. `WorkerPanel` complete with error detail. Human team presence fully implemented.

**Duration estimate:** 1–2 engineering weeks

**Deliverables:**

`[/web]`
- Full `notificationStore` wiring for all notification trigger types (budget warnings, milestone completion, health changes)
- `NotificationDrawer` with full read/unread UX
- `NotificationBell` with unread badge
- `WorkerPanel` with sorted worker list, error badge with tooltip
- `optimisticStore` for command updates with rollback
- `useWsStatusDetail()` hook exposing `degraded` countdown
- `degraded` state: tooltip shows "Last update: Xs ago"
- `SessionSwitcher` pill (Phase 3: display only, no switching)
- Overview auto-refresh on WS events
- Budget notification debouncing (fires once per session per threshold)

**Phase 3 Exit Criteria:**
- Budget at 90% toast fires exactly once when threshold is crossed.
- Worker error badge appears in `WorkerPanel` within 2s of worker entering error state.
- `NotificationDrawer` shows all notifications from current session with correct severity.
- Optimistic pause update visible in < 50ms; rollback visible on API failure.

---

## 12. Open Questions

### OQ-01 — LAN Authentication

**Question:** When `GSD_BIND_ADDRESS=0.0.0.0` is set and the server is accessible on the LAN, what authentication mechanism (if any) prevents an untrusted device on the same network from issuing `stop_auto` or `pause_auto` commands?

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: No auth (current approach)** | Any device on LAN can issue commands. | Zero configuration. Matches current localhost behavior. | Any LAN device (or malicious script) can stop or pause an active session. |
| **B: Shared PIN** | Server generates a PIN on startup (printed to console). Browser prompts for PIN before connecting. PIN stored in `localStorage`. | Simple UX, no account system needed. Low implementation cost. | PIN appears in terminal output (visible to shoulder surfers). No per-user granularity. |
| **C: Token auth (Bearer token in WS handshake)** | Server generates a token on startup. WS upgrade requires `Authorization: Bearer <token>` header or `?token=<token>` query param. | Proper authentication surface. Revokable. | Browser WebSocket API does not support custom headers on initial handshake — requires query param, which appears in server logs. More implementation work. |

**Stakes:** Without any auth, any machine on the same WiFi network (e.g., guest network, office network) can stop a running GSD session. If the server is accidentally bound to 0.0.0.0 on a public network, this is a significant concern.

**Recommendation for Phase 1:** Default to Option A (no auth) for localhost-only deployment. Add a prominent warning in the `/settings` UI when the configured server URL is not `127.0.0.1` or `localhost`: _"Warning: Connecting to a non-localhost server. Commands like Stop and Pause will be sent to a remote GSD process."_

**Decision needed before:** Phase 1 ship for any user deploying with LAN access.

---

### OQ-02 — LAN Bind Default

**Question:** Should `GSD_BIND_ADDRESS` default to `0.0.0.0` (LAN-accessible by default) or remain `127.0.0.1` (localhost-only by default, LAN requires explicit opt-in)?

**Options:**

| Option | Default | LAN Access | Security |
|--------|---------|------------|----------|
| **A: 127.0.0.1 (current, explicit opt-in)** | Localhost only | Requires `GSD_BIND_ADDRESS=0.0.0.0 gsd auto` | No LAN exposure without explicit opt-in. Low risk. |
| **B: 0.0.0.0 (LAN by default, opt-out)** | LAN-accessible | Immediate from any LAN device | Any LAN device can access the dashboard and issue commands immediately. High risk if no auth (see OQ-01). |
| **C: Configurable via preferences file** | Set in `~/.gsd/preferences.md` | Requires editing prefs file | More discoverable than env var; still requires explicit action. |

**Stakes:**
- Defaulting to `0.0.0.0` without auth (OQ-01 Option A) means any fresh install on a shared network is immediately exposed.
- Defaulting to `127.0.0.1` with opt-in means the P2 persona (secondary device) requires a terminal command change, which is a discoverability barrier.
- Middle path: default `127.0.0.1`, add a toggle in the GSD preferences (`bind_address: "0.0.0.0"`) with a clear warning in docs and the preferences view.

**Recommendation:** Option A (127.0.0.1 by default) for Phase 1. Add `bind_address` as a preferences key in Phase 2 with UI in `/preferences`. Document clearly.

**Decision needed before:** Phase 1 implementation of `GSD_BIND_ADDRESS` env var support.

---

### OQ-03 — start_auto UI Treatment

**Question:** When `autoStatus.active === false`, how should the UI present the fact that the browser cannot start a new auto session (because `start_auto` returns 501)?

**Options:**

| Option | Visual | Behavior | UX Impact |
|--------|--------|----------|-----------|
| **A: Disabled button with tooltip** | "Start Auto" button, grayed out, cursor: not-allowed | Tooltip on hover: "Auto-mode must be started from the terminal: `gsd auto`" | High discoverability (user sees the button exists), low confusion if tooltip is clear. Risk: user tries to click and nothing happens — frustrating without tooltip. |
| **B: Informational banner only, no button** | Banner: "Auto-mode is not running. Start from terminal: `gsd auto` [copy]" | No button rendered. Copy-to-clipboard for the command. | Cleaner UI. No affordance that implies the action is possible from the browser. Less cluttered. |
| **C: Hidden entirely** | Nothing rendered when idle | No indication that auto-mode exists or how to start it | Poor discoverability. New users won't know what to do. |

**Stakes:**
- Option A risks frustrating users who click a button that never works and don't notice the tooltip.
- Option B is the safest UX: it informs without implying browser capability it doesn't have.
- Option C fails the discoverability requirement for P1 (solo developer) persona.

**Recommendation:** Option B — informational banner with CLI command and copy-to-clipboard. This is specified in Section 5.2. Revisit if user testing shows confusion about the GSD auto flow.

**Decision needed before:** Phase 1 `SessionStatusBanner` implementation.

---

## 13. Appendix

### A. Glossary

| Term | Definition |
|------|-----------|
| **Session** | One running GSD process. Ephemeral. Created when `gsd auto` is invoked in a terminal. Destroyed when the process exits or `stop_auto` is called. Identified by a UUID (`sessionId`) generated on `startWebServer()`. |
| **Project** | A persistent directory tracked by GSD (`~/.gsd/projects/<hash>/`). A Project can have zero or one active Session at any time. Projects persist across Sessions. |
| **Active Project** | The Project that the current browser client's UI is displaying and subscribing to. Set via the Project Switcher or `localStorage`. |
| **Primary Project** | The Project that called `startWebServer()`. This is the only Project for which `autoStatus`, `workerStatuses`, and live log streaming are available. Other discovered Projects have read-only filesystem data. |
| **Worker** | An AI agent child process managed by `parallel-orchestrator.ts`. Workers are spawned per-milestone when parallel mode is active. Workers are NOT human team members. Represented as `WebWorkerInfo` in the API. |
| **Team Member / Human Viewer** | A human using a browser connected to the GSD web UI. Multiple team members can be connected simultaneously. Represented by the `clientCount` in `presence_update` events. |
| **Subscription** | A WS client's declaration of interest in a specific `(projectHash, sessionId)` pair. Sent as a `subscribe` message immediately after the `connected` handshake. |
| **Milestone** | The top level of the GSD work hierarchy below Project. Contains Slices. Identified by `milestoneId`. |
| **Slice** | One unit of work within a Milestone. Contains Tasks. Has a dependency graph (`depends`). |
| **Task** | Atomic work unit within a Slice. Has a `done` boolean. |
| **Auto-mode** | GSD's autonomous execution mode (`gsd auto`). Processes Milestones → Slices → Tasks sequentially (or in parallel via workers). Reflected in `autoStatus.active`. |
| **Chokidar** | Node.js filesystem watcher library used by `web-server.ts` to detect changes in `.gsd/` directories and trigger `state_change` broadcasts. |
| **GSD Root** | The `.gsd/` directory within a project's base path. Contains `DECISIONS.md`, `REQUIREMENTS.md`, milestone files, and other GSD-managed artifacts. |
| **Optimistic Update** | Immediately applying the expected result of a command in the UI before the server confirms it, then rolling back if the server returns an error. |
| **Degraded State** | A WS connection state where the socket is technically open but no `state_change` events have been received in 60 seconds. May indicate the GSD process is stuck or not emitting events. |
| **hashToBasePath** | Server-side `Map<string, string>` mapping a project hash (from `repoIdentity()`) to its filesystem base path. Used by all `?project=<hash>` API calls to resolve the correct directory. |
| **repoIdentity()** | Server-side function that derives a stable hash from a project's git remote URL or directory path. Used as the canonical project identifier across GSD. |
| **VITE_API_URL** | Build-time environment variable that sets the base URL for API calls in the `/web` frontend. In development, typically `http://127.0.0.1:4242`. Overrideable at runtime via the `/settings` UI (stored in `localStorage`). |
| **STUDIO_DEV** | Environment variable (`STUDIO_DEV=1`) that enables the Vite dev server proxy mode in `web-server.ts`, forwarding static asset requests to `:5173` instead of serving from `web/dist/`. |
| **LAN Access** | Accessing the GSD web UI from a device other than the one running GSD, over the local area network. Requires the server to bind to `0.0.0.0` instead of `127.0.0.1`. |
