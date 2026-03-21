---
// GSD-2 Web UI — Multi-Project/Session/Team PRD Prompt
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
//
// PURPOSE: Expert-grade prompt to produce a full PRD for expanding the GSD
// /web React frontend and the embedded web-server.ts Node.js server from a
// single-instance monitor to a multi-project, multi-session, multi-team
// control surface. Scope: /web frontend + web-server.ts only.
---

# PRD Prompt: GSD Web UI — Multi-Project, Multi-Session, Multi-Team Expansion

---

> **Scope statement:** This PRD covers two codebases: (1) the `/web` React frontend browser app, and (2) `src/resources/extensions/gsd/web-server.ts`, the Node.js HTTP + WS server embedded in the GSD CLI. The `/studio` Electron app is out of scope.

---

## 1. TASK CONTEXT (Role + Mission)

You are a senior Staff Product Manager with deep experience in developer tooling, AI-orchestrated workflows, and real-time collaborative dashboards. You have previously shipped multi-tenant control planes for CLI-first developer tools — tools where the primary surface is a terminal but the web UI exists to provide observability, control, and team coordination that the CLI cannot.

Your mission is to write a comprehensive, implementation-ready PRD for expanding the GSD web UI and its embedded server from a single-instance observer to a full multi-project, multi-session, and multi-team control surface. The PRD must be grounded in the existing architecture of both `web-server.ts` and `/web`, and produce a document that an engineering team can execute against without follow-up ambiguity.

---

## 2. TONE AND COMMUNICATION CONTEXT

- Tone: precise, direct, engineering-native. Avoid marketing language.
- Style: structured with clear headers, sub-sections, tables, and numbered lists. Use bullet lists only where the content is truly enumerable, not to pad length.
- Audience: the primary readers are the engineering team building this feature, plus the product owner (Jeremy McSpadden, solo developer/maintainer of GSD). Write for engineers, not executives.
- Avoid vague guidance. Every feature description must be specific enough that a developer can begin implementation without asking a follow-up question.
- Do not pad with generic PM boilerplate. Every section must contain information specific to GSD.
- When describing changes, label each item as either `[web-server.ts]` or `[/web]` to identify which codebase owns it.

---

## 3. BACKGROUND CONTEXT — THE GSD SYSTEM, CURRENT WEB UI, AND CURRENT SERVER

<guide>

### What GSD Is

GSD (Get Shit Done) is a CLI tool that orchestrates AI-powered software development. It runs locally via `claude code`. Users run `gsd` inside a project directory. GSD breaks work into a hierarchy:

  Project → Milestones → Slices → Tasks

- A **Project** is a software codebase being developed. It is identified by a filesystem path and a short hash derived from that path.
- A **Milestone** is a major deliverable (e.g., "Auth System", "API Layer"). Milestones have a status: `complete | active | pending | parked`.
- A **Slice** is a unit of work within a milestone (a feature or workstream). Slices have `depends` relationships, forming a DAG.
- A **Task** is the atomic work unit within a slice, executed by an AI agent.
- A **Phase** is the current execution mode GSD is in (e.g., `discuss`, `plan`, `implement`, `review`, `release`).
- A **Unit** is a generic term for a discrete piece of work that was executed (milestone, slice, or task level).

### What a Session Is

A **Session** is a single running invocation of `gsd` (or `claude code` orchestrated by GSD). One session = one OS process. GSD can run in **auto mode**, where it continuously executes units without user intervention. In auto mode it manages **Workers** — child processes that execute milestones in parallel worktrees.

Workers are the mechanism for **parallel execution**: GSD can spawn multiple `WebWorkerInfo` instances, each working on a different milestone concurrently. Each worker has: milestoneId, title, pid, state (`running | paused | stopped | error`), completedUnits, cost, startedAt.

A user might have multiple sessions running simultaneously:
- Session A: working on `project-alpha` (e.g., a web app backend)
- Session B: working on `project-beta` (e.g., a mobile client)
- Session C: a second session for `project-alpha` running a parallel team

### Current Web UI Architecture

