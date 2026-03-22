---
phase: 01-engine-foundation
plan: 05
type: execute
wave: 3
depends_on: ["1-02"]
files_modified:
  - src/resources/extensions/gsd/workflow-manifest.ts
  - src/resources/extensions/gsd/workflow-events.ts
  - src/resources/extensions/gsd/workflow-engine.ts
  - src/resources/extensions/gsd/engine/manifest.test.ts
  - src/resources/extensions/gsd/engine/event-log.test.ts
autonomous: true
requirements:
  - MAN-01
  - MAN-02
  - MAN-03
  - MAN-04
  - MAN-05
  - EVT-01
  - EVT-02

must_haves:
  truths:
    - "engine.snapshot() produces a complete JSON dump of all workflow state"
    - "engine.restore(snapshot) atomically replaces all workflow state from a snapshot"
    - "state-manifest.json is written after every engine command"
    - "A fresh clone can bootstrap the DB from state-manifest.json without parsing markdown"
    - "state-manifest.json is git-tracked and structured for three-way merge"
    - "Every engine command appends a JSONL event with content hash"
    - "Fork-point detection identifies the last common event between two diverged logs"
  artifacts:
    - path: "src/resources/extensions/gsd/workflow-manifest.ts"
      provides: "snapshot(), restore(), writeManifest() functions"
      exports: ["snapshot", "restore", "writeManifest", "bootstrapFromManifest"]
    - path: "src/resources/extensions/gsd/workflow-events.ts"
      provides: "appendEvent(), readEvents(), findForkPoint() functions"
      exports: ["appendEvent", "readEvents", "findForkPoint"]
    - path: "src/resources/extensions/gsd/engine/manifest.test.ts"
      provides: "Unit tests for snapshot, restore, manifest write, bootstrap"
    - path: "src/resources/extensions/gsd/engine/event-log.test.ts"
      provides: "Unit tests for event append, read, fork-point detection"
  key_links:
    - from: "src/resources/extensions/gsd/workflow-manifest.ts"
      to: "src/resources/extensions/gsd/gsd-db.ts"
      via: "import { _getAdapter, transaction }"
      pattern: "transaction\\("
    - from: "src/resources/extensions/gsd/workflow-manifest.ts"
      to: "src/resources/extensions/gsd/atomic-write.ts"
      via: "atomicWriteSync for manifest file"
      pattern: "atomicWriteSync"
    - from: "src/resources/extensions/gsd/workflow-events.ts"
      to: "node:fs"
      via: "appendFileSync for JSONL"
      pattern: "appendFileSync"
    - from: "src/resources/extensions/gsd/workflow-engine.ts"
      to: "src/resources/extensions/gsd/workflow-manifest.ts"
      via: "writeManifest called after commands"
      pattern: "writeManifest"
---

<objective>
Implement the state manifest (snapshot/restore/writeManifest) and JSONL event log (appendEvent/findForkPoint) that enable team workflows and state portability.

Purpose: The manifest makes state portable — a fresh clone bootstraps from state-manifest.json without parsing markdown. The event log records every mutation for auditability and enables fork-point detection for future event-based sync (Phase 2-3).
Output: workflow-manifest.ts, workflow-events.ts, wired into WorkflowEngine command flow, with comprehensive tests.
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
@.planning/phases/01-engine-foundation/1-02-SUMMARY.md

<interfaces>
<!-- Decisions that constrain manifest and event log design -->

From 1-CONTEXT.md:
- D-06: Full database dump structured by entity type — milestones, slices, tasks, decisions, verification evidence. No curated/filtered snapshots.
- D-07: Manifest format: { "version": 1, "exported_at": "...", "milestones": [...], "slices": [...], "tasks": [...], "decisions": [...] }
- D-08: Manifest written after every command via atomicWriteSync. Git-tracked for three-way merge.
- D-09: One event per command (command-level only). Internal transitions are not events.
- D-10: Event shape: {"cmd": "complete_task", "params": {...}, "ts": "...", "hash": "...", "actor": "agent"} — JSONL format, append-only.
- D-11: No event compaction in Phase 1. Log grows unbounded.

