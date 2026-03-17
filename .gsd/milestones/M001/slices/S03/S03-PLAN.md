# S03: Auto-Fix Retry Loop

**Goal:** When verification commands fail, the agent gets up to 2 auto-fix attempts with failure context injected into the retry prompt. After exhausting retries, the gate fails permanently and surfaces for human review.
**Demo:** A failing verification gate triggers a retry dispatch with formatted failure context (command, exit code, stderr excerpt). After 2 failures the unit is marked failed and auto-mode pauses. Retry attempt count appears in T##-VERIFY.json evidence.

## Must-Haves

- `formatFailureContext(result)` formats failed checks into a prompt-injectable block with command names, exit codes, and truncated stderr excerpts
- `EvidenceJSON` extended with optional `retryAttempt` and `maxRetries` fields
- `writeVerificationJSON` accepts optional `retryAttempt`/`maxRetries` params and writes them to JSON
- When gate fails and `verification_auto_fix` is enabled (default true) and retries remain, `handleAgentEnd` stores failure context and returns early — no DB dual-write, no post-unit hooks, no marking unit complete
- `dispatchNextUnit` injects stored failure context into the prompt (parallel to existing `pendingCrashRecovery` pattern)
- After 2 failed retries (or when `verification_auto_fix` is false), the gate fails permanently and auto-mode pauses for human review
- When gate passes on a retry, retry state is cleared and normal flow continues
- Retry state (`pendingVerificationRetry`, `verificationRetryCount`) is cleared in `stopAuto` and `pauseAuto`
- Failure context is capped to `MAX_RECOVERY_CHARS` (50,000) to prevent OOM

## Proof Level

- This slice proves: integration — retry loop fires within the real handleAgentEnd flow
- Real runtime required: no — unit tests cover pure functions; integration wiring verified by code review + grep
- Human/UAT required: no

## Verification

- `npm run test:unit -- --test-name-pattern "verification"` — all existing 28+ gate tests pass, new `formatFailureContext` and evidence retry field tests pass
- `grep -n "pendingVerificationRetry\|verificationRetryCount\|formatFailureContext" src/resources/extensions/gsd/auto.ts` — confirms retry state variables and prompt injection are wired
- `grep -n "retryAttempt\|maxRetries" src/resources/extensions/gsd/verification-evidence.ts` — confirms evidence fields were added
- Code review confirms: when gate fails with retries remaining, `handleAgentEnd` returns early before DB dual-write and post-unit hooks
- Code review confirms: retry state is reset in `stopAuto` and `pauseAuto`

## Observability / Diagnostics

- Runtime signals: `ctx.ui.notify()` messages with retry attempt number ("Verification failed — auto-fix attempt 1/2"), stderr output with failure details on each retry
- Inspection surfaces: `T##-VERIFY.json` contains `retryAttempt` and `maxRetries` fields showing how many retries occurred
- Failure visibility: final failure pauses auto-mode with a notification identifying the exhausted retry count and failed commands
- Redaction constraints: stderr excerpts in failure context may contain file paths but no secrets (stdout/stderr already excluded from JSON per D021)

## Integration Closure

- Upstream surfaces consumed: `verification-gate.ts` → `runVerificationGate()` returning `VerificationResult` with structured failure info; `verification-evidence.ts` → `writeVerificationJSON()`; `preferences.ts` → `verification_auto_fix`, `verification_max_retries`
- New wiring introduced in this slice: module-level retry state in `auto.ts`, early return path in gate block of `handleAgentEnd`, prompt injection block in `dispatchNextUnit`
- What remains before the milestone is truly usable end-to-end: S04 (runtime error capture), S05 (dependency security scan)

## Tasks

