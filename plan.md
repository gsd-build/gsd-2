# Implementation Plan: ADR-004 Single-Writer State Architecture

## Overview

Refactor GSD-2 from split-brain markdown state to a single-writer command-driven state engine. The work is structured in 5 phases, each independently shippable.

---

## Phase 0: Foundation (Non-Breaking, Additive Only)

### 0.1 — Define the WorkflowEngine class and state schema

**New file:** `src/resources/extensions/gsd/workflow-engine.ts` (~400 lines)

Create the core `WorkflowEngine` class with:

```typescript
interface WorkflowEngine {
  // Commands (write path)
  completeTask(taskId: string, summary: TaskSummaryPayload): Promise<void>
  completeSlice(sliceId: string, summary: SliceSummaryPayload): Promise<void>
  completeMilestone(milestoneId: string, summary: MilestoneSummaryPayload): Promise<void>
  planSlice(milestoneId: string, sliceId: string, tasks: TaskPlanEntry[]): Promise<void>
  startTask(taskId: string): Promise<void>
  recordVerification(taskId: string, checks: VerificationCheck[]): Promise<void>
  reportBlocker(taskId: string, description: string): Promise<void>
  replanSlice(sliceId: string, reason: string, newTasks: TaskPlanEntry[]): Promise<void>

  // Queries (read path)
  getState(): Promise<WorkflowState>
  getMilestoneStatus(milestoneId: string): Promise<MilestoneStatus>
  getSliceStatus(milestoneId: string, sliceId: string): Promise<SliceStatus>
  getTaskStatus(taskId: string): Promise<TaskStatus>
  isSliceComplete(milestoneId: string, sliceId: string): boolean
  isMilestoneComplete(milestoneId: string): boolean
}
```

Each command handler must:
1. Validate preconditions (e.g., task exists, slice is in executing phase)
2. Write to SQLite in a single transaction
3. Emit a typed event to the event log
4. Call the projection renderer
5. Roll back everything if rendering fails

**Files touched:**
- Create `src/resources/extensions/gsd/workflow-engine.ts`
- Create `src/resources/extensions/gsd/workflow-types.ts` (command payloads, state types)

### 0.2 — Extend SQLite schema for workflow state

**File:** `src/resources/extensions/gsd/gsd-db.ts`

Add new tables to the existing schema (migration from v4 → v5):

```sql
-- Workflow state tables
milestones (id TEXT PK, title, vision, status, created_at, updated_at)
slices (id TEXT PK, milestone_id FK, title, goal, sequence INT, status, phase, created_at, updated_at)
tasks (id TEXT PK, slice_id FK, milestone_id FK, title, description, sequence INT, status, estimate, started_at, completed_at, created_at, updated_at)
verification_evidence (id INTEGER PK, task_id FK, check_name, outcome, details, created_at)
task_summaries (task_id TEXT PK FK, one_liner, what_happened, deviations, files_modified JSON, created_at)
slice_summaries (slice_id TEXT PK FK, one_liner, what_happened, uat_script, created_at)

-- Event log (append-only)
events (seq INTEGER PK AUTOINCREMENT, event_type, entity_type, entity_id, payload JSON, created_at)
```

Keep existing tables (decisions, requirements, artifacts, memories) untouched.

**Files touched:**
- `src/resources/extensions/gsd/gsd-db.ts` — add migration v4→v5, new table creation
- Create `src/resources/extensions/gsd/workflow-db.ts` — SQL query helpers for the engine (keeps gsd-db.ts from growing unbounded)

### 0.3 — Build the markdown projection renderer

**New file:** `src/resources/extensions/gsd/projection-renderer.ts` (~300 lines)

Functions:
- `renderPlan(sliceId: string, tasks: TaskRecord[]): string` — generates `S01-PLAN.md` from DB rows
- `renderRoadmap(milestoneId: string, slices: SliceRecord[]): string` — generates `M001-ROADMAP.md`
- `renderTaskSummary(task: TaskRecord, summary: TaskSummaryRecord): string` — generates `T01-SUMMARY.md`
- `renderSliceSummary(slice: SliceRecord, summary: SliceSummaryRecord): string` — generates `S01-SUMMARY.md`
- `renderStateMd(state: WorkflowState): string` — generates `STATE.md`
- `renderAllProjections(engine: WorkflowEngine, milestoneId: string): Promise<void>` — full re-render

