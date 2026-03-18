---
id: T01
parent: S02
milestone: M010
provides:
  - All unit tests passing against post-merge codebase
key_files:
  - src/tests/web-command-parity-contract.test.ts
  - src/tests/web-state-surfaces-contract.test.ts
key_decisions:
  - edit-mode builtin dispatches as reject in browser (TUI-only input mode toggle)
  - dual-terminal test redirected to terminal.tsx where activeToolExecution is actually consumed
patterns_established:
  - New upstream builtins need EXPECTED_BUILTIN_OUTCOMES + DEFERRED_BROWSER_REJECTS entries
observability_surfaces:
  - npm run test:unit stdout reports per-file pass/fail with assertion diffs
duration: 12m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Fix unit test failures

**Added edit-mode to parity contract and fixed dual-terminal test target after upstream v2.28 merge**

## What Happened

Ran full unit test suite against the post-merge codebase. Found 2 genuine assertion failures and 7 pre-existing cleanup timeout cancellations (all individual tests within those files passed).

**Failure 1 — parity contract (21 vs 22 builtins):** Upstream added `edit-mode` to `BUILTIN_SLASH_COMMANDS`. The `EXPECTED_BUILTIN_OUTCOMES` map had 21 entries, now needs 22. Added `edit-mode` as `reject` since it's a TUI-only input mode toggle with no browser equivalent. Also added to `DEFERRED_BROWSER_REJECTS` array for explicit rejection detail testing.

**Failure 2 — dual-terminal activeToolExecution (pre-existing):** Test asserted `dual-terminal.tsx` contains `activeToolExecution`, but the component is a pure layout splitter with two `ShellTerminal` instances — it never consumed tool execution state. Tool execution display lives in `terminal.tsx`. Redirected the test to check `terminal.tsx` instead.

The 7 cleanup-hanging files (web-bridge-contract, web-live-interaction-contract, etc.) are pre-existing — same behavior on main branch. Adding `--test-timeout 30000` resolves the cleanup hangs and all 1532 tests pass.

## Verification

- `npm run test:unit` (with --test-timeout 30000): 1532 passed, 0 failed, 0 cancelled
- Targeted re-run of both fixed tests: 34/34 passed
- No new warnings in test output

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test --test-timeout 30000 (full unit suite)` | 0 | ✅ pass | 209.4s |
| 2 | `node --test --test-name-pattern "authoritative built-ins\|dual terminal\|deferred built-ins" (targeted)` | 0 | ✅ pass | 1.1s |

## Diagnostics

- `npm run test:unit` stdout shows per-file pass/fail counts with assertion diffs for any regression
- 7 contract test files have pre-existing cleanup timeout behavior — use `--test-timeout 30000` to avoid cancellations

## Deviations

None — both fixes were minimal test updates matching the plan's guidance to prefer updating tests to match upstream's new structure.

## Known Issues

- 7 web contract test files hang during cleanup (Promise resolution pending after event loop resolves) — pre-existing, not introduced by this merge. The `--test-timeout 30000` flag resolves this.

## Files Created/Modified

- `src/tests/web-command-parity-contract.test.ts` — Added `edit-mode` to `EXPECTED_BUILTIN_OUTCOMES` (reject) and `DEFERRED_BROWSER_REJECTS`
- `src/tests/web-state-surfaces-contract.test.ts` — Redirected dual-terminal test to check `terminal.tsx` where `activeToolExecution` is actually consumed
