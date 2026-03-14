# S01: Format swap — production code, tests, and docs

**Goal:** Swap all milestone ID format references from `M-{rand6}-{seq}` to `M{seq}-{rand6}` across production code, tests, and docs with zero traces of the old format remaining.
**Demo:** `nextMilestoneId([], true)` returns `M001-{rand6}` format; all 208 test assertions pass; grep confirms zero old-format traces.

## Must-Haves

- `MILESTONE_ID_RE`, `extractMilestoneSeq`, `parseMilestoneId`, `nextMilestoneId` generate/parse `M{seq}-{rand6}` format
- All 8 production files use `M\d+(?:-[a-z0-9]{6})?` regex pattern
- All 3 test files use `M001-abc123` style test data
- Both doc files use updated format descriptions and examples
- `grep -rn 'M(?:-' src/resources/extensions/gsd/` returns zero hits
- All existing GSD test suites pass without regression

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — all assertions pass
- `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` — all assertions pass
- `npx vitest run src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — all assertions pass
- `grep -rn 'M(?:-' src/resources/extensions/gsd/` — zero hits
- `grep -rn 'M-[a-z0-9]\{6\}-\|M-abc123-\|M-eh88as-\|M-w2lhcz-' src/resources/extensions/gsd/` — zero hits
- `parseMilestoneId('invalid')` returns `undefined` — failure path preserved

## Observability / Diagnostics

- **Regex validation surface:** `MILESTONE_ID_RE` is the single source of truth for format validation — any invalid format produces a clear "invalid milestone ID" path in callers
- **Parse failure visibility:** `parseMilestoneId` returns `undefined` on non-matching input, and `extractMilestoneSeq` returns `undefined` — callers surface these as actionable errors
- **Grep audit:** Post-change grep for old format patterns confirms zero residual traces — this is the primary diagnostic signal for correctness
- **Test coverage:** 208+ assertions across 3 test files provide regression detection for any format-related breakage

## Tasks

- [x] **T01: Replace milestone ID format across all production, test, and doc files** `est:1h`
  - Why: Single mechanical pass covering all 16 production code sites, ~114 test data references, and 2 doc references — completes the entire slice
  - Files: `guided-flow.ts`, `state.ts`, `workspace-index.ts`, `files.ts`, `dispatch-guard.ts`, `worktree.ts`, `worktree-command.ts`, `index.ts`, `unique-milestone-ids.test.ts`, `regex-hardening.test.ts`, `integration-mixed-milestones.test.ts`, `preferences-reference.md`, `system.md`
  - Do: Update 5 core primitives in `guided-flow.ts` first (MILESTONE_ID_RE, extractMilestoneSeq with group index, parseMilestoneId with swapped capture groups, findMilestoneIds regex, nextMilestoneId format string). Then update regex patterns in remaining 7 production files per the pattern mapping table. Then update all test data from `M-abc123-NNN` to `MNNN-abc123` style across 3 test files. Then update 2 doc files. Watch for: `parseMilestoneId` capture group swap (num→group1, prefix→group2), `SLICE_BRANCH_RE` group numbering, `nextMilestoneId` test assertion style changes.
  - Verify: All 3 test suites pass, grep confirms zero old-format traces
  - Done when: 208+ test assertions pass and both grep commands return zero hits

## Files Likely Touched

- `src/resources/extensions/gsd/guided-flow.ts`
- `src/resources/extensions/gsd/state.ts`
- `src/resources/extensions/gsd/workspace-index.ts`
- `src/resources/extensions/gsd/files.ts`
- `src/resources/extensions/gsd/dispatch-guard.ts`
- `src/resources/extensions/gsd/worktree.ts`
- `src/resources/extensions/gsd/worktree-command.ts`
- `src/resources/extensions/gsd/index.ts`
- `src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts`
- `src/resources/extensions/gsd/tests/regex-hardening.test.ts`
- `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts`
- `docs/preferences-reference.md`
- `src/resources/extensions/gsd/prompts/system.md`
