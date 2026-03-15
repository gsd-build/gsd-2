---
id: M001
provides:
  - SQLite-backed context store with tiered provider chain (node:sqlite → better-sqlite3 → null)
  - Schema-versioned DB at .gsd/gsd.db with WAL mode, 3 tables (decisions, requirements, artifacts), 2 views
  - Markdown importers for all artifact types with silent auto-migration on first run
  - Scoped query layer implementing per-dispatch-unit injection matrix across 9 prompt builders
  - Dual-write infrastructure keeping markdown files in sync with DB state in both directions
  - Token measurement wired into all 13 dispatch path call sites (promptCharCount/baselineCharCount in metrics.json)
  - deriveState() DB-first content loading with filesystem fallback
  - Worktree DB isolation (copy on creation) and row-level merge reconciliation via ATTACH DATABASE
  - Three structured LLM tools (gsd_save_decision, gsd_update_requirement, gsd_save_summary) with DB-first write
  - /gsd inspect slash command for DB state diagnostics
  - Graceful degradation to markdown loading when SQLite unavailable
key_decisions:
  - "D010: node:sqlite → better-sqlite3 → null tiered fallback (amends D001)"
  - "D011: createRequire(import.meta.url) for ESM compatibility"
  - "D012: Requirements deduplication by ID with field merging during import"
  - "D013: gsdDir = project basePath, not .gsd/ directory"
  - "D014: Dynamic import() for optional SQLite dependency in auto.ts"
  - "D015: DB replaces content-reading only, not file discovery in deriveState"
  - "D016: Module-scoped measurement vars in auto.ts"
  - "D017: createWorktree sync→async for dynamic import support"
patterns_established:
  - DbAdapter interface wrapping provider differences with null-prototype row normalization
  - DB-aware inline pattern: isDbAvailable() → dynamic import → query with scope → format → fallback to inlineGsdRootFile
  - Dual-write re-import pattern: migrateFromMarkdown in handleAgentEnd after auto-commit
  - DB-first write pattern: upsert to DB → fetch all → generate markdown → saveFile
  - INSERT OR REPLACE for all upsert/import operations (idempotent)
  - Cross-DB merge via ATTACH DATABASE with DETACH in finally block
  - Dynamic import try/catch for optional SQLite dependency throughout (D003/D014)
  - Query functions guard with isDbAvailable() + try/catch, return typed empty results on failure
observability_surfaces:
  - "getDbProvider() returns 'node:sqlite' | 'better-sqlite3' | null"
  - "isDbAvailable() returns boolean for DB availability check"
  - "promptCharCount/baselineCharCount in metrics.json per dispatch unit"
  - "/gsd inspect — schema version, table counts, recent entries"
  - "stderr: gsd-migrate: imported N decisions, N requirements, N artifacts"
  - "stderr: gsd-db: re-import failed: / gsd-db: failed to open existing database:"
  - "stderr: reconciliation report with per-table counts and conflict details"
