---
estimated_steps: 3
estimated_files: 2
---

# T01: Port md-importer.ts and its test suite

**Slice:** S02 — Markdown Importers + Auto-Migration
**Milestone:** M004

## Description

Port the markdown importer module from the memory-db reference worktree. This module contains parsers for DECISIONS.md (pipe-table format with supersession detection) and REQUIREMENTS.md (section/bullet format across 4 status sections), plus a `migrateFromMarkdown()` orchestrator that walks the .gsd/ hierarchy and imports all artifact types into SQLite via a single transaction.

## Steps

1. Copy `md-importer.ts` from `/Users/lexchristopherson/Developer/gsd-2/.gsd/worktrees/memory-db/src/resources/extensions/gsd/md-importer.ts` to `src/resources/extensions/gsd/md-importer.ts`. No import path changes needed — imports use `.js` extension convention (`./types.js`, `./gsd-db.js`, `./paths.js`, `./guided-flow.js`) which all exist in the M004 worktree.
2. Copy `md-importer.test.ts` from `/Users/lexchristopherson/Developer/gsd-2/.gsd/worktrees/memory-db/src/resources/extensions/gsd/tests/md-importer.test.ts` to `src/resources/extensions/gsd/tests/md-importer.test.ts`. Test file imports use `.ts` extension (`../gsd-db.ts`, `../md-importer.ts`) resolved by the existing `resolve-ts.mjs` hook.
3. Run tests and TypeScript check to verify the port is clean.

## Must-Haves

- [ ] `parseDecisionsTable()` exported — parses pipe-table rows, detects `(amends DXXX)` supersession, skips malformed rows
- [ ] `parseRequirementsSections()` exported — parses 4 status sections (Active, Validated, Deferred, Out of Scope), extracts bullet fields, deduplicates by ID
- [ ] `migrateFromMarkdown()` exported — opens DB if needed, wraps import in `transaction()`, imports decisions + requirements + hierarchy artifacts, logs counts to stderr
- [ ] Test suite passes: 71 assertions covering parsers, supersession chains, malformed input, orchestrator behavior, idempotent re-import, missing file handling, round-trip fidelity
- [ ] `npx tsc --noEmit` clean

## Verification

- `node --experimental-sqlite --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/md-importer.test.ts`
- `npx tsc --noEmit`

## Inputs

- `/Users/lexchristopherson/Developer/gsd-2/.gsd/worktrees/memory-db/src/resources/extensions/gsd/md-importer.ts` — source file to port (526 lines)
- `/Users/lexchristopherson/Developer/gsd-2/.gsd/worktrees/memory-db/src/resources/extensions/gsd/tests/md-importer.test.ts` — test file to port (411 lines)
- `src/resources/extensions/gsd/gsd-db.ts` — S01 output, provides `openDatabase`, `closeDatabase`, `upsertDecision`, `upsertRequirement`, `insertArtifact`, `transaction`, `_getAdapter`, `getDecisionById`, `getRequirementById`, `getActiveDecisions`, `getActiveRequirements`
- `src/resources/extensions/gsd/paths.ts` — provides `resolveGsdRootFile`, `milestonesDir`, `resolveTaskFiles`
- `src/resources/extensions/gsd/guided-flow.ts` — provides `findMilestoneIds`
- `src/resources/extensions/gsd/types.ts` — provides `Decision`, `Requirement` interfaces
- `src/resources/extensions/gsd/tests/test-helpers.ts` — provides `createTestContext()` with `assertEq`, `assertTrue`, `report`
- `src/resources/extensions/gsd/tests/resolve-ts.mjs` — ESM test resolver hook

## Expected Output

- `src/resources/extensions/gsd/md-importer.ts` — new file, 526 lines, exports `parseDecisionsTable`, `parseRequirementsSections`, `migrateFromMarkdown`
- `src/resources/extensions/gsd/tests/md-importer.test.ts` — new file, 411 lines, 71 assertions all passing
