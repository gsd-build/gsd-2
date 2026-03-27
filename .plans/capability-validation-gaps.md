# Plan: Close Capability Validation Gaps (ADR-004/005)

**Status:** In Progress
**Date:** 2026-03-27
**Branch:** feat/provider-capability-registry
**Related:** ADR-004, ADR-005, capabilities.ts, model-router.ts

## Problem

Only 4 of 16+ unit types have capability validation. Three dispatch paths (direct, guided-flow, hooks) completely bypass capability checks. The planning phase has no forward-looking validation — it can create tasks that the configured model pool can't execute.

## Priority Order

### Layer 1 — Expand `getRequiredToolNames()` (HIGH)
**Files:** `model-router.ts`

Expand tool requirements for all unit types that actually use tools:

| Unit Type | Current Required Tools | Should Be |
|---|---|---|
| execute-task | Bash, Read, Write, Edit | ✓ (correct) |
| execute-plan | Bash, Read, Write, Edit | ✓ (correct) |
| research-milestone | Read | Read, WebSearch, WebFetch |
| research-slice | Read | Read, WebSearch, WebFetch |
| plan-milestone | (none) | Read, Write |
| plan-slice | (none) | Read, Write |
| run-uat | (none) | Read, Bash (+ imageToolResults flag) |
| replan-slice | (none) | Read, Write |
| complete-slice | (none) | Read, Write |
| complete-milestone | (none) | Read, Write |
| rewrite-docs | (none) | Read, Write |
| reactive-execute | (none) | Bash, Read, Write, Edit |

### Layer 2 — Unify Dispatch Paths (CRITICAL)
**Files:** `auto-direct-dispatch.ts`, `guided-flow.ts`, `auto.ts`

All dispatch paths must flow through capability validation:

- **auto-direct-dispatch.ts** — Add `adjustToolSet()` call before `pi.sendMessage()`
- **guided-flow.ts:dispatchWorkflow()** — Add `adjustToolSet()` after `pi.setModel()`, apply capability overrides
- **auto.ts:dispatchHookUnit()** — Add `adjustToolSet()` after hook model is applied

### Layer 3 — Plan-Time Capability Validation (HIGH)
**Files:** `auto-model-selection.ts` (new export), `auto-prompts.ts`, plan-slice prompt

Add a `validatePlanCapabilities()` function that:
1. Takes the available model pool + their APIs
2. For each task in the plan, infers capability requirements from:
   - Task description keywords (screenshot, image, diagram → imageToolResults)
   - File extensions in task files (.png, .svg → imageToolResults)
   - Tool references in task descriptions
3. Checks if ANY model in the pool can satisfy each requirement
4. Returns warnings for unresolvable gaps
5. Inject warnings into plan output / notify user

### Layer 4 — Replan Context Enrichment (MEDIUM)
**Files:** `auto-prompts.ts` (buildReplanSlicePrompt), `auto-post-unit.ts`

When a task fails:
- Check if failure correlates with a capability mismatch (tool was filtered, model couldn't handle image)
- Include this in the replan context: "Task T3 failed — the execution model does not support imageToolResults. Consider restructuring to avoid image-dependent tools."

## Execution Order

1. Layer 1 — getRequiredToolNames expansion + tests
2. Layer 2 — Unify dispatch paths + tests
3. Layer 3 — Plan-time validation function + integration
4. Layer 4 — Replan enrichment

## Testing Strategy

- Unit tests for expanded getRequiredToolNames() (all unit types)
- Unit tests for adjustToolSet() in each dispatch path
- Integration test: plan-slice → capability warning when model pool can't handle images
- Integration test: direct-dispatch applies tool filtering
- Integration test: hook dispatch applies tool filtering

## Success Criteria

- All 16+ unit types have accurate tool requirements
- All 3 dispatch paths (direct, guided-flow, hooks) apply capability validation
- Planning phase emits warnings when tasks exceed model pool capabilities
- Replan context includes capability mismatch information
- All existing tests pass, no regressions
