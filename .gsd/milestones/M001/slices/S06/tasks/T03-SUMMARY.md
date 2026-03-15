---
id: T03
parent: S06
milestone: M001
provides:
  - /gsd inspect slash command — dumps schema version, table counts, and recent decisions/requirements from DB
  - formatInspectOutput pure function — exported for testing, produces multi-line inspect text from InspectData
key_files:
  - src/resources/extensions/gsd/commands.ts
  - src/resources/extensions/gsd/tests/gsd-inspect.test.ts
key_decisions:
  - Extracted formatInspectOutput as a pure exported function to keep handler thin and test logic independently
  - handleInspect checks both isDbAvailable() and _getAdapter() null guard for defense-in-depth
patterns_established:
  - Inspect data flows through a typed InspectData interface → pure formatter → ctx.ui.notify()
observability_surfaces:
  - /gsd inspect command — primary diagnostic for DB state verification
  - stderr log with 'gsd-db: /gsd inspect failed:' prefix on unexpected errors
  - "No GSD database available" notification when DB is unavailable
duration: 12m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T03: /gsd inspect slash command

**Added `/gsd inspect` subcommand that queries the SQLite DB and displays schema version, table row counts, and the 5 most recent decisions and requirements**

## What Happened

Added the `inspect` subcommand to the `/gsd` command handler in `commands.ts`:

1. Added `"inspect"` to the autocomplete subcommands array so tab-completion works.
2. Added `if (trimmed === "inspect")` handler branch that dynamically imports `gsd-db.js`, checks `isDbAvailable()` and `_getAdapter()`, queries schema_version/decisions/requirements/artifacts tables for counts and recent rows, formats via the pure `formatInspectOutput()` function, and displays via `ctx.ui.notify()`.
3. Updated the unknown-command notification text to include `inspect` in the list of valid subcommands.
4. Created `gsd-inspect.test.ts` with 32 assertions testing the pure `formatInspectOutput` function: full output formatting, empty data, null schema version, five recent entries, and output format validation.

The `InspectData` interface and `formatInspectOutput` function are exported from `commands.ts` for testability.

## Verification

- `npm run test:unit -- --test-name-pattern "gsd-inspect"` — 32 passed, 0 failed ✓
- `npm run test:unit -- --test-name-pattern "db-writer"` — all passed ✓
- `npm run test:unit -- --test-name-pattern "gsd-tools"` — all passed ✓
- `npm run test:unit` — 291 passed, 0 failed (full suite, no regressions) ✓
- `npx tsc --noEmit` — clean compilation ✓
- `grep "inspect" commands.ts` confirms autocomplete array and handler branch present ✓

## Diagnostics

- `/gsd inspect` displays multi-line text with schema version, 3 table counts, and up to 5 recent decisions/requirements
- When DB unavailable: shows "No GSD database available. Run /gsd auto to create one."
- On unexpected errors: writes `gsd-db: /gsd inspect failed: <message>` to stderr, shows error notification

## Deviations

- Task plan mentioned importing `context-store.js` — not needed since all queries go directly through `_getAdapter()` which is simpler and avoids an unnecessary abstraction layer. This matches the pattern from T01 write helpers.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/commands.ts` — added `inspect` to autocomplete, `handleInspect()` function, `formatInspectOutput()` pure function, `InspectData` interface, updated unknown-command help text
- `src/resources/extensions/gsd/tests/gsd-inspect.test.ts` — new test file with 32 assertions for inspect output formatting
- `.gsd/milestones/M001/slices/S06/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
