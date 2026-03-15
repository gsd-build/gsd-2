---
estimated_steps: 4
estimated_files: 2
---

# T03: /gsd inspect slash command

**Slice:** S06 — Structured LLM Tools + /gsd inspect
**Milestone:** M001

## Description

Add an `inspect` subcommand to the `/gsd` command handler in `commands.ts` (R015). When invoked, it dynamically imports `gsd-db.js` and `context-store.js`, queries the database for schema version, table row counts, and recent entries, then displays the results via `ctx.ui.notify()`. Produces a clear "No DB available" message when SQLite is unavailable.

## Steps

1. Add `"inspect"` to the autocomplete subcommands array in `commands.ts` (line ~64 area, the `subcommands` const).

2. Add `if (trimmed === "inspect")` branch in the handler function before the unknown-command fallback. Inside: dynamically import `gsd-db.js` → check `isDbAvailable()` → if false, `ctx.ui.notify("No GSD database available. Run /gsd auto to create one.", "info")` and return. If true: import `_getAdapter` → query `SELECT MAX(version) as v FROM schema_version` → query `SELECT count(*) as cnt FROM decisions` / `requirements` / `artifacts` → query `SELECT id, decision, choice FROM decisions ORDER BY seq DESC LIMIT 5` → query `SELECT id, status, description FROM requirements ORDER BY id DESC LIMIT 5` → format as multi-line text → `ctx.ui.notify(text, "info")`.

3. Update the unknown-command notification text to include `inspect` in the list of valid subcommands.

4. Write `gsd-inspect.test.ts`: extract the inspect output formatting into a testable pure function (`formatInspectOutput`). Test with known table counts and sample rows. Verify output includes schema version, counts, and formatted recent entries.

## Must-Haves

- [ ] `/gsd inspect` autocompletes
- [ ] Shows schema version, decision/requirement/artifact counts
- [ ] Shows 5 most recent decisions and requirements
- [ ] Clear message when DB unavailable
- [ ] Dynamic imports with try/catch (D014)

## Verification

- `npm run test:unit -- --test-name-pattern "gsd-inspect"` — all assertions pass
- `npx tsc --noEmit` — clean compilation
- Verify autocomplete includes "inspect" via grep

## Inputs

- `src/resources/extensions/gsd/commands.ts` — existing command handler with subcommand routing pattern
- `src/resources/extensions/gsd/gsd-db.ts` — isDbAvailable, _getAdapter for direct queries

## Expected Output

- `src/resources/extensions/gsd/commands.ts` — modified with `inspect` subcommand (~40 LOC addition)
- `src/resources/extensions/gsd/tests/gsd-inspect.test.ts` — new test file for inspect output formatting

## Observability Impact

- **New diagnostic surface:** `/gsd inspect` command dumps schema version, table row counts (decisions/requirements/artifacts), and the 5 most recent decisions and requirements from the SQLite DB. This is the primary agent-usable diagnostic for verifying DB state.
- **Failure visibility:** When DB is unavailable, displays clear "No GSD database available" message via `ctx.ui.notify()`. On unexpected errors, writes `gsd-db: /gsd inspect failed:` to stderr with the error message, and shows "Failed to inspect GSD database" notification.
- **No existing signals changed.**
