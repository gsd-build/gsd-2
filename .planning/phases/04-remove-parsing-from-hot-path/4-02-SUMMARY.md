---
phase: 04-remove-parsing-from-hot-path
plan: 02
subsystem: doctor-surgery
tags: [wave-3, doctor-checks, engine-health, projection-drift, db-constraints, DOC-01-05]

# Dependency graph
requires:
  - phase: 04-remove-parsing-from-hot-path
    plan: 01
    provides: "Parser relocation to legacy/parsers.ts with TODO markers on hot-path stubs"
provides:
  - "checkEngineHealth() with DB constraint checks and projection drift detection"
  - "Pre-dispatch projection drift repair in preDispatchHealthGate"
  - "Engine query replacements for all parseRoadmap/parsePlan/parseSummary stubs in doctor"
  - "Placeholder summary generation removed (D-03)"
  - "Reconciliation checks removed from checkRuntimeHealth (D-01)"
affects: [4-03, 4-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [engine-query-for-doctor-checks, projection-drift-repair, db-constraint-detection]

key-files:
  created: []
  modified:
    - src/resources/extensions/gsd/doctor-checks.ts
    - src/resources/extensions/gsd/doctor-proactive.ts
    - src/resources/extensions/gsd/doctor.ts

key-decisions:
  - "Escalation logic in doctor-proactive.ts kept as-is: it tracks generic errors, not specifically bookkeeping. State-drift errors simply won't occur with engine."
  - "RoadmapSliceEntry built from engine SliceRow with risk/demo defaults for compatibility with isMilestoneComplete()"
  - "STATE.md missing fix uses renderStateProjection() with deriveState() fallback"
  - "Blocker-without-replan detection uses engine task.blocker field instead of parseSummary"

patterns-established:
  - "Engine queries replace parse calls in doctor: WorkflowEngine.getMilestones/getSlices/getTasks for roadmap/plan/task data"
  - "checkEngineHealth() pattern: DB constraint checks (full doctor only) + projection drift (also pre-dispatch)"
  - "Projection drift detection: compare event log timestamp vs ROADMAP.md mtime, auto re-render if stale"

requirements-completed: [DOC-01, DOC-02, DOC-03, DOC-04, DOC-05]

# Metrics
duration: 10min
completed: 2026-03-23
---

# Phase 4 Plan 02: Doctor Surgery Summary

**Gutted reconciliation/bookkeeping checks from doctor, added checkEngineHealth() with DB constraint detection and projection drift repair**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-23T01:36:42Z
- **Completed:** 2026-03-23T01:46:48Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Removed orphaned completed-units key validation and STATE.md drift detection from checkRuntimeHealth (DOC-01)
- Removed placeholder summary generation (ensureSliceSummaryStub, ensureSliceUatStub) from doctor.ts (DOC-02)
- Added checkEngineHealth() with 4 DB constraint checks: orphaned tasks, orphaned slices, done-tasks-without-summaries, duplicate IDs (DOC-05)
- Added projection drift detection comparing event log timestamps vs projection file mtimes (DOC-05)
- Added pre-dispatch projection drift repair in preDispatchHealthGate (fast, <50ms per D-10)
- Replaced all parseRoadmap/parsePlan/parseSummary TODO stubs in doctor.ts with engine queries
- Replaced parseRoadmap TODO stubs in checkGitHealth with WorkflowEngine.getMilestone() queries
- Git/disk/env/provider health checks preserved unchanged (DOC-04)
- TypeScript compiles clean, import boundary tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove reconciliation checks from doctor-checks.ts + add checkEngineHealth()** - `72252de4` (feat)
2. **Task 2: Remove bookkeeping escalation from doctor-proactive.ts + add pre-dispatch projection drift** - `bb32afb4` (feat)
3. **Task 3: Wire checkEngineHealth into runGSDDoctor + remove parse calls from doctor.ts** - `cf8eba76` (feat)

## Files Created/Modified
- `src/resources/extensions/gsd/doctor-checks.ts` - Removed orphaned completed-units check, STATE.md drift detection. Replaced parseRoadmap stubs with engine queries. Added checkEngineHealth() with DB constraints + projection drift.
- `src/resources/extensions/gsd/doctor-proactive.ts` - Added projection drift repair in preDispatchHealthGate. Added imports for workflow-events, workflow-projections, workflow-engine.
- `src/resources/extensions/gsd/doctor.ts` - Wired checkEngineHealth into runGSDDoctor. Replaced parseRoadmap/parsePlan/parseSummary stubs with engine queries. Removed ensureSliceSummaryStub and ensureSliceUatStub placeholder generators.

## Decisions Made
- Kept escalation logic in doctor-proactive.ts as-is: `consecutiveErrorUnits` and `checkHealEscalation` track generic errors, not specifically bookkeeping/reconciliation errors. With the engine as authoritative, state-drift errors simply won't occur anymore, so the counter naturally won't accumulate bookkeeping errors.
- Built `RoadmapSliceEntry` structure from engine `SliceRow` with default `risk: "medium"` and empty `demo` string for compatibility with `isMilestoneComplete()` and `detectCircularDependencies()`.
- For STATE.md missing fix, use `renderStateProjection(basePath)` first (engine-native), falling back to `deriveState()` + `buildStateMarkdownForCheck()` if projection renderer isn't available.
- For blocker-without-replan detection, replaced `parseSummary` call with engine `task.blocker` field check -- simpler and uses authoritative engine data.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Doctor test suite cannot run in this worktree due to pre-existing `@gsd/pi-coding-agent` package resolution issue. Import boundary tests pass. TypeScript compilation is clean for all GSD extension files.

## Next Phase Readiness
- All parseRoadmap/parsePlan/parseSummary stubs in doctor-checks.ts, doctor.ts, doctor-proactive.ts are replaced with engine queries
- Plan 4-03 (recovery surgery) can proceed -- auto-recovery.ts still has parse stubs to replace
- Plan 4-04 (forensics simplification) can proceed

---
*Phase: 04-remove-parsing-from-hot-path*
*Completed: 2026-03-23*
