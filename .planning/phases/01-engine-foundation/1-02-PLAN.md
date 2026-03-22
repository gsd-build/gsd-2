---
phase: 01-engine-foundation
plan: 02
type: execute
wave: 2
depends_on: ["1-01"]
files_modified:
  - src/resources/extensions/gsd/workflow-commands.ts
  - src/resources/extensions/gsd/workflow-engine.ts
  - src/resources/extensions/gsd/engine/commands.test.ts
autonomous: true
requirements:
  - ENG-04
  - CMD-01
  - CMD-02
  - CMD-03
  - CMD-04
  - CMD-05
  - CMD-06
  - CMD-07

must_haves:
  truths:
    - "complete_task() atomically writes status, summary, evidence and the task is queryable as done"
    - "complete_slice() atomically marks slice done with summary and UAT result"
    - "plan_slice() creates multiple task rows in one transaction"
    - "save_decision() records a decision to the decisions table"
    - "start_task() marks a task in-progress with timestamp"
    - "record_verification() stores verification evidence against a task"
    - "report_blocker() records blocker text against a task"
    - "All commands validate preconditions and throw on invalid state"
    - "Commands are idempotent — calling complete_task twice does not error"
  artifacts:
    - path: "src/resources/extensions/gsd/workflow-commands.ts"
      provides: "All 7 command handler implementations"
      exports: ["completeTask", "completeSlice", "planSlice", "saveDecision", "startTask", "recordVerification", "reportBlocker"]
    - path: "src/resources/extensions/gsd/engine/commands.test.ts"
      provides: "Unit tests for all 7 commands"
  key_links:
    - from: "src/resources/extensions/gsd/workflow-commands.ts"
      to: "src/resources/extensions/gsd/gsd-db.ts"
      via: "import { transaction, _getAdapter }"
      pattern: "transaction\\("
    - from: "src/resources/extensions/gsd/workflow-engine.ts"
      to: "src/resources/extensions/gsd/workflow-commands.ts"
      via: "engine delegates to command functions"
      pattern: "import.*workflow-commands"
---

<objective>
Implement all 7 command handlers (complete_task, complete_slice, plan_slice, save_decision, start_task, record_verification, report_blocker) as the core mutation API of the WorkflowEngine.

Purpose: Commands are the "one sheriff" — every state mutation flows through these typed, validated, atomic operations. This eliminates the split-brain problem where state was spread across markdown edits, JSON files, and in-memory arrays.
Output: workflow-commands.ts with all 7 commands, wired into WorkflowEngine, with comprehensive tests.
</objective>

<execution_context>
@/Users/jeremymcspadden/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jeremymcspadden/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/01-engine-foundation/1-CONTEXT.md
@.planning/phases/01-engine-foundation/1-RESEARCH.md
@.planning/phases/01-engine-foundation/1-01-SUMMARY.md

<interfaces>
<!-- From Plan 01 outputs -->

From src/resources/extensions/gsd/workflow-engine.ts (created in Plan 01):
```typescript
export interface MilestoneRow { id: string; title: string; status: string; created_at: string; completed_at: string | null; }
export interface SliceRow { id: string; milestone_id: string; title: string; status: string; risk: string; depends_on: string; summary: string | null; uat_result: string | null; created_at: string; completed_at: string | null; seq: number; }
export interface TaskRow { id: string; slice_id: string; milestone_id: string; title: string; description: string; status: string; estimate: string; summary: string | null; files: string; verify: string | null; started_at: string | null; completed_at: string | null; blocker: string | null; seq: number; }

export class WorkflowEngine {
  getMilestone(id: string): MilestoneRow | null;
  getSlice(milestoneId: string, sliceId: string): SliceRow | null;
  getTask(milestoneId: string, sliceId: string, taskId: string): TaskRow | null;
  getTasks(milestoneId: string, sliceId: string): TaskRow[];
  getSlices(milestoneId: string): SliceRow[];
  deriveState(): GSDState;
}

export function getEngine(basePath: string): WorkflowEngine;
export function isEngineAvailable(basePath: string): boolean;
```

From src/resources/extensions/gsd/gsd-db.ts:
```typescript
export function transaction<T>(fn: () => T): T;
export function _getAdapter(): DbAdapter | null;
export interface DbAdapter { exec(sql: string): void; prepare(sql: string): DbStatement; close(): void; }
export interface DbStatement { run(...params: unknown[]): unknown; get(...params: unknown[]): Record<string, unknown> | undefined; all(...params: unknown[]): Record<string, unknown>[]; }
```

