---
phase: 02-sync-prompt-migration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/resources/extensions/gsd/sync-lock.ts
  - src/resources/extensions/gsd/workflow-engine.ts
  - src/resources/extensions/gsd/engine/sync-lock.test.ts
  - src/resources/extensions/gsd/engine/replay.test.ts
autonomous: true
requirements: [SYNC-03, EVT-04]
must_haves:
  truths:
    - "Advisory sync lock prevents concurrent worktree syncs from colliding"
    - "Stale lock files (mtime > 60s) are detected and overridden"
    - "Lock acquisition waits up to 5 seconds then skips non-fatally"
    - "engine.replay(event) applies a command from another engine's event log"
    - "Replayed events do not re-emit events or re-write manifest (afterCommand suppressed)"
    - "Unknown or failing replay events are skipped with stderr warning"
  artifacts:
    - path: "src/resources/extensions/gsd/sync-lock.ts"
      provides: "acquireSyncLock and releaseSyncLock functions"
      exports: ["acquireSyncLock", "releaseSyncLock"]
    - path: "src/resources/extensions/gsd/workflow-engine.ts"
      provides: "replay() method on WorkflowEngine class"
      contains: "replay(event"
    - path: "src/resources/extensions/gsd/engine/sync-lock.test.ts"
      provides: "Tests for advisory sync lock behavior"
    - path: "src/resources/extensions/gsd/engine/replay.test.ts"
      provides: "Tests for event replay behavior"
  key_links:
    - from: "src/resources/extensions/gsd/sync-lock.ts"
      to: "src/resources/extensions/gsd/atomic-write.ts"
      via: "atomicWriteSync for lock file creation"
      pattern: "atomicWriteSync"
    - from: "src/resources/extensions/gsd/workflow-engine.ts"
      to: "src/resources/extensions/gsd/workflow-commands.ts"
      via: "replay dispatches to existing _completeTask, _planSlice, etc."
      pattern: "_completeTask|_completeSlice|_planSlice"
---

<objective>
Create the advisory sync lock module and add event replay to WorkflowEngine.

Purpose: Sync lock (SYNC-03) is a prerequisite for Plan 02's sync migration. Event replay (EVT-04) enables cross-worktree command replay for future reconciliation. Both are independent new capabilities built on Phase 1 infrastructure.

Output: sync-lock.ts with acquire/release, replay() method on WorkflowEngine, and tests for both.
</objective>

<execution_context>
@/Users/jeremymcspadden/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jeremymcspadden/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-sync-prompt-migration/2-CONTEXT.md
@.planning/phases/02-sync-prompt-migration/2-RESEARCH.md
@.planning/phases/01-engine-foundation/1-05-SUMMARY.md

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->

From src/resources/extensions/gsd/atomic-write.ts:
```typescript
export function atomicWriteSync(filePath: string, content: string, encoding?: BufferEncoding): void;
```

From src/resources/extensions/gsd/paths.ts:
```typescript
export function gsdRoot(basePath: string): string;
```

From src/resources/extensions/gsd/workflow-events.ts:
```typescript
export interface WorkflowEvent {
  cmd: string;
  params: Record<string, unknown>;
  ts: string;
  actor: string;
  hash?: string;
}
export function appendEvent(basePath: string, event: Omit<WorkflowEvent, "hash">): void;
export function readEvents(logPath: string): WorkflowEvent[];
export function findForkPoint(eventsA: WorkflowEvent[], eventsB: WorkflowEvent[]): number;
```

From src/resources/extensions/gsd/workflow-engine.ts:
```typescript
export class WorkflowEngine {
  private db: DbAdapter;
  readonly basePath: string;
  constructor(basePath: string);
  private afterCommand(cmd: string, params: Record<string, unknown>): void;
  completeTask(params: CompleteTaskParams): CompleteTaskResult;
  completeSlice(params: CompleteSliceParams): CompleteSliceResult;
  planSlice(params: PlanSliceParams): PlanSliceResult;
  saveDecision(params: SaveDecisionParams): SaveDecisionResult;
  startTask(params: StartTaskParams): StartTaskResult;
  recordVerification(params: RecordVerificationParams): RecordVerificationResult;
  reportBlocker(params: ReportBlockerParams): ReportBlockerResult;
}
export function getEngine(basePath: string): WorkflowEngine;
export function resetEngine(): void;
```

