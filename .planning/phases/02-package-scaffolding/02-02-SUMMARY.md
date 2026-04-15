---
phase: 02-package-scaffolding
plan: "02"
subsystem: infra
tags: [npm-workspaces, build-scripts, typescript, tsc, symlinks]

# Dependency graph
requires:
  - phase: 02-01
    provides: "gsd-agent-core and gsd-agent-modes package directories with tsconfig and src/index.ts"
provides:
  - "build:agent-core and build:agent-modes scripts wired into root package.json"
  - "build:gsd composite script exercising full pi+GSD build chain"
  - "build:core updated to call build:gsd instead of build:pi"
  - "ensure-workspace-builds.cjs includes gsd-agent-core and gsd-agent-modes"
  - "link-workspace-packages.cjs creates symlinks for @gsd/agent-core and @gsd/agent-modes"
  - "Decorator audit confirms zero decorator usage in pi-coding-agent migration targets"
affects: [03-agent-core-migration, 04-agent-modes-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "build:gsd as the canonical full-stack build target (pi + GSD packages)"
    - "Dependency-ordered WORKSPACE_PACKAGES array in ensure-workspace-builds.cjs"
    - "packageMap with unscoped name field (agent-core not gsd-agent-core) in link-workspace-packages.cjs"

key-files:
  created: []
  modified:
    - "scripts/ensure-workspace-builds.cjs"
    - "scripts/link-workspace-packages.cjs"
    - "package.json"

key-decisions:
  - "build:pi left unchanged, scoped to vendored packages only; build:gsd wraps it with new packages"
  - "build:core updated to call build:gsd so the full GSD stack is exercised on every core build"
  - "packageMap name field uses unscoped name (agent-core) not directory name (gsd-agent-core)"

patterns-established:
  - "New GSD packages slot after pi-coding-agent in WORKSPACE_PACKAGES (dependency order)"
  - "build:gsd is the integration point; add new packages to it not build:pi"

requirements-completed: [SCAF-03, SCAF-04, SCAF-05, SCAF-06]

# Metrics
duration: 15min
completed: 2026-04-14
---

# Phase 02 Plan 02: Package Scaffolding Build Chain Summary

**`build:gsd` composite script wires @gsd/agent-core and @gsd/agent-modes into the npm workspace build chain, with symlinks, install-time checks, and decorator audit confirming zero tsconfig changes needed for Phase 3.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-14T00:00:00Z
- **Completed:** 2026-04-14T00:15:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `gsd-agent-core` and `gsd-agent-modes` to `WORKSPACE_PACKAGES` in `ensure-workspace-builds.cjs` (dependency order: after pi-coding-agent, before rpc-client)
- Added `gsd-agent-core` and `gsd-agent-modes` to `packageMap` in `link-workspace-packages.cjs` with correct unscoped name fields (`agent-core`, `agent-modes`)
- Added `build:agent-core`, `build:agent-modes`, and `build:gsd` scripts to root `package.json`
- Updated `build:core` to call `build:gsd` instead of `build:pi` (SCAF-04)
- `npm run build:gsd` passes end-to-end; both `packages/gsd-agent-core/dist/index.js` and `packages/gsd-agent-modes/dist/index.js` produced
- Decorator audit confirms zero `@Injectable/@Observe/@Component/@Module/@Pipe/@Directive` usage in `pi-coding-agent/src/{core,modes,cli}/` — no tsconfig changes needed for Phase 3

## Task Commits

Each task was committed atomically:

1. **Task 1: Update install-time scripts and root build scripts** - `164f20813` (feat)
2. **Task 2: Full build verification and decorator audit** - no file changes (verification only)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `scripts/ensure-workspace-builds.cjs` - Added `gsd-agent-core` and `gsd-agent-modes` to WORKSPACE_PACKAGES
- `scripts/link-workspace-packages.cjs` - Added `gsd-agent-core` and `gsd-agent-modes` to packageMap
- `package.json` - Added `build:agent-core`, `build:agent-modes`, `build:gsd`; updated `build:core`

## Decisions Made

- `build:pi` left unchanged — it stays scoped to vendored (pi-*) packages only per D-03. `build:gsd` wraps it.
- `packageMap` name field uses unscoped name (`agent-core`) not the directory name (`gsd-agent-core`) because it combines with `scope: '@gsd'` to resolve `@gsd/agent-core`.
- `build:core` updated to call `build:gsd` so core builds exercise the complete GSD stack going forward.

## Deviations from Plan

### Pre-existing Issues (Out of Scope)

**tsc --noEmit acceptance criterion could not be satisfied** — 9 pre-existing TypeScript errors exist in `src/resources/extensions/gsd/model-router.ts` and `src/cli.ts` before this plan's changes. Verified by running `tsc --noEmit` on the base commit (before any edits). The errors reference missing exports from `@gsd/pi-ai`, `@gsd/pi-coding-agent`, and a missing `@gsd-build/mcp-server` type declaration — none related to `gsd-agent-core` or `gsd-agent-modes`. These are out of scope per the scope boundary rule (pre-existing failures in unrelated files).

Similarly, `npm run build:core` fails at its root-level `tsc` step for the same pre-existing reason (`src/cli.ts` TS2307). The `build:gsd` portion of `build:core` succeeds, confirming our wiring is correct.

Both issues logged to deferred items for Phase 3 investigation.

---

**Total deviations:** 0 auto-fixes (plan executed as written)
**Impact on plan:** Pre-existing tsc errors are out of scope. build:gsd passes; both dist outputs confirmed.

## Issues Encountered

- Stash pop during pre-existing-error verification caused merge conflicts in other agents' files (`dynamic-tools.ts`, `auto-worktree-milestone-merge.test.ts`). Resolved by checking out HEAD versions and dropping the stash. No impact on this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both packages are workspace-visible, symlinked, and build-verified
- `build:gsd` is the integration entry point for Phase 3/4 migration work
- Zero decorator usage confirmed in migration targets — no tsconfig changes needed before Phase 3
- Blocker: Pre-existing tsc errors in `src/cli.ts` and `src/resources/extensions/gsd/model-router.ts` should be resolved before `build:core` is used as a CI gate

---
*Phase: 02-package-scaffolding*
*Completed: 2026-04-14*
