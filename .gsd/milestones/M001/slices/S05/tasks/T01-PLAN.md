---
estimated_steps: 7
estimated_files: 2
---

# T01: Implement copyWorktreeDb and reconcileWorktreeDb with test suite

**Slice:** S05 — Worktree Isolation + Merge Reconciliation
**Milestone:** M001

## Description

Build the two core functions for worktree DB isolation: `copyWorktreeDb` (copies gsd.db to a new worktree, skipping WAL/SHM) and `reconcileWorktreeDb` (ATTACHes worktree DB to main, diffs for conflicts, INSERT OR REPLACE all 3 tables, DETACHes). Both are exported from `gsd-db.ts`. A comprehensive test suite verifies copy, reconciliation, conflict detection, and edge cases using real SQLite databases.

## Steps

1. Add `copyWorktreeDb(srcDbPath: string, destDbPath: string): boolean` to `gsd-db.ts`:
   - Uses `copyFileSync` to copy only the `.db` file (not `-wal` or `-shm`)
   - Returns `true` on success, `false` on failure (logs to stderr, never throws)
   - Creates parent directory if needed via `mkdirSync` with `recursive: true`
   - If source doesn't exist, returns `false` silently (expected when no DB yet)

2. Add `reconcileWorktreeDb(mainDbPath: string, worktreeDbPath: string): { decisions: number; requirements: number; artifacts: number; conflicts: string[] }` to `gsd-db.ts`:
   - Validates both paths exist, returns zeros if worktree DB missing
   - Safety check: reject paths containing single quotes (prevents SQL injection via ATTACH)
   - Opens main DB if not already open (via `openDatabase`)
   - Gets adapter via `_getAdapter()`, calls `exec("ATTACH DATABASE '...' AS wt")`
   - **Conflict detection phase:** For each table, SELECT rows where both main and wt have same PK but different content. Collect conflict descriptions into an array.
   - **Merge phase:** Inside a `BEGIN...COMMIT` block (using adapter.exec, not the transaction() wrapper which would nest):
     - `INSERT OR REPLACE INTO decisions SELECT * FROM wt.decisions`
     - `INSERT OR REPLACE INTO requirements SELECT * FROM wt.requirements`
     - `INSERT OR REPLACE INTO artifacts (...) SELECT ..., datetime('now') as imported_at FROM wt.artifacts`
   - `exec("DETACH DATABASE wt")` after commit (or after rollback on error)
   - Reports conflicts to stderr if any
   - Returns counts of rows merged per table and conflict list

3. Write `src/resources/extensions/gsd/tests/worktree-db.test.ts`:
   - Test: copyWorktreeDb copies DB file, data is queryable in copy
   - Test: copyWorktreeDb skips -wal and -shm files (create them, verify not copied)
   - Test: copyWorktreeDb returns false when source doesn't exist (no throw)
   - Test: copyWorktreeDb creates dest directory if needed
   - Test: reconcileWorktreeDb merges new decisions from worktree into main
   - Test: reconcileWorktreeDb merges new requirements from worktree into main
   - Test: reconcileWorktreeDb merges new artifacts from worktree into main
   - Test: reconcileWorktreeDb detects conflicts (same PK, different content in both DBs)
   - Test: reconcileWorktreeDb handles missing worktree DB gracefully
   - Test: reconcileWorktreeDb with path containing spaces works
   - Test: main DB is usable after reconciliation (DETACH cleanup verified)

4. Handle the `seq` column for decisions during cross-DB INSERT:
   - `decisions.seq` is INTEGER PRIMARY KEY AUTOINCREMENT — can't do blind `SELECT *` cross-DB insert because seq conflicts
   - Instead: `INSERT OR REPLACE INTO decisions (id, when_context, scope, decision, choice, rationale, revisable, superseded_by) SELECT id, when_context, scope, decision, choice, rationale, revisable, superseded_by FROM wt.decisions`
   - This lets main DB auto-assign new seq values while the `id` UNIQUE constraint handles dedup

5. Run tests and fix any issues with ATTACH/transaction ordering (ATTACH must be outside BEGIN).

6. Run `npx tsc --noEmit` to verify clean compilation.

7. Run full test suite `npm run test:unit` to check for regressions.

## Must-Haves

- [ ] `copyWorktreeDb` exported, copies only .db file, non-fatal on failure
- [ ] `reconcileWorktreeDb` exported, uses ATTACH DATABASE, merges all 3 tables
- [ ] Conflict detection identifies rows modified in both DBs
- [ ] ATTACH outside transaction, INSERT OR REPLACE inside transaction, DETACH after
- [ ] ≥20 test assertions in worktree-db.test.ts
- [ ] Clean compilation, no test regressions

## Verification

- `npm run test:unit -- --test-name-pattern "worktree-db"` — all assertions pass
- `npx tsc --noEmit` — 0 errors
- `npm run test:unit` — full suite passes

## Inputs

- `src/resources/extensions/gsd/gsd-db.ts` — existing DB layer with openDatabase, _getAdapter, transaction, upsert wrappers, DbAdapter interface
- S01 Summary — DbAdapter interface, null-prototype normalization, named parameter convention
- S02 Summary — schema v2 with decisions, requirements, artifacts tables; INSERT OR REPLACE patterns
- S05 Research — ATTACH DATABASE verified working with node:sqlite, ATTACH-outside-transaction constraint, seq column handling

## Expected Output

- `src/resources/extensions/gsd/gsd-db.ts` — augmented with `copyWorktreeDb` and `reconcileWorktreeDb` exports
- `src/resources/extensions/gsd/tests/worktree-db.test.ts` — new test file with ≥20 assertions

## Observability Impact

- **New stderr signals:** `copyWorktreeDb` emits `"gsd-db: failed to copy DB to worktree: <message>"` on failure. `reconcileWorktreeDb` emits `"gsd-db: reconciled N decisions, N requirements, N artifacts (N conflicts)"` on success, conflict details per row, and `"gsd-db: worktree DB reconciliation failed: <message>"` on error.
- **Inspection:** After copy, `openDatabase(destPath)` + `isDbAvailable()` confirms the copy is usable. After reconciliation, query decisions/requirements/artifacts tables to verify merged rows.
- **Failure state:** Both functions are non-fatal — they return `false`/zero-counts and log to stderr rather than throwing. The caller can inspect return values to determine if action is needed.