The web UI is a React 19 + TypeScript + Vite + TanStack Router application. It connects to a single server instance (`web-server.ts`) over:
- **REST API** at `VITE_API_URL` (defaults to same origin)
- **WebSocket** at the same host (single connection, singleton pattern in `lib/ws/client.ts`)

**Current REST endpoints** (all scoped by `?project=<hash>`):
- `GET /api/projects` — list all known projects `{hash, name}[]`
- `GET /api/state?project=<hash>` — full `GSDState` (phase, active milestone/slice/task, registry, autoStatus, workerStatuses, progress, requirements counts)
- `GET /api/health?project=<hash>` — budget pressure, environment checks, provider status, skill summary
- `GET /api/metrics?project=<hash>` — cost/token aggregates by phase, slice, model, tier
- `GET /api/visualizer?project=<hash>` — full DAG data (milestones, slices, tasks, criticalPath, byPhase, bySlice, byModel, byTier, units)
- `GET /api/activity?project=<hash>` — last 200 log entries (ring buffer)
- `GET /api/decisions?project=<hash>` — all entries from DECISIONS.md
- `GET /api/requirements?project=<hash>` — all entries from REQUIREMENTS.md
- `GET /api/preferences?project=<hash>` — global + project preferences
- `POST /api/command` — send a control command (`start_auto | stop_auto | pause_auto`). **Note:** `start_auto` returns 501 — it requires terminal context. Only `stop_auto` and `pause_auto` are functional via the web UI.
- `POST /api/preferences?project=<hash>` — write preferences

