---
phase: 02-sync-prompt-migration
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - src/resources/extensions/gsd/prompts/execute-task.md
  - src/resources/extensions/gsd/prompts/complete-slice.md
  - src/resources/extensions/gsd/prompts/plan-slice.md
  - src/resources/extensions/gsd/engine/prompt-migration.test.ts
autonomous: true
requirements: [PMG-01, PMG-02, PMG-03]
must_haves:
  truths:
    - "execute-task.md instructs agents to call gsd_complete_task tool, not edit checkboxes"
    - "complete-slice.md instructs agents to call gsd_complete_slice tool, not mark roadmap checkbox"
    - "plan-slice.md instructs agents to call gsd_plan_slice after writing plan files"
    - "No prompt contains 'change [ ] to [x]' or 'mark checkbox' instructions"
  artifacts:
    - path: "src/resources/extensions/gsd/prompts/execute-task.md"
      provides: "Tool-call instruction for task completion"
      contains: "gsd_complete_task"
    - path: "src/resources/extensions/gsd/prompts/complete-slice.md"
      provides: "Tool-call instruction for slice completion"
      contains: "gsd_complete_slice"
    - path: "src/resources/extensions/gsd/prompts/plan-slice.md"
      provides: "Tool-call instruction for slice planning"
      contains: "gsd_plan_slice"
    - path: "src/resources/extensions/gsd/engine/prompt-migration.test.ts"
      provides: "Content assertion tests for all three prompts"
  key_links:
    - from: "src/resources/extensions/gsd/prompts/execute-task.md"
      to: "src/resources/extensions/gsd/bootstrap/workflow-tools.ts"
      via: "Tool name reference: gsd_complete_task"
      pattern: "gsd_complete_task"
    - from: "src/resources/extensions/gsd/prompts/complete-slice.md"
      to: "src/resources/extensions/gsd/bootstrap/workflow-tools.ts"
      via: "Tool name reference: gsd_complete_slice"
      pattern: "gsd_complete_slice"
    - from: "src/resources/extensions/gsd/prompts/plan-slice.md"
      to: "src/resources/extensions/gsd/bootstrap/workflow-tools.ts"
      via: "Tool name reference: gsd_plan_slice"
      pattern: "gsd_plan_slice"
---

<objective>
Migrate three highest-traffic prompts from checkbox-edit instructions to tool-call instructions.

Purpose: Agents must call engine tools (gsd_complete_task, gsd_complete_slice, gsd_plan_slice) instead of manually editing markdown files. This makes the engine the authoritative state source and enables telemetry tracking of tool adoption. Hard switch per D-07 — no fallback language.

Output: Three updated prompt files and content-assertion tests verifying tool instructions are present and checkbox-edit instructions are removed.
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

<interfaces>
<!-- Tool names from workflow-tools.ts that prompts must reference -->

From src/resources/extensions/gsd/bootstrap/workflow-tools.ts:
- Tool name: "gsd_complete_task" — params: milestoneId, sliceId, taskId, summary
- Tool name: "gsd_complete_slice" — params: milestoneId, sliceId, summary, uat_result
- Tool name: "gsd_plan_slice" — params: milestoneId, sliceId, tasks (array)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Content-assertion tests for prompt migration</name>
  <files>src/resources/extensions/gsd/engine/prompt-migration.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/prompts/execute-task.md (current content — identify exact lines to change)
    - src/resources/extensions/gsd/prompts/complete-slice.md (current content — identify exact lines to change)
    - src/resources/extensions/gsd/prompts/plan-slice.md (current content — identify exact lines to change)
    - src/resources/extensions/gsd/bootstrap/workflow-tools.ts (tool names for reference)
    - src/resources/extensions/gsd/engine/manifest.test.ts (test pattern reference)
  </read_first>
  <behavior>
    - execute-task.md contains "gsd_complete_task" string
    - execute-task.md does NOT contain "change `[ ]` to `[x]`" or "Mark {{taskId}} done"
    - complete-slice.md contains "gsd_complete_slice" string
    - complete-slice.md does NOT contain "Mark {{sliceId}} done" or "change `[ ]` to `[x]`"
    - plan-slice.md contains "gsd_plan_slice" string
    - plan-slice.md step 8 exists with tool-call instruction (additive, after steps 6-7)
  </behavior>
  <action>
Create src/resources/extensions/gsd/engine/prompt-migration.test.ts:

```typescript
// GSD-2 Single-Writer State Architecture — Prompt migration content assertions
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Resolve prompt paths relative to this test file's location
const promptsDir = join(import.meta.dirname, "..", "prompts");

describe("prompt-migration", () => {
  describe("execute-task.md (PMG-01)", () => {
    let content: string;
    it("loads prompt file", () => {
      content = readFileSync(join(promptsDir, "execute-task.md"), "utf-8");
    });
    it("contains gsd_complete_task tool instruction", () => {
      assert.ok(content.includes("gsd_complete_task"), "must reference gsd_complete_task tool");
    });
    it("does not contain checkbox edit instruction", () => {
      assert.ok(!content.includes("change `[ ]` to `[x]`"), "must not contain checkbox toggle instruction");
      assert.ok(!content.match(/Mark.*done.*PLAN/i), "must not contain 'Mark ... done in PLAN'");
    });
  });

  describe("complete-slice.md (PMG-02)", () => {
    let content: string;
    it("loads prompt file", () => {
      content = readFileSync(join(promptsDir, "complete-slice.md"), "utf-8");
    });
    it("contains gsd_complete_slice tool instruction", () => {
      assert.ok(content.includes("gsd_complete_slice"), "must reference gsd_complete_slice tool");
    });
    it("does not contain roadmap checkbox edit instruction", () => {
      assert.ok(!content.includes("change `[ ]` to `[x]`"), "must not contain checkbox toggle instruction");
      assert.ok(!content.match(/Mark.*done.*roadmap/i), "must not contain 'Mark ... done in roadmap'");
    });
  });

  describe("plan-slice.md (PMG-03)", () => {
    let content: string;
    it("loads prompt file", () => {
      content = readFileSync(join(promptsDir, "plan-slice.md"), "utf-8");
    });
    it("contains gsd_plan_slice tool instruction", () => {
      assert.ok(content.includes("gsd_plan_slice"), "must reference gsd_plan_slice tool");
    });
    it("still contains file-write steps (additive, not replacement)", () => {
      // plan-slice tool call is additive — files are still written, tool registers plan in DB
      assert.ok(content.includes("{{outputPath}}") || content.includes("Write"), "must still have file-write instructions");
    });
  });
});
```

