---
id: T01
parent: S02
milestone: M006
provides:
  - exported detectProjectKind function with extended detection signals (Cargo, Go, Python)
  - project-discovery-service with discoverProjects() scanning one directory level
  - /api/projects?root= GET route returning discovered project metadata
  - /api/preferences GET/PUT route for persisting dev root and last active project
  - webPreferencesPath export from app-paths.ts
  - contract test proving discovery logic across mixed project types
key_files:
  - src/web/bridge-service.ts
  - src/web/project-discovery-service.ts
  - src/app-paths.ts
  - web/app/api/projects/route.ts
  - web/app/api/preferences/route.ts
  - src/tests/web-project-discovery-contract.test.ts
key_decisions:
  - Extended ProjectDetectionSignals with optional fields (hasCargo, hasGoMod, hasPyproject) to preserve backward compatibility with existing test fixtures
patterns_established:
  - project-discovery-service pattern: readdirSync one level, filter dirs, exclude dotfiles/node_modules, call detectProjectKind per entry, return sorted ProjectMetadata[]
  - /api/preferences route uses webPreferencesPath from app-paths.ts for persistence — same pattern as other app-level config files
observability_surfaces:
  - "/api/projects?root=<path>" returns project list with kind + signals for each discovered project
  - "/api/preferences" GET returns current dev root and last active project (or {} if not set)
  - discoverProjects() returns [] for missing/unreadable paths (no throw)
  - "/api/projects" returns 400 with { error } body when ?root= missing
duration: 12m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Create project discovery service, API routes, and contract test

**Exported `detectProjectKind` with extended language signals, built `discoverProjects()` service, added `/api/projects` and `/api/preferences` routes, and proved all detection logic with a 10-assertion contract test.**

## What Happened

1. Exported `detectProjectKind` from `bridge-service.ts` (was internal `function`, now `export function`).
2. Extended `ProjectDetectionSignals` with three optional fields: `hasCargo`, `hasGoMod`, `hasPyproject`. Added corresponding `existsSync` checks in `detectProjectKind()` and added them to the brownfield detection condition.
3. Added `webPreferencesPath` export to `app-paths.ts` pointing to `~/.gsd/web-preferences.json`.
4. Created `project-discovery-service.ts` with `ProjectMetadata` interface and `discoverProjects()` function. Scans one directory level, excludes dotfiles/node_modules/.git, calls `detectProjectKind` per directory, returns sorted results. Wrapped in try/catch for missing paths.
5. Created `/api/projects/route.ts` GET handler that reads `?root=` param and returns `discoverProjects(root)`.
6. Created `/api/preferences/route.ts` with GET (read or return `{}`) and PUT (validate shape, write with `mkdirSync` safety).
7. Created `web-project-discovery-contract.test.ts` with 10 test cases across 4 project types (brownfield, empty-gsd, brownfield-cargo, blank), exclusion checks, signal verification, sort order, and edge case for nonexistent path.

## Verification

- `npm run test:unit -- --test-name-pattern "project-discovery"` → 10/10 tests pass (28ms)
- `npm run build` → exit 0, clean TypeScript compilation
- `npm run build:web-host` → exit 0, Next.js standalone build includes both `/api/projects` and `/api/preferences` in route manifest
- `rg "export function detectProjectKind" src/web/bridge-service.ts` → confirmed
- `rg "webPreferencesPath" src/app-paths.ts` → confirmed
- Full test suite: 1215 pass, 0 fail (7 "cancelled" are pre-existing test-harness timeouts on unrelated bridge/SSE contract tests, not regressions)

## Diagnostics

- **Inspect discovered projects:** `curl localhost:<port>/api/projects?root=/path/to/dev` returns JSON array of `ProjectMetadata` with kind, signals, lastModified
- **Inspect preferences:** `curl localhost:<port>/api/preferences` returns `{ devRoot?, lastActiveProject? }` or `{}`
- **Set preferences:** `curl -X PUT -H 'Content-Type: application/json' -d '{"devRoot":"/path"}' localhost:<port>/api/preferences`
- **Detection correctness:** Run `npm run test:unit -- --test-name-pattern "project-discovery"` to verify detection logic

## Deviations

None — implementation followed the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `src/web/bridge-service.ts` — exported `detectProjectKind`, added `hasCargo`/`hasGoMod`/`hasPyproject` to signals and brownfield condition
- `src/web/project-discovery-service.ts` — new: `ProjectMetadata` interface, `discoverProjects()` function
- `src/app-paths.ts` — added `webPreferencesPath` export
- `web/app/api/projects/route.ts` — new: GET handler for project discovery
- `web/app/api/preferences/route.ts` — new: GET/PUT handler for dev root persistence
- `src/tests/web-project-discovery-contract.test.ts` — new: 10-case contract test for discovery logic
- `.gsd/milestones/M006/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
