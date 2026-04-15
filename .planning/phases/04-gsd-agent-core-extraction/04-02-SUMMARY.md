---
phase: "04"
plan: "02"
subsystem: gsd-agent-core
tags: [extraction, compaction, bash-executor, import-surgery]
dependency_graph:
  requires: [04-01]
  provides: [CORE-02, CORE-03]
  affects: [packages/gsd-agent-core, packages/pi-coding-agent]
tech_stack:
  added: []
  patterns: [cross-package-import-surgery, PF-03-inline-verification]
key_files:
  created:
    - packages/gsd-agent-core/src/bash-executor.ts
    - packages/gsd-agent-core/src/compaction/utils.ts
    - packages/gsd-agent-core/src/compaction/compaction.ts
    - packages/gsd-agent-core/src/compaction/branch-summarization.ts
    - packages/gsd-agent-core/src/compaction/index.ts
    - packages/gsd-agent-core/src/compaction-orchestrator.ts
  modified:
    - packages/pi-coding-agent/src/index.ts
  deleted:
    - packages/pi-coding-agent/src/core/bash-executor.ts
    - packages/pi-coding-agent/src/core/compaction/utils.ts
    - packages/pi-coding-agent/src/core/compaction/compaction.ts
    - packages/pi-coding-agent/src/core/compaction/branch-summarization.ts
    - packages/pi-coding-agent/src/core/compaction/index.ts
    - packages/pi-coding-agent/src/core/compaction-orchestrator.ts
decisions:
  - "getErrorMessage added to pi-coding-agent index.ts (not inlined) — consistent with pattern of utility re-exports for cross-package use"
  - "compaction.test.ts preserved in pi-coding-agent/src/core/compaction/ — test files never deleted during extraction"
  - "AgentSessionEvent import in compaction-orchestrator.ts points to @gsd/pi-coding-agent (TEMPORARY — updated in Plan 3 when agent-session.ts moves)"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 1
  files_deleted: 6
---

# Phase 04 Plan 02: bash-executor + compaction extraction Summary

Move bash execution (CORE-02) and context compaction subsystems (CORE-03) from `pi-coding-agent` into `gsd-agent-core`, surgering relative imports to `@gsd/pi-coding-agent` package imports, with PF-03 inline verification.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extract CORE-02 bash-executor.ts + verify extensions/types.ts | 8d220a245 | bash-executor.ts moved, BashResult inline confirmed |
| 2 | Extract CORE-03 compaction/ + compaction-orchestrator.ts | ce2ab6d4b | 5 files moved, 7 index.ts exports added |

## What Was Built

**CORE-02:** `bash-executor.ts` copied verbatim to `gsd-agent-core/src/` — no import changes needed (file only uses `node:` builtins, `@gsd/native`, and other package imports that don't change).

**CORE-03:** Entire compaction subsystem (4 files in `compaction/` + `compaction-orchestrator.ts`) moved to `gsd-agent-core/src/`. Import surgery applied:
- `../constants.js` → `@gsd/pi-coding-agent`
- `../messages.js` → `@gsd/pi-coding-agent`
- `../session-manager.js` → `@gsd/pi-coding-agent`
- `./extensions/index.js` → `@gsd/pi-coding-agent`
- `./model-registry.js` → `@gsd/pi-coding-agent`
- `./settings-manager.js` → `@gsd/pi-coding-agent`
- `./agent-session.js` → `@gsd/pi-coding-agent` (TEMPORARY)
- `./compaction/index.js` → stays relative `./compaction/index.js` (both in gsd-agent-core)
- `./compaction.js` in branch-summarization → stays relative (both files in compaction/)

**PF-03 verification:** `extensions/types.ts` confirmed to have `BashResult`, `CompactionResult`, and `CompactionPreparation` as structural inlined interfaces — not imports from the now-moved files.

**pi-coding-agent/src/index.ts additions:** 7 new exports added to support the cross-package imports:
- `createBranchSummaryMessage`, `createCustomMessage` (messages.ts)
- `TOOL_RESULT_MAX_CHARS`, `COMPACTION_KEEP_RECENT_TOKENS`, `COMPACTION_RESERVE_TOKENS` (constants.ts)
- `ReadonlySessionManager` (session-manager.ts)
- `getErrorMessage` (utils/error.ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] getErrorMessage not in pi-coding-agent index.ts**
- **Found during:** Task 2, Step 4 (compaction-orchestrator.ts surgery)
- **Issue:** `compaction-orchestrator.ts` originally imports `getErrorMessage` from `../utils/error.js` (relative within pi-coding-agent). After moving to gsd-agent-core, `../utils/error.js` would resolve to a non-existent path.
- **Fix:** Added `export { getErrorMessage } from "./utils/error.js"` to pi-coding-agent/src/index.ts; updated compaction-orchestrator.ts to import from `@gsd/pi-coding-agent`.
- **Files modified:** `packages/pi-coding-agent/src/index.ts`, `packages/gsd-agent-core/src/compaction-orchestrator.ts`
- **Commit:** ce2ab6d4b

**2. [Rule 1 - Preservation] compaction.test.ts preserved in pi-coding-agent**
- **Found during:** Task 2, Step 2 (compaction directory deletion)
- **Issue:** `packages/pi-coding-agent/src/core/compaction/compaction.test.ts` exists in the directory the plan says to delete entirely.
- **Fix:** Deleted only the 4 source files (utils, compaction, branch-summarization, index); preserved the test file. The test file's imports will be broken until a future plan moves/updates it, but the file is not deleted.
- **Files modified:** None (deletion scope narrowed)
- **Commit:** ce2ab6d4b

## Build Gate Results

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| After Task 1 | 3 errors | 3 errors | PASS |
| After compaction/ move | 3 errors | 3 errors | PASS |
| After compaction-orchestrator.ts | 3 errors | 3 errors | PASS |

The 3 baseline errors are pre-existing TS2305 (RpcClient missing export) and TS7006 (parameter any type) in `src/headless.ts` and `src/headless-ui.ts` — unrelated to this plan's changes.

## Known Stubs

None. All moved files are functional implementations, not stubs.

## Threat Flags

No new threat surface introduced. All changes are file relocations within the workspace; no new network endpoints, auth paths, or external interfaces added.

## Self-Check: PASSED

Files created:
- packages/gsd-agent-core/src/bash-executor.ts: FOUND
- packages/gsd-agent-core/src/compaction/utils.ts: FOUND
- packages/gsd-agent-core/src/compaction/compaction.ts: FOUND
- packages/gsd-agent-core/src/compaction/branch-summarization.ts: FOUND
- packages/gsd-agent-core/src/compaction/index.ts: FOUND
- packages/gsd-agent-core/src/compaction-orchestrator.ts: FOUND

Commits:
- 8d220a245: FOUND (Task 1)
- ce2ab6d4b: FOUND (Task 2)