From src/resources/extensions/gsd/workflow-commands.ts (internal, used by engine):
```typescript
export function _completeTask(db: DbAdapter, params: CompleteTaskParams): CompleteTaskResult;
export function _completeSlice(db: DbAdapter, params: CompleteSliceParams): CompleteSliceResult;
export function _planSlice(db: DbAdapter, params: PlanSliceParams): PlanSliceResult;
export function _saveDecision(db: DbAdapter, params: SaveDecisionParams): SaveDecisionResult;
export function _startTask(db: DbAdapter, params: StartTaskParams): StartTaskResult;
export function _recordVerification(db: DbAdapter, params: RecordVerificationParams): RecordVerificationResult;
export function _reportBlocker(db: DbAdapter, params: ReportBlockerParams): ReportBlockerResult;
```

Test pattern from src/resources/extensions/gsd/engine/manifest.test.ts:
```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Advisory sync lock module with TDD</name>
  <files>src/resources/extensions/gsd/sync-lock.ts, src/resources/extensions/gsd/engine/sync-lock.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/atomic-write.ts (atomicWriteSync signature and behavior)
    - src/resources/extensions/gsd/paths.ts (gsdRoot function at line 301)
    - src/resources/extensions/gsd/engine/manifest.test.ts (test pattern: node:test, tmpdir, beforeEach/afterEach)
    - src/resources/extensions/gsd/session-lock.ts (reference lock pattern — NOT reused, but shows codebase conventions)
  </read_first>
  <behavior>
    - acquireSyncLock returns { acquired: true } when no lock file exists
    - acquireSyncLock writes lock file at `{gsdRoot}/.gsd/sync.lock` with JSON `{ pid: number, acquired_at: string }`
    - releaseSyncLock deletes the lock file
    - acquireSyncLock returns { acquired: false } when lock is held by another process and not stale (mtime < 60s)
    - acquireSyncLock overrides a stale lock file (mtime > 60s) and acquires successfully
    - acquireSyncLock waits up to 5 seconds for a held lock before returning { acquired: false }
    - releaseSyncLock is no-op when lock file does not exist (does not throw)
  </behavior>
  <action>
RED: Create src/resources/extensions/gsd/engine/sync-lock.test.ts with failing tests:

```typescript
// GSD-2 Single-Writer State Architecture — Sync lock tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
```

Test structure: describe("sync-lock") with beforeEach creating tmpDir + `.gsd/` subdirectory, afterEach cleaning up.

Tests to write:
1. "acquires lock when none held" — call acquireSyncLock(tmpDir), assert acquired=true, assert lock file exists with pid and acquired_at fields
2. "release removes lock file" — acquire then release, assert lock file gone
3. "release is no-op when no lock" — call releaseSyncLock without acquire, assert no throw
4. "returns false when lock held and not stale" — write a lock file with current mtime, call acquireSyncLock with a SHORT timeout override (100ms instead of 5000ms to keep test fast), assert acquired=false. NOTE: acquireSyncLock should accept an optional `timeoutMs` param for testability (default 5000).
5. "overrides stale lock (mtime > 60s)" — write lock file, then set mtime to 120 seconds in the past using `utimesSync`, call acquireSyncLock, assert acquired=true
6. "lock file contains pid and acquired_at" — acquire, read lock file JSON, assert pid === process.pid and acquired_at is valid ISO string

GREEN: Create src/resources/extensions/gsd/sync-lock.ts:

```typescript
// GSD-2 Single-Writer State Architecture — Advisory sync lock
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
```

Implementation per D-04 through D-06:
- `acquireSyncLock(basePath: string, timeoutMs = 5000): { acquired: boolean }` — lock path is `join(basePath, ".gsd", "sync.lock")`. Loop until deadline: check existsSync, if exists check stale (statSync mtime > 60_000ms ago → unlinkSync), if not exists write via atomicWriteSync with `{ pid: process.pid, acquired_at: new Date().toISOString() }` and return acquired:true. If exists and not stale, spin with `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)` for ~100ms intervals. After deadline, return acquired:false.
- `releaseSyncLock(basePath: string): void` — lock path same formula. If existsSync, unlinkSync. Wrap in try/catch for non-fatal.
- Import `atomicWriteSync` from `./atomic-write.js`, `existsSync`, `statSync`, `unlinkSync` from `node:fs`, `join` from `node:path`.
- Do NOT use gsdRoot() — use `join(basePath, ".gsd", "sync.lock")` directly. The sync functions already know the basePath and the lock must be at the sync target's .gsd directory.

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/sync-lock.test.ts`
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/sync-lock.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/sync-lock.ts exists and contains `export function acquireSyncLock(`
    - src/resources/extensions/gsd/sync-lock.ts contains `export function releaseSyncLock(`
    - src/resources/extensions/gsd/sync-lock.ts contains `atomicWriteSync` (uses atomic writes, not writeFileSync)
    - src/resources/extensions/gsd/sync-lock.ts contains `sync.lock` (correct lock file name)
    - src/resources/extensions/gsd/sync-lock.ts contains `60_000` or `60000` (60-second stale threshold per D-06)
    - src/resources/extensions/gsd/engine/sync-lock.test.ts exists with at least 5 test cases
    - All sync-lock tests pass (exit code 0)
  </acceptance_criteria>
  <done>Advisory sync lock acquires/releases correctly, detects stale locks, waits with timeout, all tests green</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: engine.replay() method with TDD</name>
  <files>src/resources/extensions/gsd/workflow-engine.ts, src/resources/extensions/gsd/engine/replay.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/workflow-engine.ts (full file — understand class structure, afterCommand hook, command handler pattern)
    - src/resources/extensions/gsd/workflow-commands.ts (command handler signatures and param types)
    - src/resources/extensions/gsd/workflow-events.ts (WorkflowEvent interface)
    - src/resources/extensions/gsd/workflow-manifest.ts (writeManifest — to verify replay does NOT call it)
    - src/resources/extensions/gsd/engine/event-log.test.ts (test pattern for event-related tests)
  </read_first>
  <behavior>
    - replay(event) with cmd="complete_task" and valid params calls _completeTask and renders projections
    - replay(event) does NOT call afterCommand (no event append, no manifest write)
    - replay(event) with unknown cmd logs warning to stderr and returns without throwing
    - replay(event) with failing handler logs warning to stderr and returns without throwing
    - replay(event) renders projections via renderAllProjections when milestoneId is in params
    - replayAll(events) processes an array of events in order, skipping failures
  </behavior>
  <action>
