---
estimated_steps: 5
estimated_files: 6
skills_used:
  - test
  - review
  - debug-like-expert
---

# T03: Convert hooks to UnifiedRule format, facade post-unit-hooks.ts, and wire registry into auto.ts

**Slice:** S01 — Unified Rule Engine
**Milestone:** M001-xij4rf

## Description

Complete the unification by converting post-unit and pre-dispatch hooks into `UnifiedRule` objects, refactoring `post-unit-hooks.ts` into a thin facade, and wiring the registry singleton into `auto.ts`. This is the highest-risk task in the slice because it touches mutable state management, hook lifecycle semantics, and the runtime integration seam (`LoopDeps`).

The critical constraint: all 13 exported functions from `post-unit-hooks.ts` must continue to work with identical signatures and behavior. The mutable state (`activeHook`, `hookQueue`, `cycleCounts`, `retryPending`, `retryTrigger`) currently lives as module-level variables — it must migrate to the `RuleRegistry` instance, and the facade functions must delegate through `getRegistry()`.

Hooks are NOT cached in the registry — `resolvePostUnitHooks()` and `resolvePreDispatchHooks()` from `preferences.ts` are called on each evaluation to support mid-session preference changes.

## Steps

1. **Add hook-to-rule conversion methods in `rule-registry.ts`** — Add internal methods:
   - `private loadPostUnitRules(): UnifiedRule[]` — calls `resolvePostUnitHooks()`, maps each `PostUnitHookConfig` to a `UnifiedRule` with `when: "post-unit"`, `evaluation: "all-matching"`, `lifecycle: { artifact: config.artifact, retry_on: config.retry_on, max_cycles: config.max_cycles }`, `name: config.name`, `description` from `config.after.join(", ")`.
   - `private loadPreDispatchRules(): UnifiedRule[]` — calls `resolvePreDispatchHooks()`, maps each `PreDispatchHookConfig` to a `UnifiedRule` with `when: "pre-dispatch"`, `evaluation: "all-matching"`, `name: config.name`.
   - Update `listRules()` to return `[...this.dispatchRules, ...this.loadPostUnitRules(), ...this.loadPreDispatchRules()]`.

2. **Migrate mutable state and hook logic from `post-unit-hooks.ts` into `RuleRegistry`** — Move the core logic of `checkPostUnitHooks`, `handleHookCompletion`, `dequeueNextHook`, `runPreDispatchHooks`, and all state management functions into `RuleRegistry` instance methods. The logic stays the same — this is a structural move, not a behavioral change. Key methods on the registry:
   - `evaluatePostUnit(completedUnitType, completedUnitId, basePath)` — exactly the current `checkPostUnitHooks` logic, using `this.activeHook`, `this.hookQueue`, `this.cycleCounts` instead of module globals. Must preserve: hook-on-hook prevention (`completedUnitType.startsWith("hook/")`), triage/quick-task exclusion, idempotency via artifact existence, cycle limits, retry_on semantics, browser safety prompt injection.
   - `evaluatePreDispatch(unitType, unitId, prompt, basePath)` — exactly the current `runPreDispatchHooks` logic. Must preserve: hook unit bypass, modify/skip/replace compose semantics, variable substitution.
   - State methods: `resetState()`, `getActiveHook()`, `isRetryPending()`, `consumeRetryTrigger()`, `persistState(basePath)`, `restoreState(basePath)`, `clearPersistedState(basePath)`, `getHookStatus()`, `triggerHookManually(...)`, `formatHookStatus()`.
   - **Hook state persistence key format must be unchanged:** `"hookName/triggerUnitType/triggerUnitId"` in cycleCounts serialization.

3. **Refactor `post-unit-hooks.ts` to thin facade** — Replace all 13 exported functions with one-liners that delegate to `getRegistry()`:
   ```typescript
   export function checkPostUnitHooks(completedUnitType: string, completedUnitId: string, basePath: string): HookDispatchResult | null {
     return getRegistry().evaluatePostUnit(completedUnitType, completedUnitId, basePath);
   }
   export function resetHookState(): void { getRegistry().resetState(); }
   export function getActiveHook(): HookExecutionState | null { return getRegistry().getActiveHook(); }
   // ... etc for all 13 functions
   ```
   Keep all type imports for the function signatures. The facade file should be ~50-80 lines total.
   **Important:** The facade functions must handle the case where the registry is not yet initialized (during testing). Add a guard: if `getRegistry()` throws (registry not initialized), fall back to a default instance. Use `getOrCreateRegistry()` that lazily creates with empty dispatch rules if not yet set — this ensures tests that import from `post-unit-hooks.ts` directly still work without explicit registry initialization.