- [ ] **T01: Add formatFailureContext helper and extend evidence JSON with retry fields** `est:25m`
  - Why: Provides the pure functions that T02 wires into auto.ts — failure context formatting for prompt injection and retry metadata for evidence artifacts. Must exist before the integration task.
  - Files: `src/resources/extensions/gsd/verification-gate.ts`, `src/resources/extensions/gsd/verification-evidence.ts`, `src/resources/extensions/gsd/tests/verification-gate.test.ts`, `src/resources/extensions/gsd/tests/verification-evidence.test.ts`
  - Do: (1) Add `formatFailureContext(result: VerificationResult): string` to `verification-gate.ts` — formats each failed check as a block with command name, exit code, and truncated stderr (cap individual stderr to 2000 chars). Overall output capped to 10,000 chars. Returns empty string if no failures. (2) Add optional `retryAttempt?: number` and `maxRetries?: number` fields to `EvidenceJSON` interface in `verification-evidence.ts`. (3) Add optional `retryAttempt`/`maxRetries` params to `writeVerificationJSON()` function signature and write them to JSON when provided. (4) Write tests for `formatFailureContext` in `verification-gate.test.ts` (formats failures, truncates long stderr, returns empty for all-pass, handles empty checks). (5) Write tests for retry evidence fields in `verification-evidence.test.ts` (fields present when provided, absent when omitted).
  - Verify: `npm run test:unit -- --test-name-pattern "verification"` — all existing + new tests pass
  - Done when: `formatFailureContext` is exported from `verification-gate.ts`, `EvidenceJSON` has optional retry fields, `writeVerificationJSON` accepts and writes retry metadata, all tests pass

- [ ] **T02: Wire retry loop into handleAgentEnd and prompt injection into dispatchNextUnit** `est:35m`
  - Why: This is the integration task that makes the retry loop actually work — connecting the pure functions from T01 into the auto-mode dispatch flow. Covers R005 end-to-end.
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/verification-gate.ts`
  - Do: (1) Add module-level state to `auto.ts`: `let pendingVerificationRetry: { unitId: string; failureContext: string; attempt: number } | null = null;` and `const verificationRetryCount = new Map<string, number>();`. (2) In the verification gate block (line ~1513 area), after the gate runs: if `result.passed === false` and `verification_auto_fix !== false` (default true) and retry count for this unitId < `verification_max_retries` (default 2), then: increment `verificationRetryCount`, set `pendingVerificationRetry` with formatted failure context from `formatFailureContext(result)`, write evidence JSON with current retry attempt number, log retry notification via `ctx.ui.notify()`, and `return` from `handleAgentEnd` — skipping DB dual-write and post-unit hooks. If retries exhausted or auto-fix disabled, log permanent failure, write final evidence, pause auto-mode. (3) If `result.passed === true`, clear `verificationRetryCount` for this unitId and clear `pendingVerificationRetry` if it was set — normal flow continues. (4) In `dispatchNextUnit` (line ~2844 area), add a parallel injection block for `pendingVerificationRetry`: if set, cap to `MAX_RECOVERY_CHARS`, prepend to `finalPrompt` with a header like "VERIFICATION FAILED — AUTO-FIX ATTEMPT {n}/{max}", then clear `pendingVerificationRetry`. Insert this before the existing `pendingCrashRecovery` check. (5) In `stopAuto`: add `pendingVerificationRetry = null;` and `verificationRetryCount.clear();` to the state reset block. (6) In `pauseAuto`: add `pendingVerificationRetry = null;` (don't clear retry count — preserve for resume). (7) Import `formatFailureContext` from `verification-gate.ts` in the existing import statement.
  - Verify: `npm run test:unit -- --test-name-pattern "verification"` — all tests still pass. `grep -n "pendingVerificationRetry\|verificationRetryCount\|formatFailureContext" src/resources/extensions/gsd/auto.ts` shows the wiring. Code review confirms early return path before DB dual-write and hooks.
  - Done when: The verification gate block in `handleAgentEnd` returns early on failure with retries remaining, `dispatchNextUnit` injects failure context into the prompt, retry state is cleared in `stopAuto`/`pauseAuto`, and all existing tests pass

## Files Likely Touched

- `src/resources/extensions/gsd/verification-gate.ts` — add `formatFailureContext()` export
- `src/resources/extensions/gsd/verification-evidence.ts` — add optional `retryAttempt`/`maxRetries` to `EvidenceJSON` and `writeVerificationJSON`
- `src/resources/extensions/gsd/auto.ts` — module-level retry state, gate block retry logic, `dispatchNextUnit` prompt injection, `stopAuto`/`pauseAuto` state reset
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — tests for `formatFailureContext`
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — tests for retry evidence fields