The renderer must produce markdown that is byte-compatible with current format (preserving git diff readability). Compare output against existing `files.ts` format functions.

**Files touched:**
- Create `src/resources/extensions/gsd/projection-renderer.ts`

### 0.4 — Register agent-callable tools

**File:** `src/resources/extensions/gsd/bootstrap/db-tools.ts`

Add new tools alongside existing ones:

- `gsd_complete_task` — calls `engine.completeTask()`. Parameters: `task_id`, `milestone_id`, `slice_id`, `one_liner`, `what_happened`, `deviations`, `files_modified[]`, `verification_evidence[]`
- `gsd_complete_slice` — calls `engine.completeSlice()`. Parameters: `slice_id`, `milestone_id`, `one_liner`, `what_happened`, `uat_script`
- `gsd_start_task` — calls `engine.startTask()`. Parameters: `task_id`, `milestone_id`, `slice_id`
- `gsd_plan_slice` — calls `engine.planSlice()`. Parameters: `milestone_id`, `slice_id`, `tasks[]`
- `gsd_record_verification` — calls `engine.recordVerification()`. Parameters: `task_id`, `checks[]`
- `gsd_report_blocker` — calls `engine.reportBlocker()`. Parameters: `task_id`, `description`

Each tool: validates input, delegates to engine, returns success/failure message.

**Files touched:**
- `src/resources/extensions/gsd/bootstrap/db-tools.ts` — add 6 new tool registrations
- Create `src/resources/extensions/gsd/bootstrap/workflow-tools.ts` if db-tools.ts gets too large (extract new tools there)

### 0.5 — Dual-write bridge in existing mutation paths

Wire existing code to also write through the engine when it exists. This is the key non-breaking integration point.

**File:** `src/resources/extensions/gsd/roadmap-mutations.ts` (135 lines)

After `markTaskDoneInPlan()` succeeds, also call `engine.completeTask()` if engine is initialized. After `markSliceDoneInRoadmap()` succeeds, also call `engine.completeSlice()` if engine is initialized.

**File:** `src/resources/extensions/gsd/auto-post-unit.ts`

After artifact verification succeeds, verify engine state agrees. Log discrepancies as warnings (telemetry only, not blocking).

**Files touched:**
- `src/resources/extensions/gsd/roadmap-mutations.ts` — add dual-write calls
- `src/resources/extensions/gsd/auto-post-unit.ts` — add engine agreement check
- `src/resources/extensions/gsd/auto-dispatch.ts` — pass engine ref to dispatch context

### 0.6 — Migration command: markdown → engine

**New file:** `src/resources/extensions/gsd/workflow-migrate.ts` (~200 lines)

`migrateMarkdownToEngine(basePath)`:
1. Parse all `*-ROADMAP.md` → insert milestones + slices
2. Parse all `*-PLAN.md` → insert tasks with status from checkboxes
3. Parse all `*-SUMMARY.md` → insert task/slice summaries
4. Parse existing `completed-units.json` → reconcile with task statuses
5. Validate: re-derive state from engine, compare against `deriveState()` from markdown
6. Report discrepancies

Callable via `gsd migrate` CLI command and automatically on first engine init.

**Files touched:**
- Create `src/resources/extensions/gsd/workflow-migrate.ts`
- `src/resources/extensions/gsd/commands/index.ts` (or wherever CLI commands are registered) — add `migrate` command

---

## Phase 1: Prompt Migration

### 1.1 — Update execute-task.md

**File:** `src/resources/extensions/gsd/prompts/execute-task.md`

Replace lines 67-73 (the checkbox mutation instructions):

