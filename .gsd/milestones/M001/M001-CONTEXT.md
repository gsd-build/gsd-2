# M001: Memory Database — SQLite-Backed Context Store

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

Replace GSD's markdown-file-based artifact storage with a SQLite database (`gsd.db`) that enables selective, context-aware injection into LLM prompts. The TS system becomes the context curator — it knows the current milestone, slice, task, and phase, and uses that knowledge to query structured data and build minimal, precise context for each prompt.

## Why This Milestone

Three compounding problems: (1) token waste from loading entire markdown files when only a subset is relevant, (2) context pollution where irrelevant data (superseded decisions, out-of-scope requirements) degrades LLM output, (3) all-or-nothing loading with no way to filter by scope. A mature project wastes 3,000–8,000 tokens per dispatch on unnecessary context.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run auto-mode on an existing GSD project and see it silently migrate to DB-backed context with zero friction
- See measurable token savings (≥30%) on planning and research dispatch units via built-in metrics
- Use `/gsd inspect` to examine DB state for debugging
- Experience faster, more focused LLM output because prompts contain only relevant context

### Entry point / environment

- Entry point: `gsd` CLI / `/gsd` slash command / auto-mode dispatch
- Environment: local dev (Node.js ≥20.6.0)
- Live dependencies involved: `better-sqlite3` native addon, filesystem (`.gsd/gsd.db`)

## Completion Class

- Contract complete means: all DB operations tested with unit tests, migration fidelity verified via round-trip tests, query layer returns correct subsets for each dispatch unit type
- Integration complete means: auto-mode dispatch uses DB queries for all prompt building, dual-write keeps markdown in sync, graceful fallback works when sqlite unavailable
- Operational complete means: worktree isolation with DB copy on creation and row-level merge reconciliation

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A full auto-mode cycle (research → plan → execute → complete) runs entirely on DB-backed context and produces equivalent output
- An existing project with 20+ decisions and mature requirements migrates silently and shows ≥30% token savings on planning units
- Worktree creation copies gsd.db, worktree merge reconciles rows correctly
- `better-sqlite3` load failure degrades gracefully to markdown loading with no crash

## Risks and Unknowns

- `better-sqlite3` native addon build failures on some platforms — mitigated by graceful fallback
- Existing markdown parsers may not capture all data needed for structured DB rows — mitigated by `full_content` escape hatch columns
- Prompt builder rewiring is high-surface-area (9+ functions in a 3800-line file) — mitigated by incremental approach and dual-write for rollback
- Schema may need iteration as real dispatch patterns reveal missing queries — mitigated by versioned migrations
- LLM structured tool output may be unreliable initially — mitigated by keeping markdown roundtrip as fallback

## Existing Codebase / Prior Art

- `src/resources/extensions/gsd/auto.ts` — 3800-line dispatch system with 9+ `build*Prompt()` functions that use `inlineGsdRootFile()`. This is the primary integration surface.
- `src/resources/extensions/gsd/files.ts` — 857-line parser module with `parseRoadmap`, `parsePlan`, `parseSummary`, `parseContinue`, `parseRequirementCounts`, `parseSecretsManifest`, `parseContextDependsOn`. These become the import layer.
- `src/resources/extensions/gsd/state.ts` — 569-line state derivation that scans `.gsd/` file tree. Will be rewired to query DB.
- `src/resources/extensions/gsd/types.ts` — Core type definitions (`Roadmap`, `SlicePlan`, `Summary`, `Continue`, `GSDState`, etc.) that the DB schema mirrors.
- `src/resources/extensions/gsd/paths.ts` — Path resolution for all artifact files. Stays relevant for dual-write.
- `src/resources/extensions/gsd/prompt-loader.ts` — `inlineTemplate()` for static templates. Unaffected.
- `src/resources/extensions/gsd/post-unit-hooks.ts` — Hook engine. May need hooks for DB write-back.
- `src/resources/extensions/gsd/worktree-manager.ts` / `auto-worktree.ts` — Worktree lifecycle. Needs DB copy/merge logic.
- `native/crates/engine/src/gsd_parser.rs` — Rust native parser used for batch file parsing in `deriveState()`. DB queries will replace this usage.
- `src/resources/extensions/gsd/native-parser-bridge.ts` — TS bridge to native parser. Less critical once DB is primary.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001–R021 — All active requirements are owned by M001 slices (see REQUIREMENTS.md)
- R030 (vector search) — Deferred to M002, but M001 schema must accommodate it (R021)

## Scope

### In Scope

- SQLite DB layer with `better-sqlite3`, schema versioning, WAL mode
- Markdown importers for all artifact types (decisions, requirements, roadmaps, plans, summaries, contexts, research, continues, queue, secrets manifest, project)
- Silent auto-migration on first run
- Context store query layer implementing the injection matrix from the PRD
- Prompt builder rewiring for all `build*Prompt()` functions
- Dual-write: markdown files continue alongside DB
- Graceful fallback to markdown if `better-sqlite3` unavailable
- Built-in token measurement (before/after per dispatch unit)
- State derivation from DB
- Worktree DB isolation and row-level merge reconciliation
- Structured LLM tools for direct DB writes
- `/gsd inspect` slash command

### Out of Scope / Non-Goals

- Vector search / embeddings (M002)
- Web UI for DB contents
- Multi-user / networked DB
- Replacing git version control
- Real-time sync across machines
- Moving prompt templates to DB

## Technical Constraints

- Node.js ≥20.6.0 (existing engine requirement)
- `better-sqlite3` sync API (matches current sync prompt-building code)
- Schema must be forward-compatible with future Rust `rusqlite` access for vector search
- Must not break existing npm package distribution (native addon prebuilds)
- All existing tests must continue to pass

## Integration Points

- `auto.ts` prompt builders — primary integration surface, 9+ functions to rewire
- `state.ts` deriveState — rewire from file scanning to DB queries
- `worktree-manager.ts` / `auto-worktree.ts` — DB copy on worktree creation, merge on teardown
- `post-unit-hooks.ts` — potential hook for DB write-back after unit completion
- `files.ts` parsers — reused as importers, then potentially deprecated as DB becomes primary
- `metrics.ts` — integration point for token measurement
- `gitignore.ts` — ensure `gsd.db` is gitignored
- Extension tool registration — new structured LLM tools registered as pi extension tools

## Open Questions

- Exact `better-sqlite3` version and prebuilt binary availability for current Node targets — verify during S01
- Whether `node:sqlite` stabilizes before M001 completes — monitor but don't wait for it
- Optimal transaction boundaries for import (one big transaction vs per-table) — decide during S02 implementation
