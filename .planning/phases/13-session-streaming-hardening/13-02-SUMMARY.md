---
phase: 13-session-streaming-hardening
plan: "02"
subsystem: process-lifecycle
tags: [interrupt, crash-event, killall, process-manager, session-manager]
dependency_graph:
  requires: []
  provides: [interrupt, process_crashed-event, killAll]
  affects: [claude-process, session-manager, IProcessManager-interface]
tech_stack:
  added: []
  patterns: [TDD-red-green, injectable-spawn, event-handler-pattern]
key_files:
  created:
    - packages/mission-control/tests/process-lifecycle.test.ts
  modified:
    - packages/mission-control/src/server/claude-process.ts
    - packages/mission-control/src/server/session-manager.ts
decisions:
  - "process_crashed cast as unknown as StreamEvent to pass through existing handler infrastructure — downstream consumers will use GSD2StreamEvent for richer typing in plan 13-05"
  - "killAll() uses Promise.all on listSessions() map to kill concurrently — same pattern as closeSession but without registry removal"
  - "IProcessManager.interrupt() added as required interface member — existing test stubs pass at Bun runtime without strict interface enforcement"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 3
---

# Phase 13 Plan 02: Process Lifecycle Hardening Summary

**One-liner:** interrupt() via SIGINT + process_crashed event on non-zero exit with prior output + killAll() for orphan prevention at shutdown.

## Tasks Completed

| # | Name | Commit | Result |
|---|------|--------|--------|
| 1 | Add interrupt() to ClaudeProcessManager and crash event emission | 6df988a | 5 new tests pass |
| 2 | Add killAll() to SessionManager | 6df988a | 2 new tests pass |

## What Was Built

### ClaudeProcessManager.interrupt()
- New method on `ClaudeProcessManager` that calls `this.activeProcess.kill("SIGINT")`
- No-op guard: returns immediately if `activeProcess` is null
- Enables Escape key interrupt in auto mode (wiring in later plan)

### process_crashed Event Emission
- New branch in `proc.on("close", ...)` handler: `else if (code !== 0 && chunkCount > 0)`
- Emits `{ type: "process_crashed", exitCode: code, stderr: stderrText.trim() }` to all handlers
- Distinct from existing error path (non-zero exit with no output → `result` error event)
- Cast as `unknown as StreamEvent` — typed richer downstream via GSD2StreamEvent in plan 13-05
- Prevents UI stuck in "processing" state when gsd crashes mid-stream

### SessionManager.killAll()
- New async method using `Promise.all(sessions.map(s => s.processManager.kill()))`
- No-op for empty session map (Promise.all of empty array resolves immediately)
- Orphan prevention hook — called by server on app shutdown (server.ts wiring in later plan)

### IProcessManager Interface
- Added `interrupt(): void` to the interface in `session-manager.ts`
- All existing stubs continue to satisfy interface at Bun runtime

## Tests

File: `packages/mission-control/tests/process-lifecycle.test.ts` — 7 tests

| Test | Status |
|------|--------|
| interrupt() sends SIGINT to active process | PASS |
| interrupt() is no-op when no active process | PASS |
| process_crashed emitted on non-zero exit after output | PASS |
| result error emitted on non-zero exit with no output | PASS |
| cwd option passed as spawn cwd | PASS |
| killAll() calls kill() on both sessions | PASS |
| killAll() is no-op with zero sessions | PASS |

Full test suite: 564 pass, 0 fail.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `packages/mission-control/tests/process-lifecycle.test.ts` created
- [x] `packages/mission-control/src/server/claude-process.ts` — interrupt() added, crash branch added
- [x] `packages/mission-control/src/server/session-manager.ts` — IProcessManager.interrupt() + killAll() added
- [x] Commit 6df988a exists and includes all three files
- [x] All 564 tests pass

## Self-Check: PASSED
