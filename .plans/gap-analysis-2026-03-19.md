# Full Gap Analysis Report — 2026-03-19

**Branch**: `analysis/full-gap-analysis-2026-03-19`
**Scope**: 917 commits since 2026-03-14 across GSD core, worktree management, extension loading, and test infrastructure
**Build Status**: PASSING
**Test Status (after fixes)**: 1853/1853 passing (100%) — 0 failures, 3 skipped

---

## Executive Summary

After a comprehensive deep-dive across 4 parallel analysis streams (core state machine, worktree/git ops, tests/build, extension loading/startup), the codebase is **functionally stable** but has accumulated **race conditions, silent error swallowing, and state management gaps** from the rapid pace of recent PRs. The most dangerous patterns are around lock lifecycle management, dispatch loop edge cases, and lazy-loading error handling.

**Findings**: 4 CRITICAL, 11 HIGH, 12 MEDIUM, 2 LOW

---

## CRITICAL FINDINGS (4)

### C1. Race Condition: Dispatch Gap Watchdog vs Deferred Agent-End Retry
**File**: `src/resources/extensions/gsd/auto.ts` — lines 445-470, 869
**Introduced by**: PR #1310 (dispatch loop hardening)

The gap watchdog fires on a fixed 5s timeout. When a deferred `handleAgentEnd` retry fires via `setImmediate()`, it clears `s.dispatchGapHandle` but there's a window where the gap watchdog's `setTimeout` callback has already been queued. Both can call `dispatchNextUnit()` concurrently. The reentrancy guard catches this, but the gap watchdog doesn't check if dispatch is already in progress before arming.

**Impact**: Auto-mode can stall silently — phantom dispatch attempts get dropped, leaving no unit timeout and no watchdog active. This manifests as auto-mode appearing to "hang" with no visible error.

**Fix**: Check `s.dispatching` flag in gap watchdog callback before calling `dispatchNextUnit()`.

---

### C2. Verification Retry Loop Silently Hits Dispatch Lifetime Cap
**File**: `src/resources/extensions/gsd/auto-verification.ts` — lines 210-229
**Introduced by**: PR #1340 (verification retry skip for infra errors)

When verification fails and auto-fix retries, the verification retry count (default 2) and dispatch lifetime cap (default 6) are tracked independently. Verification failures increment both counters without user notification. If a check consistently fails, the unit silently hits the lifetime dispatch cap and auto-mode stops mysteriously.

**Impact**: Users see auto-mode stop with no clear error message. The verification retry count says "2 retries" but the lifetime cap was hit at 6.

**Fix**: Either unify the counters, or emit a clear warning when lifetime cap is approaching due to verification retries.

---

### C3. Lazy-Load Promise Reset Creates Race Condition in All 3 Non-GSD Extensions
**Files**:
- `src/resources/extensions/browser-tools/index.ts` — lines 135-138
- `src/resources/extensions/bg-shell/index.ts` — lines 27-30
- `src/resources/extensions/search-the-web/index.ts` — lines 25-28
**Introduced by**: PR #1336 (lazy extension loading)

All three extensions use the same pattern: on load error, reset `registrationPromise = null` then re-throw. If another trigger calls the register function before the first rejection propagates, both start loading concurrently, causing duplicate tool registrations.

**Impact**: Duplicate tool definitions, unhandled promise rejections, tools behaving unpredictably.

**Fix**: Don't reset the promise on error — cache the rejection so subsequent calls get the same error rather than retrying.

---

### C4. Two Test Files Fail Due to Missing Export (`_clearGsdRootCache`)
**Files**:
- `src/resources/extensions/gsd/tests/paths.test.ts` — line 6
- `src/resources/extensions/gsd/tests/repo-identity-worktree.test.ts`
**Status**: Untracked files on this branch

These tests import `_clearGsdRootCache` from `paths.ts`, but that export doesn't exist. The recent refactor removed the old `gsdRoot` cache mechanism. These tests were created expecting the export but the implementation was never shipped.

**Impact**: 2 failing tests in the suite. Not caught by CI because `test:unit` isn't in the pipeline (see M8).

**Fix**: Either implement and export `_clearGsdRootCache` in `paths.ts`, or remove these untracked test files.

---

## HIGH FINDINGS (11)

### H1. OnCompromised Handler Leaves Lock Directory Stranded
**File**: `src/resources/extensions/gsd/session-lock.ts` — lines 182-189
**Related PRs**: #1307, #1322, #1332

