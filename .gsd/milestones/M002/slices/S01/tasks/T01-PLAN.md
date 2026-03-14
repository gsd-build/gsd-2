---
estimated_steps: 6
estimated_files: 13
---

# T01: Replace milestone ID format across all production, test, and doc files

**Slice:** S01 — Format swap — production code, tests, and docs
**Milestone:** M002

## Description

Mechanical format swap from `M-{rand6}-{seq}` to `M{seq}-{rand6}` across the entire codebase. The research inventories every change site — 16 production code locations in 8 files, ~114 test data references in 3 test files, and 2 doc file references. The core complexity is in `guided-flow.ts` where `parseMilestoneId` capture groups swap position and `nextMilestoneId` format string flips.

## Steps

1. **Core primitives** — Update `guided-flow.ts`:
   - L107: `findMilestoneIds` dir scan regex → `M\d+(?:-[a-z0-9]{6})?`
   - L118: comment → update example to new format
   - L119: `MILESTONE_ID_RE` → `/^M\d{3}(?:-[a-z0-9]{6})?$/`
   - L123: `extractMilestoneSeq` regex → `/^M(\d{3})(?:-[a-z0-9]{6})?$/` (digits in group 1)
   - L129: `parseMilestoneId` regex → `/^M(\d{3})(?:-([a-z0-9]{6}))?$/` and swap return statement: `num = parseInt(m[1])`, `prefix = m[2]`
   - L164: `nextMilestoneId` → `` `M${seq}-${generateMilestonePrefix()}` ``
2. **Remaining production files** — Apply regex pattern mapping from research to:
   - `state.ts` (L66, L171)
   - `workspace-index.ts` (L68, L79)
   - `files.ts` (L759, L769)
   - `dispatch-guard.ts` (L42)
   - `worktree.ts` (L98) — careful with `SLICE_BRANCH_RE` group numbering
   - `worktree-command.ts` (L320)
   - `index.ts` (L63, L484, L490)
3. **Test file: unique-milestone-ids.test.ts** — Replace all `M-abc123-001` style references with `M001-abc123` style. Update `MILESTONE_ID_RE` match/reject cases, `extractMilestoneSeq` test data, `parseMilestoneId` group expectations (prefix/num swap), `milestoneIdSort` arrays, `nextMilestoneId` assertions (check startsWith pattern and regex match).
4. **Test file: regex-hardening.test.ts** — Update all ~30 pattern strings, regex const declarations, and test data in comments and match/reject cases.
5. **Test file: integration-mixed-milestones.test.ts** — Systematic replacement of `M-abc123-NNN` → `MNNN-abc123` across ~69 references including fixture creation, assertions, and error message strings.
6. **Doc files** — Update `docs/preferences-reference.md` (L110) and `prompts/system.md` (L53) with new format description and examples.

## Must-Haves

- [ ] `MILESTONE_ID_RE` validates `M001-abc123` and rejects `M-abc123-001`
- [ ] `extractMilestoneSeq('M001-abc123')` returns `'001'`
- [ ] `parseMilestoneId('M001-abc123')` returns `{ prefix: 'abc123', num: 1 }`
- [ ] `nextMilestoneId([], true)` generates `M001-{rand6}` format
- [ ] All 8 production files use new regex pattern
- [ ] All 3 test suites pass (208+ assertions)
- [ ] Zero traces of old format in grep

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts`
- `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts`
- `npx vitest run src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts`
- `grep -rn 'M(?:-' src/resources/extensions/gsd/` returns zero hits
- `grep -rn 'M-[a-z0-9]\{6\}-\|M-abc123-\|M-eh88as-\|M-w2lhcz-' src/resources/extensions/gsd/` returns zero hits

## Observability Impact

- **No new signals** — this is a format swap, not a behavioral change
- **Existing signals preserved:** `parseMilestoneId` returns `undefined` on invalid input, `extractMilestoneSeq` returns `undefined` on non-match — both failure paths unchanged
- **Future agent inspection:** grep for `M\d+(?:-[a-z0-9]{6})?` confirms new format is in place; grep for `M(?:-` confirms old format is gone

## Inputs

- S01-RESEARCH.md — complete inventory of all change sites with line numbers, old→new pattern mapping table, and pitfall notes
- D007, D008 in DECISIONS.md — define the target format and regex pattern

## Expected Output

- All 13 files updated with new format
- All test suites passing
- Grep verification clean — zero old-format traces
