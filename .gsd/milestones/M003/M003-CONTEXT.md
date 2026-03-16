# M003: Upstream Sync and Full Web Feature Parity

**Gathered:** 2026-03-16
**Status:** Ready for planning

## Project Description

The upstream GSD repo (gsd-build/gsd-2) has diverged by 398 commits spanning v2.12 through v2.21. This fork added browser-first web mode (M001, M002) while upstream added major new features — workflow visualizer, forensics, capture/triage, dynamic model routing, SQLite context store, branchless worktree architecture, and 15+ new /gsd subcommands. M003 merges upstream, resolves conflicts, and builds browser surfaces for every new feature to achieve absolute 1:1 TUI-web parity.

## Why This Milestone

The fork and upstream have diverged far enough that further independent development risks permanent incompatibility. The upstream features are substantial and users expect them. Merging now — before more drift accumulates — is the right time.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run `gsd --web` and access every feature that the TUI offers, including all new upstream capabilities
- Open a dedicated visualizer page with 7 tabbed sections showing project progress, dependencies, metrics, timeline, agent activity, changelog, and export
- Run `/gsd forensics`, `/gsd doctor`, `/gsd skill-health` from the browser and see results in dedicated panels
- View and manage knowledge entries and captures/triage from a dedicated browser page
- Configure model routing, provider management, and budget from the browser settings surface
- Use `/gsd quick`, `/gsd history`, `/gsd undo`, `/gsd steer`, `/gsd mode`, `/gsd hooks`, `/gsd config`, `/gsd inspect`, `/gsd export`, `/gsd cleanup` from the browser — every command has a surface

### Entry point / environment

- Entry point: `gsd --web` CLI command
- Environment: local dev / browser
- Live dependencies involved: upstream git remote for merge, local GSD runtime

## Completion Class

- Contract complete means: all upstream commits merged, build green, every /gsd subcommand has a browser dispatch path
- Integration complete means: web UI surfaces are backed by real upstream data sources (visualizer-data.ts, forensics.ts, captures.ts, doctor.ts, skill-health.ts, metrics.ts, context-budget.ts)
- Operational complete means: full test suite passes, parity audit confirms no TUI feature is missing

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `npm run build` and `npm run build:web-host` succeed on the merged codebase
- Every `/gsd` subcommand typed in the browser terminal dispatches correctly (surface, execute, or reject with guidance)
- The visualizer page renders real project data across all 7 tabs
- Forensics, doctor, and skill-health panels show real diagnostic data
- Knowledge and captures page shows real project context
- A systematic TUI-to-web parity audit finds no missing features
- `npm run test:unit`, `npm run test:integration` pass clean

## Risks and Unknowns

- **auto.ts decomposition conflict** — Upstream split the monolithic auto.ts into 6+ modules. Our web bridge hooks into the old structure. Reconnecting hooks across the new module boundaries is the hardest conflict resolution.
- **git-service.ts rewrite to Rust/libgit2** — Upstream rewired git operations through native-git-bridge.ts. Our web git-summary-service.ts uses the old git-service.ts API.
- **types.ts interface changes** — Upstream added substantial new types that may break the web store's type contracts.
- **Worktree architecture changes** — Upstream's M003 rearchitected worktrees (branchless). The web bridge's session/cwd assumptions may need updating.
- **package.json / package-lock.json conflict** — Both sides added dependencies. Version resolution may need manual intervention.

## Existing Codebase / Prior Art

- `web/lib/gsd-workspace-store.tsx` (4600 lines) — The central browser state store that bridges all web surfaces
- `web/lib/browser-slash-command-dispatch.ts` (233 lines) — Current command dispatch, handles ~12 commands, needs extension to ~27
- `web/lib/command-surface-contract.ts` (935 lines) — Typed command surface state for settings, session, git, etc.
- `web/components/gsd/command-surface.tsx` (2082 lines) — Renders command surfaces in the browser
- `web/components/gsd/dashboard.tsx` (577 lines) — Dashboard with metrics, tasks, activity
- `web/app/api/recovery/route.ts` — Existing recovery diagnostics route
- `src/web/bridge-service.ts` — Bridge service connecting web routes to GSD runtime
- `src/resources/extensions/gsd/visualizer-data.ts` — Upstream data aggregation for visualizer (VisualizerData interface)
- `src/resources/extensions/gsd/forensics.ts` — Upstream forensics anomaly scanning
- `src/resources/extensions/gsd/captures.ts` — Upstream capture/triage system
- `src/resources/extensions/gsd/doctor.ts` — Upstream doctor with 7 health checks and auto-fix
- `src/resources/extensions/gsd/skill-health.ts` — Upstream skill lifecycle telemetry
- `src/resources/extensions/gsd/model-router.ts` — Upstream dynamic model routing
- `src/resources/extensions/gsd/context-budget.ts` — Upstream context window budget engine
- `src/resources/extensions/gsd/commands.ts` — Upstream command registry with all /gsd subcommands

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R100 — Clean merge is the foundation for everything
- R101 — Command dispatch must cover all upstream subcommands
- R102 — Visualizer page gives project visibility
- R103, R104, R105 — Diagnostics panels surface system health
- R106 — Knowledge/captures surface project context
- R107 — Settings surface covers model/provider/budget management
- R108 — Remaining commands achieve absolute parity
- R109 — Parity audit catches what individual slices miss
- R110 — Test suite confirms nothing is broken

## Scope

### In Scope

- Full merge of upstream/main (398 commits) with conflict resolution
- Browser-native surfaces for all new upstream /gsd subcommands
- Dedicated visualizer page with 7 tabbed sections
- Separate panels for forensics, doctor, skill-health
- Knowledge + captures/triage dedicated page
- Extended settings surface for model routing, providers, budget
- Surfaces for quick, history, undo, steer, mode, hooks, config, inspect, export, cleanup
- TUI-to-web 1:1 parity audit
- Full test suite green

### Out of Scope / Non-Goals

- Re-skinning or redesigning existing web UI (R031)
- Cross-project launcher (R020)
- Remote/LAN access (R022)
- Adding new features not present in upstream
- Modifying upstream feature behavior — only surfacing in browser

## Technical Constraints

- Web-only files (web/, src/web/) have zero upstream conflicts — all conflicts are in shared core files
- The merge must preserve our web integration hooks while adopting upstream's structural changes
- New API routes follow the established same-origin pattern (web/app/api/)
- New browser surfaces use the existing command-surface-contract and workspace-store patterns
- Visualizer data comes from the upstream loadVisualizerData() function — no reimplementation

## Integration Points

- `upstream/main` — 398 commits to merge, 50 file conflicts
- `src/resources/extensions/gsd/` — Upstream's decomposed module structure replaces the monolithic files our hooks attached to
- `web/lib/gsd-workspace-store.tsx` — Must expand to hold state for new surfaces (visualizer, forensics, captures, etc.)
- `web/lib/browser-slash-command-dispatch.ts` — Must add dispatch entries for all new commands
- `web/app/api/` — New routes for visualizer, forensics, doctor, skill-health, captures, knowledge data

## Open Questions

- Whether upstream's worktree architecture changes affect the web bridge's session resolution — will be answered during merge (S01)
- Exact shape of visualizer API route — whether to call loadVisualizerData() directly or reshape for browser consumption — will be answered during S03 planning
