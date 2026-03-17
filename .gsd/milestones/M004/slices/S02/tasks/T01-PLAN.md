---
estimated_steps: 8
estimated_files: 1
---

# T01: Write docs/web-mode.md

**Slice:** S02 — Web Mode Documentation
**Milestone:** M004

## Description

Write the dedicated web mode guide covering launch, onboarding, workspace UI, browser commands, architecture, configuration, and troubleshooting. This is the primary documentation deliverable that all other docs cross-reference.

## Steps

1. Create `docs/web-mode.md` with front matter and title
2. Write **Overview** section: what web mode is, when to use it vs TUI, current-project scoped
3. Write **Getting Started** section: `gsd --web [path]`, `gsd web start`, `gsd web stop`, prerequisites (Node.js, npm), first launch experience
4. Write **Browser Onboarding** section: first-run credential validation, setup blocks workspace, auth refresh, workspace unlock
5. Write **Workspace** section: 6 views (dashboard, power/terminal, roadmap, files, activity, visualizer with 7 tabs), sidebar navigation (NavRail), command surfaces, settings panels. Use a table or structured list.
6. Write **Browser Commands** section: `/gsd` dispatch with 30 subcommands — table showing the 20 surface commands, 9 passthrough commands, 1 local help. Plus built-in slash commands (`/new`, `/resume`, `/session`, `/fork`, `/compact`, `/export`, `/settings`, `/auth`, `/logout`, `/git`, `/exit`).
7. Write **Architecture** section: parent launcher → standalone host → bridge singleton (RPC subprocess) → workspace store. Child-process service pattern for upstream module calls. 23 API routes. Keep high-level — not internal API docs.
8. Write **Configuration & Troubleshooting** section: `GSD_WEB_*` env vars (`GSD_WEB_HOST`, `GSD_WEB_PORT`, `GSD_WEB_PROJECT_CWD`, `GSD_WEB_PROJECT_SESSIONS_DIR`, `GSD_WEB_PACKAGE_ROOT`, `GSD_WEB_HOST_KIND`), port conflicts, bridge disconnects, build failures, packaged vs dev host resolution.

## Must-Haves

- [ ] All 7 sections written
- [ ] View names match KNOWN_VIEWS in app-shell.tsx: dashboard, power, roadmap, files, activity, visualize
- [ ] CLI commands match cli-web-branch.ts: `gsd --web [path]`, `gsd web start [path]`, `gsd web stop`
- [ ] Command classification matches parity contract: 20 surface, 9 passthrough, 1 help
- [ ] Env vars match web-mode.ts: GSD_WEB_HOST, GSD_WEB_PORT, GSD_WEB_PROJECT_CWD, GSD_WEB_PROJECT_SESSIONS_DIR, GSD_WEB_PACKAGE_ROOT, GSD_WEB_HOST_KIND
- [ ] Tone matches existing docs: technical, concise, code examples where helpful

## Verification

- `test -f docs/web-mode.md`
- `wc -l docs/web-mode.md` returns 150+ lines
- `rg "dashboard\|power\|roadmap\|files\|activity\|visualize" docs/web-mode.md` returns hits for all 6 views

## Inputs

- `src/web-mode.ts` — launch mechanics, env vars, host resolution
- `src/cli-web-branch.ts` — CLI parsing, flags, web start/stop
- `web/components/gsd/app-shell.tsx` — KNOWN_VIEWS, view rendering
- `web/lib/browser-slash-command-dispatch.ts` — command classification
- `web/components/gsd/sidebar.tsx` — NavRail navigation
- `web/app/api/` — 23 API route directories
- `src/web/bridge-service.ts` — bridge singleton, RPC subprocess

## Expected Output

- `docs/web-mode.md` — complete web mode guide (~200-300 lines)

## Observability Impact

This task creates a documentation file only — no runtime code is changed.

- **No new runtime signals.** No log lines, env vars, metrics, or error messages are added or modified.
- **Inspection:** The doc's accuracy is verifiable by grepping source files for every name it references (view names, CLI flags, env vars, API routes).
- **Failure state:** A missing or inaccurate doc entry is detectable by automated cross-reference checks in T03. No runtime failure modes are introduced.