From src/resources/extensions/gsd/gsd-db.ts:
```typescript
export function transaction<T>(fn: () => T): T;
export function _getAdapter(): DbAdapter | null;
export function openDatabase(path: string): boolean;
export interface DbAdapter { exec(sql: string): void; prepare(sql: string): DbStatement; close(): void; }
```

From src/resources/extensions/gsd/workflow-engine.ts (Plans 01-02):
```typescript
export interface MilestoneRow { id: string; title: string; status: string; created_at: string; completed_at: string | null; }
export interface SliceRow { id: string; milestone_id: string; title: string; status: string; risk: string; depends_on: string; summary: string | null; uat_result: string | null; created_at: string; completed_at: string | null; seq: number; }
export interface TaskRow { id: string; slice_id: string; milestone_id: string; title: string; description: string; status: string; estimate: string; summary: string | null; files: string; verify: string | null; started_at: string | null; completed_at: string | null; blocker: string | null; seq: number; }

export class WorkflowEngine {
  completeTask(params): CompleteTaskResult;
  // ... all 7 commands
}
```

From src/resources/extensions/gsd/atomic-write.ts:
```typescript
export function atomicWriteSync(filePath: string, content: string, encoding?: BufferEncoding): void;
```

From src/resources/extensions/gsd/bootstrap/dynamic-tools.ts:
```typescript
export async function ensureDbOpen(): Promise<boolean>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement state manifest (snapshot, restore, writeManifest, bootstrapFromManifest)</name>
  <files>src/resources/extensions/gsd/workflow-manifest.ts, src/resources/extensions/gsd/engine/manifest.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/gsd-db.ts (transaction, _getAdapter, DbAdapter — for reading all tables)
    - src/resources/extensions/gsd/workflow-engine-schema.ts (table definitions — column names for SELECT)
    - src/resources/extensions/gsd/atomic-write.ts (atomicWriteSync signature)
    - src/resources/extensions/gsd/bootstrap/dynamic-tools.ts (ensureDbOpen — integration point for bootstrap)
    - .planning/phases/01-engine-foundation/1-CONTEXT.md (D-06, D-07, D-08 — manifest format decisions)
  </read_first>
  <behavior>
    - Test: snapshot() with populated DB returns object with version=1, exported_at, milestones, slices, tasks, decisions arrays
    - Test: snapshot() with empty DB returns object with empty arrays
    - Test: restore(snapshot) on empty DB populates all tables correctly
    - Test: restore(snapshot) on populated DB replaces all existing data
    - Test: restore() is atomic — if one table insert fails, no tables are modified
    - Test: writeManifest writes state-manifest.json to .gsd/ directory
    - Test: bootstrapFromManifest reads state-manifest.json and restores DB state
    - Test: manifest JSON is pretty-printed with 2-space indent (git-friendly)
  </behavior>
  <action>
    Create `src/resources/extensions/gsd/workflow-manifest.ts` with:

    1. File header: `// GSD Extension — State Manifest (Snapshot/Restore)` and copyright.

    2. Define the manifest type matching D-07:
    ```typescript
    export interface StateManifest {
      version: 1;
      exported_at: string;  // ISO 8601
      milestones: MilestoneRow[];
      slices: SliceRow[];
      tasks: TaskRow[];
      decisions: Array<{ id: string; when_context: string; scope: string; decision: string; choice: string; rationale: string; revisable: string; made_by: string; superseded_by: string | null; }>;
      verification_evidence: Array<{ id: number; task_id: string; slice_id: string; milestone_id: string; command: string; exit_code: number | null; stdout: string; stderr: string; duration_ms: number | null; recorded_at: string; }>;
    }
    ```

    3. **snapshot(db: DbAdapter): StateManifest**
       - SELECT * from milestones, slices, tasks, decisions, verification_evidence
       - Map each table's rows to typed arrays
       - Return `{ version: 1, exported_at: new Date().toISOString(), milestones, slices, tasks, decisions, verification_evidence }`

    4. **restore(db: DbAdapter, manifest: StateManifest): void**
       - Inside `transaction()`:
         - DELETE FROM milestones, slices, tasks, verification_evidence (clear v5 tables only — don't touch v4 artifacts/memories)
         - Also DELETE FROM decisions (engine-managed decisions replace all)
         - INSERT each row from manifest arrays
       - If any insert fails, transaction rolls back — no partial state

    5. **writeManifest(basePath: string, db: DbAdapter): void**
       - Call `snapshot(db)` to get current state
       - Write to `{basePath}/.gsd/state-manifest.json` via `atomicWriteSync`
       - Use `JSON.stringify(manifest, null, 2)` for pretty-printing (git three-way merge friendly per D-08)

    6. **bootstrapFromManifest(basePath: string, db: DbAdapter): boolean**
       - Read `{basePath}/.gsd/state-manifest.json` via `readFileSync`
       - If file doesn't exist, return false
       - Parse JSON, validate version === 1
       - Call `restore(db, parsed)`
       - Return true

    Create `src/resources/extensions/gsd/engine/manifest.test.ts`:
    - Use node:test, in-memory DB
    - Helper to insert test data (milestone, slices, tasks, decision, evidence)
    - Test all 8 behaviors above
    - For writeManifest test, use a temp directory (node:os tmpdir)
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/manifest.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-manifest.ts exports `StateManifest` interface
    - workflow-manifest.ts exports `snapshot` function
    - workflow-manifest.ts exports `restore` function
    - workflow-manifest.ts exports `writeManifest` function
    - workflow-manifest.ts exports `bootstrapFromManifest` function
    - workflow-manifest.ts contains `version: 1` in StateManifest
    - workflow-manifest.ts contains `atomicWriteSync` call
    - workflow-manifest.ts contains `JSON.stringify(manifest, null, 2)`
    - workflow-manifest.ts contains `transaction(` for restore
    - workflow-manifest.ts contains copyright header with `Jeremy McSpadden`
    - manifest.test.ts contains at least 8 test cases
    - All tests pass
  </acceptance_criteria>
  <done>State manifest captures complete DB state as portable JSON, restore replaces state atomically, writeManifest persists after commands, bootstrapFromManifest enables fresh-clone initialization from manifest file.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement JSONL event log with fork-point detection and wire into WorkflowEngine</name>
  <files>src/resources/extensions/gsd/workflow-events.ts, src/resources/extensions/gsd/workflow-engine.ts, src/resources/extensions/gsd/engine/event-log.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/workflow-engine.ts (WorkflowEngine class — where to add manifest/event calls after commands)
    - src/resources/extensions/gsd/workflow-manifest.ts (Task 1 output — writeManifest signature)
    - src/resources/extensions/gsd/atomic-write.ts (atomicWriteSync for reference)
    - .planning/phases/01-engine-foundation/1-CONTEXT.md (D-09: one event per command, D-10: event shape, D-11: no compaction)
  </read_first>
  <behavior>
    - Test: appendEvent writes one JSON line to event-log.jsonl
    - Test: appendEvent includes cmd, params, ts, hash, actor fields per D-10
    - Test: hash is a hex string derived from cmd+params content
    - Test: readEvents reads all events from JSONL file and returns typed array
    - Test: readEvents returns empty array when file doesn't exist
    - Test: findForkPoint with two identical logs returns last event index
    - Test: findForkPoint with diverged logs returns index of last common event
    - Test: findForkPoint with completely different logs returns -1
    - Test: WorkflowEngine.completeTask calls writeManifest and appendEvent after DB write
  </behavior>
  <action>
    Create `src/resources/extensions/gsd/workflow-events.ts` with:

    1. File header: `// GSD Extension — Event Log (Append-Only JSONL)` and copyright.

    2. Define event type matching D-10:
    ```typescript
    export interface WorkflowEvent {
      cmd: string;           // e.g. "complete_task"
      params: Record<string, unknown>;
      ts: string;            // ISO 8601
      hash: string;          // content hash (hex, 16 chars)
      actor: 'agent' | 'system';
    }
    ```

    3. **appendEvent(basePath: string, event: Omit<WorkflowEvent, 'hash'>): void**
       - Compute hash: `createHash('sha256').update(JSON.stringify({ cmd: event.cmd, params: event.params })).digest('hex').slice(0, 16)`
       - Construct full event with hash
       - Append `JSON.stringify(fullEvent) + '\n'` to `{basePath}/.gsd/event-log.jsonl` via `appendFileSync`
       - Create .gsd directory if needed via `mkdirSync({ recursive: true })`

    4. **readEvents(logPath: string): WorkflowEvent[]**
       - If file doesn't exist, return []
       - Read file, split by newline, filter empty lines
       - Parse each line as JSON, return typed array
       - Wrap in try/catch — corrupted lines are skipped with stderr warning

    5. **findForkPoint(logA: WorkflowEvent[], logB: WorkflowEvent[]): number**
       - Walk both logs forward comparing hashes
       - Return the index of the last event where hashes match
       - If first events differ, return -1 (completely diverged)
       - If one log is a prefix of the other, return length of shorter - 1
       - This satisfies EVT-02

    Modify `src/resources/extensions/gsd/workflow-engine.ts`:

    6. Import `writeManifest` from `./workflow-manifest.js` and `appendEvent` from `./workflow-events.js`

    7. Add a private method to WorkflowEngine:
    ```typescript
    private afterCommand(cmd: string, params: Record<string, unknown>): void {
      // Write manifest after every command (MAN-03, D-08)
      try {
        writeManifest(this.basePath, this.db);
      } catch (err) {
        process.stderr.write(`workflow-engine: manifest write failed (non-fatal): ${(err as Error).message}\n`);
      }
      // Append event (EVT-01, D-09)
      try {
        appendEvent(this.basePath, { cmd, params, ts: new Date().toISOString(), actor: 'agent' });
      } catch (err) {
        process.stderr.write(`workflow-engine: event append failed (non-fatal): ${(err as Error).message}\n`);
      }
    }
    ```

    8. Call `this.afterCommand(...)` at the end of each of the 7 command methods in WorkflowEngine (completeTask, completeSlice, planSlice, saveDecision, startTask, recordVerification, reportBlocker). Add the call after the DB transaction succeeds but before returning the result. Example for completeTask:
    ```typescript
    completeTask(params: CompleteTaskParams): CompleteTaskResult {
      const result = completeTaskCmd(this.db, params);
      this.afterCommand('complete_task', params as unknown as Record<string, unknown>);
      return result;
    }
    ```

    Create `src/resources/extensions/gsd/engine/event-log.test.ts`:
    - Use node:test, temp directory for JSONL file
    - Test all 9 behaviors above
    - For the integration test (WorkflowEngine calls afterCommand), use in-memory DB + temp basePath
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/event-log.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-events.ts exports `WorkflowEvent` interface
    - workflow-events.ts exports `appendEvent` function
    - workflow-events.ts exports `readEvents` function
    - workflow-events.ts exports `findForkPoint` function
    - workflow-events.ts contains `appendFileSync` call
    - workflow-events.ts contains `createHash('sha256')` for content hash
    - workflow-events.ts contains copyright header with `Jeremy McSpadden`
    - workflow-engine.ts contains `afterCommand` private method
    - workflow-engine.ts contains `writeManifest(` call
    - workflow-engine.ts contains `appendEvent(` call
    - event-log.test.ts contains at least 9 test cases
    - All tests pass
  </acceptance_criteria>
  <done>Event log appends one JSONL line per command with content hash. Fork-point detection compares two logs and identifies divergence point. WorkflowEngine calls writeManifest and appendEvent after every command. All tests pass.</done>
</task>

</tasks>

<verification>
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/manifest.test.ts` passes (8+ tests)
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/event-log.test.ts` passes (9+ tests)
- snapshot() captures all DB state as JSON with version:1 format
- restore() atomically replaces DB state from manifest
- bootstrapFromManifest initializes DB from state-manifest.json file
- appendEvent writes JSONL with content hash per D-10
- findForkPoint correctly identifies divergence between two logs
- WorkflowEngine calls afterCommand (manifest + event) after every command
</verification>

<success_criteria>
- State manifest: snapshot/restore round-trips preserve all state
- Manifest written to .gsd/state-manifest.json after every command
- Fresh clone can bootstrap from manifest (no markdown parsing)
- Event log: JSONL format, one line per command, content hash
- Fork-point detection works for identical, diverged, and completely different logs
- All manifest and event failures are non-fatal (logged to stderr)
- 17+ tests pass across both test files
</success_criteria>

<output>
After completion, create `.planning/phases/01-engine-foundation/1-05-SUMMARY.md`
</output>
