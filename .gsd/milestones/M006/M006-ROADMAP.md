# M006: Multi-Project Workspace

**Vision:** Replace the single-project-per-launch architecture with a multi-project workspace. The user selects a development root folder during onboarding, GSD discovers projects within it, a Projects NavRail tab shows all detected projects with status, and switching projects keeps the previous project's agent session alive in the background.

## Success Criteria

- A user can launch `gsd --web`, see a Projects tab in the NavRail, and click between detected projects under their dev root — all surfaces (dashboard, terminal, roadmap, files, activity) switch to the selected project's context
- Switching from Project A to Project B and back preserves Project A's agent session exactly where it was left
- `gsd --web` launched from within `~/Projects/foo` opens directly into `foo`; launched from `~/Projects` or `~` opens the project picker
- During first-time setup, the user selects their dev root folder; subsequent launches remember it without re-prompting
- A user who never configures a dev root sees zero regression — single-project behavior continues unchanged
- `npm run build` and `npm run build:web-host` succeed, and no existing tests break

## Key Risks / Unknowns

- **Bridge singleton → registry migration** — The entire API surface (29 routes, 16 child-process services, bridge-service.ts) derives project context from `GSD_WEB_PROJECT_CWD` env var via `resolveBridgeRuntimeConfig()`. Converting this to runtime-parameterized multi-instance requires threading `projectCwd` through every call site without breaking backward compatibility. This is the hardest architectural change.
- **SSE event stream and store isolation** — Each bridge has its own subscriber set. Multi-project means the browser manages per-project SSE connections and per-project store instances. Connection leaks, stale state bleed, and disposal races are all possible.
- **Context-aware launch detection** — Determining whether `cwd` is inside a known project under the dev root, and routing to either direct entry or the project picker, changes the host launch contract.

## Proof Strategy

- **Bridge registry** → retire in S01 by proving two concurrent bridge instances coexist without interference, all 29 API routes accept `?project=` parameter, and existing tests pass unchanged
- **SSE/store isolation** → retire in S02 by proving two project contexts can be opened in the browser with independent SSE streams, switching between them swaps all surfaces, and background sessions survive
- **Context-aware launch** → retire in S03 by proving `gsd --web` from inside a project opens directly, from outside opens the picker, and the full onboarding→discover→switch→persist flow works end-to-end

## Verification Classes

- Contract verification: new `web-multi-project-contract.test.ts` covering bridge registry, project-scoped API resolution, project discovery. Existing 12 contract test files + 3 integration test files must pass unchanged.
- Integration verification: real multi-bridge coexistence (two bridge instances for different project paths), project-scoped SSE streams, store switching
- Operational verification: context-aware launch detection, dev root persistence across sessions, idle bridge lifecycle
- UAT / human verification: end-to-end flow — onboarding with dev root, project picker, switch between projects, verify sessions survive

## Milestone Definition of Done

This milestone is complete only when all are true:

- All three slices S01–S03 are complete with summaries
- Bridge registry manages multiple concurrent bridge instances keyed by project path
- All 29 API routes and 16 child-process services accept project context via `?project=` parameter with env-var fallback
- Projects view renders in the NavRail, shows detected projects, and switching projects swaps all surfaces
- Browser manages per-project SSE connections and store state — background sessions survive switches
- Dev root selection persists in `~/.gsd/web-preferences.json` and subsequent launches skip the prompt
- Context-aware launch works: inside project → direct entry, outside → project picker
- `npm run build`, `npm run build:web-host`, and all existing tests pass
- Final integrated acceptance scenarios pass:
  - First-time user completes onboarding with dev root selection, sees projects, switches between them
  - Agent work in Project A survives switch to Project B and back
  - `gsd --web` from project dir → direct entry; from dev root → picker

## Requirement Coverage

- Covers: R020 (multi-project workspace — primary deliverable)
- Preserves: R002 (browser onboarding — extended with dev root step), R003 (current-project launch scoping — preserved via context-aware launch)
- Leaves for later: R021 (cross-project analytics), R022 (remote access)
- Orphan risks: none

## Slices

- [x] **S01: Bridge registry and project-scoped API surface** `risk:high` `depends:[]`
  > After this: All 29 API routes accept a `?project=` query parameter to target a specific project's bridge. Two bridge instances can coexist in the same host process. All existing single-project behavior and tests pass unchanged (proven by contract tests and builds).

- [x] **S02: Project discovery, Projects view, and store switching** `risk:medium` `depends:[S01]`
  > After this: A Projects tab appears in the NavRail. Clicking a project switches all workspace surfaces to that project's context with a per-project SSE connection. Background agent sessions survive project switches. Project discovery scans the dev root and shows typed metadata.

- [x] **S03: Onboarding dev root step, context-aware launch, and final assembly** `risk:low` `depends:[S02]`
  > After this: First-time users select a dev root folder during onboarding. The preference persists across sessions. `gsd --web` from inside a project opens directly into it; from outside opens the project picker. The full end-to-end flow is proven in a real browser environment.

## Boundary Map

### S01 → S02

Produces:
- `getProjectBridgeServiceForCwd(projectCwd: string): BridgeService` — registry-based bridge lookup that creates/returns bridge instances keyed by project path
- `resolveProjectCwd(request: Request): string` — helper that reads `?project=` from URL and falls back to `GSD_WEB_PROJECT_CWD` env var
- All 29 API routes threaded with project context — every route calls `resolveProjectCwd(request)` and passes to service functions
- All 16 child-process service `collect*()` functions accept optional `projectCwd?: string` parameter
- `resolveBridgeRuntimeConfig(env?, projectCwdOverride?: string)` — extended to accept runtime override
- Backward-compatible: `getProjectBridgeService()` still works as env-based shim for existing code paths

### S02 → S03

Produces:
- `project-discovery-service.ts` — `discoverProjects(devRootPath: string): ProjectMetadata[]` scanning one level with smart detection
- `/api/projects?root=` route returning discovered projects with typed metadata
- `/api/preferences` GET/PUT route for dev root persistence in `~/.gsd/web-preferences.json`
- `ProjectStoreManager` in workspace store — `Map<string, GSDWorkspaceStore>` keyed by project path, active store switching, per-project SSE lifecycle
- `ProjectsView` component in app-shell with `KNOWN_VIEWS` entry and NavRail tab
- Store isolation: each project gets its own store instance with independent SSE connection, clean state on creation

### S03 output

Produces:
- `step-dev-root.tsx` — onboarding wizard step for dev root folder selection
- Dev root persistence in `~/.gsd/web-preferences.json` with graceful stale-path handling
- Context-aware launch detection in `web-mode.ts` / `cli-web-branch.ts`: cwd inside known project → direct entry, outside → picker
- End-to-end assembled proof of the full multi-project flow
