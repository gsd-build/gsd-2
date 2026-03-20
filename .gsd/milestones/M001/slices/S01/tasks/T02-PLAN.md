---
estimated_steps: 5
estimated_files: 2
---

# T02: Define LoopDeps sub-interfaces and add activeEngineId to AutoSession

**Slice:** S01 — Interface Extraction + LoopDeps Decomposition
**Milestone:** M001

## Description

Create `loop-deps-groups.ts` containing role-based sub-interfaces that formalize the 45+ imports in `auto.ts` into typed dependency groups (R003). Unlike `engine-types.ts`, this file CAN and SHOULD import types from existing GSD modules — it wraps them into logical contracts.

Also add `activeEngineId: string | null` to `AutoSession` to enable S02's engine resolution. This must pass the encapsulation test in `auto-session-encapsulation.test.ts` which verifies that `reset()` covers every instance property and `toJSON()` includes diagnostic properties.

**This is the riskiest task in S01.** The sub-interface grouping must reflect actual dependency clusters in `auto.ts`, not theoretical purity. If the grouping creates awkward cross-group coupling, S02 will struggle to implement `DevWorkflowEngine`. Err on the side of fewer, larger groups over many small ones.

**Relevant skills:** None required — this is TypeScript interface + class field work.

## Steps

1. Read all 66 import statements in `src/resources/extensions/gsd/auto.ts` (lines 14-80+). For each imported function/type, note which module it comes from and how it's used in `auto.ts`. Use `rg` to find call sites if needed. Group them by role.

2. Create `src/resources/extensions/gsd/loop-deps-groups.ts` with sub-interfaces. Start with these groups from research, but merge aggressively where groups are small (<3 functions) or tightly coupled:
   - **GitOps** — commit, merge, worktree create/enter/teardown, branch ops. Modules: `auto-worktree.ts`, `git-service.ts`, `native-git-bridge.ts`, `gitignore.ts`, `git-self-heal.ts`
   - **StateOps** — `deriveState()`, cache invalidation, file loading, path resolution. Modules: `state.ts`, `cache.ts`, `files.ts`, `paths.ts`
   - **DispatchOps** — `resolveDispatch()`, prompt building, dispatch guard. Modules: `auto-dispatch.ts`, `auto-prompts.ts`, `prompt-loader.ts`
   - **ModelOps** — model selection, preferences, context budgets. Modules: `auto-model-selection.ts`, `preferences.ts`, `context-budget.ts`
   - **BudgetOps** — budget alerting, cost tracking. Modules: `auto-budget.ts`, `metrics.ts`
   - **VerificationOps** — gate execution, evidence writing. Modules: `auto-verification.ts`, `verification-gate.ts`, `verification-evidence.ts`
   - **RecoveryOps** — artifact recovery, stuck detection, idempotency, crash recovery, timeout recovery. Modules: `auto-recovery.ts`, `auto-stuck-detection.ts`, `auto-idempotency.ts`, `auto-timeout-recovery.ts`, `crash-recovery.ts`, `session-forensics.ts`
   - **SupervisionOps** — unit timeout, tool tracking. Modules: `auto-timers.ts`, `auto-supervisor.ts`, `auto-tool-tracking.ts`
   - **PostUnitOps** — pre/post verification processing, closeout, hooks. Modules: `auto-post-unit.ts`, `auto-unit-closeout.ts`
   - **DashboardOps** — widget updates, progress display. Modules: `auto-dashboard.ts`
   - **SessionOps** — session lifecycle, locking, bootstrap. Modules: `auto/session.ts`, `session-lock.ts`, `auto-start.ts`
   - **ObservabilityOps** — logging, notifications, telemetry. Modules: `auto-observability.ts`, `debug-logger.ts`, `activity-log.ts`, `notifications.ts`

   Each sub-interface should have method signatures typed with the actual parameter and return types from the source modules. Use `import type` to reference existing types. Add JSDoc linking each method to its source module/function.

   **Constraint:** If a group ends up with only 1-2 methods, merge it into a related group. Aim for 8-10 sub-interfaces, not 13+.

3. Add `activeEngineId: string | null = null` to `AutoSession` class in `src/resources/extensions/gsd/auto/session.ts`:
   - Add the property in the "Lifecycle" section (after `verbose`)
   - Add `this.activeEngineId = null;` to `reset()` in the "Lifecycle" section
   - Add `activeEngineId: this.activeEngineId,` to `toJSON()` return object

4. Run `npx tsc --noEmit` to verify both files compile cleanly.

5. Run `npm run test:unit -- --test-name-pattern "session-encapsulation"` to verify `AutoSession` invariants hold.

## Must-Haves

- [ ] `loop-deps-groups.ts` has 8-10 sub-interfaces covering all dependency clusters in `auto.ts`
- [ ] Each sub-interface method has a typed signature matching the actual exported function
- [ ] `AutoSession.activeEngineId` exists with type `string | null`, default `null`
- [ ] `reset()` clears `activeEngineId` to `null`
- [ ] `toJSON()` includes `activeEngineId`
- [ ] `auto-session-encapsulation.test.ts` passes

## Verification

- `npx tsc --noEmit` passes
- `npm run test:unit -- --test-name-pattern "session-encapsulation"` passes (all 7 invariant tests)
- `grep "activeEngineId" src/resources/extensions/gsd/auto/session.ts | wc -l` returns >= 3 (declaration, reset, toJSON)

## Inputs

- `src/resources/extensions/gsd/auto.ts` — 66 import statements defining the dependency surface
- `src/resources/extensions/gsd/auto/session.ts` — `AutoSession` class (236 lines) with `reset()` and `toJSON()`
- `src/resources/extensions/gsd/tests/auto-session-encapsulation.test.ts` — invariant tests that will validate the `activeEngineId` addition
- T01 output: `engine-types.ts` exists (referenced types can be re-exported or cross-referenced)
- Existing context interfaces: `DispatchContext` (auto-dispatch.ts:45), `VerificationContext` (auto-verification.ts:30), `PostUnitContext` (auto-post-unit.ts:90), `SupervisionContext` (auto-timers.ts:25), `StuckContext` (auto-stuck-detection.ts:44), `IdempotencyContext` (auto-idempotency.ts:23), `BootstrapDeps` (auto-start.ts:69), `RecoveryContext` (auto-timeout-recovery.ts:23)

## Expected Output

- `src/resources/extensions/gsd/loop-deps-groups.ts` — 8-10 role-based sub-interfaces with typed method signatures
- `src/resources/extensions/gsd/auto/session.ts` — modified with `activeEngineId` field, passing all encapsulation tests

## Observability Impact

- **No new runtime signals.** `loop-deps-groups.ts` is pure interfaces erased at runtime by `--experimental-strip-types`. `activeEngineId` is a class field that appears in `toJSON()` diagnostic snapshots.
- **Typecheck signal:** `npx tsc --noEmit --project tsconfig.extensions.json` validates all new interface signatures compile cleanly. Failure means a mismatched import or type incompatibility.
- **Encapsulation test signal:** `auto-session-encapsulation.test.ts` validates `activeEngineId` is covered by `reset()`. Failure means the field was added without lifecycle coverage.
- **Future agent inspection:** To verify this task's output, run `npx tsc --noEmit --project tsconfig.extensions.json` (zero errors) and `grep "^export interface" src/resources/extensions/gsd/loop-deps-groups.ts | wc -l` (expect 11: 10 sub-interfaces + 1 composite).
