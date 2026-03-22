---
phase: 01-engine-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/workflow-engine.ts
  - src/resources/extensions/gsd/workflow-engine-schema.ts
  - src/resources/extensions/gsd/engine/workflow-engine.test.ts
autonomous: true
requirements:
  - ENG-01
  - ENG-02

must_haves:
  truths:
    - "WorkflowEngine class exists and wraps SQLite via the existing DbAdapter"
    - "Schema v5 adds milestones, slices, tasks, verification_evidence tables to SQLite"
    - "Opening a database on schema v4 migrates to v5 without data loss"
    - "WorkflowEngine provides typed query methods for all new tables"
  artifacts:
    - path: "src/resources/extensions/gsd/workflow-engine-schema.ts"
      provides: "Schema v5 DDL and migration function"
      contains: "CREATE TABLE IF NOT EXISTS milestones"
    - path: "src/resources/extensions/gsd/workflow-engine.ts"
      provides: "WorkflowEngine class with constructor and query methods"
      exports: ["WorkflowEngine", "getEngine", "isEngineAvailable"]
    - path: "src/resources/extensions/gsd/engine/workflow-engine.test.ts"
      provides: "Unit tests for engine creation and schema migration"
  key_links:
    - from: "src/resources/extensions/gsd/workflow-engine.ts"
      to: "src/resources/extensions/gsd/gsd-db.ts"
      via: "import { transaction, _getAdapter } from './gsd-db.js'"
      pattern: "import.*from.*gsd-db"
    - from: "src/resources/extensions/gsd/gsd-db.ts"
      to: "src/resources/extensions/gsd/workflow-engine-schema.ts"
      via: "migrateSchema calls v5 migration"
      pattern: "currentVersion < 5"
---

<objective>
Create the SQLite schema v5 migration and WorkflowEngine class skeleton that all other Phase 1 plans depend on.

Purpose: Every subsequent plan (commands, projections, tools, manifest, events) needs tables to write to and a WorkflowEngine class to attach methods to. This is the foundation.
Output: workflow-engine.ts, workflow-engine-schema.ts, schema v5 migration in gsd-db.ts, and tests proving migration + engine instantiation work.
</objective>

<execution_context>
@/Users/jeremymcspadden/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jeremymcspadden/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-engine-foundation/1-CONTEXT.md
@.planning/phases/01-engine-foundation/1-RESEARCH.md

<interfaces>
<!-- Existing adapter and transaction APIs from gsd-db.ts that WorkflowEngine wraps -->

From src/resources/extensions/gsd/gsd-db.ts:
```typescript
interface DbStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
}

interface DbAdapter {
  exec(sql: string): void;
  prepare(sql: string): DbStatement;
  close(): void;
}

export function openDatabase(path: string): boolean;
export function closeDatabase(): void;
export function transaction<T>(fn: () => T): T;
export function _getAdapter(): DbAdapter | null;
export function isDbAvailable(): boolean;

const SCHEMA_VERSION = 4; // must bump to 5
```

From src/resources/extensions/gsd/types.ts:
```typescript
export type Phase = "pre-planning" | "needs-discussion" | "discussing" | "researching" | "planning" | "executing" | "verifying" | "summarizing" | "advancing" | "validating-milestone" | "completing-milestone" | "replanning-slice" | "complete" | "paused" | "blocked";

export interface GSDState {
  activeMilestone: ActiveRef | null;
  activeSlice: ActiveRef | null;
  activeTask: ActiveRef | null;
  phase: Phase;
  recentDecisions: string[];
  blockers: string[];
  nextAction: string;
  activeWorkspace?: string;
  registry: MilestoneRegistryEntry[];
  requirements?: RequirementCounts;
  progress?: { milestones: { done: number; total: number }; slices?: { done: number; total: number }; tasks?: { done: number; total: number } };
}
```