requirement_outcomes:
  - id: R001
    from_status: active
    to_status: validated
    proof: "S01 DB opens with schema init, S02 forward-only v1→v2 migration, S07 lifecycle integration across 4 modules"
  - id: R002
    from_status: active
    to_status: validated
    proof: "S01 query/format return empty when unavailable, S03 all 9 builders fall back to inlineGsdRootFile (52 test assertions)"
  - id: R003
    from_status: active
    to_status: validated
    proof: "S02 70-assertion round-trip test suite, all artifact types imported and verified"
  - id: R004
    from_status: active
    to_status: validated
    proof: "S02 auto-migration in startAuto() with dynamic imports, try/catch guard, one-line log"
  - id: R005
    from_status: active
    to_status: validated
    proof: "S01 queryDecisions with milestone/scope filters, S03 milestone-scoped in all 9 builders (43 assertions)"
  - id: R006
    from_status: active
    to_status: validated
    proof: "S01 queryRequirements with slice/status filters, S03 slice-filtered in all 9 builders (43 assertions)"
  - id: R007
    from_status: active
    to_status: validated
    proof: "S03 queryArtifact, queryProject, scoped queries wired per injection matrix (52 assertions)"
  - id: R008
    from_status: active
    to_status: validated
    proof: "S03 all 19 inlineGsdRootFile calls replaced, grep confirms 0 direct usage in builders (43 assertions)"
  - id: R009
    from_status: active
    to_status: validated
    proof: "S03 handleAgentEnd re-import (8 assertions), S06 DB-first tools with markdown dual-write (127+35 assertions)"
  - id: R010
    from_status: active
    to_status: validated
    proof: "S04 promptCharCount/baselineCharCount in UnitMetrics, wired into all 13 dispatch call sites"
  - id: R011
    from_status: active
    to_status: validated
    proof: "S04 deriveState DB-first with fallback, 51-assertion field-by-field equality across 7 scenarios"
  - id: R012
    from_status: active
    to_status: validated
    proof: "S05 copyWorktreeDb wired into createWorktree, 37-assertion test suite"
  - id: R013
    from_status: active
    to_status: validated
    proof: "S05 reconcileWorktreeDb via ATTACH, wired into both merge paths, 37-assertion test suite"
  - id: R014
    from_status: active
    to_status: validated
    proof: "S06 three tools registered with DB-first write, 35+127 assertions, round-trip fidelity proven"
  - id: R015
    from_status: active
    to_status: validated
    proof: "S06 /gsd inspect with autocomplete, handler, formatInspectOutput (32 assertions)"
  - id: R016
    from_status: active
    to_status: validated
    proof: "S04 fixture-proven 52.2% plan-slice, 66.3% decisions, 32.2% research composite (99 assertions)"
  - id: R017
    from_status: active
    to_status: validated
    proof: "S01 0.62ms for 100 rows, test assertion enforces <5ms"
  - id: R018
    from_status: active
    to_status: validated
    proof: "S02 70-assertion round-trip test, all fields verified against source markdown"
  - id: R019
    from_status: active
    to_status: validated
    proof: "S07 lifecycle test proves same data in = same prompt out, ≥30% savings with correct scoping"
  - id: R020
    from_status: active
    to_status: validated
    proof: "S01 PRAGMA journal_mode returns 'wal', test assertion confirms"
  - id: R021
    from_status: active
    to_status: validated
    proof: "S01 auto-increment seq PK (decisions), stable id PK (requirements), schema verified in tests"
duration: 3h 23m
verification_result: passed
completed_at: 2026-03-15
---

# M001: Memory Database — SQLite-Backed Context Store

**SQLite-backed context store with selective injection across all 9 prompt builders, ≥30% token savings proven, structured LLM tools, worktree DB isolation, and graceful degradation — 21/21 requirements validated, 293 tests passing**

## What Happened

M001 replaced GSD's markdown-file artifact loading with a SQLite database and typed query layer that selectively injects only the context each dispatch unit needs.

