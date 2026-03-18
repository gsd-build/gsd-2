# S02: Test Green + Session Picker Dispatch + Final Verification

**Goal:** Fix all test failures and warnings introduced by the merge, wire `/gsd sessions` dispatch into the web command surface, update the parity contract test for the new `edit-mode` builtin, and verify everything end-to-end.
**Demo:** `npm run test:unit` and `npm run test:integration` both pass with zero failures. `/gsd sessions` typed into the browser terminal opens the existing session browser surface. Both builds still green.

## Must-Haves

- All unit tests pass (zero failures)
- All integration tests pass (zero failures)
- No new warnings introduced
- `/gsd sessions` dispatch wired in web command handling
- Parity contract test updated for upstream's new `edit-mode` builtin slash command
- Both builds still exit 0

## Verification

- `npm run test:unit` — zero failures
- `npm run test:integration` — zero failures
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0
- `rg "edit-mode" src/tests/web-command-parity-contract.test.ts` — shows updated map entry

## Tasks

- [x] **T01: Fix unit test failures** `est:30m`
  - Why: The 223-commit merge likely broke tests that reference relocated modules, renamed functions, or changed upstream behavior. These must all pass before the milestone is done (R126).
  - Files: test files under `src/tests/`, `src/resources/extensions/gsd/tests/`, `packages/pi-coding-agent/src/`
  - Do: Run `npm run test:unit`. For each failure: read the error, identify whether it's a stale import, renamed function, changed assertion target, or missing module. Apply the minimal fix. Re-run until all pass. Check for new warnings in test output.
  - Verify: `npm run test:unit` — zero failures, no new warnings
  - Done when: All unit tests pass clean

- [x] **T02: Fix integration test failures** `est:20m`
  - Why: Integration tests exercise the full runtime path and may break from the merge. Must pass for R126.
  - Files: `src/tests/integration/`
  - Do: Run `npm run test:integration`. Fix any failures using the same approach as T01. Common issues: changed CLI flags, new subcommands altering help output, session management changes.
  - Verify: `npm run test:integration` — zero failures
  - Done when: All integration tests pass clean

- [x] **T03: Wire /gsd sessions dispatch and update parity test** `est:20m`
  - Why: The upstream added `gsd sessions` as a CLI subcommand. The web already has full session browse/resume from M002 (`command-surface.tsx` SESSION_SURFACE_SECTIONS). We need to wire the dispatch so typing `/gsd sessions` in the browser terminal opens the existing session browser surface. The upstream also added `edit-mode` to `BUILTIN_SLASH_COMMANDS`, which the parity contract test must account for.
  - Files: `web/lib/workspace-store.ts` or `web/components/gsd/command-surface.tsx` (dispatch handling), `src/tests/web-command-parity-contract.test.ts` (parity test)
  - Do: Add `/gsd sessions` dispatch that opens the session browser surface (same target as `/gsd resume`). Add `edit-mode` to `EXPECTED_BUILTIN_OUTCOMES` in the parity contract test with the correct outcome kind. Run both builds to ensure nothing breaks. Run the parity tests.
  - Verify: `npm run build:web-host` exit 0; parity test passes with updated builtin count
  - Done when: `/gsd sessions` dispatches to session browser in web; `edit-mode` in parity test; both builds green

- [x] **T04: Final verification sweep** `est:10m`
  - Why: Comprehensive final check that all success criteria are met.
  - Files: none (verification only)
  - Do: Run the full verification sequence: `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` (zero markers), `npm run build` (exit 0), `npm run build:web-host` (exit 0), `npm run test:unit` (zero failures), `npm run test:integration` (zero failures). Check test output for new warnings. Verify `git log --oneline v2.22.0..HEAD | wc -l` includes all upstream commits.
  - Verify: All commands pass; all success criteria met
  - Done when: Every success criterion from the roadmap is verified

## Observability / Diagnostics

- **Test suite output:** `npm run test:unit` and `npm run test:integration` produce structured pass/fail counts. Zero failures is the success signal.
- **Build exit codes:** `npm run build` and `npm run build:web-host` exit 0 confirms no regressions.
- **Parity contract test:** `src/tests/web-command-parity-contract.test.ts` enumerates expected builtin commands — a mismatch surfaces as a named assertion failure identifying the missing/extra command.
- **Session dispatch:** `/gsd sessions` typed in browser terminal should open the session browser surface — observable via `browser_assert` checking for the session picker UI.
- **Failure visibility:** Test failures include file path, line number, and assertion diff in stdout. Build failures include TypeScript diagnostic with file:line:col.
- **Redaction:** No secrets or credentials are involved in this slice.

## Files Likely Touched

- `src/tests/` (test fixes)
- `src/resources/extensions/gsd/tests/` (test fixes)
- `packages/pi-coding-agent/src/` (test fixes)
- `src/tests/web-command-parity-contract.test.ts` (edit-mode addition)
- `web/lib/workspace-store.ts` or `web/components/gsd/command-surface.tsx` (sessions dispatch)
