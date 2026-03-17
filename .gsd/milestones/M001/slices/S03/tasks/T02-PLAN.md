---
estimated_steps: 7
estimated_files: 3
---

# T02: Wire retry loop into handleAgentEnd and prompt injection into dispatchNextUnit

**Slice:** S03 — Auto-Fix Retry Loop
**Milestone:** M001

## Description

Wire the retry loop into `auto.ts` so that when the verification gate fails, the agent gets up to 2 auto-fix attempts with failure context injected into the retry prompt. This is the integration task that delivers R005 end-to-end.

The pattern follows the existing `pendingCrashRecovery` mechanism: store context in a module-level variable, return early from `handleAgentEnd` (preventing the unit from being marked complete), and inject the context into the prompt in `dispatchNextUnit` before re-dispatching the same unit.

Key constraint: the retry path must `return` from `handleAgentEnd` **before** the DB dual-write block and the post-unit hooks block. If it falls through, the unit gets marked complete and the retry can't re-dispatch it.

## Steps

1. **Add module-level state variables** near the other module-level state (around line 244-336 area where `unitDispatchCount`, `pendingCrashRecovery` etc. are declared):
   ```typescript
   /** Pending verification retry — set when gate fails with retries remaining, consumed by dispatchNextUnit */
   let pendingVerificationRetry: { unitId: string; failureContext: string; attempt: number } | null = null;
   /** Verification retry count per unitId — separate from unitDispatchCount which tracks artifact-missing retries */
   const verificationRetryCount = new Map<string, number>();
   ```

2. **Update the import** from `verification-gate.ts` (line 23) to also import `formatFailureContext`:
   ```typescript
   import { runVerificationGate, formatFailureContext } from "./verification-gate.js";
   ```

3. **Modify the verification gate block** in `handleAgentEnd` (starting around line ~1491 where `currentUnit.type === "execute-task"` is checked). After the gate runs and `result` is available:

   - Load `verification_auto_fix` and `verification_max_retries` from effective preferences (already loaded as `prefs`)
   - `verification_auto_fix`: treat `undefined` as `true` (enabled by default per R005)
   - `verification_max_retries`: treat `undefined` as `2` (default per D005)
   
   After the existing pass/fail logging and evidence write:
   
   **If `result.passed === true`:**
   - Clear `verificationRetryCount` for this unitId (a retry succeeded)
   - Clear `pendingVerificationRetry` if it was set
   - Continue normal flow (fall through to DB dual-write and hooks)
   
   **If `result.passed === false` and auto-fix is enabled and retries remain:**
   - Compute `attempt = (verificationRetryCount.get(currentUnit.id) ?? 0) + 1`
   - If `attempt <= maxRetries`:
     - `verificationRetryCount.set(currentUnit.id, attempt)`
     - `pendingVerificationRetry = { unitId: currentUnit.id, failureContext: formatFailureContext(result), attempt }`
     - Write evidence JSON with `retryAttempt: attempt, maxRetries` (call `writeVerificationJSON` with the new optional params)
     - `ctx.ui.notify(`Verification failed — auto-fix attempt ${attempt}/${maxRetries}`, "warning")`
     - Remove the completion key from `completedKeySet` if it was added (so `dispatchNextUnit` re-dispatches this unit): `completedKeySet.delete(completionKey)` and call `removeCompletedKey(basePath, completionKey)` if that function exists, otherwise just delete from the Set
     - `return` — this is critical! Must exit `handleAgentEnd` before DB dual-write and post-unit hooks
   
   **If `result.passed === false` and retries exhausted (or auto-fix disabled):**
   - Write final evidence JSON with `retryAttempt: attempt, maxRetries`
   - `verificationRetryCount.delete(currentUnit.id)`
   - `pendingVerificationRetry = null`
   - `ctx.ui.notify(`Verification gate FAILED after ${attempt} retries — pausing for human review`, "error")`
   - Call `await pauseAuto(ctx, pi)` to pause auto-mode
   - `return`