**Current WebSocket event types** (discriminated union `StudioEvent`):
- `connected` — handshake, includes `{ project: string | null }` (the current `activeBasePath`'s repo identity)
- `state_change` — project state changed (triggers query invalidation) `{ project }`
- `phase_change` — GSD moved to a new phase `{ project, phase }`
- `unit_start` / `unit_complete` — unit lifecycle `{ project, unitId, unitType }`
- `metric_update` — cost/token update `{ project }`
- `log_line` — single log entry `{ level, message, timestamp }` — **NOT project-tagged**
- `health_change` — health diagnostic changed `{ project }`
- `ping` — keepalive

**Current Zustand stores:**
- `connectionStore` — `wsStatus`, `activeProjectHash`, `projectList`, `initConnection()`
- `logsStore` — log ring buffer (populated from `log_line` WS events)
- `uiStore` — sidebar open/close, theme, other UI state

**Current routes / views:**
- `/` — Dashboard: active unit card, auto controls, cost ticker, phase timeline, progress section, recent units, worker panel
- `/milestones` — DAG/graph visualization of milestone → slice → task nodes
- `/metrics` — Budget panel, model usage, cost by phase, cost by slice, cache stats, tier breakdown
- `/visualizer` — Dependency DAG with critical path highlighting
- `/health` — Budget pressure, environment checks, issue list
- `/logs` — Real-time log viewer with controls and log lines
- `/decisions` — Decision table with superseded-chain tracking
- `/requirements` — Requirements Kanban board
- `/preferences` — Preferences editor

**Current primitives:** Card, StatCard, ConfirmModal, ProgressBar, Tooltip, DataTable, Badge, CostGauge, EmptyState, Spinner.

### Current web-server.ts Implementation — Constraints and Gaps

This is the Node.js HTTP + WebSocket server embedded directly in the GSD CLI process. It is started by calling `startWebServer(basePath, port)` when GSD initializes. The following implementation facts are ground truth for the PRD.

**Current binding:**
```typescript
server!.listen(port, "127.0.0.1", () => { ... })  // localhost only — LAN clients cannot connect
```

**Current session model:**
```typescript
let activeBasePath: string | null = null;           // only ONE active project at a time
const hashToBasePath = new Map<string, string>();   // single entry only — set once at startWebServer()
```
The server only knows about the project that was passed to `startWebServer()`. It cannot represent multiple concurrent GSD sessions.

**Current WS broadcast model:**
```typescript
const clients = new Set<WebSocket>();  // ALL connected browsers get ALL events
export function broadcast(type: string, data?: unknown): void {
  // sends to every client in the Set — no filtering, no per-session routing
}
```
Every connected browser receives every WS event. There is no subscription model and no per-session scoping.

**Current WS connection handler:**
```typescript
wss.on("connection", (ws: WebSocket) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "connected", data: { project: activeBasePath ? repoIdentity(activeBasePath) : null } }));
  // no session subscription — client gets everything from the moment it connects
});
```

**Current file watcher:** chokidar watches a single `gsdRoot(basePath)` directory (the `.gsd/` subdirectory of the active project), debounced 500ms, broadcasts `state_change` to ALL clients.

**Current log channel:** `onLog((entry) => { broadcast("log_line", entry) })` — `log_line` events carry `{ level, message, timestamp }` only. They are NOT tagged with a project hash or session identifier.

**Valid commands:** `"start_auto" | "stop_auto" | "pause_auto"`. `start_auto` returns HTTP 501 with a message that it requires terminal context. Only `stop_auto` and `pause_auto` execute successfully.

### What Does Not Exist Yet (The Gap)

1. **No multi-session routing** — `web-server.ts` is a single-project process. If a user runs two GSD sessions, the UI has no way to discover or switch between them.
2. **No session lifecycle control** — the user cannot start a session from the UI (501). Pause and stop work; there is no "resume" command yet.
3. **No team visibility** — multiple humans watching the same session receive all the same events but have no presence awareness of each other.
4. **No cross-project dashboard** — no view shows health/progress of multiple projects side by side.
5. **No notification system** — no awareness of events across sessions not currently visible.
6. **No LAN access** — the server binds to `127.0.0.1` only. Remote browser clients on the same LAN cannot connect without changes to `web-server.ts`.
7. **No per-client subscription** — broadcast is all-or-nothing; there is no mechanism to filter events by session for a specific client.
8. **log_line events are not project-tagged** — in a multi-session world, a client cannot determine which project a log entry belongs to.

</guide>

---

## 4. DETAILED TASK DESCRIPTION AND RULES

Write a full Product Requirements Document (PRD) for the GSD Web UI Multi-Project / Multi-Session / Multi-Team expansion, covering both the `/web` React frontend and `web-server.ts`. The PRD must follow the structure defined in Section 9 (Output Format) exactly.

### Rules the PRD must follow:

1. **Ground every feature in the existing data model.** When describing a new UI element, reference the existing types from `lib/api/types.ts` where possible. When new fields are required, name them explicitly and describe their type and source.

2. **Address the WebSocket architecture problem on BOTH sides.** The current singleton WS model in `/web` and the all-clients broadcast model in `web-server.ts` cannot support multi-session routing without redesign. The PRD must propose concrete changes to both — not just say "WebSocket needs to support multiple sessions."

3. **Distinguish Session from Project.** A Project is a GSD project directory (persistent). A Session is a running GSD process attached to a project (ephemeral). Multiple sessions can be attached to the same project. The PRD must be precise about this distinction throughout.

4. **Do not invent GSD CLI commands that do not make sense.** Control commands sent via `POST /api/command` must map to valid GSD control actions. `start_auto` is not available via the web UI — the PRD must account for this constraint explicitly in any feature that touches session lifecycle control.

5. **Scope multi-team carefully.** "Multiple people" means multiple humans who can open the web UI and observe/control GSD sessions. This is NOT the same as GSD's internal parallel workers (which are already implemented). The PRD must not conflate human team members with GSD AI agent workers.

6. **Every feature must include acceptance criteria** — written as testable, binary statements (passes/fails), not vague descriptions.

7. **Label every change as `[web-server.ts]` or `[/web]`** so it is unambiguous which codebase owns each requirement.

8. **Flag open questions explicitly.** If a design decision is not resolved, name it as an Open Question with context on what is at stake and what the options are.

9. **Non-Goals must be specific.** Do not write "scalability is out of scope." Write "Cloud-hosted multi-tenant deployment (i.e., a SaaS version of the GSD Studio) is out of scope for this release. The target deployment model remains: single machine, local network access only."

10. **Prioritize using table format** for feature lists and acceptance criteria wherever there are more than three items of the same type.

11. **All acceptance criteria must be verifiable from the browser or frontend test harness only.** Do not write criteria that require inspecting server internals, reading server logs, or asserting on server-side state. If a criterion would require server access to verify, reframe it as an observable frontend behavior (e.g., "the UI displays X when the server responds with Y").

12. **Feature 5.8 must cover the following specific behaviors for the frontend WS client:**

    **Problem statement to reproduce in the PRD:**
    The current WS client is a module-level singleton hardcoded to connect to `VITE_API_URL` (same origin). The server currently binds to `127.0.0.1` only, so LAN clients cannot connect at all. Even once the server supports LAN binding, the frontend client has no mechanism to configure a remote server URL, handle cross-origin WS connections, or coordinate with other connected browser clients.

    **Required behaviors the frontend WS client must implement:**
    - **Configurable server URL at runtime** — the user can enter a server address (IP:PORT) via the Connection Configuration UI (Section 8.7) and the WS client connects to that address without a page reload. The URL is persisted in localStorage. Build-time `VITE_API_URL` is the default fallback only.
    - **Reconnect strategy with exponential backoff** — on disconnect, the client retries with delays of 1s, 2s, 4s, 8s, up to a configurable cap (default: 30s). The UI reflects each retry attempt.
    - **Client-side session subscription model** — after connecting, the browser client sends a subscription message specifying which session IDs it wants events for. The client does not receive events for sessions it has not subscribed to. Subscribing/unsubscribing does not require reconnection.
    - **Conflict detection for control commands** — when the client sends a control command (pause, stop, etc.) via `POST /api/command`, it applies an optimistic UI update immediately. If the server responds with a state that conflicts with the optimistic update (e.g., another client already changed the state), the UI rolls back and displays a conflict notice.
    - **Presence awareness** — the client renders how many other browser clients are currently connected to the same session, derived from a WS event (e.g., `session_presence` event carrying a `clientCount` field). This is not polled; it is push-only from the server.
    - **Connection state machine** — the client tracks one of five explicit states: `disconnected | connecting | connected | reconnecting | degraded`. Each state has a distinct UI affordance (e.g., color indicator, banner, disabled controls). `degraded` means connected but receiving stale or partial data.

    All acceptance criteria for 5.8 must be observable from the browser (connection state indicator visible, presence count visible, optimistic rollback visible, etc.).

---

## 5. EXAMPLES

<example>

### Example: Well-formed Feature Section

**Feature: Session Switcher**

**Problem Statement:**
A user running two concurrent GSD sessions (e.g., one on `project-alpha` and one on `project-beta`) has no way to switch between them in the current UI. The active session is fixed at startup via the WebSocket connection.

**Proposed Solution:**
A persistent session switcher component in the top navigation bar displays all active sessions, their project name, current phase, and a live cost ticker. Clicking a session makes it the "active session" — all views (Dashboard, Logs, Metrics, etc.) display data scoped to the selected session.

**API Dependencies:**
- `GET /api/sessions` — fetches the list of active sessions known to the server. `[web-server.ts change]`

**UX Behavior:**
- If only one session exists, the switcher is hidden and the single session is auto-selected.
- If a session disconnects, it moves to a "disconnected" state in the switcher rather than being removed — so the user can see what died.
- Switching sessions does not navigate away from the current route. The route stays on `/logs`; the data source switches.

**Acceptance Criteria:**
- [ ] The session switcher renders all sessions returned by `GET /api/sessions` without a page reload.
- [ ] Selecting a session from the switcher updates all view data within one polling cycle (≤10s) without a full page reload.
- [ ] A disconnected session is displayed with a visual indicator and is not auto-removed for at least 60 seconds.
- [ ] Session switcher is not rendered when fewer than two sessions are active.

</example>

---

## 6. CONVERSATION HISTORY

<history>
This PRD is being written for a solo developer/maintainer (Jeremy McSpadden) who is also the primary user of GSD. The tool is not yet multi-user in the wild — this PRD describes the target architecture for a planned expansion. There is no existing team-access or auth system. Decisions about whether to add authentication should be treated as an open question with a strong prior toward "no auth for local-network use, explicit auth only if remote access is required."
</history>

---

## 7. IMMEDIATE TASK REQUEST

<question>
Write the full PRD document for the GSD Web UI Multi-Project, Multi-Session, and Multi-Team expansion, covering both the `/web` React frontend and `src/resources/extensions/gsd/web-server.ts`. Follow the output structure defined in Section 9 exactly. Do not omit any section. Where information would normally require stakeholder input, make a reasonable explicit assumption and mark it `[ASSUMPTION]` so the author can validate it.
</question>

---

## 8. DEEP THINKING INSTRUCTION

Before writing each major section:
- Ask: what breaks in the current `web-server.ts` or frontend architecture if this feature is added naively?
- Ask: what does the engineer implementing this need to know that is not obvious from the feature description?
- Ask: what are the two or three most likely ways this design could go wrong, and does the PRD prevent them?
- Consider the failure mode where a session crashes mid-execution. Does the UI degrade gracefully?
- Consider the state explosion problem: with N projects × M sessions × K workers, what data is too expensive to poll and must be pushed?
- Consider the 127.0.0.1 binding constraint: what changes in `web-server.ts` are required before any LAN feature can work?
- Consider the `log_line` tagging gap: in multi-session mode, how does a browser client know which project produced a given log entry?

Do not reveal this reasoning as a section in the output. Let it inform the quality of what you write.

---

## 9. OUTPUT FORMAT

Produce the PRD as a Markdown document with the following top-level sections, in order. Do not skip or merge sections. Use `##` for top-level sections and `###` for sub-sections.

```
## 1. Overview
   ### 1.1 Problem Statement
   ### 1.2 Opportunity
   ### 1.3 Release Scope Summary (one-paragraph executive summary of what ships)

## 2. Goals
   - Measurable goals tied to user outcomes, not feature counts

## 3. Non-Goals
   - Specific and explicit. Each item must say WHY it is out of scope.

## 4. Users and Use Cases
   ### 4.1 User Personas
   ### 4.2 User Stories (table format: As a [persona], I want [action], so that [outcome])

## 5. Feature Specifications
   ### 5.1 Multi-Project Management
   ### 5.2 Multi-Session Monitoring and Control
   ### 5.3 Parallel Worker Visibility (per-session)
   ### 5.4 Team / Multi-User Coordination
   ### 5.5 Cross-Project / Cross-Session Dashboard
   ### 5.6 Notification System
   ### 5.7 Navigation and UX Patterns
   ### 5.8 Network-Accessible Multi-Client WebSocket

   Each sub-section must include:
   - Problem Statement
   - Proposed Solution
   - API Dependencies (name which existing or new endpoints the feature calls, labeled [web-server.ts] or [/web])
   - UX Behavior (specific, not vague)
   - Acceptance Criteria (numbered, testable, browser-observable only)

## 6. Technical Architecture
   ### 6.1 Current Architecture Limitations
       Cover both web-server.ts and /web. Specifically address:
       - 127.0.0.1 binding (LAN access blocked)
       - Single activeBasePath / single-entry hashToBasePath (no multi-session)
       - All-clients broadcast with no subscription filtering
       - log_line events untagged (no project/session field)
       - start_auto returns 501 (terminal context required)
   ### 6.2 WebSocket Server + Client Redesign
       Cover BOTH sides:
       Server side [web-server.ts]:
       - Per-client subscription model: what data structure tracks which sessions each client has subscribed to
       - Session-scoped broadcast: how broadcast() is modified to only deliver events to subscribed clients
       - Project-tagged log_line events: add project/sessionId field to log_line payload
       - LAN binding option: configurable bind address (0.0.0.0 vs 127.0.0.1, gated by config flag or env var)
       Client side [/web — lib/ws/client.ts]:
       - Subscription handshake: what message the client sends after connecting, what response it expects
       - Reconnect with exponential backoff: delays, cap, state transitions
       - 5-state connection state machine: disconnected | connecting | connected | reconnecting | degraded
       - Configurable server URL: how runtime URL overrides VITE_API_URL, localStorage persistence
       - Event routing: how incoming WS events are dispatched to the correct session store
   ### 6.3 web-server.ts Changes
       - Multi-session registry: replace `activeBasePath: string | null` and single-entry `hashToBasePath`
         with a proper session registry (data structure, session lifecycle: when sessions are added/removed)
       - Session lifecycle: how the registry is populated when GSD starts, and cleaned up when GSD stops
       - LAN access: what config flag or env var controls the bind address; what default is chosen and why
       - New endpoints required for multi-session support (names and purpose only — interfaces defined in Section 7)
       - Broadcast filtering: how broadcast() is updated to route events only to subscribed clients
       - Project-tag all WS events including log_line
   ### 6.4 Frontend State Management Changes
       - Changes to Zustand stores
       - New stores required
       - TanStack Query key strategy for multi-session scoping
   ### 6.5 New Primitive Components Required

## 7. API Contracts
   Full TypeScript interface specs for:
   - All new REST endpoints (request shape + response shape)
   - All new or modified WS event shapes
   Label every interface as [web-server.ts change] or [/web frontend change] to indicate ownership.
   Format each entry as:
     ### 7.x <EndpointOrEventName>
     Owner: [web-server.ts change] | [/web frontend change]
     ```typescript
     // interface definition
     ```
     Notes: (any constraints or edge cases)

## 8. New Frontend Modules
   List of new files and modules that will be created inside /web/src.
   Grouped by type: Stores, Hooks, Components, Views/Routes.
   For each entry: file path relative to /web/src, purpose in one sentence.
   Do not list files that already exist unchanged.

## 9. UX / Navigation Design
   ### 9.1 Navigation Structure (before vs. after)
   ### 9.2 Project Switcher
   ### 9.3 Session Switcher
   ### 9.4 Team Presence Indicators
   ### 9.5 Notification Surface
   ### 9.6 Cross-Session Dashboard Layout
   ### 9.7 Connection Configuration UI
       A settings panel where the user can input the server URL/IP and port, test the connection, and save it to localStorage.
       Must work for LAN IP addresses (e.g., `192.168.1.x:PORT`).
       Must not require a page reload to apply a new server address.
       Include: URL input field, port field, "Test Connection" button with live status indicator, save/clear controls, and display of currently active connection.

## 10. Success Metrics
   - How will the team know this shipped successfully?
   - Measurable, observable indicators tied to the goals in Section 2.

## 11. Phasing and Milestones
    ### 11.1 Phase 1 — Multi-Session Routing (foundation)
        Must include: web-server.ts session registry, LAN bind config, per-client subscription, log_line tagging,
        /web WS client redesign with reconnect + state machine
    ### 11.2 Phase 2 — Multi-Project Dashboard
    ### 11.3 Phase 3 — Team Coordination Features
    For each phase: what ships (labeled by codebase), what the acceptance bar is, and what is explicitly deferred.

## 12. Open Questions
    Numbered list. Each entry: the question, the options, and what is at stake if the wrong call is made.
    Must include the following questions:
    — **LAN auth:** If the server is accessible on the LAN (via the connection configuration UI), should the web UI require any form of authentication before allowing command access (pause, stop, etc.) vs. read-only observation? Options: (a) no auth — trust the LAN, (b) simple shared PIN stored in localStorage and validated against a server-side value, (c) full token auth with a login step. At stake: if no auth, any machine on the LAN can issue control commands to a running GSD session.
    — **LAN bind default:** Should `web-server.ts` bind to `0.0.0.0` by default or require an explicit opt-in (`--web-host 0.0.0.0` flag or env var)? At stake: security (any machine on LAN can access with 0.0.0.0 default) vs. usability (LAN access is the goal, requiring a flag adds friction).
    — **start_auto in the UI:** The `start_auto` command currently returns 501 — it requires terminal context. Should the web UI expose a "Start" button that is visually disabled with a tooltip explaining it requires the CLI? Or hide it entirely? At stake: discoverability of the constraint vs. UI clutter.

## 13. Appendix
    ### A. Glossary (Project, Session, Worker, Phase, Milestone, Slice, Task, Unit, Team Member)
```

Produce the complete PRD inside a `<response>` tag.

<response>
</response>