RED: Create src/resources/extensions/gsd/engine/replay.test.ts with failing tests:

```typescript
// GSD-2 Single-Writer State Architecture — Event replay tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, closeDatabase, _getAdapter } from "../gsd-db.ts";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkflowEvent } from "../workflow-events.ts";
```

Test structure: describe("engine.replay") with beforeEach creating tmpDir + in-memory DB (openDatabase(":memory:")), afterEach cleanup.

Tests to write:
1. "replays complete_task event" — insert a milestone/slice/task via DB, create engine, create a WorkflowEvent with cmd="complete_task" and params={milestoneId, sliceId, taskId, summary:"test"}, call engine.replay(event), assert task row status is "done"
2. "does not append to event log" — replay an event, check that event log file was NOT created or not appended to (readEvents returns empty or file doesn't exist)
3. "does not write manifest on replay" — replay an event, check that state-manifest.json was NOT written (or if it existed before, mtime didn't change)
4. "skips unknown command with warning" — replay event with cmd="nonexistent_command", capture stderr, assert no throw and warning written
5. "skips failing command with warning" — replay event with cmd="complete_task" but params referencing non-existent entity (per D-10 lenient), assert no throw and warning written
6. "replayAll processes events in order" — insert milestone/slice + 2 tasks, replay [start_task(T1), complete_task(T1)], assert T1 status is "done"

GREEN: Add replay() and replayAll() methods to WorkflowEngine class in workflow-engine.ts:

```typescript
/**
 * Replay a single event from another engine's log.
 * Dispatches to the matching command handler but suppresses afterCommand
 * side effects (no event append, no manifest write). Projections still render.
 * Per D-10: lenient — unknown/failing events are skipped with stderr warning.
 */
replay(event: WorkflowEvent): void {
  const handlers: Record<string, (p: Record<string, unknown>) => unknown> = {
    complete_task: (p) => _completeTask(this.db, p as CompleteTaskParams),
    complete_slice: (p) => _completeSlice(this.db, p as CompleteSliceParams),
    plan_slice: (p) => _planSlice(this.db, p as PlanSliceParams),
    save_decision: (p) => _saveDecision(this.db, p as SaveDecisionParams),
    start_task: (p) => _startTask(this.db, p as StartTaskParams),
    record_verification: (p) => _recordVerification(this.db, p as RecordVerificationParams),
    report_blocker: (p) => _reportBlocker(this.db, p as ReportBlockerParams),
  };

  const handler = handlers[event.cmd];
  if (!handler) {
    process.stderr.write(`workflow-engine: replay skipping unknown cmd: ${event.cmd}\n`);
    return;
  }

  try {
    handler(event.params);
    // D-11: render projections but do NOT call afterCommand
    const milestoneId = (event.params as { milestoneId?: string }).milestoneId;
    if (milestoneId) {
      try { renderAllProjections(this.basePath, milestoneId); } catch { /* non-fatal */ }
    }
  } catch (err) {
    process.stderr.write(`workflow-engine: replay skipping ${event.cmd} (${event.hash ?? "?"}): ${(err as Error).message}\n`);
  }
}

/**
 * Replay multiple events in order. Per D-12: if one fails, log and continue.
 */
replayAll(events: WorkflowEvent[]): void {
  for (const event of events) {
    this.replay(event);
  }
}
```

Add import for WorkflowEvent type at the top of workflow-engine.ts:
```typescript
import type { WorkflowEvent } from "./workflow-events.js";
```

The replay method must NOT call `this.afterCommand()` — this is the key D-11 requirement.

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/replay.test.ts`
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/replay.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/workflow-engine.ts contains `replay(event` (method exists)
    - src/resources/extensions/gsd/workflow-engine.ts contains `replayAll(events` (batch method exists)
    - src/resources/extensions/gsd/workflow-engine.ts replay method does NOT contain `this.afterCommand` (suppressed per D-11)
    - src/resources/extensions/gsd/workflow-engine.ts contains `import type { WorkflowEvent }` or `import.*WorkflowEvent`
    - src/resources/extensions/gsd/engine/replay.test.ts exists with at least 5 test cases
    - All replay tests pass (exit code 0)
    - All existing engine tests still pass: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts`
  </acceptance_criteria>
  <done>engine.replay() dispatches events to command handlers, suppresses afterCommand, handles unknown/failing events leniently, all tests green including existing engine tests</done>
</task>

</tasks>

<verification>
Run all engine tests to confirm no regressions:
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts
```
</verification>

<success_criteria>
- sync-lock.ts exports acquireSyncLock and releaseSyncLock with correct lock behavior
- WorkflowEngine has replay() and replayAll() methods
- replay() suppresses afterCommand (no event append, no manifest write)
- All new tests pass, all existing engine tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/02-sync-prompt-migration/2-01-SUMMARY.md`
</output>