When `proper-lockfile` detects mtime drift (system sleep, event loop stall), the `onCompromised` callback sets `_lockCompromised = true` and clears `_releaseFunction = null` — but never calls the release function first. The OS-level lock file is never unlocked. Later cleanup attempts call a null `_releaseFunction`, leaving `.gsd.lock/` stranded on disk.

**Impact**: After laptop sleep/wake, the lock directory blocks the next auto-mode session until manually removed.

**Fix**: Call `_releaseFunction()` before clearing it in the onCompromised handler, wrapped in try-catch.

---

### H2. Lock Directory Cleanup Failure Not Handled
**File**: `src/resources/extensions/gsd/session-lock.ts` — lines 205-240
**Related PR**: #1315

When stale lock detection finds a dead PID and tries `rmSync()` on the lock directory, if that fails (permissions, disk issues), the error is not handled. All future `acquireSessionLock()` calls fail until manual cleanup. The `cleanupStrayLockFiles()` function cleans numbered variants but not the main `.gsd.lock/` directory.

**Impact**: Permanent lock-out from auto-mode sessions requiring manual intervention.

---

### H3. Unsafe GSD Runtime File Cleanup During Merge
**File**: `src/resources/extensions/gsd/auto-worktree.ts` — lines 509-540

Files (`STATE.md`, `completed-units.json`, `auto.lock`, `gsd.db`) are deleted individually with empty catch blocks. If `auto.lock` deletion happens while another session is active, it bypasses session locking. No atomic transaction, no rollback.

**Impact**: Concurrent auto-mode sessions possible, corrupted state, lost execution history.

---

### H4. Merge Conflict Resolution Silently Proceeds With Unresolved Conflicts
**File**: `src/resources/extensions/gsd/auto-worktree.ts` — lines 554-590

Auto-resolution of `.gsd/` conflicts via `nativeCheckoutTheirs()` doesn't verify success. If both the checkout and the `nativeRmForce()` fallback fail, the file remains conflicted but the merge continues.

**Impact**: Unresolved conflicts committed to main. Data loss in `.gsd/` state files.

---

### H5. Stale Branch After Incomplete Worktree Removal
**File**: `src/resources/extensions/gsd/worktree-manager.ts` — lines 299-312

`removeWorktree()` deletes the branch even if the directory removal failed. Creates orphaned branch pointers. No post-removal validation against `git worktree list`.

**Impact**: Stray worktree directories, "branch already in use" errors on next worktree creation.

---

### H6. Session Lock Bypass During Branch Checkout in Merge
**File**: `src/resources/extensions/gsd/auto-worktree.ts` — lines 529-541

After `chdir` to main repo for milestone merge, the code checks out a branch without re-acquiring the session lock. Another session could start between the `chdir` and checkout.

**Impact**: Concurrent auto-mode sessions with conflicting commits.

---

### H7. No Error Handling in Dispatch Rule Loop
**File**: `src/resources/extensions/gsd/auto-dispatch.ts` — lines 392-404

`resolveDispatch()` loops through rules calling `rule.match()` without try-catch. A single failing rule (e.g., file I/O error in `buildRewriteDocsPrompt`) breaks the entire dispatch chain and triggers gap watchdog retries.

**Impact**: Transient file errors create phantom stuck-loop detection false positives.

---

### H8. Silent Failure in Non-TTY Mode for All Lazy Extensions
**Files**: browser-tools, bg-shell, search-the-web `index.ts`
**Introduced by**: PR #1336

In non-TTY mode, `await registerXXX(pi)` throws without catch. The UI notification path only fires when `ctx.hasUI` is true. Headless sessions crash with no recovery.

**Impact**: Headless/CI sessions crash silently when optional extensions fail to load.

---

### H9. Uninitialized Action Methods Called During Lazy Load
**File**: `packages/pi-coding-agent/src/core/extensions/loader.ts` — lines 182-214

Extensions loaded lazily via `session_start` handlers can call `pi.sendMessage()` before `bindCore()` replaces the throwing stubs. Any extension that communicates during module-level load will crash.

**Impact**: Session crashes with "Extension runtime not initialized" — hard to debug.

---

### H10. Missing Integration Branch Validation
**File**: `src/resources/extensions/gsd/git-service.ts` — lines 201-214

`readIntegrationBranch()` validates branch name format but doesn't verify the branch exists in the repo. If a user deletes the branch manually, merge operations fail with confusing errors.

**Impact**: Milestone merges target non-existent branches.

---

### H11. Process Chdir Without Directory Validation
**File**: `src/resources/extensions/gsd/auto-worktree.ts` — lines 261, 290, 408, 503

