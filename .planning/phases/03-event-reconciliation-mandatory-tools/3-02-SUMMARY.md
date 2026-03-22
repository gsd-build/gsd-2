---
phase: 03-event-reconciliation-mandatory-tools
plan: 02
subsystem: write-intercept
tags: [write-intercept, state-protection, prompt-migration, tool-calls, mandatory-tools]
dependency_graph:
  requires: [3-01]
  provides: [write-intercept module, blocked-state-file detection, prompt migration PMG-04]
  affects: [register-hooks.ts, complete-milestone.md, complete-slice.md, guided-complete-slice.md, reassess-roadmap.md]
tech_stack:
  added: []
  patterns:
    - isBlockedStateFile() with realpathSync for symlink handling
    - BLOCKED_WRITE_ERROR constant directing agents to engine tools
    - Content-assertion tests for prompt files
key_files:
  created:
    - src/resources/extensions/gsd/write-intercept.ts
    - src/resources/extensions/gsd/engine/write-intercept.test.ts
  modified:
    - src/resources/extensions/gsd/bootstrap/register-hooks.ts
    - src/resources/extensions/gsd/prompts/complete-milestone.md
    - src/resources/extensions/gsd/prompts/complete-slice.md
    - src/resources/extensions/gsd/prompts/guided-complete-slice.md
    - src/resources/extensions/gsd/prompts/reassess-roadmap.md
    - src/resources/extensions/gsd/engine/prompt-migration.test.ts
decisions:
  - "realpathSync try/catch in isBlockedStateFile handles files that don't exist yet (pre-write path matching)"
  - "BLOCKED_PATTERNS uses regex array — explicit, readable, and independently testable per pattern"
  - "discuss.md and discuss-headless.md REQUIREMENTS.md writes left as-is — initial project setup, not status updates"
  - "reassess-roadmap.md, complete-slice.md REQUIREMENTS.md direct-write instructions replaced with gsd_save_decision"
metrics:
  duration_seconds: 223
  completed_date: "2026-03-22"
  tasks_completed: 3
  files_created: 2
  files_modified: 6
requirements: [PMG-04, PMG-05]
---

# Phase 3 Plan 02: Write Intercept + Prompt Migration Summary

## One-liner

Write intercept module blocks agent writes to .gsd/ state files via isBlockedStateFile() wired into register-hooks.ts tool_call handler, with complete-milestone.md and three other prompts migrated from direct REQUIREMENTS.md writes to gsd_save_decision tool calls.

## What Was Built

### Task 1: Write Intercept Module (TDD)

Created `src/resources/extensions/gsd/write-intercept.ts` with:

- `isBlockedStateFile(filePath: string): boolean` — tests filePath against blocked patterns for STATE.md, REQUIREMENTS.md, PROJECT.md, *PLAN.md, and *ROADMAP.md within .gsd/ directories. Also resolves symlinks via `realpathSync` in a try/catch (Pitfall #6 handling).
- `BLOCKED_WRITE_ERROR` — string constant directing agents to use `gsd_complete_task`, `gsd_complete_slice`, `gsd_save_decision`, `gsd_start_task`, `gsd_record_verification`, and `gsd_report_blocker` instead of direct file writes.

11 unit tests created and passing (TDD: RED → GREEN with no REFACTOR needed).

### Task 2: Wiring into register-hooks.ts

Added import of `isBlockedStateFile` and `BLOCKED_WRITE_ERROR` from `../write-intercept.js`.

Inside the existing `pi.on("tool_call", ...)` handler, added two checks immediately after the loop guard and before `shouldBlockContextWrite`:
- Write tool calls to blocked state file paths → `{ block: true, reason: BLOCKED_WRITE_ERROR }`
- Edit tool calls to blocked state file paths → `{ block: true, reason: BLOCKED_WRITE_ERROR }`

The hard block (D-07) takes priority over context-specific soft blocks (shouldBlockContextWrite).

### Task 3: Prompt Migration + Audit

**complete-milestone.md (PMG-04):** Step 7 replaced direct REQUIREMENTS.md update with `gsd_save_decision` call. Step 8 (PROJECT.md) preserved as content-file write with explanatory note.

**Prompt audit — files updated:**
- `complete-slice.md` step 5: direct REQUIREMENTS.md update → `gsd_save_decision` call
- `guided-complete-slice.md`: "Mark the slice checkbox done in the roadmap" → `gsd_complete_slice` tool call
- `reassess-roadmap.md` step 3: direct REQUIREMENTS.md update → `gsd_save_decision` call

**Prompt audit — files confirmed clean (no changes needed):**
- `replan-slice.md`, `validate-milestone.md`, `research-slice.md` — write non-authoritative content only
- `worktree-merge.md`, `plan-milestone.md`, `research-milestone.md` — no checkbox or direct state-file write instructions
- `guided-execute-task.md`, `guided-plan-milestone.md`, `guided-plan-slice.md`, `guided-research-slice.md`, `guided-resume-task.md`, `guided-discuss-milestone.md`, `guided-discuss-slice.md` — no residual instructions found

**discuss.md and discuss-headless.md** — contain "Write .gsd/REQUIREMENTS.md" for initial project setup. Left as-is: these create the initial requirements document, not update authoritative state.

**prompt-migration.test.ts extended with:**
- complete-milestone.md assertions: gsd_save_decision, "Do NOT write", PROJECT.md preserved
- Checkbox-edit audit across 16 prompt files: no "Edit the checkbox", "toggle the checkbox", or "mark the checkbox"

All 29 prompt migration tests pass. All 130 engine tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] complete-slice.md residual REQUIREMENTS.md write**
- **Found during:** Task 3 prompt audit
- **Issue:** complete-slice.md step 5 instructed agents to directly update .gsd/REQUIREMENTS.md — not in the plan's target list
- **Fix:** Replaced with gsd_save_decision call pattern matching complete-milestone.md migration
- **Files modified:** src/resources/extensions/gsd/prompts/complete-slice.md
- **Commit:** 1f7bed45

**2. [Rule 2 - Missing] reassess-roadmap.md residual REQUIREMENTS.md write**
- **Found during:** Task 3 prompt audit
- **Issue:** reassess-roadmap.md step 3 instructed agents to directly update REQUIREMENTS.md — not in the plan's target list
- **Fix:** Replaced with gsd_save_decision call
- **Files modified:** src/resources/extensions/gsd/prompts/reassess-roadmap.md
- **Commit:** 1f7bed45

**3. [Rule 2 - Missing] guided-complete-slice.md checkbox marking**
- **Found during:** Task 3 prompt audit
- **Issue:** guided-complete-slice.md instructed "Mark the slice checkbox done in the roadmap" — residual checkbox-edit instruction
- **Fix:** Replaced with gsd_complete_slice tool call instruction matching complete-slice.md
- **Files modified:** src/resources/extensions/gsd/prompts/guided-complete-slice.md
- **Commit:** 1f7bed45

## Verification Results

- write-intercept.test.ts: 11/11 pass
- prompt-migration.test.ts: 29/29 pass
- All engine tests (130/130 pass)
- `gsd_save_decision` confirmed in complete-milestone.md
- `isBlockedStateFile(event.input.path)` confirmed in register-hooks.ts (write + edit)
- `isBlockedStateFile` check appears before `shouldBlockContextWrite` in handler

## Self-Check: PASSED
