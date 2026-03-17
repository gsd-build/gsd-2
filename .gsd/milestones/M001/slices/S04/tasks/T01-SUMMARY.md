---
id: T01
parent: S04
milestone: M001
provides:
  - RuntimeError interface in types.ts
  - captureRuntimeErrors() async function in verification-gate.ts
  - Injectable CaptureRuntimeErrorsOptions for testability
key_files:
  - src/resources/extensions/gsd/types.ts
  - src/resources/extensions/gsd/verification-gate.ts
  - src/resources/extensions/gsd/tests/verification-gate.test.ts
key_decisions:
  - Dependency injection via options parameter instead of module mocking for testability
patterns_established:
  - Dynamic import with try/catch for optional extension dependencies (bg-shell, browser-tools)
  - Injectable getProcesses/getConsoleLogs overrides for unit testing async capture functions
observability_surfaces:
  - RuntimeError[] return value from captureRuntimeErrors() with source/severity/message/blocking per error
  - runtimeErrors optional field on VerificationResult for downstream consumption
duration: 15m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Implement RuntimeError type and captureRuntimeErrors function with tests

**Added RuntimeError interface and captureRuntimeErrors() function with D004 severity classification and 14 unit tests**

## What Happened

Defined `RuntimeError` interface in types.ts with `source`, `severity`, `message`, `blocking` fields. Extended `VerificationResult` with optional `runtimeErrors` field (backward compatible — all existing code compiles unchanged).

Implemented `captureRuntimeErrors()` in verification-gate.ts as an exported async function that:
1. Scans bg-shell processes via dynamic `import()` — detects crashed status, non-zero exits on dead processes, fatal signals (SIGABRT/SIGSEGV/SIGBUS), and alive processes with recentErrors
2. Scans browser console logs via dynamic `import()` — detects unhandled rejections (blocking crash), general console.error (non-blocking), and deprecation warnings (non-blocking)
3. Returns `RuntimeError[]`, gracefully returning `[]` when either module is unavailable

Used dependency injection pattern (`CaptureRuntimeErrorsOptions`) with `getProcesses` and `getConsoleLogs` overrides for testability — avoids complex module mocking while preserving dynamic import in production.

## Verification

- `npx --yes tsx src/resources/extensions/gsd/verification-gate.ts` — compiles cleanly (no output)
- `npm run test:unit -- --test-name-pattern "verification-gate"` — all verification-gate tests pass (28 existing + 14 new = 42 total)
- `npm run test:unit` — 1082 pass, 8 fail (all 8 are pre-existing chokidar/octokit failures)
- `grep -n "RuntimeError" src/resources/extensions/gsd/types.ts` — shows interface at line 61 and field at line 74
- `grep -n "captureRuntimeErrors" src/resources/extensions/gsd/verification-gate.ts` — shows export at line 254

Slice-level checks (partial, T01 is intermediate):
- ✅ `npm run test:unit -- --test-name-pattern "verification-gate"` — all pass
- ⏳ `npm run test:unit -- --test-name-pattern "verification-evidence"` — T02 scope
- ✅ `npm run test:unit` — no new failures (1082 pass, 8 pre-existing)
- ⏳ `grep -n "captureRuntimeErrors" src/resources/extensions/gsd/auto.ts` — T02 scope
- ✅ `grep -n "runtimeErrors" src/resources/extensions/gsd/types.ts` — shows RuntimeError interface + field

## Diagnostics

- Call `captureRuntimeErrors()` standalone to probe runtime health of bg-shell processes and browser console
- Pass `{ getProcesses, getConsoleLogs }` for isolated testing/debugging without module dependencies
- Inspect returned `RuntimeError[]` for `source` (bg-shell|browser), `severity` (crash|error|warning), `blocking` (true/false)
- Browser console text is truncated to 500 chars; bg-shell messages include up to 3 recentErrors

## Deviations

- Added 14 tests instead of the planned 10 — included extra coverage for case-insensitive UnhandledRejection detection, non-deprecation warning filtering, recentErrors truncation to 3, and mixed source scenarios

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/types.ts` — Added RuntimeError interface and runtimeErrors optional field on VerificationResult
- `src/resources/extensions/gsd/verification-gate.ts` — Added captureRuntimeErrors() async function with D004 severity classification, CaptureRuntimeErrorsOptions interface, and buildBgShellMessage helper
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — Added 14 new unit tests covering all 7 severity classes, graceful degradation, text truncation, and mixed scenarios
- `.gsd/milestones/M001/slices/S04/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