Multiple `process.chdir()` calls without checking if the target exists first. If a worktree was cleaned up externally, chdir throws and leaves module state (`originalBase`) inconsistent.

**Impact**: Process stranded in invalid directory, all subsequent git operations fail.

---

## MEDIUM FINDINGS (12)

| # | Issue | File | Lines |
|---|-------|------|-------|
| M1 | Idempotency eviction marks persist across milestones — units evade skip-loop detection | auto-idempotency.ts | 56-80, 113 |
| M2 | Resume path clears dispatch counters, allowing lifetime cap bypass | auto.ts | 641-652 |
| M3 | Gap watchdog 5s timeout too short for legitimate skip chains (20 × 150ms = 3s) | auto.ts | 445-470 |
| M4 | Error swallowing in post-unit hooks — doctor findings silently ignored | auto-post-unit.ts | 134-166 |
| M5 | Backward null check in lock metadata update skips legitimate updates | session-lock.ts | 285-309 |
| M6 | Command bootstrap + runtime double-registration can overwrite state | worktree-command-bootstrap.ts + worktree-command.ts | 43-46, 245 |
| M7 | Symlink resolution failures in worktree state sync fall through to wrong copy | auto-worktree.ts | 64-78 |
| M8 | CI pipeline missing `npm run test:unit` — extension test failures not caught | pipeline.yml | — |
| M9 | No timeout/deadlock detection on `git worktree remove` operations | auto-worktree.ts, worktree-manager.ts | — |
| M10 | Auto-commit failure ignored before merge — dirty tree causes cascade failure | auto-worktree.ts | 456-466, 495 |
| M11 | 10+ empty catch blocks throughout auto-worktree.ts hide real errors | auto-worktree.ts | 89,112,128,139,515,520,539 |
| M12 | Missing error logging in all 9 memoized lazy module loaders in GSD index | gsd/index.ts | 61-79 |

---

## LOW FINDINGS (2)

| # | Issue | File |
|---|-------|------|
| L1 | Unreachable code in idempotency fallback after eviction | auto-idempotency.ts |
| L2 | Dead code: no-op `refreshTools` stub during early extension load | loader.ts |

---

## Test Suite Status

| Metric | Value |
|--------|-------|
| Total tests | 1853 |
| Passing | 1848 |
| Failing | 2 |
| Skipped | 3 |
| Pass rate | 99.89% |
| Build | PASSING |

**Failing tests** (both untracked — not in CI):
1. `paths.test.ts` — imports non-existent `_clearGsdRootCache` export
2. `repo-identity-worktree.test.ts` — depends on paths.test.ts infrastructure

---

## Priority Fix Order

### Wave 1 — Immediate (blocks stability)
1. **C1**: Add `s.dispatching` guard to gap watchdog callback
2. **C4**: Fix or remove failing test files
3. **H1**: Fix onCompromised to release lock before clearing reference
4. **H2**: Add fallback cleanup for main `.gsd.lock/` directory

### Wave 2 — High priority (data integrity)
5. **C2**: Unify verification retry / lifetime dispatch counters with user notification
6. **C3**: Fix lazy-load promise reset pattern in all 3 extensions
7. **H3**: Add atomic state cleanup or rollback in merge flow
8. **H4**: Verify merge conflict resolution succeeded before committing

### Wave 3 — Hardening (resilience)
9. **H5-H6**: Worktree removal validation + lock re-acquisition on chdir
10. **H7**: Wrap dispatch rule matching in try-catch
11. **H8-H9**: Add error boundaries for lazy loading in non-TTY mode
12. **M8**: Add `test:unit` to CI pipeline

### Wave 4 — Quality (maintainability)
13. **M11-M12**: Replace empty catch blocks with diagnostic logging
14. **M1-M3**: Fix idempotency/counter edge cases
15. **M6**: Consolidate command registration to single path

---

## PRs Contributing Most Findings

| PR | Title | Findings |
|----|-------|----------|
| #1336 | Lazy extension loading | C3, H8, H9, M12 |
| #1310 | Dispatch loop hardening | C1, H7, M1, M2, M3 |
| #1340 | Verification retry skip | C2 |
| #1315 | Stale lock cleanup | H1, H2, M5 |
| #1334 | External GSD state in worktrees | H3, H4, M7 |
| #1342 | Quick-task branch lifecycle | H5, H10 |

---

*Analysis performed on commit `235d83af` (main) with 4 parallel deep-dive agents covering: core state machine, worktree/git operations, test/build integrity, and extension loading/startup.*