**Before:**
```
Mark {{taskId}} done in `{{planPath}}` (change `[ ]` to `[x]`)
...
You MUST mark {{taskId}} as `[x]` in `{{planPath}}`
```

**After:**
```
Call the `gsd_complete_task` tool with your task summary, verification evidence, and files modified.
Do NOT manually edit {{planPath}} — the tool handles all state updates and file rendering.
```

Remove instructions to write `T01-SUMMARY.md` manually — the tool does it.

### 1.2 — Update complete-slice.md

**File:** `src/resources/extensions/gsd/prompts/complete-slice.md`

Replace lines 26-35:

**Before:**
```
Write {{sliceSummaryPath}} ... Write {{sliceUatPath}} ... Mark {{sliceId}} done in {{roadmapPath}}
You MUST do ALL THREE before finishing
```

**After:**
```
Call the `gsd_complete_slice` tool with slice summary, UAT script, and milestone context.
Do NOT manually edit {{roadmapPath}} or write summary files — the tool handles everything atomically.
```

### 1.3 — Add telemetry for tool vs manual path

**File:** `src/resources/extensions/gsd/auto-post-unit.ts`

In `postUnitPreVerification()`, after artifact verification:
- Check if completion came via tool call (engine event log has entry) or via manual markdown edit
- Log which path was used to activity log
- This lets us track adoption rate and know when Phase 2 is safe

### 1.4 — Update any other prompt templates referencing checkbox edits

Search all prompt templates for `[ ]` → `[x]` instructions and replace with tool calls.

**Files to audit:**
- `src/resources/extensions/gsd/prompts/*.md` — all templates
- `src/resources/extensions/gsd/prompts/**/*.md` — nested templates if any

---

## Phase 2: Engine Becomes Authoritative

### 2.1 — Switch deriveState() to query the engine

**File:** `src/resources/extensions/gsd/state.ts` (868 lines)

Replace the core of `deriveState()`:

**Before:** Parse markdown files via `nativeBatchParseGsdFiles()`, reconstruct state from checkboxes
**After:** `return engine.getState()` — typed query on the engine, <1ms

Keep the markdown-parsing `deriveState()` as `deriveStateLegacy()` for:
- Migration validation (compare engine state vs legacy)
- Disaster recovery (`gsd recover --from-markdown`)

### 2.2 — Switch dispatch guards to engine queries

**File:** `src/resources/extensions/gsd/auto-dispatch.ts` (636 lines)

Dispatch rules currently check `state.activeTask`, `state.activeSlice`, `state.phase` — these come from `deriveState()`. After 2.1, they come from the engine. No rule logic changes needed, just the data source.

### 2.3 — Switch artifact verification to engine queries

**File:** `src/resources/extensions/gsd/auto-recovery.ts`

`verifyExpectedArtifact()` currently checks:
- File existence on disk
- Checkbox state in markdown
- Summary content patterns

Replace with:
- Engine query: `engine.getTaskStatus(taskId).status === 'complete'`
- Still verify the projection file exists (re-render if missing)

### 2.4 — Block manual .gsd/ state edits by agents

**File:** Agent tool definitions / tool middleware

Add a warning when agents attempt to write to authoritative state files (`*-PLAN.md` checkboxes, `*-ROADMAP.md` checkboxes). Don't hard-block yet — warn and log.

### 2.5 — Build `gsd migrate` for existing projects

**File:** `src/resources/extensions/gsd/workflow-migrate.ts`

