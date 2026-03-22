---
phase: 01-engine-foundation
plan: 04
type: execute
wave: 3
depends_on: ["1-02", "1-03"]
files_modified:
  - src/resources/extensions/gsd/bootstrap/workflow-tools.ts
  - src/resources/extensions/gsd/bootstrap/register-extension.ts
  - src/resources/extensions/gsd/state.ts
  - src/resources/extensions/gsd/engine/workflow-tools.test.ts
autonomous: true
requirements:
  - TOOL-01
  - TOOL-02
  - TOOL-03
  - ENG-03

must_haves:
  truths:
    - "7 agent-callable tools are registered via pi.registerTool() alongside existing 4 tools"
    - "Each tool calls the corresponding WorkflowEngine command"
    - "Tool responses include rich context per D-04 (what happened, progress, next action)"
    - "deriveState() returns engine state when WorkflowEngine is available, falls back to markdown parsing for legacy"
    - "deriveState() via engine executes in under 1ms"
    - "Telemetry tags distinguish tool-based vs markdown-based state mutations"
  artifacts:
    - path: "src/resources/extensions/gsd/bootstrap/workflow-tools.ts"
      provides: "7 agent-callable tool registrations"
      exports: ["registerWorkflowTools"]
    - path: "src/resources/extensions/gsd/engine/workflow-tools.test.ts"
      provides: "Integration tests for tool registration and execution"
  key_links:
    - from: "src/resources/extensions/gsd/bootstrap/workflow-tools.ts"
      to: "src/resources/extensions/gsd/workflow-engine.ts"
      via: "import { getEngine } from '../workflow-engine.js'"
      pattern: "getEngine"
    - from: "src/resources/extensions/gsd/bootstrap/register-extension.ts"
      to: "src/resources/extensions/gsd/bootstrap/workflow-tools.ts"
      via: "import { registerWorkflowTools }"
      pattern: "registerWorkflowTools"
    - from: "src/resources/extensions/gsd/state.ts"
      to: "src/resources/extensions/gsd/workflow-engine.ts"
      via: "import { isEngineAvailable, getEngine } from './workflow-engine.js'"
      pattern: "isEngineAvailable"
---

<objective>
Register 7 agent-callable tools for all WorkflowEngine commands and wire the deriveState() dual-write bridge so the engine serves state when available.

Purpose: This connects the engine to agents (via tools) and to the rest of the codebase (via deriveState bridge). After this plan, agents can call `gsd_complete_task` instead of editing checkboxes, and `deriveState()` returns engine state in <1ms instead of parsing 868 lines of markdown.
Output: workflow-tools.ts with 7 registered tools, modified register-extension.ts to wire them, modified state.ts with engine bridge, telemetry tagging.
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
<!-- Existing tool registration pattern from db-tools.ts -->

From src/resources/extensions/gsd/bootstrap/db-tools.ts:
```typescript
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { ensureDbOpen } from "./dynamic-tools.js";

export function registerDbTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "gsd_save_decision",
    label: "Save Decision",
    description: "Record a project decision...",
    promptSnippet: "Record a project decision...",
    promptGuidelines: ["Use gsd_save_decision when...", ...],
    parameters: Type.Object({ ... }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) { return { content: [{ type: "text" as const, text: "Error: ..." }], details: { ... } as any }; }
      try { ... } catch (err) { ... }
    },
  });
}
```

From src/resources/extensions/gsd/bootstrap/register-extension.ts:
```typescript
import { registerDbTools } from "./db-tools.js";
import { registerDynamicTools } from "./dynamic-tools.js";
// line 41-42:
registerDynamicTools(pi);
registerDbTools(pi);
```