4. **Wire registry initialization in `auto.ts`** — In the `startAuto()` function (where `LoopDeps` is assembled, around line 909):
   - Import `initRegistry` and `convertDispatchRules` from `./rule-registry.ts`
   - Import `getDispatchRulesRaw` (or equivalent) from `./auto-dispatch.ts` to get the raw `DispatchRule[]`
   - Call `initRegistry(convertDispatchRules(getDispatchRulesRaw()))` before the LoopDeps object is built
   - The existing `resolveDispatch` and `runPreDispatchHooks` entries in LoopDeps can stay as-is — they call the facade functions which delegate to the registry
   - **Also:** in auto-mode stop/reset, call `getRegistry().resetState()` (which `resetHookState()` already delegates to)

5. **Run ALL existing tests and verify zero regression** — Execute the full test suite. Pay special attention to:
   - `post-unit-hooks.test.ts` — tests all 13 exported functions from the facade
   - `retry-state-reset.test.ts` — tests `resetHookState`, `consumeRetryTrigger`, `isRetryPending`, `resolveHookArtifactPath`
   - `auto-loop.test.ts` — tests mock LoopDeps with `resolveDispatch` and `runPreDispatchHooks`
   - `dispatch-missing-task-plans.test.ts` and `validate-milestone.test.ts` — still passing from T02
   - Add final tests to `rule-registry.test.ts`: `listRules()` returns dispatch + hook rules when preferences mock has hooks configured (may need to mock `resolvePostUnitHooks` via `preferences.ts`).
   - Run `npx tsc --noEmit` to verify full type safety.

## Must-Haves

- [ ] All 13 exported functions from `post-unit-hooks.ts` continue to work with identical signatures
- [ ] Mutable hook state lives in `RuleRegistry` instance, not module-level variables
- [ ] Hook lifecycle preserved: idempotency (artifact check), retry_on, max_cycles, cycle persistence, hook-on-hook prevention
- [ ] `listRules()` returns dispatch rules + hook-derived rules from preferences
- [ ] Pre-dispatch compose/skip/replace semantics unchanged
- [ ] Hook state persistence key format unchanged: `"hookName/triggerUnitType/triggerUnitId"`
- [ ] `triggerHookManually` force capability preserved
- [ ] Registry initialized in `auto.ts` before LoopDeps assembly
- [ ] Facade handles missing registry gracefully (lazy init for test compatibility)
- [ ] ALL existing test files pass: `post-unit-hooks.test.ts`, `retry-state-reset.test.ts`, `auto-loop.test.ts`, `dispatch-missing-task-plans.test.ts`, `validate-milestone.test.ts`
- [ ] `npx tsc --noEmit` succeeds

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/post-unit-hooks.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/retry-state-reset.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-loop.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/dispatch-missing-task-plans.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/validate-milestone.test.ts` — passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/rule-registry.test.ts` — passes (including hook-derived rule tests)
- `npx tsc --noEmit` — no type errors
- `npm run test:unit 2>&1 | tail -5` — full test suite passes

## Observability Impact

- Signals added/changed: `listRules()` now returns hook-derived rules alongside dispatch rules — this is the core observability surface for S02 (journal emission will reference rule names from this registry)
- How a future agent inspects this: call `getRegistry().listRules()` to see all registered rules, their `when` phase, `evaluation` strategy, and `name`
- Failure state exposed: if hook state is corrupted, `getHookStatus()` and `formatHookStatus()` (delegating through the facade) will show the current cycle counts and active hook via the registry instance

## Inputs

- `src/resources/extensions/gsd/rule-types.ts` — unified rule type definitions from T01
- `src/resources/extensions/gsd/rule-registry.ts` — RuleRegistry class from T01+T02 with dispatch rules already working
- `src/resources/extensions/gsd/post-unit-hooks.ts` — existing 524-line module with 13 exported functions and module-level mutable state
- `src/resources/extensions/gsd/auto.ts` — LoopDeps wiring at ~line 909
- `src/resources/extensions/gsd/auto-post-unit.ts` — imports `checkPostUnitHooks` from `post-unit-hooks.ts` at line 43
- `src/resources/extensions/gsd/preferences.ts` — `resolvePostUnitHooks()` and `resolvePreDispatchHooks()` at lines 412/422
- `src/resources/extensions/gsd/tests/rule-registry.test.ts` — existing test file from T01+T02 to expand

## Expected Output

- `src/resources/extensions/gsd/post-unit-hooks.ts` — refactored to ~50-80 line thin facade
- `src/resources/extensions/gsd/rule-registry.ts` — updated with hook evaluation methods, mutable state, and all hook lifecycle logic
- `src/resources/extensions/gsd/auto.ts` — updated with registry initialization before LoopDeps assembly
- `src/resources/extensions/gsd/tests/rule-registry.test.ts` — expanded with hook-derived rule tests
- `src/resources/extensions/gsd/auto-post-unit.ts` — likely unchanged (imports from facade)
