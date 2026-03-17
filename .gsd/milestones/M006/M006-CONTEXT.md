---
depends_on: [M005]
---

# M006: Multi-Project Workspace

**Gathered:** 2026-03-17
**Status:** Queued — pending auto-mode execution.

## Project Description

Replace the single-project-per-launch architecture with a multi-project workspace. The user selects a development root folder (e.g. `~/Projects`) during initial onboarding. GSD discovers projects within that root using smart detection (`.git`, `.gsd`, `package.json`, etc.). A new "Projects" NavRail tab shows all detected projects with status. Switching projects keeps the previous project's agent session alive in the background. The user can toggle between active projects without losing context.

## Why This Milestone

The current architecture requires launching a separate `gsd --web` per project directory. Users working across multiple projects must juggle multiple browser tabs pointed at different ports, each with its own isolated host process. This is the single biggest friction point for daily multi-project work. R020 (deferred since M002) explicitly identified this gap — "broader project/session switching beyond the current-project launch contract."

## User-Visible Outcome

### When this milestone is complete, the user can:

- During first-time setup, select their development root folder (e.g. `~/Projects`) as part of the onboarding wizard
- Open `gsd --web` and see a Projects tab in the NavRail listing all detected projects under their dev root, with GSD status (active session, milestone progress, idle)
- Click a project to enter it — dashboard, terminal, roadmap, files, activity, and all surfaces switch to that project's context
- Switch back to a previously-opened project and find the agent session still running where they left it
- Launch `gsd --web` from within a project directory and go straight into that project (context-aware launch preserves current behavior)
- Launch `gsd --web` from outside any project (or from the dev root) and land on the project picker

### Entry point / environment

- Entry point: `gsd --web`
- Environment: local dev / browser
- Live dependencies involved: local web host, multiple RPC subprocesses (one per active project), filesystem scanning of dev root

## Completion Class