Make migration robust for all `.gsd/` directory shapes:
- Projects with no DB yet
- Projects with stale DB (the #759 scenario)
- Projects with partially completed milestones
- Projects with orphaned summaries or missing plans

Run migration automatically on first `deriveState()` call if engine tables are empty.

---

## Phase 3: Remove Markdown Parsing from Critical Path

### 3.1 — Delete checkbox-to-state parsing in files.ts

**File:** `src/resources/extensions/gsd/files.ts` (1170 lines)

Remove or deprecate:
- `parsePlan()` checkbox reconstruction logic (~120 lines) — keep structure parsing for migration only
- `parseRoadmap()` checkbox state extraction (~85 lines) — keep structure parsing for migration only
- `parseSummary()` frontmatter-to-status logic (~60 lines)

Mark these as `@deprecated` with `@see WorkflowEngine` — don't delete yet, they're needed for migration.

### 3.2 — Delete back-parsing in state.ts

**File:** `src/resources/extensions/gsd/state.ts`

`deriveState()` becomes:
```typescript
export async function deriveState(basePath: string): Promise<GSDState> {
  const engine = getWorkflowEngine(basePath);
  return engine.getState();
}
```

The 800+ lines of markdown parsing, memoization, and cache management become dead code. Move to `state-legacy.ts` for disaster recovery.

### 3.3 — Delete roadmap-mutations.ts checkbox functions

**File:** `src/resources/extensions/gsd/roadmap-mutations.ts` (135 lines)

Functions `markTaskDoneInPlan()`, `markSliceDoneInRoadmap()`, etc. are replaced by engine commands + projection rendering. Delete once Phase 2 is stable.

### 3.4 — Delete reconcilePlanCheckboxes() in auto-worktree.ts

**File:** `src/resources/extensions/gsd/auto-worktree.ts` (lines 536-613)

This function exists to forward-apply checkbox state across worktree boundaries. With the engine, state is in SQLite — worktree sync becomes:
1. Copy `gsd.db` (or share via symlink)
2. Re-render projections in worktree

Delete `reconcilePlanCheckboxes()` and simplify `syncProjectRootToWorktree()` / `syncStateToProjectRoot()`.

---

## Phase 4: Doctor Reduction

### 4.1 — Remove reconciliation checks from doctor-checks.ts

**File:** `src/resources/extensions/gsd/doctor-checks.ts` (1068 lines)

**Remove these check categories:**
- Task done without summary (engine enforces atomicity)
- Roadmap checkbox tracking vs plan state (engine is authoritative)
- STATE.md staleness checks (STATE.md is a projection, re-render on demand)
- Placeholder summary detection
- `completed-units.json` orphan checks

**Keep these check categories:**
- Orphaned worktrees and stale branches (infrastructure)
- Corrupt merge/rebase state (git health)
- Tracked runtime files in git (git hygiene)

Estimated removal: ~400 lines from doctor-checks.ts.

### 4.2 — Remove self-healing from auto-recovery.ts

**File:** `src/resources/extensions/gsd/auto-recovery.ts` (794 lines)

**Remove:**
- `selfHealRuntimeRecords()` (lines 662-729) — stale record cleanup is unnecessary; engine state is authoritative
- `skipExecuteTask()` (lines 495-542) — writes blocker summary + marks checkbox; replaced by `engine.reportBlocker()`
- `writeBlockerPlaceholder()` (lines 423-445) — replaced by engine blocker command
- Checkbox verification inside `verifyExpectedArtifact()` — replaced by engine query

**Keep:**
- `resolveExpectedArtifactPath()` — still useful for projection file existence checks
- `reconcileMergeState()` — git infrastructure health
- `hasImplementationArtifacts()` — validates real code was committed
- `buildLoopRemediationSteps()` — user-facing recovery guidance

### 4.3 — Simplify doctor-proactive.ts health scoring

**File:** `src/resources/extensions/gsd/doctor-proactive.ts` (431 lines)

Remove escalation logic for bookkeeping failures. Keep:
- Health snapshot recording (useful telemetry)
- Trend detection (useful observability)
- Pre-dispatch health gate for git/merge state

Remove:
- Escalation for consecutive error units caused by state drift (~80 lines)
- Health scoring that includes reconciliation fix counts

### 4.4 — Simplify forensics

**File:** `src/resources/extensions/gsd/forensics.ts` (636 lines)

Replace `completed-units.json` inspection with engine event log query. Replace anomaly detectors for missing artifacts and stuck loops with event log pattern detection. The event log makes forensics dramatically simpler and more reliable.

---

## Phase 5: Dead Code Cleanup

### 5.1 — Delete completed-units.json handling

Remove all read/write paths for `completed-units.json`. The engine's durable unit status replaces it entirely.

**Files touched:**
- `src/resources/extensions/gsd/auto-post-unit.ts` — remove completed-units.json writes
- `src/resources/extensions/gsd/forensics.ts` — remove completed-units.json reads
- `src/resources/extensions/gsd/doctor-checks.ts` — remove orphan detection

### 5.2 — Delete state-legacy.ts (formerly state.ts parsing)

Once migration has run successfully on all known project shapes and the legacy path has had no callers for a release cycle, delete `state-legacy.ts`.

### 5.3 — Delete deprecated parse functions from files.ts

Remove `@deprecated` parse functions. Keep only structure-aware parsing needed for:
- `gsd migrate` (one-time migration of old projects)
- Content rendering helpers (non-state, like formatting summaries)

### 5.4 — Delete unit-runtime.ts completion inspection

**File:** `src/resources/extensions/gsd/unit-runtime.ts` (189 lines)

`inspectExecuteTaskDurability()` exists to check if a task is "probably done" by inspecting markdown + summary + STATE.md. The engine replaces this with `engine.getTaskStatus()`. Delete the inspection function and simplify `ExecuteTaskRecoveryStatus`.

### 5.5 — Clean up auto-worktree-sync.ts

**File:** `src/resources/extensions/gsd/auto-worktree-sync.ts` (204 lines)

Simplify sync to:
1. Engine state travels via `gsd.db` file copy or shared path
2. `renderAllProjections()` in target worktree after sync
3. Delete milestone-directory-level file copying that was compensating for checkbox drift

---

## Dependency Graph

```
Phase 0.1 (types) ──┬── Phase 0.2 (schema) ──── Phase 0.3 (renderer) ──┐
                     │                                                    │
                     └── Phase 0.4 (tools) ─────────────────────────────┤
                                                                         │
Phase 0.5 (dual-write) ◄────────────────────────────────────────────────┘
        │
Phase 0.6 (migration) ◄── Phase 0.5
        │
Phase 1.1-1.4 (prompts) ◄── Phase 0.4
        │
Phase 2.1-2.5 (authoritative switch) ◄── Phase 1 + Phase 0.6
        │
Phase 3.1-3.4 (remove parsing) ◄── Phase 2
        │
Phase 4.1-4.4 (doctor reduction) ◄── Phase 3
        │
Phase 5.1-5.5 (cleanup) ◄── Phase 4
```

## Estimated Impact

| Metric | Value |
|--------|-------|
| New files | 5 (workflow-engine, workflow-types, workflow-db, projection-renderer, workflow-migrate) |
| New lines | ~2,000-2,500 |
| Deleted lines | ~4,500-6,500 |
| Net change | –2,500 to –4,000 lines |
| Modified files | ~18 (prompts, state, doctor, recovery, dispatch, post-unit, worktree, forensics, tools, roadmap-mutations, files, unit-runtime) |
| New DB tables | 6 (milestones, slices, tasks, verification_evidence, task_summaries, slice_summaries) + 1 (events) |
| New agent tools | 6 (complete_task, complete_slice, start_task, plan_slice, record_verification, report_blocker) |

## Risk Mitigation

1. **Phase 0 dual-write** is the safety net. Both paths run in parallel. If the engine disagrees with markdown, we log it and keep markdown authoritative until confidence is high.

2. **Migration validation** compares engine-derived state against legacy `deriveState()`. Any discrepancy blocks the switch to Phase 2.

3. **Projection byte-compatibility** — the renderer must produce markdown indistinguishable from current format. Test by rendering from engine and diffing against existing files.

4. **Rollback path** — at any point before Phase 3, we can disable the engine and fall back to pure markdown. After Phase 3, rollback requires re-running migration from engine → markdown (which the renderer already does).

5. **LLM compliance** — Phase 1 prompt changes must be validated by running auto-mode on test milestones and confirming agents call tools instead of editing markdown. Track via the telemetry added in 1.3.
