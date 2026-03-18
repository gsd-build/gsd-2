# M010: Upstream Sync v2.22→v2.28

**Vision:** Merge 223 upstream commits (v2.22.0→v2.28.0) into the fork, resolve all conflicts, fix all errors/warnings/failing tests, and wire the session picker dispatch into the existing web session browser.

## Success Criteria

- All 223 upstream commits from v2.22.0 to v2.28.0 are in fork history
- Zero conflict markers remain in any file
- `npm run build` exits 0
- `npm run build:web-host` exits 0
- All unit tests pass with zero failures
- All integration tests pass with zero failures
- No new warnings introduced by the merge
- `/gsd sessions` dispatches correctly in the browser terminal, opening the existing session browser surface
- R127 (park/discard) and R129 (/gsd keys) are explicitly deferred — those features landed post-v2.28.0

## Key Risks / Unknowns

- Conflict resolution in `src/resources/extensions/gsd/state.ts` — both fork and upstream modify `deriveState`, making this the most nuanced merge hunk
- Post-merge test breakage — tests may reference relocated or renamed upstream modules after the 58 refactoring commits
- Stale dist/ artifacts — large merges leave orphaned `.d.ts` files that cause TS5055 errors (documented in KNOWLEDGE.md)

## Proof Strategy

- state.ts conflict complexity → retire in S01 by resolving all 8 conflict files and proving both builds pass
- Test breakage scope → retire in S02 by running the full test suite and fixing all failures
- Stale dist/ artifacts → retire in S01 by cleaning dist/ before the first post-merge build (established pattern from M003)

## Verification Classes

- Contract verification: `npm run build` exit 0, `npm run build:web-host` exit 0, `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` returns empty, `git log --oneline v2.22.0..v2.28.0 | wc -l` returns 223
- Integration verification: `npm run test:unit`, `npm run test:integration` — full suite green
- Operational verification: none (no new services or runtime behavior)
- UAT / human verification: browser spot-check that `/gsd sessions` opens the session browser surface

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 223 upstream commits are in fork history
- All 8 conflict files resolved with zero conflict markers anywhere
- Both builds (`npm run build`, `npm run build:web-host`) exit 0
- All unit and integration tests pass with zero failures
- No new warnings introduced
- `/gsd sessions` dispatches to the existing web session browser
- R127 and R129 are updated to deferred status with rationale
- Success criteria are re-checked against live behavior

## Requirement Coverage

- Covers: R125 (merge + both builds green), R126 (tests pass, zero warnings), R128 (session picker web surface)
- Defers: R127 (park/discard — feature not in v2.28.0, landed post-v2.28.0), R129 (/gsd keys — feature not in v2.28.0, landed post-v2.28.0)
- Orphan risks: none

## Slices

- [x] **S01: Big-Bang Merge + Conflict Resolution** `risk:high` `depends:[]`
  > After this: All 223 upstream commits merged, 8 conflict files resolved, both `npm run build` and `npm run build:web-host` exit 0, zero conflict markers in the codebase.
- [x] **S02: Test Green + Session Picker Dispatch + Final Verification** `risk:medium` `depends:[S01]`
  > After this: All unit and integration tests pass, `/gsd sessions` dispatches to the existing web session browser, zero warnings, both builds still green.

## Boundary Map

### S01 → S02

Produces:
- Clean merged codebase with all 223 upstream commits and zero conflict markers
- Both builds (`npm run build`, `npm run build:web-host`) exit 0
- Upstream's `gsd sessions` subcommand code present in `src/cli.ts`
- All upstream refactoring (auto.ts decomposition, headless mode, models-resolver, session picker) integrated

Consumes:
- nothing (first slice)

### S02

Produces:
- Full test suite green (unit + integration)
- `/gsd sessions` dispatch wired in web command surface
- Updated requirement statuses (R127→deferred, R129→deferred)

Consumes:
- S01's clean merged codebase with both builds passing