- Contract complete means: dev root selection persists across sessions, project discovery returns typed project metadata, the bridge registry manages multiple concurrent bridge instances keyed by project path, the Projects view renders in the NavRail, and API routes accept a project context parameter
- Integration complete means: switching projects in the browser actually changes the active bridge, terminal, dashboard, roadmap, and all surfaces to the selected project's live state, and background sessions continue running
- Operational complete means: context-aware launch works (inside project → direct entry, outside → picker), dev root preference persists, project list refreshes on return, and agent sessions survive project switches without data loss

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A first-time user completes onboarding including dev root selection, and subsequent launches remember the dev root without re-prompting
- From the Projects tab, the user can open Project A, start agent work, switch to Project B (Project A's session keeps running), do work in Project B, switch back to Project A, and find the session exactly where they left it
- `gsd --web` launched from within `~/Projects/foo` opens directly into the `foo` project workspace; launched from `~/Projects` or `~` opens to the project picker
- `npm run build` and `npm run build:web-host` succeed, and no existing tests break

## Risks and Unknowns

- **Bridge singleton → registry migration** — The entire API surface (`getProjectBridgeService()`, `resolveBridgeRuntimeConfig()`, `collectBootPayload()`) assumes one project context derived from `GSD_WEB_PROJECT_CWD` env vars set at host launch. Every API route and the SSE event stream need to become project-aware. This is the hardest architectural change.
- **Memory and subprocess overhead** — Each active project spawns an RPC subprocess. With many projects open simultaneously, memory pressure could become a concern. May need an eviction policy for idle sessions.
- **SSE event stream multiplexing** — Currently one SSE stream per browser connection carrying events for one project. Multi-project needs either multiple SSE connections (one per active project) or a multiplexed stream with project-scoped event routing.
- **Store state isolation** — `gsd-workspace-store.tsx` holds all state as flat top-level properties. Switching projects means either swapping the entire store state or partitioning state by project. The swap approach is simpler but risks stale state; partitioning is cleaner but touches every store consumer.
- **Dev root scanning performance** — Scanning a large dev folder (hundreds of subdirectories) needs to be fast. Should avoid deep recursive scanning — one level of depth plus smart detection heuristics.
- **Onboarding flow expansion** — Adding a dev root step to the existing 5-step wizard needs to feel natural and not delay setup for users who just want to work in one project.

## Existing Codebase / Prior Art

- `src/web/bridge-service.ts` — Bridge singleton pattern. `getProjectBridgeService()` creates/returns one `BridgeService` keyed by `projectCwd::projectSessionsDir::packageRoot`. Disposes the old bridge when the key changes. This becomes a multi-instance registry.
- `src/web-mode.ts` — Host launch sets `GSD_WEB_PROJECT_CWD` env var. Instance registry tracks one host per cwd. Context-aware launch detection happens here.
- `web/lib/gsd-workspace-store.tsx` — Central browser state (5000+ lines). `WorkspaceBootPayload` carries `project.cwd`. All surfaces read from one flat state tree.
- `web/components/gsd/app-shell.tsx` — View routing via `KNOWN_VIEWS` set and `activeView` state. NavRail drives view selection. New "projects" view entry goes here.
- `web/components/gsd/sidebar.tsx` — `NavRail` component with icon-based view tabs. Projects tab goes in the NavRail alongside Dashboard, Roadmap, etc.
- `web/components/gsd/onboarding-gate.tsx` — 5-step setup wizard (Welcome → Provider → Authenticate → Optional → Ready). Dev root selection step gets added here.
- `src/web/onboarding-service.ts` — Onboarding state management. Needs a dev root configuration step.
- `web/app/api/boot/route.ts` — Boot payload assembly. Currently reads from one fixed project context.
- `web/app/api/session/events/route.ts` — SSE stream. Currently attaches to one bridge.
- `web/app/api/session/command/route.ts` — Command dispatch. Currently uses single bridge.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R020 — This milestone directly fulfills R020 ("Support broader project/session switching beyond the current-project launch contract"), promoting it from deferred to active.
- R003 — Current-project launch scoping (validated in M001) is preserved through context-aware launch behavior.
- R002 — Browser onboarding (validated in M001) is extended with the dev root selection step.

## Scope

### In Scope

- Dev root folder selection step in the onboarding wizard, with persistence across sessions
- Smart project discovery within the dev root (one level deep, detection via `.git`, `.gsd`, `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.)
- "Projects" NavRail tab with project list showing name, path, GSD status, and active session indicator
- Multi-bridge registry replacing the singleton — concurrent bridge instances keyed by project path
- Project-scoped API routes — boot, command, events, and all data routes accept/resolve a project context
- Store state management for project switching — clean swap of workspace state when changing projects
- Context-aware `gsd --web` launch: inside a known project → direct entry; outside → project picker
- Background agent session persistence — switching projects does not kill the previous project's RPC subprocess
- Project list refresh on tab return / visibility change
- Dev root preference stored in a durable location (e.g. `~/.gsd/web-preferences.json`)

### Out of Scope / Non-Goals

- Multiple dev roots (single root for now — can extend later)
- Remote/LAN project access (R022 stays deferred)
- Project creation or scaffolding from the browser
- Deep recursive scanning beyond one directory level
- Cross-project analytics or aggregated dashboards (R021 stays deferred)
- Redesigning the workspace UI beyond what's needed for project switching

## Technical Constraints

- All existing single-project behavior must continue working — a user who only works in one project should see no regression
- The bridge registry must handle concurrent RPC subprocesses safely — no shared mutable state between project bridges
- API routes currently derive project context from `GSD_WEB_PROJECT_CWD` env var set at host startup. Multi-project needs a runtime mechanism (query param, header, or cookie) to identify which project a request targets
- SSE event streams are per-connection; multi-project likely means one SSE connection per active project in the browser, managed by the store
- The onboarding wizard step order matters — dev root should come early (after authentication) since it affects what the workspace shows
- Dev root preference must persist independently of any project's `.gsd/` directory since it's a cross-project setting
- `next-themes` localStorage persistence, view persistence per project, and dev root preference are three separate persistence concerns — keep them cleanly separated

## Integration Points

- `src/web/bridge-service.ts` — Singleton → registry migration, project-scoped `getProjectBridgeService(projectCwd)` API
- `src/web-mode.ts` — Context-aware launch detection (is cwd inside a known project under the dev root?)
- `web/lib/gsd-workspace-store.tsx` — Project switching state management, multi-SSE connection management
- `web/components/gsd/app-shell.tsx` — New "projects" entry in `KNOWN_VIEWS`, Projects view component
- `web/components/gsd/sidebar.tsx` — NavRail "Projects" tab with icon
- `web/components/gsd/onboarding-gate.tsx` + `src/web/onboarding-service.ts` — Dev root selection step
- `web/app/api/` — All routes need project-scoping mechanism
- `~/.gsd/web-preferences.json` (new) — Persistent dev root and cross-project web preferences

## Open Questions

- Whether idle project bridges should have an eviction timeout (e.g. kill RPC subprocess after 30 minutes of inactivity) or stay alive indefinitely — will be determined during planning based on memory profiling.
- Whether the project list view should show aggregate GSD progress (milestone counts, active slice) or just basic project metadata (name, path, last activity) — will be determined during discussion of the Projects view component.
- Whether switching projects should use full page navigation (simpler, cleaner state reset) or in-place state swap (faster, but more complex) — will be determined during store architecture planning.
