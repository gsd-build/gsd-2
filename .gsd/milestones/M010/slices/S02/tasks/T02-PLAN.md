---
estimated_steps: 3
estimated_files: 4
---

# T02: Fix integration test failures

**Slice:** S02 — Test Green + Session Picker Dispatch + Final Verification
**Milestone:** M010

## Description

Run the full integration test suite and fix any failures from the merge. Integration tests exercise the real CLI launch path, web mode runtime, and onboarding flow — changes to CLI flags, new subcommands (sessions, headless), or help text changes may break existing assertions.

## Steps

1. Run `npm run test:integration` and capture failures
2. Fix each failure — common issues: changed help output (new subcommands in help text), new CLI flags, session management API changes
3. Re-run until zero failures

## Must-Haves

- [ ] All integration tests pass with zero failures

## Verification

- `npm run test:integration` — zero failures

## Inputs

- S02/T01's unit test fixes
- Upstream additions: `gsd sessions` subcommand, `gsd headless` subcommand, new CLI flags

## Expected Output

- All integration test files updated for post-merge codebase
- Zero integration test failures

## Observability Impact

- **`npm run test:integration` stdout:** Produces structured pass/fail counts per test file. Zero failures is the success signal. Failures include file path, line number, and assertion diff.
- **CLI help text assertions:** Integration tests may assert exact help output strings. New subcommands (`sessions`, `headless`) or flags change this output — failures surface as string comparison diffs.
- **Failure diagnostics:** Each integration test failure includes the test name, expected vs actual values, and stack trace pointing to the exact assertion line.
- **No new runtime signals:** This task fixes test assertions only — no production code changes, no new observability surfaces.
