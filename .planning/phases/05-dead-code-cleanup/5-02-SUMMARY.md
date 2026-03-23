---
phase: 05-dead-code-cleanup
plan: 02
status: complete
started: 2026-03-22
completed: 2026-03-22
---

## Summary

Removed completed-units.json tracking system, deleted unit-runtime.ts entirely, and stripped oscillation detection (Rule 3) from detect-stuck.ts. The engine's task status queries now serve as the single source of truth.

## What Was Done

1. Deleted `unit-runtime.ts` (188 lines — writeUnitRuntimeRecord, readUnitRuntimeRecord, clearUnitRuntimeRecord)
2. Removed all completed-units.json read/write/flush from auto/phases.ts, auto-post-unit.ts, auto.ts
3. Removed s.completedUnits array from AutoSession interface
4. Removed completed-units.json from worktree sync lists (auto-worktree.ts)
5. Removed completed-units.json from git-service.ts RUNTIME_EXCLUSION_PATHS
6. Removed completed-units.json from gitignore.ts GSD_RUNTIME_PATTERNS
7. Removed completed-units.json from doctor-checks.ts criticalPatterns
8. Removed completed-units.json from commands-maintenance.ts handleSkip
9. Removed Rule 3 (oscillation detection) from auto/detect-stuck.ts
10. Updated auto-timeout-recovery.ts to use engine queries instead of runtime records
11. Updated auto-timers.ts idle watchdog to use local variable for progress tracking
12. Updated prompts/forensics.md to remove completed-units.json references

## Key Files

### Deleted
- `src/resources/extensions/gsd/unit-runtime.ts` — Entire file removed (188 lines)

### Modified
- `src/resources/extensions/gsd/auto.ts` — s.completedUnits removed
- `src/resources/extensions/gsd/auto/session.ts` — completedUnits removed from interface
- `src/resources/extensions/gsd/auto/detect-stuck.ts` — Rule 3 oscillation detection removed
- `src/resources/extensions/gsd/auto-post-unit.ts` — completed-units flush removed
- `src/resources/extensions/gsd/auto/phases.ts` — completed-units tracking removed
- `src/resources/extensions/gsd/auto-timeout-recovery.ts` — engine queries replace runtime records
- `src/resources/extensions/gsd/auto-timers.ts` — local variable replaces runtime tracking
- `src/resources/extensions/gsd/auto-worktree.ts` — sync list cleaned
- `src/resources/extensions/gsd/commands-maintenance.ts` — skip tracking cleaned
- `src/resources/extensions/gsd/doctor-checks.ts` — critical patterns cleaned
- `src/resources/extensions/gsd/git-service.ts` — exclusion paths cleaned
- `src/resources/extensions/gsd/gitignore.ts` — runtime patterns cleaned

## Net Impact

- 61 insertions, 452 deletions (net -391 lines)
- unit-runtime.ts deleted entirely
- 14 tests removed with deleted code, 0 new failures

## Decisions

- 5-02: Engine task status queries replace all unit-runtime tracking — single source of truth
- 5-02: Rule 3 oscillation detection fully removed, Rules 1+2 (same-error-twice) retained

## Self-Check: PASSED

- [x] completed-units.json is not read or written anywhere (only referenced in explanatory comments)
- [x] unit-runtime.ts file does not exist
- [x] Stuck detection no longer contains oscillation detection (Rule 3 removed)
- [x] All tests pass after removals (1397 pass, same failure count as baseline)