These tests will FAIL initially because the prompts still have the old checkbox instructions. This is the RED phase.

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts`
Confirm tests fail (RED).
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/engine/prompt-migration.test.ts exists
    - File contains at least 6 test assertions across 3 describe blocks
    - File contains "gsd_complete_task", "gsd_complete_slice", "gsd_plan_slice" strings
  </acceptance_criteria>
  <done>Content-assertion test file exists with failing tests for all three prompts</done>
</task>

<task type="auto">
  <name>Task 2: Update three prompts with tool-call instructions</name>
  <files>src/resources/extensions/gsd/prompts/execute-task.md, src/resources/extensions/gsd/prompts/complete-slice.md, src/resources/extensions/gsd/prompts/plan-slice.md</files>
  <read_first>
    - src/resources/extensions/gsd/prompts/execute-task.md (full file — find exact step 16 to replace)
    - src/resources/extensions/gsd/prompts/complete-slice.md (full file — find exact step 10 to replace)
    - src/resources/extensions/gsd/prompts/plan-slice.md (full file — find exact steps 6-7, add step 8)
    - src/resources/extensions/gsd/bootstrap/workflow-tools.ts (tool names and param names for accuracy)
  </read_first>
  <action>
**execute-task.md (PMG-01):**

Find the step that says something like:
```
16. Mark {{taskId}} done in `{{planPath}}` (change `[ ]` to `[x]`)
```

Replace it with:
```
16. Call `gsd_complete_task` with milestone_id, slice_id, task_id, and a summary of what was accomplished. This is your final required step — do NOT manually edit PLAN.md checkboxes. The tool marks the task complete, updates the DB, and renders PLAN.md automatically.
```

Also look for any step that says "Write summary" to a file path — if step 15 instructs writing a summary file, that is now handled by the tool's summary parameter. Replace step 15 with:
```
15. (Handled by tool) The summary you provide to `gsd_complete_task` is stored in the engine DB and rendered to projections automatically.
```

Or if step 15 is more complex, just ensure the tool call in step 16 makes clear the summary goes through the tool.

Keep step 17 ("Do not run git commands...") unchanged.

**complete-slice.md (PMG-02):**

Find the step that says something like:
```
10. Mark {{sliceId}} done in `{{roadmapPath}}` (change `[ ]` to `[x]`)
```

Replace with:
```
10. Call `gsd_complete_slice` with milestone_id, slice_id, the slice summary, and the UAT result. Do NOT manually mark the roadmap checkbox — the tool writes to the DB and renders the ROADMAP.md projection automatically.
```

**plan-slice.md (PMG-03):**

This is ADDITIVE, not replacement. Steps 6-7 still write plan files. Add step 8 after step 7:

Find the existing steps 6-7 that say something like:
```
6. Write `{{outputPath}}`
7. Write individual task plans in `{{slicePath}}/tasks/`: `T01-PLAN.md`, `T02-PLAN.md`, etc.
```

After step 7, add:
```
8. Call `gsd_plan_slice` with milestone_id, slice_id, and the task list derived from the plans you just wrote. This registers the plan in the engine DB and renders projections. Do NOT skip this step — the engine must know the task structure for tool-based completion to work.
```

Renumber any subsequent steps if needed.

For all three files: do NOT add any fallback language like "if tool is unavailable, edit the file instead". Per D-07 this is a hard switch. The dual-write bridge from Phase 1 catches divergence if an agent ignores the instruction.

Run tests: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts`
  </action>
  <verify>
    <automated>node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - src/resources/extensions/gsd/prompts/execute-task.md contains "gsd_complete_task"
    - src/resources/extensions/gsd/prompts/execute-task.md does NOT contain "change `[ ]` to `[x]`"
    - src/resources/extensions/gsd/prompts/complete-slice.md contains "gsd_complete_slice"
    - src/resources/extensions/gsd/prompts/complete-slice.md does NOT contain "change `[ ]` to `[x]`"
    - src/resources/extensions/gsd/prompts/plan-slice.md contains "gsd_plan_slice"
    - src/resources/extensions/gsd/prompts/plan-slice.md still contains "{{outputPath}}" (file-write steps preserved)
    - All prompt-migration tests pass (exit code 0)
  </acceptance_criteria>
  <done>All three prompts instruct tool calls, no checkbox-edit instructions remain, content-assertion tests green</done>
</task>

</tasks>

<verification>
Run prompt migration tests and all engine tests:
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/prompt-migration.test.ts
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/engine/*.test.ts
```
</verification>

<success_criteria>
- execute-task.md references gsd_complete_task, no checkbox editing
- complete-slice.md references gsd_complete_slice, no checkbox editing
- plan-slice.md references gsd_plan_slice (additive step 8), file-write steps preserved
- All content-assertion tests pass
</success_criteria>

<output>
After completion, create `.planning/phases/02-sync-prompt-migration/2-03-SUMMARY.md`
</output>