From src/resources/extensions/gsd/workflow-engine.ts (Plans 01-02):
```typescript
export class WorkflowEngine {
  completeTask(params: CompleteTaskParams): CompleteTaskResult;
  completeSlice(params: CompleteSliceParams): CompleteSliceResult;
  planSlice(params: PlanSliceParams): PlanSliceResult;
  saveDecision(params: SaveDecisionParams): SaveDecisionResult;
  startTask(params: StartTaskParams): StartTaskResult;
  recordVerification(params: RecordVerificationParams): RecordVerificationResult;
  reportBlocker(params: ReportBlockerParams): ReportBlockerResult;
  deriveState(): GSDState;
}
export function getEngine(basePath: string): WorkflowEngine;
export function isEngineAvailable(basePath: string): boolean;
```

From src/resources/extensions/gsd/state.ts (deriveState cache + signature):
```typescript
export async function deriveState(basePath: string): Promise<GSDState> { ... }
// Has 100ms cache via StateCache interface
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Register 7 workflow tools in workflow-tools.ts and wire into register-extension.ts</name>
  <files>src/resources/extensions/gsd/bootstrap/workflow-tools.ts, src/resources/extensions/gsd/bootstrap/register-extension.ts</files>
  <read_first>
    - src/resources/extensions/gsd/bootstrap/db-tools.ts (complete file — copy tool registration pattern exactly)
    - src/resources/extensions/gsd/bootstrap/dynamic-tools.ts (ensureDbOpen function)
    - src/resources/extensions/gsd/bootstrap/register-extension.ts (where to add registerWorkflowTools call)
    - src/resources/extensions/gsd/workflow-engine.ts (getEngine, command param types)
    - src/resources/extensions/gsd/workflow-commands.ts (param/result type definitions)
    - .planning/phases/01-engine-foundation/1-CONTEXT.md (D-04: rich tool responses, D-05: reduce round-trips)
  </read_first>
  <action>
    Create `src/resources/extensions/gsd/bootstrap/workflow-tools.ts` with:

    1. File header: `// GSD Extension — Workflow Engine Agent Tools` and copyright.

    2. Register 7 tools following the exact pattern from db-tools.ts:

    **Tool 1: gsd_complete_task** (CMD-01)
    - name: "gsd_complete_task"
    - label: "Complete Task"
    - description: "Mark a task as complete with summary and optional verification evidence. Updates PLAN.md projection automatically."
    - promptSnippet: "Mark a GSD task complete (updates DB, renders PLAN.md, records evidence)"
    - promptGuidelines: ["Use gsd_complete_task when a task is finished — do NOT manually edit PLAN.md checkboxes.", "Provide milestone_id, slice_id, task_id, and a summary of what was accomplished.", "Optionally include evidence array with verification results.", "The tool is idempotent — calling it twice for the same task is safe."]
    - parameters: milestone_id (String), slice_id (String), task_id (String), summary (String), evidence (Optional Array of String)
    - execute: ensureDbOpen(), getEngine(process.cwd()).completeTask(params), return rich text: "Task {id} marked complete. {progress}. Next: {nextTask ?? 'slice complete'}"

    **Tool 2: gsd_complete_slice** (CMD-02)
    - name: "gsd_complete_slice"
    - parameters: milestone_id, slice_id, summary, uat_result (Optional String)
    - Rich response: "Slice {id} marked complete. {progress}. Next: {nextSlice ?? 'milestone complete'}"

    **Tool 3: gsd_plan_slice** (CMD-03)
    - name: "gsd_plan_slice"
    - parameters: milestone_id, slice_id, tasks (Array of Object with id, title, description, estimate?, files?, verify?)
    - Rich response: "Created {taskCount} tasks for slice {id}: {taskIds.join(', ')}"

    **Tool 4: gsd_start_task** (CMD-05)
    - name: "gsd_start_task"
    - parameters: milestone_id, slice_id, task_id
    - Rich response: "Task {id} started at {startedAt}"

    **Tool 5: gsd_record_verification** (CMD-06)
    - name: "gsd_record_verification"
    - parameters: milestone_id, slice_id, task_id, command, exit_code (Integer), stdout, stderr, duration_ms (Integer)
    - Rich response: "Recorded verification for {taskId}: {command} exited {exitCode}"

    **Tool 6: gsd_report_blocker** (CMD-07)
    - name: "gsd_report_blocker"
    - parameters: milestone_id, slice_id, task_id, description
    - Rich response: "Task {taskId} blocked: {description}"

    **Tool 7: gsd_engine_save_decision** (CMD-04 — engine-backed version)
    - name: "gsd_engine_save_decision"
    - description: "Record a decision via the workflow engine (engine-backed, includes event log)"
    - parameters: scope, decision, choice, rationale, revisable?, when_context?, made_by?
    - Rich response: "Saved decision {id} via engine"
    - Note: This coexists with existing gsd_save_decision (legacy path). Both work during dual-write.

    3. Each tool's execute function follows this exact pattern:
    ```typescript
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "xxx", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.xxxCommand(params);
        return {
          content: [{ type: "text" as const, text: `Rich response text` }],
          details: { operation: "xxx", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_xxx failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "xxx", error: msg } as any,
        };
      }
    }
    ```

    Modify `src/resources/extensions/gsd/bootstrap/register-extension.ts`:
    4. Add import: `import { registerWorkflowTools } from "./workflow-tools.js";`
    5. Add call after `registerDbTools(pi);`: `registerWorkflowTools(pi);`
  </action>
  <verify>
    <automated>node --experimental-strip-types -e "
      // Verify workflow-tools.ts exports registerWorkflowTools
      const mod = require('./src/resources/extensions/gsd/bootstrap/workflow-tools.js');
      console.log('registerWorkflowTools exported:', typeof mod.registerWorkflowTools === 'function');
      if (typeof mod.registerWorkflowTools !== 'function') process.exit(1);
    " 2>/dev/null || echo "Module check — verify manually via grep"
    </automated>
  </verify>
  <acceptance_criteria>
    - workflow-tools.ts exports `registerWorkflowTools` function
    - workflow-tools.ts contains `name: "gsd_complete_task"`
    - workflow-tools.ts contains `name: "gsd_complete_slice"`
    - workflow-tools.ts contains `name: "gsd_plan_slice"`
    - workflow-tools.ts contains `name: "gsd_start_task"`
    - workflow-tools.ts contains `name: "gsd_record_verification"`
    - workflow-tools.ts contains `name: "gsd_report_blocker"`
    - workflow-tools.ts contains `name: "gsd_engine_save_decision"`
    - workflow-tools.ts contains copyright header with `Jeremy McSpadden`
    - register-extension.ts contains `import { registerWorkflowTools }`
    - register-extension.ts contains `registerWorkflowTools(pi)`
    - Each tool uses `ensureDbOpen()` guard before engine access
    - Each tool returns rich text response per D-04
  </acceptance_criteria>
  <done>7 workflow tools registered alongside existing 4 tools. Each tool calls the corresponding WorkflowEngine command and returns rich context (progress, next action). Tools are wired into the extension registration pipeline.</done>