From src/resources/extensions/gsd/atomic-write.ts:
```typescript
export function atomicWriteSync(filePath: string, content: string, encoding?: BufferEncoding): void;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create schema v5 DDL module and wire migration into gsd-db.ts</name>
  <files>src/resources/extensions/gsd/workflow-engine-schema.ts, src/resources/extensions/gsd/gsd-db.ts</files>
  <read_first>
    - src/resources/extensions/gsd/gsd-db.ts (current schema v4, migrateSchema pattern, DbAdapter interface)
    - src/resources/extensions/gsd/types.ts (GSDState, Phase type — informs column choices)
    - docs/ADR-004-single-writer-state-architecture.md (three-layer architecture)
  </read_first>
  <action>
    Create `src/resources/extensions/gsd/workflow-engine-schema.ts` with:

    1. Export function `migrateToV5(db: DbAdapter): void` that creates 4 new tables inside a transaction:

    ```sql
    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,               -- e.g. "M001"
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',  -- pending | active | complete | parked
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS slices (
      id TEXT NOT NULL,                   -- e.g. "S01"
      milestone_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',  -- pending | active | done
      risk TEXT NOT NULL DEFAULT 'low',
      depends_on TEXT NOT NULL DEFAULT '[]',   -- JSON array of slice IDs
      summary TEXT DEFAULT NULL,
      uat_result TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT DEFAULT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (milestone_id, id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT NOT NULL,                   -- e.g. "T01"
      slice_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',  -- pending | in-progress | done | blocked
      estimate TEXT NOT NULL DEFAULT '',
      summary TEXT DEFAULT NULL,
      files TEXT NOT NULL DEFAULT '[]',        -- JSON array of file paths
      verify TEXT DEFAULT NULL,
      started_at TEXT DEFAULT NULL,
      completed_at TEXT DEFAULT NULL,
      blocker TEXT DEFAULT NULL,
      seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (milestone_id, slice_id, id)
    );

    CREATE TABLE IF NOT EXISTS verification_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      slice_id TEXT NOT NULL,
      milestone_id TEXT NOT NULL,
      command TEXT NOT NULL DEFAULT '',
      exit_code INTEGER DEFAULT NULL,
      stdout TEXT NOT NULL DEFAULT '',
      stderr TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER DEFAULT NULL,
      recorded_at TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_slices_status ON slices(status);
    CREATE INDEX IF NOT EXISTS idx_verification_task ON verification_evidence(milestone_id, slice_id, task_id);
    ```

    2. The function must accept a `DbAdapter` (the internal interface from gsd-db.ts). Import the `DbAdapter` type — since it's not currently exported, the schema module will need to accept it as parameter typed inline or via a shared internal type export.

    3. Add file header: `// GSD Extension — Schema v5: Workflow Engine Tables` and copyright.

    Then modify `src/resources/extensions/gsd/gsd-db.ts`:

    4. Bump `SCHEMA_VERSION` from `4` to `5`.

    5. In `migrateSchema()`, add a `if (currentVersion < 5)` block after the existing v4 block that:
       - Calls `migrateToV5(db)` (imported from workflow-engine-schema.ts)
       - Inserts schema_version row with version 5

    6. Export the `DbAdapter` interface (rename the existing private `DbAdapter` to export it) so workflow-engine-schema.ts and workflow-engine.ts can import it. Add `export` keyword to the existing `interface DbAdapter` declaration on line 29.

    7. Also export the `DbStatement` interface (line 23) for downstream use.
  </action>
  <verify>
    <automated>node --experimental-strip-types -e "
      const db = require('./src/resources/extensions/gsd/gsd-db.js');
      db.openDatabase(':memory:');
      const adapter = db._getAdapter();
      const tables = adapter.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
      const names = tables.map(t => t.name);
      console.log('Tables:', names.join(', '));
      const has = ['milestones','slices','tasks','verification_evidence'].every(t => names.includes(t));
      console.log('All v5 tables present:', has);
      if (!has) process.exit(1);
      db.closeDatabase();
    "
    </automated>
  </verify>
  <acceptance_criteria>
    - gsd-db.ts contains `SCHEMA_VERSION = 5`
    - gsd-db.ts contains `if (currentVersion < 5)` in migrateSchema
    - gsd-db.ts exports `DbAdapter` and `DbStatement` interfaces
    - workflow-engine-schema.ts contains `CREATE TABLE IF NOT EXISTS milestones`
    - workflow-engine-schema.ts contains `CREATE TABLE IF NOT EXISTS slices`
    - workflow-engine-schema.ts contains `CREATE TABLE IF NOT EXISTS tasks`
    - workflow-engine-schema.ts contains `CREATE TABLE IF NOT EXISTS verification_evidence`
    - workflow-engine-schema.ts contains copyright header with `Jeremy McSpadden`
    - Opening an in-memory DB creates all 4 new tables alongside existing tables
  </acceptance_criteria>
  <done>Schema v5 migration runs on fresh and existing databases, creating milestones/slices/tasks/verification_evidence tables. Existing v4 data (decisions, requirements, artifacts, memories) is preserved.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create WorkflowEngine class skeleton with typed query methods</name>
  <files>src/resources/extensions/gsd/workflow-engine.ts, src/resources/extensions/gsd/engine/workflow-engine.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/gsd-db.ts (after Task 1 modifications — DbAdapter export, transaction())
    - src/resources/extensions/gsd/workflow-engine-schema.ts (Task 1 output — table shapes)
    - src/resources/extensions/gsd/types.ts (GSDState interface — deriveState return type)
    - src/resources/extensions/gsd/doctor.ts lines 88-135 (buildStateMarkdown — existing STATE.md renderer for reference)
  </read_first>
  <behavior>
    - Test 1: `new WorkflowEngine(basePath)` with an open in-memory DB does not throw
    - Test 2: `engine.getTask(mid, sid, tid)` returns null for nonexistent task
    - Test 3: After inserting a task row via raw SQL, `engine.getTask()` returns typed result with correct fields
    - Test 4: `engine.getTasks(mid, sid)` returns empty array when no tasks exist
    - Test 5: `engine.getSlice(mid, sid)` returns null for nonexistent slice
    - Test 6: `engine.getMilestone(mid)` returns null for nonexistent milestone
    - Test 7: `isEngineAvailable(basePath)` returns true when DB has v5 schema
    - Test 8: `getEngine(basePath)` returns a WorkflowEngine instance
    - Test 9: `engine.deriveState()` returns a valid GSDState with null active refs when DB is empty
  </behavior>
  <action>
    Create `src/resources/extensions/gsd/workflow-engine.ts` with:

    1. File header: `// GSD Extension — WorkflowEngine: single-writer state command API` and copyright.

    2. Import from `./gsd-db.js`: `transaction`, `_getAdapter`, `isDbAvailable`, and the exported `DbAdapter` type.

    3. Define result/param interfaces:
       ```typescript
       export interface MilestoneRow { id: string; title: string; status: string; created_at: string; completed_at: string | null; }
       export interface SliceRow { id: string; milestone_id: string; title: string; status: string; risk: string; depends_on: string; summary: string | null; uat_result: string | null; created_at: string; completed_at: string | null; seq: number; }
       export interface TaskRow { id: string; slice_id: string; milestone_id: string; title: string; description: string; status: string; estimate: string; summary: string | null; files: string; verify: string | null; started_at: string | null; completed_at: string | null; blocker: string | null; seq: number; }
       ```

    4. Class `WorkflowEngine`:
       ```typescript
       export class WorkflowEngine {
         private db: DbAdapter;
         constructor(private readonly basePath: string) {
           const adapter = _getAdapter();
           if (!adapter) throw new Error('WorkflowEngine: no database connection');
           this.db = adapter;
         }

         // Query methods
         getMilestone(id: string): MilestoneRow | null { ... }
         getMilestones(): MilestoneRow[] { ... }
         getSlice(milestoneId: string, sliceId: string): SliceRow | null { ... }
         getSlices(milestoneId: string): SliceRow[] { ... }
         getTask(milestoneId: string, sliceId: string, taskId: string): TaskRow | null { ... }
         getTasks(milestoneId: string, sliceId: string): TaskRow[] { ... }

         // State derivation (ENG-03 — will be <1ms since it's just DB reads)
         deriveState(): GSDState { ... }
       }
       ```

    5. `deriveState()` implementation:
       - Query milestones table for active milestone (status='active')
       - Query slices table for active slice (status='active' within active milestone)
       - Query tasks table for active task (status='in-progress' within active slice, or first pending)
       - Determine phase from status of active entities
       - Query decisions table (existing) for recentDecisions (last 5)
       - Query tasks for blockers (status='blocked')
       - Return typed GSDState

    6. Module-level singleton functions:
       ```typescript
       let _engineInstance: WorkflowEngine | null = null;
       let _engineBasePath: string | null = null;

       export function getEngine(basePath: string): WorkflowEngine { ... }
       export function isEngineAvailable(basePath: string): boolean { ... }
       export function resetEngine(): void { _engineInstance = null; _engineBasePath = null; }
       ```

    7. `isEngineAvailable` checks: `isDbAvailable()` AND the milestones table exists (via `SELECT name FROM sqlite_master WHERE type='table' AND name='milestones'`).

    Create `src/resources/extensions/gsd/engine/workflow-engine.test.ts`:
    - Use `node:test` (describe/it) and `node:assert/strict`
    - Import `openDatabase`, `closeDatabase` from `../gsd-db.js`
    - Each test opens `:memory:` DB (which auto-creates v5 schema), creates engine, runs assertion, closes DB
    - Test all 9 behaviors listed above
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/workflow-engine.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-engine.ts exports `WorkflowEngine` class
    - workflow-engine.ts exports `getEngine` function
    - workflow-engine.ts exports `isEngineAvailable` function
    - workflow-engine.ts exports `resetEngine` function
    - workflow-engine.ts exports `MilestoneRow`, `SliceRow`, `TaskRow` interfaces
    - workflow-engine.ts contains `deriveState(): GSDState`
    - workflow-engine.ts contains copyright header with `Jeremy McSpadden`
    - workflow-engine.test.ts contains at least 9 test cases
    - All tests pass with exit code 0
  </acceptance_criteria>
  <done>WorkflowEngine class instantiates from an open SQLite connection, provides typed query methods for milestones/slices/tasks, and implements deriveState() returning GSDState from DB reads. All 9+ tests pass.</done>
</task>

</tasks>

<verification>
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/workflow-engine.test.ts` passes
- Opening an in-memory DB creates schema v5 tables (milestones, slices, tasks, verification_evidence) alongside existing v4 tables
- `WorkflowEngine` can be instantiated and queried without errors
- `deriveState()` returns valid GSDState shape with null active refs on empty DB
</verification>

<success_criteria>
- Schema v5 migration is wired into gsd-db.ts and runs automatically on DB open
- WorkflowEngine class exists with query methods and deriveState()
- All tests pass
- No existing tests broken (npm test still passes)
</success_criteria>

<output>
After completion, create `.planning/phases/01-engine-foundation/1-01-SUMMARY.md`
</output>
