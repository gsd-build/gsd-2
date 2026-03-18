---
estimated_steps: 4
estimated_files: 8
---

# T01: Fix unit test failures

**Slice:** S02 — Test Green + Session Picker Dispatch + Final Verification
**Milestone:** M010

## Description

Run the full unit test suite against the post-merge codebase and fix all failures. Failures will come from: stale imports referencing modules that were relocated by upstream refactoring (auto.ts→6 modules, commands.ts→5 modules), renamed function signatures, changed assertion targets, or new upstream behavior that invalidates existing test expectations.

## Steps

1. Run `npm run test:unit` and capture the failure output
2. Categorize failures: stale import, renamed API, changed behavior, missing module
3. Fix each failure with the minimal change — prefer updating the test to match upstream's new structure
4. Re-run until zero failures and check output for new warnings

## Must-Haves

- [ ] All unit tests pass with zero failures
- [ ] No new warnings in test output

## Verification

- `npm run test:unit` — zero failures, no new warnings

## Inputs

- S01/T02's clean builds (both builds exit 0)
- Upstream refactoring: auto.ts→6 modules, commands.ts→5 modules, preferences.ts decomposed, doctor.ts decomposed

## Observability Impact

- **Inspection surface:** `npm run test:unit` stdout reports per-file pass/fail counts. Each failure includes the test file path, test name, and assertion diff — sufficient for a future agent to categorize and fix without re-investigating.
- **Signals changed:** No runtime signals change. This task only modifies test files to align with the post-merge module layout.
- **Failure visibility:** If a fix is incomplete, the specific test name and assertion diff will appear in subsequent `npm run test:unit` runs, pinpointing the exact remaining issue.

## Expected Output

- All unit test files updated to work with post-merge codebase
- Zero test failures