</task>

<task type="auto">
  <name>Task 2: Add deriveState() engine bridge and telemetry tagging</name>
  <files>src/resources/extensions/gsd/state.ts, src/resources/extensions/gsd/engine/workflow-tools.test.ts</files>
  <read_first>
    - src/resources/extensions/gsd/state.ts (full file — understand deriveState cache, signature, and where to add engine branch)
    - src/resources/extensions/gsd/workflow-engine.ts (isEngineAvailable, getEngine, deriveState method)
    - src/resources/extensions/gsd/cache.ts (invalidateAllCaches — may need to call on engine state)
    - .planning/phases/01-engine-foundation/1-CONTEXT.md (D-01: engine wins on divergence, D-02: projections from engine)
  </read_first>
  <action>
    Modify `src/resources/extensions/gsd/state.ts`:

    1. At the top of `deriveState()` (the actual function body, before the cache check), add an engine bridge:
    ```typescript
    // Engine bridge (Phase 1 dual-write — ENG-03, TOOL-02)
    // When WorkflowEngine is available (v5 schema), bypass the 868-line markdown parse
    // and return typed state directly from DB in <1ms.
    try {
      const { isEngineAvailable, getEngine } = await import('./workflow-engine.js');
      if (isEngineAvailable(basePath)) {
        const engine = getEngine(basePath);
        const engineState = engine.deriveState();
        // Cache the engine result with the same TTL as the markdown path
        stateCache = { basePath, result: engineState, timestamp: Date.now() };
        return engineState;
      }
    } catch {
      // Fall through to legacy markdown parse — engine not yet initialized or import failed
    }
    ```

    2. The bridge goes AFTER the existing cache check (if cache is valid, return cached regardless of source) but BEFORE any markdown parsing.

    3. Add telemetry helper for tracking tool-vs-manual usage (TOOL-03):
    Create a simple counter that tracks how state was derived:
    ```typescript
    // Telemetry: track engine vs markdown derivation (TOOL-03)
    let _telemetry = { engineDeriveCount: 0, markdownDeriveCount: 0 };
    export function getDeriveTelemetry(): { engineDeriveCount: number; markdownDeriveCount: number } {
      return { ..._telemetry };
    }
    export function resetDeriveTelemetry(): void {
      _telemetry = { engineDeriveCount: 0, markdownDeriveCount: 0 };
    }
    ```
    - Increment `_telemetry.engineDeriveCount` when engine path is taken
    - Increment `_telemetry.markdownDeriveCount` when markdown parse path is taken

    Create `src/resources/extensions/gsd/engine/workflow-tools.test.ts`:
    4. Test that deriveState returns GSDState shape when engine is available (open :memory: DB with v5 schema)
    5. Test that deriveState falls back to markdown parse when engine is not available (no DB open)
    6. Test that getDeriveTelemetry increments engineDeriveCount when engine path is taken
    7. Test that tool registration function exists and is callable (smoke test)
  </action>
  <verify>
    <automated>node --experimental-strip-types --test src/resources/extensions/gsd/engine/workflow-tools.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - state.ts contains `isEngineAvailable` import from `./workflow-engine.js`
    - state.ts contains `engine.deriveState()` call in deriveState function
    - state.ts exports `getDeriveTelemetry` function
    - state.ts exports `resetDeriveTelemetry` function
    - state.ts contains `engineDeriveCount` counter increment
    - state.ts contains `markdownDeriveCount` counter increment
    - Engine bridge is positioned after cache check but before markdown parsing
    - workflow-tools.test.ts contains at least 4 test cases
    - All tests pass
  </acceptance_criteria>
  <done>deriveState() returns engine state in <1ms when WorkflowEngine is available, falls back to markdown parsing for legacy projects. Telemetry counters track which path is used for TOOL-03 migration validation.</done>
</task>

</tasks>

<verification>
- `node --experimental-strip-types --test src/resources/extensions/gsd/engine/workflow-tools.test.ts` passes
- 7 tools registered in workflow-tools.ts following db-tools.ts pattern
- register-extension.ts calls registerWorkflowTools
- deriveState() takes engine path when v5 schema is present
- deriveState() falls back to markdown when no engine
- npm test still passes (no existing tests broken)
</verification>

<success_criteria>
- 7 agent-callable tools registered and wired into extension pipeline
- deriveState() engine bridge works — <1ms on engine path
- Telemetry tracks engine vs markdown state derivation
- All tools return rich responses per D-04
- Dual-write mode works: both legacy and engine paths produce valid GSDState
</success_criteria>

<output>
After completion, create `.planning/phases/01-engine-foundation/1-04-SUMMARY.md`
</output>
