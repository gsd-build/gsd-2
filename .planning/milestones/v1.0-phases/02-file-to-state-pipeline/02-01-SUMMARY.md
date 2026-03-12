---
phase: 02-file-to-state-pipeline
plan: 01
subsystem: server
tags: [file-watcher, state-derivation, gray-matter, bun, typescript]

requires:
  - phase: 01-monorepo-bun-server-bootstrap
    provides: Bun server on :4000, monorepo workspace structure, bun:test setup
provides:
  - PlanningState type system (types.ts) with all shared interfaces
  - createFileWatcher with debounced recursive watching and temp file filtering
  - buildFullState() state derivation from .planning/ files
  - parseRoadmap() and parseRequirements() for checkbox parsing
affects: [02-02-ws-server-differ, 02-03-client-reconnect, all-future-server-plans]

tech-stack:
  added: [gray-matter@4.0.3]
  patterns: [debounced-file-watcher, full-state-rebuild, yaml-frontmatter-parsing]

key-files:
  created:
    - packages/mission-control/src/server/types.ts
    - packages/mission-control/src/server/watcher.ts
    - packages/mission-control/src/server/state-deriver.ts
    - packages/mission-control/tests/watcher.test.ts
    - packages/mission-control/tests/state-deriver.test.ts
  modified:
    - packages/mission-control/package.json
    - bun.lock

key-decisions:
  - "Used Bun fs.watch with recursive:true and 50ms debounce (not chokidar)"
  - "Full state rebuild on every change (not incremental) since .planning/ has ~25 files"
  - "gray-matter for YAML frontmatter parsing of STATE.md and PLAN.md files"
  - "readdirSync for PLAN.md discovery instead of glob library"

patterns-established:
  - "Debounced watcher pattern: collect filenames in Set, fire after quiet period"
  - "State deriver pattern: concurrent file reads with Promise.all, graceful defaults for missing files"
  - "Type-first approach: shared types.ts defines all interfaces before implementation"

requirements-completed: [SERV-02, SERV-03, SERV-09]

duration: 4min
completed: 2026-03-10
---

# Phase 2 Plan 1: Shared Types, File Watcher, and State Deriver Summary

**Debounced file watcher with recursive .planning/ monitoring and state derivation engine parsing STATE.md, ROADMAP.md, config.json, PLAN.md, and REQUIREMENTS.md into typed PlanningState**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-10T00:35:28Z
- **Completed:** 2026-03-10T00:39:25Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created comprehensive PlanningState type system with interfaces for all .planning/ file types
- Implemented createFileWatcher with 50ms debounce, recursive watching, and temp/swap file filtering
- Built buildFullState() that parses all .planning/ files concurrently into typed JSON state
- 15 tests passing across both modules covering all behaviors and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared types and debounced file watcher** - `e1a75e0` (feat)
2. **Task 2: Create state derivation engine with full state rebuild** - `2b7bb23` (feat)

_Both tasks followed TDD: tests written first (RED), implementation to pass (GREEN)._

## Files Created/Modified
- `packages/mission-control/src/server/types.ts` - All shared types: PlanningState, ProjectState, RoadmapState, PhaseState, PlanState, ConfigState, RequirementState, StateDiff, WatcherOptions
- `packages/mission-control/src/server/watcher.ts` - Debounced recursive file watcher with temp file filtering
- `packages/mission-control/src/server/state-deriver.ts` - State derivation engine: buildFullState(), parseRoadmap(), parseRequirements()
- `packages/mission-control/tests/watcher.test.ts` - 4 tests: onChange callback, ignore filters, debounce coalescing, close behavior
- `packages/mission-control/tests/state-deriver.test.ts` - 11 tests: STATE.md, ROADMAP.md, config.json, PLAN.md, REQUIREMENTS.md parsing, missing files, restart reconstruction
- `packages/mission-control/package.json` - Added gray-matter dependency
- `bun.lock` - Updated with gray-matter and transitive deps

## Decisions Made
- Used Bun fs.watch with recursive:true and 50ms debounce per research recommendation (not chokidar)
- Full state rebuild on every change since .planning/ has ~25 files and parse takes <10ms
- Used readdirSync for PLAN.md file discovery to avoid adding a glob dependency
- gray-matter installed for YAML frontmatter parsing (needed by state-deriver)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- types.ts provides all shared interfaces needed by differ (02-02) and ws-server (02-02)
- createFileWatcher ready to be wired into pipeline orchestrator (02-02)
- buildFullState ready to be called on startup and file change events (02-02)
- All exports match the must_haves.artifacts spec from the plan

---
*Phase: 02-file-to-state-pipeline*
*Completed: 2026-03-10*