4. **Handle the completion key correctly for retry.** Above the gate block (around line ~1460), `triggerArtifactVerified` causes `persistCompletedKey(basePath, completionKey)` and `completedKeySet.add(completionKey)`. The completion key format is `${currentUnit.type}/${currentUnit.id}`. When the retry path triggers, remove this key using `completedKeySet.delete(completionKey)` and `removePersistedKey(basePath, completionKey)` — both exist. `removePersistedKey` is exported from `auto-recovery.ts` (check if it's already imported in auto.ts; if not, add the import). This ensures `dispatchNextUnit` will re-dispatch this unit instead of skipping it as already completed.

5. **Add prompt injection in `dispatchNextUnit`** (around line ~2844 area, before the existing `pendingCrashRecovery` check):
   ```typescript
   if (pendingVerificationRetry) {
     const retryCtx = pendingVerificationRetry;
     pendingVerificationRetry = null;
     const capped = retryCtx.failureContext.length > MAX_RECOVERY_CHARS
       ? retryCtx.failureContext.slice(0, MAX_RECOVERY_CHARS) + "\n\n[...failure context truncated]"
       : retryCtx.failureContext;
     finalPrompt = `**VERIFICATION FAILED — AUTO-FIX ATTEMPT ${retryCtx.attempt}**\n\nThe verification gate ran after your previous attempt and found failures. Fix these issues before completing the task.\n\n${capped}\n\n---\n\n${finalPrompt}`;
   }
   ```
   Insert this **before** the `if (pendingCrashRecovery)` block so verification retries take priority over crash recovery (they're mutually exclusive in practice, but the ordering makes intent clear).

6. **Reset state in `stopAuto`** (around line ~680 area where other state is cleared):
   ```typescript
   pendingVerificationRetry = null;
   verificationRetryCount.clear();
   ```
   Add these alongside the existing `pendingCrashRecovery = null;` line.

7. **Reset state in `pauseAuto`** (around line ~735 area):
   ```typescript
   pendingVerificationRetry = null;
   ```
   Only clear the pending retry context, **not** the retry count map — the count should persist across pause/resume so the retry budget is preserved.

## Must-Haves

- [ ] `pendingVerificationRetry` and `verificationRetryCount` module-level state declared
- [ ] `formatFailureContext` imported from `verification-gate.ts`
- [ ] Gate block returns early when failure + retries remaining (before DB dual-write and post-unit hooks)
- [ ] Gate block pauses auto-mode when retries exhausted
- [ ] Retry state cleared when gate passes (successful retry)
- [ ] `dispatchNextUnit` injects failure context into prompt
- [ ] Failure context capped to `MAX_RECOVERY_CHARS` (50,000)
- [ ] `stopAuto` clears both `pendingVerificationRetry` and `verificationRetryCount`
- [ ] `pauseAuto` clears `pendingVerificationRetry`
- [ ] `verification_auto_fix` defaults to `true` when undefined
- [ ] `verification_max_retries` defaults to `2` when undefined
- [ ] Evidence JSON written with `retryAttempt`/`maxRetries` on each retry
- [ ] All existing tests still pass

## Verification

- `npm run test:unit -- --test-name-pattern "verification"` — all tests still pass (no regressions)
- `npm run test:unit` — no new failures beyond the 8 pre-existing ones
- `grep -n "pendingVerificationRetry\|verificationRetryCount\|formatFailureContext" src/resources/extensions/gsd/auto.ts` — shows the state variables, import, and usage sites
- Code review: trace the gate block's failure path — confirm it `return`s before the `// ── DB dual-write` comment
- Code review: trace `dispatchNextUnit` — confirm `pendingVerificationRetry` injection block exists before `pendingCrashRecovery`
- Code review: `stopAuto` and `pauseAuto` both clear `pendingVerificationRetry`

## Observability Impact

- Signals added: `ctx.ui.notify()` with retry attempt number on each retry, permanent failure notification when retries exhausted
- How a future agent inspects this: `T##-VERIFY.json` contains `retryAttempt` and `maxRetries` showing retry progression; stderr has per-retry failure details
- Failure state exposed: auto-mode pauses with explicit "FAILED after N retries" message when retries exhaust

## Inputs

- `src/resources/extensions/gsd/auto.ts` — current gate block at line ~1491, `dispatchNextUnit` at line ~2007, `stopAuto` at line ~601, `pauseAuto` at line ~720. Module-level state declared near line ~244-336.
- `src/resources/extensions/gsd/verification-gate.ts` — now exports `formatFailureContext` (from T01)
- `src/resources/extensions/gsd/verification-evidence.ts` — `writeVerificationJSON` now accepts optional `retryAttempt`/`maxRetries` params (from T01)
- `src/resources/extensions/gsd/auto-recovery.ts` — exports `removePersistedKey(base, key)` for removing completion keys from the persisted JSON file. Already imported in auto.ts at line 124.
- T01 summary — confirms `formatFailureContext` signature and `writeVerificationJSON` param additions
- S01 forward intelligence: unitId format is 3-part `M001/S01/T03`, gate block is after artifact verification and before DB dual-write, gate is non-fatal (try/catch wrapped)
- Existing patterns: `pendingCrashRecovery` at line ~336 for module-level state, `MAX_RECOVERY_CHARS = 50_000` at line ~2842 for prompt capping, `completedKeySet` for tracking completed units

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — module-level retry state, gate block retry logic with early return, `dispatchNextUnit` prompt injection, `stopAuto`/`pauseAuto` state cleanup. Import updated to include `formatFailureContext`.
