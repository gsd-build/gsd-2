# S02: Web Mode Documentation

**Goal:** Complete web mode documentation: a dedicated guide, README updates, docs index update, and relevant cross-references in 5 existing docs.
**Demo:** `rg -i "web mode\|--web\|gsd --web" docs/ README.md` returns hits in `docs/web-mode.md`, `README.md`, `docs/README.md`, `docs/getting-started.md`, `docs/architecture.md`, `docs/commands.md`, `docs/configuration.md`, `docs/troubleshooting.md`. All referenced file paths, commands, and view names match the codebase.

## Must-Haves

- `docs/web-mode.md` covers: launch (`gsd --web`, `gsd web start`, `gsd web stop`), onboarding flow, workspace views (dashboard, power, roadmap, files, activity, visualize), browser commands (30 subcommands: 20 surface, 9 passthrough, 1 help), architecture (parent launcher → packaged host → bridge singleton → workspace store), configuration (`GSD_WEB_*` env vars), troubleshooting (port conflicts, bridge disconnects, build failures)
- README: documentation index includes web mode guide, command table includes `gsd --web`, getting-started mentions web mode, architecture section references web host/bridge
- `docs/README.md`: user docs table includes web mode guide entry
- `docs/getting-started.md`: mentions `gsd --web` as alternative launch path
- `docs/architecture.md`: web host/bridge/store architecture section
- `docs/commands.md`: `gsd --web` flag, `gsd web stop`, browser command dispatch
- `docs/configuration.md`: web-relevant preferences and env vars
- `docs/troubleshooting.md`: web-specific troubleshooting section

## Verification

- `rg -i "web mode\|--web\|gsd --web" docs/ README.md | cut -d: -f1 | sort -u` returns all 8 target files
- `test -f docs/web-mode.md` passes
- Every `[text](./file.md)` cross-reference in the new/updated docs resolves to an existing file
- All CLI flags mentioned match `src/cli-web-branch.ts` (`--web`, `web start`, `web stop`)
- All view names match `web/components/gsd/app-shell.tsx` KNOWN_VIEWS: `dashboard, power, roadmap, files, activity, visualize`
- All API route directories mentioned match `web/app/api/` listing (23 routes)
- `docs/README.md` table row count increases by 1
- Every CLI flag and env var mentioned in `docs/web-mode.md` maps to a real identifier in the corresponding source file (no phantom references)
- Cross-reference links that resolve to non-existent files are detected by `for f in $(rg -oP '\(\.\/[^)]+\)' docs/web-mode.md README.md docs/README.md docs/getting-started.md docs/architecture.md docs/commands.md docs/configuration.md docs/troubleshooting.md | sed 's/.*(\.\//docs\//;s/)//'); do test -f "$f" || echo "BROKEN: $f"; done` — any output indicates a broken link (failure state)

## Tasks

- [x] **T01: Write docs/web-mode.md** `est:1h`
  - Why: This is the primary deliverable — the complete dedicated web mode guide. It must exist before T02 can cross-reference it.
  - Files: `docs/web-mode.md`
  - Do: Write the guide covering 7 sections: (1) Overview — what web mode is, when to use it; (2) Getting Started — `gsd --web [path]`, `gsd web start/stop`, prerequisites; (3) Browser Onboarding — first-run credential setup, validation, workspace unlock; (4) Workspace — the 6 views (dashboard, power/terminal, roadmap, files, activity, visualizer with 7 tabs), sidebar navigation, command surfaces; (5) Browser Commands — `/gsd` with 30 subcommands classified as 20 surface, 9 passthrough, 1 help, plus built-in slash commands; (6) Architecture — parent launcher → standalone host → bridge singleton → workspace store, child-process service pattern, 23 API routes; (7) Configuration & Troubleshooting — `GSD_WEB_*` env vars, port conflicts, bridge disconnects, build issues. Match existing docs tone (technical, concise, code examples, tables). Source truth from `src/web-mode.ts`, `src/cli-web-branch.ts`, `web/components/gsd/app-shell.tsx`, `web/lib/browser-slash-command-dispatch.ts`.
  - Verify: `test -f docs/web-mode.md`; `wc -l docs/web-mode.md` returns 150+; all view names, commands, and API routes match source.
  - Done when: `docs/web-mode.md` exists with all 7 sections, references are accurate against the codebase.

- [x] **T02: Update README and existing docs** `est:45m`
  - Why: The README and 6 existing docs have zero web mode mentions. Cross-references to the new guide must be added, and each doc's relevant sections must incorporate web mode context.
  - Files: `README.md`, `docs/README.md`, `docs/getting-started.md`, `docs/architecture.md`, `docs/commands.md`, `docs/configuration.md`, `docs/troubleshooting.md`
  - Do: (1) `README.md` — add `[Web Mode](./docs/web-mode.md)` to the documentation index after Getting Started, add `gsd --web [path]` row to the command table, add a brief web mode paragraph to the getting-started section, add a web mode note to the architecture overview. (2) `docs/README.md` — add web mode guide row to the user docs table. (3) `docs/getting-started.md` — add a "Web Mode" subsection mentioning `gsd --web` as an alternative and linking to the guide. (4) `docs/architecture.md` — add a "Web Mode Architecture" section covering host/bridge/store. (5) `docs/commands.md` — add `gsd --web`, `gsd web start`, `gsd web stop` to CLI flags, add browser command dispatch note. (6) `docs/configuration.md` — add `GSD_WEB_*` env vars section. (7) `docs/troubleshooting.md` — add web-specific issues section (port conflicts, bridge errors). Match each doc's existing tone and depth.
  - Verify: `rg -i "web mode\|--web\|gsd --web" docs/ README.md | cut -d: -f1 | sort -u | wc -l` returns 8. All `[text](./path)` references resolve to existing files.
  - Done when: All 7 files updated with accurate web mode references; cross-references resolve; doc tone matches surroundings.

- [x] **T03: Verify documentation accuracy** `est:15m`
  - Why: Documentation accuracy is the hardest constraint — every path, command, and name must match the real codebase.
  - Files: (no new files — reads only)
  - Do: Run verification checks: (1) Extract all file paths from `docs/web-mode.md` and verify they exist. (2) Verify all 6 KNOWN_VIEWS match app-shell.tsx. (3) Verify CLI flags match cli-web-branch.ts. (4) Verify `GSD_WEB_*` env vars match web-mode.ts. (5) Verify all cross-reference links resolve. (6) Verify API route count matches `web/app/api/` listing. (7) Verify command classification (20 surface, 9 passthrough, 1 help) matches parity contract test.
  - Verify: All 7 checks pass with no discrepancies.
  - Done when: Zero documentation-vs-codebase mismatches found, or all found mismatches are corrected.

## Observability / Diagnostics

This slice is documentation-only — no runtime code changes. Observability concerns:

- **Inspection surface:** `rg -i "web mode\|--web\|gsd --web" docs/ README.md` confirms cross-reference coverage across all 8 target files.
- **Accuracy verification:** All documented CLI flags, view names, env vars, and API routes are verified against source files. Mismatches are caught by T03 verification checks.
- **Failure visibility:** If a cross-reference link (`[text](./path.md)`) resolves to a non-existent file, the T03 verification task catches it with `test -f` checks on all referenced paths.
- **No runtime signals changed.** No env vars, log lines, or error messages are modified by this slice.

## Files Likely Touched

- `docs/web-mode.md` (new)
- `README.md`
- `docs/README.md`
- `docs/getting-started.md`
- `docs/architecture.md`
- `docs/commands.md`
- `docs/configuration.md`
- `docs/troubleshooting.md`
