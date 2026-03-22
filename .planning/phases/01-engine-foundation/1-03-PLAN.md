---
phase: 01-engine-foundation
plan: 03
type: execute
wave: 2
depends_on: ["1-01"]
files_modified:
  - src/resources/extensions/gsd/workflow-projections.ts
  - src/resources/extensions/gsd/engine/projections.test.ts
autonomous: true
requirements:
  - PROJ-01
  - PROJ-02
  - PROJ-03
  - PROJ-04
  - PROJ-05

must_haves:
  truths:
    - "renderPlanProjection produces PLAN.md with [x]/[ ] checkboxes matching task status in DB"
    - "renderRoadmapProjection produces ROADMAP.md with [x]/[ ] checkboxes matching slice status in DB"
    - "renderSummaryProjection produces SUMMARY.md with correct frontmatter from DB summary field"
    - "renderStateProjection produces STATE.md matching buildStateMarkdown output format"
    - "renderAllProjections regenerates all projection files from DB state without data loss"
    - "Corrupted or deleted projection files are regenerated on demand"
  artifacts:
    - path: "src/resources/extensions/gsd/workflow-projections.ts"
      provides: "Projection renderers for PLAN, ROADMAP, SUMMARY, STATE markdown files"
      exports: ["renderPlanProjection", "renderRoadmapProjection", "renderSummaryProjection", "renderStateProjection", "renderAllProjections"]
    - path: "src/resources/extensions/gsd/engine/projections.test.ts"
      provides: "Unit tests for all projection renderers"
  key_links:
    - from: "src/resources/extensions/gsd/workflow-projections.ts"
      to: "src/resources/extensions/gsd/gsd-db.ts"
      via: "reads task/slice/milestone rows via _getAdapter()"
      pattern: "_getAdapter\\(\\)"
    - from: "src/resources/extensions/gsd/workflow-projections.ts"
      to: "src/resources/extensions/gsd/atomic-write.ts"
      via: "atomicWriteSync for safe file writes"
      pattern: "atomicWriteSync"
---

<objective>
Build projection renderers that produce PLAN.md, ROADMAP.md, SUMMARY.md, and STATE.md from database rows, making markdown files read-only views of engine state.

Purpose: Projections are Layer 3 of the architecture — human-readable, git-friendly, regenerable views. They replace the current system where markdown IS the state, eliminating the split-brain problem.
Output: workflow-projections.ts with 5 renderer functions, plus tests proving byte-compatible output with existing formats.
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
<!-- Existing formats to match -->

From src/resources/extensions/gsd/doctor.ts lines 88-135 (buildStateMarkdown — the target format for STATE.md):
```typescript
function buildStateMarkdown(state: GSDState): string {
  // Produces:
  // # GSD State
  // **Active Milestone:** M001: Title
  // **Active Slice:** S01: Title
  // **Phase:** executing
  // **Requirements Status:** N active · N validated · ...
  // ## Milestone Registry
  // - 🔄 **M001:** Title
  // ## Recent Decisions
  // - Decision text
  // ## Blockers
  // - None
  // ## Next Action
  // Action text
}
```

From src/resources/extensions/gsd/types.ts (target output shapes):
```typescript
export interface TaskPlanEntry {
  id: string; title: string; description: string; done: boolean;
  estimate: string; files?: string[]; verify?: string;
}
export interface RoadmapSliceEntry {
  id: string; title: string; risk: RiskLevel; depends: string[];
  done: boolean; demo: string;
}
export interface SummaryFrontmatter {
  id: string; parent: string; milestone: string; provides: string[];
  requires: SummaryRequires[]; affects: string[]; key_files: string[];
  key_decisions: string[]; patterns_established: string[];
  drill_down_paths: string[]; observability_surfaces: string[];
  duration: string; verification_result: string; completed_at: string;
  blocker_discovered: boolean;
}
```

