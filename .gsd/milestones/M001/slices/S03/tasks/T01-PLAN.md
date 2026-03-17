---
estimated_steps: 5
estimated_files: 4
---

# T01: Add formatFailureContext helper and extend evidence JSON with retry fields

**Slice:** S03 — Auto-Fix Retry Loop
**Milestone:** M001

## Description

Add pure functions that T02 will wire into the auto-mode dispatch flow. Two changes:

1. **`formatFailureContext(result: VerificationResult): string`** in `verification-gate.ts` — formats each failed verification check into a prompt-injectable text block containing the command name, exit code, and a truncated stderr excerpt. This is what gets injected into the retry prompt so the agent knows what to fix.

2. **Extend `EvidenceJSON`** in `verification-evidence.ts` with optional `retryAttempt` and `maxRetries` fields so the T##-VERIFY.json artifact records how many retries occurred.

Both are pure function changes with zero integration risk. All existing 28+ tests must continue to pass.

## Steps

1. **Add `formatFailureContext` to `verification-gate.ts`:**
   - Export a function `formatFailureContext(result: VerificationResult): string`
   - Filter `result.checks` to only failed checks (`exitCode !== 0`)
   - If no failures, return `""`
   - For each failed check, format a block like:
     ```
     ### ❌ `npm run lint` (exit code 1)
     ```stderr
     <first 2000 chars of check.stderr>
     ```
     ```
   - Cap each check's stderr to 2000 chars (append `\n…[truncated]` if exceeded)
   - Cap total output to 10,000 chars (append `\n\n…[remaining failures truncated]` if exceeded)
   - Wrap the whole output in a header: `## Verification Failures\n\n<checks>`

2. **Extend `EvidenceJSON` in `verification-evidence.ts`:**
   - Add `retryAttempt?: number` and `maxRetries?: number` to the `EvidenceJSON` interface
   - These are optional — when omitted, the JSON output should not include them (use conditional spread or explicit assignment only when defined)

3. **Update `writeVerificationJSON` signature:**
   - Add optional params: `retryAttempt?: number, maxRetries?: number` after the existing params
   - When provided, include them in the `evidence` object before writing
   - When not provided, omit them from the JSON (current behavior unchanged)

4. **Add tests for `formatFailureContext` in `verification-gate.test.ts`:**
   - Test: formats a single failure with command, exit code, stderr
   - Test: formats multiple failures
   - Test: truncates stderr longer than 2000 chars
   - Test: returns empty string when all checks pass
   - Test: returns empty string for empty checks array
   - Test: caps total output at 10,000 chars (generate enough failures to exceed)
   - Import `formatFailureContext` alongside existing imports from `../verification-gate.ts`

5. **Add tests for retry evidence fields in `verification-evidence.test.ts`:**
   - Test: `writeVerificationJSON` with `retryAttempt` and `maxRetries` includes them in the output JSON
   - Test: `writeVerificationJSON` without retry params produces JSON without `retryAttempt`/`maxRetries` keys
   - Import pattern follows existing test file structure

## Must-Haves

- [ ] `formatFailureContext` exported from `verification-gate.ts`
- [ ] Returns empty string for passing results and empty checks
- [ ] Individual stderr capped to 2000 chars per check
- [ ] Total output capped to 10,000 chars
- [ ] `EvidenceJSON` has optional `retryAttempt` and `maxRetries` fields
- [ ] `writeVerificationJSON` accepts and writes optional retry params
- [ ] Retry fields absent from JSON when not provided (backward compatible)
- [ ] All existing verification tests still pass
- [ ] New tests for `formatFailureContext` pass
- [ ] New tests for retry evidence fields pass

## Verification

- `npm run test:unit -- --test-name-pattern "verification"` — all existing + new tests pass
- `grep -n "formatFailureContext" src/resources/extensions/gsd/verification-gate.ts` — confirms export exists
- `grep -n "retryAttempt\|maxRetries" src/resources/extensions/gsd/verification-evidence.ts` — confirms fields added

## Inputs

- `src/resources/extensions/gsd/verification-gate.ts` — existing file with `discoverCommands()` and `runVerificationGate()`. Add `formatFailureContext` as a new export.
- `src/resources/extensions/gsd/verification-evidence.ts` — existing file with `EvidenceJSON` interface and `writeVerificationJSON()` function. Extend both.
- `src/resources/extensions/gsd/types.ts` — provides `VerificationResult` and `VerificationCheck` interfaces (read-only, no changes needed). `VerificationCheck` has: `command: string`, `exitCode: number`, `stdout: string`, `stderr: string`, `durationMs: number`.
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — existing test file with 28 tests. Append new tests.
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — existing test file with evidence tests. Append new tests.

## Expected Output

- `src/resources/extensions/gsd/verification-gate.ts` — now exports `formatFailureContext(result: VerificationResult): string` alongside existing exports
- `src/resources/extensions/gsd/verification-evidence.ts` — `EvidenceJSON` has optional `retryAttempt`/`maxRetries`, `writeVerificationJSON` accepts and writes them
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — 6+ new tests for `formatFailureContext`
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — 2+ new tests for retry evidence fields