**Foundation (S01, 40m):** Built the SQLite abstraction layer with a tiered provider chain — `node:sqlite` (available on Node 22.20.0 via `DatabaseSync`), falling back to `better-sqlite3`, then to null. A thin `DbAdapter` interface normalizes API differences (primarily `node:sqlite`'s null-prototype rows). Schema init creates `decisions`, `requirements`, and `schema_version` tables plus `active_decisions`/`active_requirements` views. WAL mode enabled on file-backed databases. Query layer in `context-store.ts` provides `queryDecisions` (filterable by milestone/scope) and `queryRequirements` (filterable by slice/status), both with format functions producing prompt-injectable markdown. All query functions degrade gracefully — `isDbAvailable()` guard plus try/catch means DB issues never crash prompt injection.

**Import (S02, 47m):** Schema v2 migration adds the `artifacts` table. Custom parsers handle DECISIONS.md pipe-table format (with supersession chain detection via `amends DXXX`) and REQUIREMENTS.md section/bullet format (with deduplication across Active/Validated sections). Hierarchy artifact walker imports milestones → slices → tasks for all artifact types (ROADMAP, CONTEXT, RESEARCH, ASSESSMENT, PLAN, SUMMARY, UAT, CONTINUE plus root files). The `migrateFromMarkdown()` orchestrator wraps everything in a single transaction with per-import error isolation. Auto-migration wired into `startAuto()` via dynamic imports — detects markdown files without gsd.db and migrates silently.

**Prompt Rewiring (S03, 30m):** Three DB-aware helper functions (`inlineDecisionsFromDb`, `inlineRequirementsFromDb`, `inlineProjectFromDb`) replaced all 19 `inlineGsdRootFile` call sites across 9 prompt builders. Each helper queries scoped data (milestone-filtered decisions, slice-filtered requirements) and falls back to filesystem loading when DB is unavailable or empty. DB opens at session start for pre-existing gsd.db files. Dual-write re-import in `handleAgentEnd` keeps DB in sync after each dispatch unit modifies markdown files.

**Measurement + State (S04, 47m):** `promptCharCount` and `baselineCharCount` fields added to `UnitMetrics`, measurement wired into all 13 `snapshotUnitMetrics` call sites. `deriveState()` modified to query the artifacts table for content when DB is available, replacing the native batch file parse step (file discovery still uses disk). Fixture-based savings validation proved ≥30% threshold: 52.2% on plan-slice, 66.3% on decisions-only, 32.2% on research composite, 42.4% on full lifecycle.

**Worktree (S05, 27m):** `copyWorktreeDb` copies gsd.db to new worktrees on creation (skipping WAL/SHM, non-fatal on failure). `reconcileWorktreeDb` ATTACHes the worktree DB, detects conflicts by comparing content columns, then runs INSERT OR REPLACE in a transaction with DETACH guaranteed via try/finally. Wired into both deterministic and LLM merge paths with dynamic imports preserving graceful degradation.

**Structured Tools (S06, 52m):** Three LLM-callable tools registered: `gsd_save_decision` (auto-assigns D-numbers), `gsd_update_requirement` (verifies existence before update), `gsd_save_summary` (validates artifact type, computes paths). All follow the DB-first write pattern: upsert → fetch all → generate markdown → write file. Round-trip fidelity proven — generated markdown parses back to field-identical data. `/gsd inspect` dumps schema version, table counts, and recent entries.

**Integration (S07, 17m):** 83-assertion integration test suite proves full subsystem composition across 4 module boundaries: realistic fixtures → file-backed DB → migrate → scoped queries → format → 42.4% savings → re-import → write-back → round-trip. Edge cases cover empty projects, partial migrations, and fallback mode via `_resetProvider`.

## Cross-Slice Verification

| Success Criterion | Verified | Evidence |
|---|---|---|
| Auto-mode dispatches use DB queries for context injection across all prompt builders | ✅ | S03: all 19 `inlineGsdRootFile` calls replaced; `grep -c inlineGsdRootFile auto.ts` = 10 (1 def + 3 baseline measurement + 3 fallback + 3 JSDoc, zero direct builder usage); 52 test assertions |
| Existing GSD projects migrate silently to DB on first run with zero data loss | ✅ | S02: auto-migration in `startAuto()`, 70-assertion round-trip fidelity, all artifact types imported |
| Planning and research dispatch units show ≥30% fewer tokens on mature projects | ✅ | S04: 52.2% plan-slice, 66.3% decisions-only, 32.2% research composite, 42.4% lifecycle (99 assertions) |
| `better-sqlite3` load failure degrades gracefully to markdown loading | ✅ | S01: query functions return `[]` when unavailable; S03: all builders fall back; S07: `_resetProvider` integration test |
| Worktree creation copies gsd.db; worktree merge reconciles rows | ✅ | S05: `copyWorktreeDb` + `reconcileWorktreeDb` wired into lifecycle, 37 assertions |
| LLM can write decisions/requirements/summaries via structured tool calls | ✅ | S06: 3 tools registered, 35 + 127 assertions, round-trip fidelity proven |
| `/gsd inspect` shows DB state for debugging | ✅ | S06: handler with autocomplete, 32 assertions |
| All existing tests continue to pass | ✅ | 293/293 tests pass, 0 failures, `npx tsc --noEmit` clean |
| Dual-write keeps markdown files in sync with DB state | ✅ | S03: handleAgentEnd re-import (markdown→DB); S06: DB-first tools regenerate markdown (DB→markdown) |
| deriveState() derives from DB, producing identical GSDState output | ✅ | S04: 51-assertion field-by-field equality across 7 scenarios |
| Worktree isolation and merge reconciliation work with row-level conflict detection | ✅ | S05: ATTACH-based merge, conflict detection by content column comparison, wired into both merge paths |
| Structured LLM tools eliminate markdown-then-parse roundtrip | ✅ | S06: tools write to DB directly, trigger markdown dual-write |
| Full auto-mode cycle completes with DB-backed context | ✅ | S07: 50-assertion lifecycle test crosses 4 module boundaries end-to-end |

## Requirement Changes

All 21 requirements transitioned from active → validated during M001:

- R001: active → validated — DB opens, schema inits, v1→v2 migration, lifecycle integration across 4 modules
- R002: active → validated — query/format return empty when unavailable, all 9 builders fall back (52 assertions)
- R003: active → validated — 70-assertion round-trip test, all artifact types imported and verified
- R004: active → validated — auto-migration in startAuto() with dynamic imports and try/catch guard
- R005: active → validated — queryDecisions with milestone/scope filters, wired into all 9 builders
- R006: active → validated — queryRequirements with slice/status filters, wired into all 9 builders
- R007: active → validated — full injection matrix implemented per dispatch unit type (52 assertions)
- R008: active → validated — all 19 inlineGsdRootFile calls replaced, zero direct builder usage
- R009: active → validated — bidirectional dual-write: markdown→DB re-import + DB→markdown generation
- R010: active → validated — promptCharCount/baselineCharCount in UnitMetrics, 13 call sites wired
- R011: active → validated — deriveState DB-first with fallback, 51-assertion equality proof
- R012: active → validated — copyWorktreeDb wired into createWorktree, 37-assertion test suite
- R013: active → validated — reconcileWorktreeDb via ATTACH, conflict detection, both merge paths
- R014: active → validated — 3 tools with DB-first write, 35+127 assertions, round-trip fidelity
- R015: active → validated — /gsd inspect with autocomplete, 32 assertions
- R016: active → validated — 52.2% plan-slice, 66.3% decisions, 32.2% research composite savings
- R017: active → validated — 0.62ms for 100 rows, test enforces <5ms
- R018: active → validated — 70-assertion round-trip, all fields verified against source markdown
- R019: active → validated — same data in = same prompt out, ≥30% savings with correct scoping
- R020: active → validated — PRAGMA journal_mode returns 'wal', test assertion confirms
- R021: active → validated — auto-increment seq PK + stable id PK, schema verified in tests

## Forward Intelligence

### What the next milestone should know
- `node:sqlite` is the active provider on Node 22.20.0 — `better-sqlite3` code path exists but is untested in this environment. If targeting Node <22.5.0, the `better-sqlite3` path needs explicit validation.
- Named SQL parameters use colon-prefix (`:id`, `:scope`) for `node:sqlite` compatibility. All new SQL must follow this pattern.
- The injection matrix (which scope parameters go to which builder) is hardcoded in the DB-aware helpers in auto.ts (~line 2460-2550). Adding new builders or changing scope requires manual updates.
- Schema is at version 2. Use `migrateSchema()` in `gsd-db.ts` for forward-only migrations — it reads current version and applies incremental DDL.
- `migrateFromMarkdown` is idempotent (INSERT OR REPLACE). Calling it repeatedly is safe.
- R030 (vector search) was explicitly deferred — schema uses stable PKs designed to be joinable by future embedding tables.

### What's fragile
- **DbAdapter null-prototype normalization** — `node:sqlite` returns rows with `Object.create(null)` prototype. The `normalizeRow` spread works but any code doing `row instanceof Object` or `row.hasOwnProperty()` will fail on unnormalized rows.
- **Dynamic import paths** (`"./gsd-db.js"`, `"./context-store.js"`, `"./md-importer.js"`) — if compiled output paths change, these silently fail and fall back to markdown without test detection.
- **Requirements parser format dependency** — assumes `### RXXX — Title` headings under status section headings with `- Field: value` bullets. Any REQUIREMENTS.md format change breaks parsing.
- **Module-scoped measurement vars** in auto.ts — rely on reset at top of `dispatchNextUnit`. A new dispatch entry point that skips the reset leaks stale data into metrics.
- **Round-trip fidelity coupling** — `generateDecisionsMd`/`generateRequirementsMd` in db-writer.ts and `parseDecisionsTable`/`parseRequirementsSections` in md-importer.ts must produce/consume identical formats. Changes to one require lockstep updates to the other.

### Authoritative diagnostics
- `npm run test:unit` — 293 tests, the definitive regression check
- `npm run test:unit -- --test-name-pattern "integration-lifecycle|integration-edge"` — 83 assertions proving full subsystem composition in ~2 seconds
- `/gsd inspect` — primary runtime diagnostic for DB state verification
- `getDbProvider()` — returns which SQLite backend loaded (`'node:sqlite'`, `'better-sqlite3'`, or `null`)
- `isDbAvailable()` — returns whether a DB is currently open and usable
- `grep -c inlineGsdRootFile src/resources/extensions/gsd/auto.ts` — should be 10 (any increase means someone bypassed DB queries)

### What assumptions changed
- D001 assumed `better-sqlite3` as the sole provider — D010 amended to tiered chain with `node:sqlite` preferred. The abstraction layer makes this transparent.
- Plan assumed reusing `files.ts` parsers for import — custom parsers were built because existing parsers don't extract structured fields needed for DB rows.
- Plan assumed DB replaces all content loading in deriveState — actually only replaces the batch-parse step. File discovery still uses disk (D015).
- `createWorktree` changed from sync to async (D017) — required for dynamic import pattern, minimal impact since the only call site was already async.

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts` — SQLite abstraction with provider chain, schema init/migration, typed CRUD wrappers, worktree copy/reconcile
- `src/resources/extensions/gsd/context-store.ts` — Query layer with scoped filters, format functions, artifact/project queries
- `src/resources/extensions/gsd/md-importer.ts` — Markdown parsers and migrateFromMarkdown orchestrator
- `src/resources/extensions/gsd/db-writer.ts` — DB→markdown generators and DB-first write helpers
- `src/resources/extensions/gsd/auto.ts` — DB-aware prompt builders, dual-write re-import, token measurement, auto-migration
- `src/resources/extensions/gsd/state.ts` — DB-first content loading in deriveState
- `src/resources/extensions/gsd/metrics.ts` — promptCharCount/baselineCharCount in UnitMetrics
- `src/resources/extensions/gsd/types.ts` — Decision and Requirement interfaces
- `src/resources/extensions/gsd/gitignore.ts` — DB sidecar patterns
- `src/resources/extensions/gsd/index.ts` — 3 structured LLM tool registrations
- `src/resources/extensions/gsd/commands.ts` — /gsd inspect slash command
- `src/resources/extensions/gsd/worktree-manager.ts` — async createWorktree with DB copy
- `src/resources/extensions/gsd/worktree-command.ts` — DB reconciliation in merge paths
- `src/resources/extensions/gsd/tests/gsd-db.test.ts` — 41 assertions for DB layer
- `src/resources/extensions/gsd/tests/context-store.test.ts` — 56 assertions for query layer
- `src/resources/extensions/gsd/tests/md-importer.test.ts` — 70 assertions for importers
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — 52 assertions for DB-aware builders
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — 51 assertions for state derivation
- `src/resources/extensions/gsd/tests/token-savings.test.ts` — 99 assertions for savings validation
- `src/resources/extensions/gsd/tests/worktree-db.test.ts` — 37 assertions for worktree DB ops
- `src/resources/extensions/gsd/tests/db-writer.test.ts` — 127 assertions for write layer
- `src/resources/extensions/gsd/tests/gsd-tools.test.ts` — 35 assertions for LLM tools
- `src/resources/extensions/gsd/tests/gsd-inspect.test.ts` — 32 assertions for inspect command
- `src/resources/extensions/gsd/tests/integration-lifecycle.test.ts` — 50 assertions for lifecycle integration
- `src/resources/extensions/gsd/tests/integration-edge.test.ts` — 33 assertions for edge cases