PLAN.md format (from existing parsePlan in files.ts):
```markdown
# S01: Slice Title

**Goal:** Slice goal text
**Demo:** After this: demo text

## Must-Haves
- Must have item 1

## Tasks
- [x] **T01:** Task title — description
  - Estimate: 30m
  - Files: file1.ts, file2.ts
  - Verify: npm test
- [ ] **T02:** Task title — description
```

ROADMAP.md format (from existing parseRoadmap in files.ts):
```markdown
# M001: Milestone Title

## Vision
Vision text

## Success Criteria
- Criterion 1

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Title | low | — | ✅ | Demo text |
| S02 | Title | med | S01 | ⬜ | Demo text |
```

From src/resources/extensions/gsd/workflow-engine.ts (Plan 01):
```typescript
export interface MilestoneRow { id: string; title: string; status: string; ... }
export interface SliceRow { id: string; milestone_id: string; title: string; status: string; risk: string; depends_on: string; summary: string | null; ... seq: number; }
export interface TaskRow { id: string; slice_id: string; milestone_id: string; title: string; description: string; status: string; estimate: string; summary: string | null; files: string; verify: string | null; ... seq: number; }
```

From src/resources/extensions/gsd/atomic-write.ts:
```typescript
export function atomicWriteSync(filePath: string, content: string, encoding?: BufferEncoding): void;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement PLAN.md and ROADMAP.md projection renderers</name>
  <files>src/resources/extensions/gsd/workflow-projections.ts, src/resources/extensions/gsd/engine/projections.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/files.ts (parsePlan function — understand the format that must be reproduced)
    - src/resources/extensions/gsd/roadmap-slices.ts (parseRoadmapSlices — understand roadmap table format)
    - src/resources/extensions/gsd/workflow-engine.ts (Plan 01 output — row types, query methods)
    - src/resources/extensions/gsd/workflow-engine-schema.ts (Plan 01 output — table columns)
    - src/resources/extensions/gsd/atomic-write.ts (atomicWriteSync signature)
    - src/resources/extensions/gsd/paths.ts (resolveSlicePath, resolveMilestonePath patterns)
  </read_first>
  <behavior>
    - Test: renderPlanContent with 3 tasks (2 done, 1 pending) produces markdown with [x] and [ ] checkboxes
    - Test: renderPlanContent includes "- Estimate:", "- Files:", "- Verify:" sublines when present
    - Test: renderPlanContent omits "- Files:" subline when files is empty array
    - Test: renderRoadmapContent with 2 slices (1 done, 1 pending) produces table with checkmark and empty square
    - Test: renderRoadmapContent includes depends column with "S01" when depends_on has values
    - Test: renderRoadmapContent shows "—" for depends when empty
  </behavior>
  <action>
    Create `src/resources/extensions/gsd/workflow-projections.ts` with:

    1. File header: `// GSD Extension — Projection Renderers (DB → Markdown)` and copyright.

    2. Import `_getAdapter` from `./gsd-db.js`, `atomicWriteSync` from `./atomic-write.js`, `join` from `node:path`, `mkdirSync` from `node:fs`.

    3. Import row types: `MilestoneRow`, `SliceRow`, `TaskRow` from `./workflow-engine.js`.

    4. **renderPlanContent(sliceRow: SliceRow, taskRows: TaskRow[]): string** — pure function, no side effects:
       ```
       # {sliceId}: {sliceTitle}

       **Goal:** {from slice summary or "TBD"}
       **Demo:** After this: {from slice or "TBD"}

       ## Tasks
       - [x] **T01:** Task title — description
         - Estimate: 30m
         - Files: file1.ts, file2.ts
         - Verify: npm test
       - [ ] **T02:** Task title — description
         - Estimate: 1h
       ```
       Rules:
       - Checkbox: `[x]` if status='done', `[ ]` otherwise
       - Bold task ID and title: `**{id}:** {title}`
       - Description after em dash: `— {description}`
       - Sublines indented with 2 spaces: `  - Estimate: {estimate}` (always present if non-empty)
       - `  - Files: {files}` only if files JSON array is non-empty (parse JSON, join with ", ")
       - `  - Verify: {verify}` only if verify is non-null

    5. **renderPlanProjection(basePath: string, milestoneId: string, sliceId: string): void**
       - Query DB for slice row and task rows (ordered by seq)
       - Call renderPlanContent
       - Write to `{basePath}/.gsd/milestones/{milestoneId}/slices/{sliceId}/{sliceId}-PLAN.md` via `atomicWriteSync`
       - Create directories if needed with `mkdirSync({ recursive: true })`

    6. **renderRoadmapContent(milestoneRow: MilestoneRow, sliceRows: SliceRow[]): string** — pure function:
       ```
       # {milestoneId}: {milestoneTitle}

       ## Vision
       {milestone title or TBD}

       ## Slice Overview
       | ID | Slice | Risk | Depends | Done | After this |
       |----|-------|------|---------|------|------------|
       | S01 | Title | low | — | ✅ | Demo text |
       | S02 | Title | med | S01 | ⬜ | Demo text |
       ```
       Rules:
       - Done column: `✅` if status='done', `⬜` otherwise
       - Depends column: parse depends_on JSON array, join with ", ", or "—" if empty
       - Risk column: lowercase (low, med, high)

    7. **renderRoadmapProjection(basePath: string, milestoneId: string): void**
       - Query DB for milestone row and slice rows (ordered by seq)
       - Call renderRoadmapContent
       - Write to `{basePath}/.gsd/milestones/{milestoneId}/{milestoneId}-ROADMAP.md` via `atomicWriteSync`

    Create test file `src/resources/extensions/gsd/engine/projections.test.ts`:
    - Test renderPlanContent and renderRoadmapContent pure functions
    - Use mock row data (no DB needed for content tests)
    - 6 test cases per behavior list
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/projections.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-projections.ts exports `renderPlanContent` function
    - workflow-projections.ts exports `renderPlanProjection` function
    - workflow-projections.ts exports `renderRoadmapContent` function
    - workflow-projections.ts exports `renderRoadmapProjection` function
    - renderPlanContent output contains `- [x] **T` for done tasks
    - renderPlanContent output contains `- [ ] **T` for pending tasks
    - renderRoadmapContent output contains `| ID | Slice | Risk |`
    - All 6+ tests pass
  </acceptance_criteria>
  <done>PLAN.md and ROADMAP.md projection renderers produce format-compatible markdown from DB rows, with [x]/[ ] checkboxes and roadmap tables matching existing format.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement SUMMARY.md, STATE.md, and renderAllProjections</name>
  <files>src/resources/extensions/gsd/workflow-projections.ts, src/resources/extensions/gsd/engine/projections.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/workflow-projections.ts (Task 1 output — existing renderers)
    - src/resources/extensions/gsd/doctor.ts lines 88-135 (buildStateMarkdown — reference STATE.md format)
    - src/resources/extensions/gsd/templates/state.md (STATE.md template)
    - src/resources/extensions/gsd/types.ts (SummaryFrontmatter, GSDState interfaces)
    - src/resources/extensions/gsd/workflow-engine.ts (deriveState method)
  </read_first>
  <behavior>
    - Test: renderSummaryContent produces frontmatter with id, parent, milestone fields
    - Test: renderSummaryContent includes "## What Happened" section with summary text
    - Test: renderStateContent with active milestone/slice produces matching STATE.md format
    - Test: renderStateContent with empty DB produces "None" for active milestone/slice
    - Test: renderAllProjections calls all individual renderers (mock verification)
    - Test: regenerateIfMissing regenerates a deleted projection file from DB
  </behavior>
  <action>
    Add to `src/resources/extensions/gsd/workflow-projections.ts`:

    8. **renderSummaryContent(taskRow: TaskRow, sliceId: string, milestoneId: string): string** — pure function:
       ```
       ---
       id: T01
       parent: S01
       milestone: M001
       provides: []
       requires: []
       affects: []
       key_files: []
       key_decisions: []
       patterns_established: []
       drill_down_paths: []
       observability_surfaces: []
       duration: ""
       verification_result: ""
       completed_at: {task.completed_at}
       blocker_discovered: false
       ---

       # T01: {task.title}

       ## What Happened
       {task.summary or "No summary recorded."}
       ```

    9. **renderSummaryProjection(basePath: string, milestoneId: string, sliceId: string, taskId: string): void**
       - Query task row from DB
       - Call renderSummaryContent
       - Write to `{basePath}/.gsd/milestones/{milestoneId}/slices/{sliceId}/tasks/{taskId}-SUMMARY.md`

    10. **renderStateContent(state: GSDState): string** — matches `buildStateMarkdown` output format exactly:
        ```
        # GSD State

        **Active Milestone:** {id}: {title} or "None"
        **Active Slice:** {id}: {title} or "None"
        **Phase:** {phase}
        {optional: **Requirements Status:** N active · N validated · ...}

        ## Milestone Registry
        - 🔄 **M001:** Title  (for active)
        - ✅ **M002:** Title  (for complete)
        - ⬜ **M003:** Title  (for pending)
        - ⏸️ **M004:** Title  (for parked)

        ## Recent Decisions
        - Decision text (or "- None recorded")

        ## Blockers
        - Blocker text (or "- None")

        ## Next Action
        Action text (or "None")
        ```

    11. **renderStateProjection(basePath: string): void**
       - Import and call `getEngine(basePath).deriveState()`
       - Call renderStateContent
       - Write to `{basePath}/.gsd/STATE.md` via `atomicWriteSync`

    12. **renderAllProjections(basePath: string, milestoneId: string): void**
       - Query all slices for milestone
       - For each slice, call renderPlanProjection
       - Call renderRoadmapProjection for the milestone
       - For each completed task, call renderSummaryProjection
       - Call renderStateProjection
       - All calls wrapped in try/catch — projection failure is non-fatal per D-02, log to stderr

    13. **regenerateIfMissing(basePath: string, milestoneId: string, sliceId: string, fileType: 'PLAN' | 'ROADMAP' | 'SUMMARY' | 'STATE'): boolean**
       - Check if the expected file exists on disk
       - If missing, call the appropriate renderer to regenerate it
       - Return true if regenerated, false if already existed
       - This satisfies PROJ-05 (corrupted/deleted projections regenerate on demand)

    Add tests to `src/resources/extensions/gsd/engine/projections.test.ts`:
    - Test renderSummaryContent and renderStateContent pure functions
    - Test regenerateIfMissing with a temp directory
    - 6 additional test cases
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/projections.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - workflow-projections.ts exports `renderSummaryContent` function
    - workflow-projections.ts exports `renderSummaryProjection` function
    - workflow-projections.ts exports `renderStateContent` function
    - workflow-projections.ts exports `renderStateProjection` function
    - workflow-projections.ts exports `renderAllProjections` function
    - workflow-projections.ts exports `regenerateIfMissing` function
    - renderStateContent output contains `# GSD State`
    - renderStateContent output contains `**Active Milestone:**`
    - renderStateContent output contains `## Milestone Registry`
    - All 12+ tests pass
  </acceptance_criteria>
  <done>All 4 projection types (PLAN, ROADMAP, SUMMARY, STATE) render from DB state. renderAllProjections regenerates everything for a milestone. regenerateIfMissing handles corrupted/deleted files per PROJ-05.</done>
</task>

</tasks>

<verification>
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/projections.test.ts` passes (12+ tests)
- renderPlanContent produces [x]/[ ] checkbox format matching existing PLAN.md structure
- renderRoadmapContent produces table format matching existing ROADMAP.md structure
- renderStateContent produces STATE.md matching buildStateMarkdown output format
- renderAllProjections handles failures non-fatally per D-02
</verification>

<success_criteria>
- All 5 projection functions (PLAN, ROADMAP, SUMMARY, STATE, all) work correctly
- Output formats are byte-compatible with existing markdown formats
- regenerateIfMissing can recreate deleted projection files from DB
- All projection write failures are non-fatal (logged to stderr, not thrown)
- 12+ tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/01-engine-foundation/1-03-SUMMARY.md`
</output>