From src/resources/extensions/gsd/types.ts:
```typescript
export interface Decision { seq: number; id: string; when_context: string; scope: string; decision: string; choice: string; rationale: string; revisable: string; made_by: DecisionMadeBy; superseded_by: string | null; }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement all 7 command handlers in workflow-commands.ts</name>
  <files>src/resources/extensions/gsd/workflow-commands.ts, src/resources/extensions/gsd/engine/commands.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/workflow-engine.ts (Plan 01 output — WorkflowEngine class, row types)
    - src/resources/extensions/gsd/workflow-engine-schema.ts (Plan 01 output — table columns)
    - src/resources/extensions/gsd/gsd-db.ts (transaction, _getAdapter, insertDecision patterns)
    - src/resources/extensions/gsd/types.ts (Decision interface for save_decision compatibility)
    - .planning/phases/01-engine-foundation/1-CONTEXT.md (D-04: rich responses, D-09: event shape)
  </read_first>
  <behavior>
    - Test: completeTask on nonexistent task throws "Task T99 not found"
    - Test: completeTask on existing pending task sets status='done', summary, completed_at
    - Test: completeTask with evidence inserts rows into verification_evidence
    - Test: completeTask is idempotent — calling twice returns same result without error
    - Test: completeTask returns rich result with progress context (e.g. "2/5 tasks done")
    - Test: completeSlice on nonexistent slice throws
    - Test: completeSlice sets status='done', summary, uat_result, completed_at
    - Test: planSlice creates multiple task rows with sequential IDs
    - Test: planSlice on slice with existing tasks throws "Slice S01 already has tasks"
    - Test: saveDecision inserts row into decisions table with auto-generated ID
    - Test: startTask sets status='in-progress' and started_at timestamp
    - Test: startTask on already-done task throws "Task T01 is already done"
    - Test: recordVerification inserts verification_evidence row
    - Test: reportBlocker sets task status='blocked' and blocker text
  </behavior>
  <action>
    Create `src/resources/extensions/gsd/workflow-commands.ts` with:

    1. File header: `// GSD Extension — Workflow Command Handlers` and copyright.

    2. Define param and result interfaces for each command:
       ```typescript
       export interface CompleteTaskParams { milestoneId: string; sliceId: string; taskId: string; summary: string; evidence?: string[]; }
       export interface CompleteTaskResult { taskId: string; status: string; progress: string; nextTask: string | null; nextTaskTitle: string | null; }

       export interface CompleteSliceParams { milestoneId: string; sliceId: string; summary: string; uatResult?: string; }
       export interface CompleteSliceResult { sliceId: string; status: string; progress: string; nextSlice: string | null; }

       export interface PlanSliceParams { milestoneId: string; sliceId: string; tasks: Array<{ id: string; title: string; description: string; estimate?: string; files?: string[]; verify?: string; }>; }
       export interface PlanSliceResult { sliceId: string; taskCount: number; taskIds: string[]; }

       export interface SaveDecisionParams { scope: string; decision: string; choice: string; rationale: string; revisable?: string; whenContext?: string; madeBy?: 'human' | 'agent' | 'collaborative'; }
       export interface SaveDecisionResult { id: string; }

       export interface StartTaskParams { milestoneId: string; sliceId: string; taskId: string; }
       export interface StartTaskResult { taskId: string; status: string; startedAt: string; }

       export interface RecordVerificationParams { milestoneId: string; sliceId: string; taskId: string; command: string; exitCode: number; stdout: string; stderr: string; durationMs: number; }
       export interface RecordVerificationResult { taskId: string; evidenceId: number; }

       export interface ReportBlockerParams { milestoneId: string; sliceId: string; taskId: string; description: string; }
       export interface ReportBlockerResult { taskId: string; status: string; }
       ```

    3. Implement each command as a standalone exported function that accepts `(db: DbAdapter, params: XxxParams): XxxResult`:

       **completeTask:** Inside `transaction()`:
       - SELECT task row, throw if not found
       - If status='done', return existing result (idempotent)
       - UPDATE tasks SET status='done', summary=params.summary, completed_at=ISO timestamp
       - If evidence provided, INSERT each into verification_evidence with recorded_at
       - After transaction, compute progress: count tasks where status='done' / total tasks in slice
       - Return rich result per D-04: `{ taskId, status: 'done', progress: "3/7 tasks done in S01", nextTask: next pending task ID or null, nextTaskTitle }`

       **completeSlice:** Inside `transaction()`:
       - SELECT slice row, throw if not found
       - UPDATE slices SET status='done', summary=params.summary, uat_result=params.uatResult, completed_at=ISO timestamp
       - Compute progress: count slices done / total slices in milestone
       - Return: `{ sliceId, status: 'done', progress: "2/5 slices done in M001", nextSlice }`

       **planSlice:** Inside `transaction()`:
       - SELECT existing tasks for this slice, throw if any exist
       - INSERT each task with seq = index, status='pending'
       - Return: `{ sliceId, taskCount, taskIds }`

       **saveDecision:** Inside `transaction()`:
       - SELECT MAX seq from decisions, compute next ID as `D${String(maxSeq + 1).padStart(3, '0')}`
       - INSERT into decisions table (reuse insertDecision pattern from gsd-db.ts)
       - Return: `{ id }`

       **startTask:** Inside `transaction()`:
       - SELECT task, throw if not found or already done
       - UPDATE tasks SET status='in-progress', started_at=ISO timestamp
       - Return: `{ taskId, status: 'in-progress', startedAt }`

       **recordVerification:** Inside `transaction()`:
       - INSERT into verification_evidence
       - Return: `{ taskId, evidenceId }` (use lastInsertRowid or re-query)

       **reportBlocker:** Inside `transaction()`:
       - SELECT task, throw if not found
       - UPDATE tasks SET status='blocked', blocker=params.description
       - Return: `{ taskId, status: 'blocked' }`

    Create `src/resources/extensions/gsd/engine/commands.test.ts`:
    - Use `node:test` (describe/it) and `node:assert/strict`
    - Helper function to set up test DB: open `:memory:`, insert a milestone, slice, and tasks
    - Test all 14 behaviors listed above
    - Each test block uses before/after to open/close DB
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/commands.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-commands.ts exports `completeTask` function
    - workflow-commands.ts exports `completeSlice` function
    - workflow-commands.ts exports `planSlice` function
    - workflow-commands.ts exports `saveDecision` function
    - workflow-commands.ts exports `startTask` function
    - workflow-commands.ts exports `recordVerification` function
    - workflow-commands.ts exports `reportBlocker` function
    - workflow-commands.ts contains `transaction(` calls wrapping all mutations
    - commands.test.ts contains at least 14 test cases
    - All tests pass with exit code 0
  </acceptance_criteria>
  <done>All 7 command handlers work atomically via transaction(), validate preconditions, handle idempotency, and return rich results with progress context per D-04.</done>
