---
estimated_steps: 4
estimated_files: 3
skills_used:
  - test
---

# T01: Define unified rule types and build RuleRegistry class

**Slice:** S01 — Unified Rule Engine
**Milestone:** M001-xij4rf

## Description

Create the foundational type system (`rule-types.ts`) and `RuleRegistry` class (`rule-registry.ts`) that will hold all dispatch rules and hooks as a flat list of `UnifiedRule` objects. This is pure new code with no integration into existing modules — the registry can be written and unit-tested in isolation using mock rules.

The registry must support three distinct evaluation strategies: async first-match-wins (for dispatch rules), sync all-matching (for post-unit hooks with lifecycle semantics), and sync all-matching-with-compose (for pre-dispatch hooks). It must also encapsulate mutable hook state (activeHook, hookQueue, cycleCounts, retryPending, retryTrigger) as instance fields, with a module-level singleton accessor so existing code can be migrated to delegate to it in later tasks.

## Steps

1. **Create `src/resources/extensions/gsd/rule-types.ts`** — Define these types:
   - `RulePhase = "dispatch" | "post-unit" | "pre-dispatch"` — the `when` field
   - `RuleEvaluation = "first-match" | "all-matching"` — evaluation strategy
   - `UnifiedRule` interface with fields:
     - `name: string` — stable human-readable identifier (existing names preserved per D005)
     - `when: RulePhase` — which phase/event this rule responds to
     - `evaluation: RuleEvaluation` — how this rule is evaluated relative to peers
     - `where: (...args: any[]) => Promise<any> | any` — the predicate/match function (async for dispatch, sync for hooks)
     - `then: (...args: any[]) => any` — the action builder (may be merged with `where` for dispatch rules where match returns the action directly)
     - `description?: string` — optional human-readable summary for LLM inspection
     - `lifecycle?: RuleLifecycle` — optional hook lifecycle metadata
   - `RuleLifecycle` interface with optional fields: `artifact?: string`, `retry_on?: string`, `max_cycles?: number`, `idempotency_key?: string`
   - **Important:** Import `DispatchAction` and `DispatchContext` from `./auto-dispatch.ts` as type-only imports for type signatures. Import `PostUnitHookConfig`, `PreDispatchHookConfig`, `HookDispatchResult`, `PreDispatchResult`, `HookExecutionState` from `./types.ts`.

2. **Create `src/resources/extensions/gsd/rule-registry.ts`** — Build the `RuleRegistry` class:
   - Constructor: takes `dispatchRules: UnifiedRule[]` (the static dispatch rules from auto-dispatch)
   - Instance fields for mutable hook state: `activeHook: HookExecutionState | null`, `hookQueue: Array<{...}>`, `cycleCounts: Map<string, number>`, `retryPending: boolean`, `retryTrigger: {...} | null`
   - Methods:
     - `listRules(): UnifiedRule[]` — returns all rules (dispatch rules + dynamically loaded hook rules from preferences). Hook rules are loaded fresh from preferences on each call (not cached).
     - `evaluateDispatch(ctx: DispatchContext): Promise<DispatchAction>` — iterate dispatch rules in order, first match wins, return result. If no match, return stop action for unhandled phase.
     - `evaluatePostUnit(completedUnitType: string, completedUnitId: string, basePath: string): HookDispatchResult | null` — loads post-unit hooks from preferences, converts to unified rules, evaluates all-matching. Must replicate exact semantics of current `checkPostUnitHooks`: hook-on-hook prevention, idempotency, cycle limits, retry_on, dequeue pattern.
     - `evaluatePreDispatch(unitType: string, unitId: string, prompt: string, basePath: string): PreDispatchResult` — loads pre-dispatch hooks from preferences, converts to unified rules, evaluates all-matching with compose/skip/replace semantics.
     - `resetState(): void` — clear all mutable state (activeHook, hookQueue, cycleCounts, retryPending, retryTrigger)
     - `getActiveHook(): HookExecutionState | null`
     - `isRetryPending(): boolean`
     - `consumeRetryTrigger(): {...} | null`
     - `persistState(basePath: string): void`
     - `restoreState(basePath: string): void`
     - `clearPersistedState(basePath: string): void`
     - `getHookStatus(): HookStatusEntry[]`
     - `triggerHookManually(hookName, unitType, unitId, basePath): HookDispatchResult | null`
     - `formatHookStatus(): string`
   - Module-level singleton: `let _registry: RuleRegistry | null = null;` with `getRegistry(): RuleRegistry` (throws if not initialized) and `setRegistry(r: RuleRegistry): void` and `initRegistry(dispatchRules: UnifiedRule[]): RuleRegistry` (creates + sets).

3. **Create `src/resources/extensions/gsd/tests/rule-registry.test.ts`** — Tests using `node:test`:
   - Test: construct `RuleRegistry` with 3 mock dispatch rules (first-match). `listRules()` returns them. `evaluateDispatch()` returns the first match.
   - Test: construct registry, call `listRules()` — returns all rules with correct `name`, `when`, `evaluation` fields.
   - Test: mock dispatch rule with async `where` predicate works correctly.
   - Test: `resetState()` clears all mutable state.
   - Test: singleton accessors `getRegistry()`/`setRegistry()` work correctly.
   - Use `createTestContext` from `./test-helpers.ts` for assertions.

4. **Verify TypeScript compiles:** Run `npx tsc --noEmit` and ensure no type errors in the new files.

## Must-Haves

- [ ] `UnifiedRule` type has `name`, `when`, `evaluation`, `where`, `then`, and optional `lifecycle` and `description` fields
- [ ] `RuleRegistry` class with `listRules()`, `evaluateDispatch()`, `evaluatePostUnit()`, `evaluatePreDispatch()` methods
- [ ] Mutable hook state is encapsulated as instance fields, not module-level variables
- [ ] Singleton accessor pattern (`getRegistry`/`setRegistry`/`initRegistry`) for migration path
- [ ] New test file passes with `node:test` runner
- [ ] `npx tsc --noEmit` succeeds

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/rule-registry.test.ts` — all tests pass
- `npx tsc --noEmit` — no type errors

## Inputs

- `src/resources/extensions/gsd/auto-dispatch.ts` — type-only imports for `DispatchAction`, `DispatchContext`
- `src/resources/extensions/gsd/types.ts` — type-only imports for hook config types, `HookExecutionState`, `HookDispatchResult`, `PreDispatchResult`, `HookStatusEntry`
- `src/resources/extensions/gsd/preferences.ts` — imports `resolvePostUnitHooks`, `resolvePreDispatchHooks` for dynamic hook loading
- `src/resources/extensions/gsd/tests/test-helpers.ts` — `createTestContext` for test assertions

## Expected Output

- `src/resources/extensions/gsd/rule-types.ts` — new file with unified rule type definitions
- `src/resources/extensions/gsd/rule-registry.ts` — new file with RuleRegistry class and singleton accessors
- `src/resources/extensions/gsd/tests/rule-registry.test.ts` — new test file for registry
