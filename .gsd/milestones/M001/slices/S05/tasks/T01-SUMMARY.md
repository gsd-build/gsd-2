---
id: T01
parent: S05
milestone: M001
provides:
  - copyWorktreeDb function for isolating gsd.db into worktrees
  - reconcileWorktreeDb function for merging worktree DB rows back to main via ATTACH DATABASE
key_files:
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/tests/worktree-db.test.ts
key_decisions:
  - Used INSERT OR REPLACE with explicit column list for decisions (excludes seq) to avoid AUTOINCREMENT PK conflicts across databases
  - Conflict detection compares specific content columns (decision/choice/rationale/superseded_by for decisions, description/status/notes/superseded_by for requirements, full_content/artifact_type for artifacts) rather than full row hash
  - ATTACH/DETACH lifecycle uses try/finally to guarantee cleanup even on error
  - reconcileWorktreeDb uses adapter.exec for BEGIN/COMMIT rather than the transaction() wrapper to avoid nesting issues with ATTACH
patterns_established:
  - Cross-DB merge via ATTACH DATABASE with ATTACH outside transaction, INSERT OR REPLACE inside transaction, DETACH in finally block
  - Non-fatal file operations that log to stderr and return status codes rather than throwing
observability_surfaces:
  - stderr reconciliation report with per-table counts and conflict count
  - stderr conflict details listing each divergent row
  - stderr error messages for copy and reconciliation failures
duration: 15m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T01: Implement copyWorktreeDb and reconcileWorktreeDb with test suite

**Added copyWorktreeDb and reconcileWorktreeDb to gsd-db.ts with 37-assertion test suite covering copy, merge, conflict detection, and edge cases.**

## What Happened

Implemented two new exported functions in `gsd-db.ts`:

1. **`copyWorktreeDb(srcDbPath, destDbPath)`** — Copies only the `.db` file (not WAL/SHM) using `copyFileSync`. Creates parent directories. Returns `false` on missing source or error (never throws). Logs failures to stderr.

2. **`reconcileWorktreeDb(mainDbPath, worktreeDbPath)`** — ATTACHes the worktree DB, runs conflict detection across all 3 tables, then merges via INSERT OR REPLACE inside a manual BEGIN/COMMIT block. DETACHes in a finally block. Reports conflicts to stderr. Returns counts of merged rows per table and a conflict list.

Key implementation detail: decisions use explicit column list excluding `seq` (INTEGER PRIMARY KEY AUTOINCREMENT) to avoid cross-DB PK conflicts. The `id` UNIQUE constraint handles dedup.

Created `worktree-db.test.ts` with 37 assertions covering: DB copy with data queryability, WAL/SHM skip, missing source, nested directory creation, per-table merge verification, conflict detection, missing worktree DB, paths with spaces, post-reconciliation DB usability (DETACH verified), and identical-DB reconciliation.

## Verification

- `npm run test:unit -- --test-name-pattern "worktree-db"` — **36 passed, 0 failed** (37 assertions in test file, 36 reported by runner due to assertion grouping)
- `npx tsc --noEmit` — 0 errors
- `npm run test:unit` — **288 passed, 0 failed** (full suite, no regressions)

### Slice-level verification status (intermediate task — partial expected):
- ✅ `npm run test:unit -- --test-name-pattern "worktree-db"` — passes with all assertions
- ✅ `npx tsc --noEmit` — clean compilation
- ✅ `npm run test:unit` — full suite passes, no regressions

## Diagnostics

- **Reconciliation report:** stderr line `"gsd-db: reconciled N decisions, N requirements, N artifacts (N conflicts)"` after every successful reconciliation
- **Conflict details:** stderr lines `"  - decision D001: modified in both main and worktree"` for each divergent row
- **Copy failure:** stderr `"gsd-db: failed to copy DB to worktree: <message>"`
- **Reconciliation failure:** stderr `"gsd-db: worktree DB reconciliation failed: <message>"`
- **Return values:** Both functions return structured results (boolean / counts object) for programmatic inspection

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts` — Added `copyWorktreeDb` and `reconcileWorktreeDb` exports, plus `node:fs` and `node:path` imports
- `src/resources/extensions/gsd/tests/worktree-db.test.ts` — New test file with 37 assertions across 8 test blocks
- `.gsd/milestones/M001/slices/S05/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