</task>

<task type="auto">
  <name>Task 2: Wire command handlers into WorkflowEngine class methods</name>
  <files>src/resources/extensions/gsd/workflow-engine.ts</files>
  <read_first>
    - src/resources/extensions/gsd/workflow-engine.ts (current class from Plan 01)
    - src/resources/extensions/gsd/workflow-commands.ts (Task 1 output — all exported command functions and their param/result types)
  </read_first>
  <action>
    Modify `src/resources/extensions/gsd/workflow-engine.ts` to:

    1. Import all command functions and their param/result types from `./workflow-commands.js`:
       ```typescript
       import { completeTask, completeSlice, planSlice, saveDecision, startTask, recordVerification, reportBlocker } from './workflow-commands.js';
       import type { CompleteTaskParams, CompleteTaskResult, CompleteSliceParams, CompleteSliceResult, PlanSliceParams, PlanSliceResult, SaveDecisionParams, SaveDecisionResult, StartTaskParams, StartTaskResult, RecordVerificationParams, RecordVerificationResult, ReportBlockerParams, ReportBlockerResult } from './workflow-commands.js';
       ```

    2. Add delegation methods to the WorkflowEngine class:
       ```typescript
       completeTask(params: CompleteTaskParams): CompleteTaskResult { return completeTask(this.db, params); }
       completeSlice(params: CompleteSliceParams): CompleteSliceResult { return completeSlice(this.db, params); }
       planSlice(params: PlanSliceParams): PlanSliceResult { return planSlice(this.db, params); }
       saveDecision(params: SaveDecisionParams): SaveDecisionResult { return saveDecision(this.db, params); }
       startTask(params: StartTaskParams): StartTaskResult { return startTask(this.db, params); }
       recordVerification(params: RecordVerificationParams): RecordVerificationResult { return recordVerification(this.db, params); }
       reportBlocker(params: ReportBlockerParams): ReportBlockerResult { return reportBlocker(this.db, params); }
       ```

    3. Re-export the param/result types from workflow-engine.ts so consumers can import from one place:
       ```typescript
       export type { CompleteTaskParams, CompleteTaskResult, CompleteSliceParams, CompleteSliceResult, PlanSliceParams, PlanSliceResult, SaveDecisionParams, SaveDecisionResult, StartTaskParams, StartTaskResult, RecordVerificationParams, RecordVerificationResult, ReportBlockerParams, ReportBlockerResult } from './workflow-commands.js';
       ```
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/workflow-engine.test.ts && node --experimental-strip-types --test src/resources/extensions/gsd/engine/commands.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-engine.ts contains `import.*from.*workflow-commands`
    - workflow-engine.ts class contains method `completeTask(`
    - workflow-engine.ts class contains method `completeSlice(`
    - workflow-engine.ts class contains method `planSlice(`
    - workflow-engine.ts class contains method `saveDecision(`
    - workflow-engine.ts class contains method `startTask(`
    - workflow-engine.ts class contains method `recordVerification(`
    - workflow-engine.ts class contains method `reportBlocker(`
    - workflow-engine.ts re-exports all param/result types
    - Both test files pass
  </acceptance_criteria>
  <done>WorkflowEngine class delegates all 7 commands to workflow-commands.ts functions, exposing a clean public API. All existing and new tests pass.</done>
</task>

</tasks>

<verification>
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/commands.test.ts` passes (14+ tests)
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/workflow-engine.test.ts` passes
- WorkflowEngine.completeTask() atomically updates task status and returns rich progress context
- All commands validate preconditions and are idempotent where applicable
</verification>

<success_criteria>
- All 7 commands implemented with atomic transactions
- Each command validates preconditions and throws clear errors on invalid state
- complete_task and complete_slice return progress context per D-04
- Idempotency: calling complete_task twice does not error
- 14+ tests pass covering all commands
</success_criteria>

<output>
After completion, create `.planning/phases/01-engine-foundation/1-02-SUMMARY.md`
</output>
