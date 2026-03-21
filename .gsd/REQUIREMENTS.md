# Requirements

This file is the explicit capability and coverage contract for the project.

## Active

### R001 — All dispatch rules and hooks expressed as objects in a single flat registry with a common shape
- Class: core-capability
- Status: active
- Description: All dispatch rules and hooks expressed as objects in a single flat registry with a common shape
- Why it matters: AI agents modifying GSD's behavior need one place to read and one pattern to follow — not three separate systems with different shapes
- Source: user (#1764)
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: `getRegistry().listRules()` returns 20+ rules all sharing the `UnifiedRule` interface with `name`, `when`, `evaluation`, `where`, `then` fields
- Notes: The registry must be inspectable at runtime — an agent should be able to list all active rules

### R002 — Each dispatch rule has explicit when (event/phase pattern), where (state condition), and then (action) fields instead of opaque match functions
- Class: core-capability
- Status: active
- Description: Each dispatch rule has explicit when (event/phase pattern), where (state condition), and then (action) fields instead of opaque match functions
- Why it matters: when/where/then is self-documenting to an LLM scanning the rule list — no need to read function bodies to understand behavior
- Source: user (#1764)
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: Each `UnifiedRule` has typed `when: RulePhase`, `where` (predicate function), and `then` (action builder) fields — verified by TypeScript compilation and `listRules()` test assertions
- Notes: The existing match functions contain complex async logic (file existence checks, preference reads). The when/where/then shape must accommodate this without losing capability.

### R003 — Post-unit hooks (currently PostUnitHookConfig in preferences) become entries in the unified rule registry
- Class: core-capability
- Status: active
- Description: Post-unit hooks (currently PostUnitHookConfig in preferences) become entries in the unified rule registry
- Why it matters: One system to understand, not two. An AI agent adding a "run linter after task execution" rule uses the same mechanism as a dispatch rule.
- Source: user (#1764)
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: `listRules().filter(r => r.when === "post-unit").length > 0` when preferences have post_unit_hooks configured; hook evaluation delegates to registry
- Notes: Must preserve hook lifecycle: idempotency via artifact checks, retry_on, max_cycles, state persistence

### R004 — Pre-dispatch hooks (currently PreDispatchHookConfig in preferences) become entries in the unified rule registry
- Class: core-capability
- Status: active
- Description: Pre-dispatch hooks (currently PreDispatchHookConfig in preferences) become entries in the unified rule registry
- Why it matters: Same as R003 — one system, not three
- Source: user (#1764)
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: `listRules().filter(r => r.when === "pre-dispatch").length > 0` when preferences have pre_dispatch_hooks configured; pre-dispatch evaluation delegates to registry
- Notes: Pre-dispatch hooks modify/skip/replace — these become rule actions in the unified shape

### R005 — After unification, hook-originated rules retain idempotency (skip if artifact exists), retry_on, max_cycles, and cycle state persistence across crashes
- Class: continuity
- Status: active
- Description: After unification, hook-originated rules retain idempotency (skip if artifact exists), retry_on, max_cycles, and cycle state persistence across crashes
- Why it matters: Hooks are user-configured and have battle-tested lifecycle semantics — breaking them breaks user workflows
- Source: inferred
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: `post-unit-hooks.test.ts` and `retry-state-reset.test.ts` pass unchanged — covering idempotency, retry_on, max_cycles, and cycle state persistence
- Notes: persistHookState/restoreHookState must work with unified state

### R006 — Users can still define post_unit_hooks and pre_dispatch_hooks in .gsd/preferences.md; these are loaded into the unified registry at runtime
- Class: continuity
- Status: active
- Description: Users can still define post_unit_hooks and pre_dispatch_hooks in .gsd/preferences.md; these are loaded into the unified registry at runtime
- Why it matters: Existing user configurations must not break
- Source: inferred
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: preferences.md YAML keys `post_unit_hooks` and `pre_dispatch_hooks` unchanged; `resolvePostUnitHooks()` and `resolvePreDispatchHooks()` still called at evaluation time
- Notes: Preferences shape may evolve but existing configs must still parse

### R007 — Auto-mode emits structured events (dispatch match, guard check, unit start/end, hook fire, state transition) to .gsd/journal/YYYY-MM-DD.jsonl
- Class: core-capability
- Status: active
- Description: Auto-mode emits structured events (dispatch match, guard check, unit start/end, hook fire, state transition) to .gsd/journal/YYYY-MM-DD.jsonl
- Why it matters: AI agents debugging autonomous runs need a causal trace, not grep through activity logs
- Source: user (#1763)
- Primary owning slice: M001-xij4rf/S02
- Supporting slices: none
- Validation: unmapped
- Notes: Append-only, one JSON object per line. Must not measurably slow the auto-loop.

### R008 — Every auto-mode loop iteration gets a unique flowId; all events within that iteration reference it
- Class: core-capability
- Status: active
- Description: Every auto-mode loop iteration gets a unique flowId; all events within that iteration reference it
- Why it matters: Groups related events — "show me everything that happened in this iteration" is one filter
- Source: user (#1763)
- Primary owning slice: M001-xij4rf/S02
- Supporting slices: none
- Validation: unmapped
- Notes: flowId format: timestamp + short random suffix for uniqueness

### R009 — Journal events include a causedBy field referencing the upstream flowId + eventId that triggered them
- Class: core-capability
- Status: active
- Description: Journal events include a causedBy field referencing the upstream flowId + eventId that triggered them
- Why it matters: Enables "why did this happen?" queries — trace any event back through the chain that caused it
- Source: user (#1763)
- Primary owning slice: M001-xij4rf/S02
- Supporting slices: none
- Validation: unmapped
- Notes: causedBy is optional — root events (loop start) have no cause

### R010 — When a rule fires, the journal event includes the rule's stable name (e.g., "summarizing → complete-slice")
- Class: integration
- Status: active
- Description: When a rule fires, the journal event includes the rule's stable name (e.g., "summarizing → complete-slice")
- Why it matters: Connects the journal to the rule registry — an agent reads the journal, sees a rule name, can look up the rule definition
- Source: inferred
- Primary owning slice: M001-xij4rf/S02
- Supporting slices: M001-xij4rf/S01
- Validation: unmapped
- Notes: Rule names must be stable — renaming a rule breaks journal provenance

### R011 — A registered GSD tool that accepts filters (flowId, unitId, ruleId, eventType, time range) and returns matching journal entries
- Class: core-capability
- Status: active
- Description: A registered GSD tool that accepts filters (flowId, unitId, ruleId, eventType, time range) and returns matching journal entries
- Why it matters: AI agents shouldn't need to construct bash+grep+jq queries to debug themselves — the tool is the native interface
- Source: user
- Primary owning slice: M001-xij4rf/S03
- Supporting slices: M001-xij4rf/S02
- Validation: unmapped
- Notes: Ships as gsd_journal_query following the new naming convention from day one

### R012 — Journal files rotate daily (one file per day), old files accumulate but can be pruned
- Class: operability
- Status: active
- Description: Journal files rotate daily (one file per day), old files accumulate but can be pruned
- Why it matters: Prevents unbounded file growth while keeping recent history accessible
- Source: user (#1763)
- Primary owning slice: M001-xij4rf/S02
- Supporting slices: none
- Validation: unmapped
- Notes: No auto-pruning in v1 — just daily rotation

### R013 — All GSD tools follow gsd_concept_action pattern (e.g., gsd_decision_save, gsd_requirement_update, gsd_journal_query)
- Class: quality-attribute
- Status: active
- Description: All GSD tools follow gsd_concept_action pattern (e.g., gsd_decision_save, gsd_requirement_update, gsd_journal_query)
- Why it matters: Predictable naming helps LLMs select the right tool — concept groups related operations, action describes the operation
- Source: user (#1766)
- Primary owning slice: M001-xij4rf/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Constrained by Anthropic API: ^[a-zA-Z0-9_-]{1,128}$

### R014 — Old tool names (gsd_save_decision, gsd_update_requirement, etc.) remain registered as aliases pointing to the same implementation
- Class: continuity
- Status: active
- Description: Old tool names (gsd_save_decision, gsd_update_requirement, etc.) remain registered as aliases pointing to the same implementation
- Why it matters: System prompts, skills, and external references use old names — breaking them breaks existing workflows
- Source: inferred
- Primary owning slice: M001-xij4rf/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Aliases can be removed in a future breaking change release

### R015 — Tests in tests/dispatch-missing-task-plans.test.ts, tests/validate-milestone.test.ts, and dispatch-related sections of tests/auto-loop.test.ts pass unchanged or with minimal adaptation
- Class: quality-attribute
- Status: active
- Description: Tests in tests/dispatch-missing-task-plans.test.ts, tests/validate-milestone.test.ts, and dispatch-related sections of tests/auto-loop.test.ts pass unchanged or with minimal adaptation
- Why it matters: The refactor must not change behavior — tests are the proof
- Source: inferred
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Tests may need import path changes but assertions should hold

### R016 — Tests in tests/post-unit-hooks.test.ts and tests/retry-state-reset.test.ts pass unchanged or with minimal adaptation
- Class: quality-attribute
- Status: active
- Description: Tests in tests/post-unit-hooks.test.ts and tests/retry-state-reset.test.ts pass unchanged or with minimal adaptation
- Why it matters: Same as R015 — behavior preservation
- Source: inferred
- Primary owning slice: M001-xij4rf/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Hook API surface (checkPostUnitHooks, runPreDispatchHooks, etc.) may change but behavior must match

## Deferred

### R020 — Users can define their own when/where/then rules in preferences that extend GSD's behavior
- Class: differentiator
- Status: deferred
- Description: Users can define their own when/where/then rules in preferences that extend GSD's behavior
- Why it matters: Makes GSD's orchestration user-extensible beyond hooks
- Source: research (#1764)
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred because the unified rule system is prerequisite; hooks already cover the main user-extensibility use case

### R021 — Replay autonomous runs from journal data; visualize causal chains
- Class: differentiator
- Status: deferred
- Description: Replay autonomous runs from journal data; visualize causal chains
- Why it matters: Would make debugging even more accessible
- Source: research (#1763)
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Deferred — the query tool covers the primary use case; visualization is polish

## Out of Scope

### R030 — Individual LLM tool invocations within a unit are NOT recorded in the journal
- Class: anti-feature
- Status: out-of-scope
- Description: Individual LLM tool invocations within a unit are NOT recorded in the journal
- Why it matters: Prevents scope confusion — tool calls are already in .gsd/activity/ as full session dumps. The journal is orchestration-level only.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: The journal answers "why was this unit dispatched?" not "what did the LLM do inside the unit?"

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M001-xij4rf/S01 | none | `getRegistry().listRules()` returns 20+ rules all sharing the `UnifiedRule` interface with `name`, `when`, `evaluation`, `where`, `then` fields |
| R002 | core-capability | active | M001-xij4rf/S01 | none | Each `UnifiedRule` has typed `when: RulePhase`, `where` (predicate function), and `then` (action builder) fields — verified by TypeScript compilation and `listRules()` test assertions |
| R003 | core-capability | active | M001-xij4rf/S01 | none | `listRules().filter(r => r.when === "post-unit").length > 0` when preferences have post_unit_hooks configured; hook evaluation delegates to registry |
| R004 | core-capability | active | M001-xij4rf/S01 | none | `listRules().filter(r => r.when === "pre-dispatch").length > 0` when preferences have pre_dispatch_hooks configured; pre-dispatch evaluation delegates to registry |
| R005 | continuity | active | M001-xij4rf/S01 | none | `post-unit-hooks.test.ts` and `retry-state-reset.test.ts` pass unchanged — covering idempotency, retry_on, max_cycles, and cycle state persistence |
| R006 | continuity | active | M001-xij4rf/S01 | none | preferences.md YAML keys `post_unit_hooks` and `pre_dispatch_hooks` unchanged; `resolvePostUnitHooks()` and `resolvePreDispatchHooks()` still called at evaluation time |
| R007 | core-capability | active | M001-xij4rf/S02 | none | unmapped |
| R008 | core-capability | active | M001-xij4rf/S02 | none | unmapped |
| R009 | core-capability | active | M001-xij4rf/S02 | none | unmapped |
| R010 | integration | active | M001-xij4rf/S02 | M001-xij4rf/S01 | unmapped |
| R011 | core-capability | active | M001-xij4rf/S03 | M001-xij4rf/S02 | unmapped |
| R012 | operability | active | M001-xij4rf/S02 | none | unmapped |
| R013 | quality-attribute | active | M001-xij4rf/S04 | none | unmapped |
| R014 | continuity | active | M001-xij4rf/S04 | none | unmapped |
| R015 | quality-attribute | active | M001-xij4rf/S01 | none | unmapped |
| R016 | quality-attribute | active | M001-xij4rf/S01 | none | unmapped |
| R020 | differentiator | deferred | none | none | unmapped |
| R021 | differentiator | deferred | none | none | unmapped |
| R030 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 16
- Mapped to slices: 16
- Validated: 0
- Unmapped active requirements: 0
