---
estimated_steps: 6
estimated_files: 10
---

# T01: Execute merge and resolve all 8 conflict files

**Slice:** S01 — Big-Bang Merge + Conflict Resolution
**Milestone:** M010

## Description

Run `git merge v2.28.0`, then systematically resolve all 8 conflict files. The dry-run merge-tree shows these conflicts:

1. `.gitignore` — take upstream additions, keep fork additions
2. `src/cli.ts` (2 hunks) — keep fork web mode additions + take upstream session picker, headless, models-resolver, update-check additions
3. `src/resource-loader.ts` (2 hunks) — take upstream changes, preserve fork additions
4. `src/resources/extensions/gsd/state.ts` (2 hunks) — most nuanced: both modify deriveState, but fork and upstream target different regions
5. `packages/pi-coding-agent/src/core/settings-manager.ts` (1 hunk) — take upstream
6. `src/resources/extensions/gsd/tests/derive-state-db.test.ts` (1 hunk) — take upstream test updates, preserve fork-specific assertions if any
7. `src/resources/extensions/gsd/workspace-index.ts` (1 hunk) — take upstream, preserve fork additions
8. `src/tests/github-client.test.ts` (1 hunk) — take upstream test updates

## Steps

1. Run `git merge v2.28.0 --no-edit` — this will stop with conflict markers in the 8 files
2. For each conflict file, read the conflict hunks, understand what fork adds vs what upstream adds, and resolve:
   - For `.gitignore`: union of both sides
   - For `cli.ts`: keep fork's `--web` launch path and web mode code; take upstream's session picker block, headless block, models-resolver import, `checkAndPromptForUpdates` import, `_selectedSessionPath` on `CliFlags`
   - For `resource-loader.ts`: take upstream refactoring, preserve any fork-specific loader additions
   - For `state.ts`: keep fork deriveState modifications, take upstream changes (different regions)
   - For remaining 4 files: read the hunks and resolve based on which side's changes are more current
3. After resolving each file, run `rg "^<<<<<<<|^>>>>>>>|^=======$" <file>` to catch any duplicate hunks
4. Stage all resolved files with `git add`
5. Run `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` across the full tree
6. Complete the merge with `git commit --no-edit`

## Must-Haves

- [ ] All 8 conflict files resolved correctly
- [ ] Zero conflict markers in any file
- [ ] Merge commit created with all 223 upstream commits in history
- [ ] Fork web mode additions preserved in cli.ts
- [ ] Fork deriveState modifications preserved in state.ts

## Verification

- `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` — returns empty
- `git log --oneline v2.22.0..HEAD | wc -l` — 223+ (upstream commits + fork commits)

## Observability Impact

- **Conflict markers:** After this task, `rg "^<<<<<<<|^>>>>>>>|^=======$"` across the repo must return empty. Any non-empty result is a missed conflict.
- **Git history:** `git log --oneline v2.22.0..HEAD | wc -l` changes from fork-only count to 223+ (all upstream commits included). This is the primary signal that the merge landed correctly.
- **Fork additions inspection:** Future agents can verify fork code survived by checking `rg "webMode|--web" src/cli.ts` and `rg "deriveState" src/resources/extensions/gsd/state.ts`.
- **Failure state:** If the merge commit exists but conflict markers remain, the merge is corrupted and must be reset with `git reset --hard HEAD~1` and re-attempted.

## Inputs

- Upstream tag `v2.28.0` — the merge target
- Research doc identifying 8 conflict files and their hunk counts
- KNOWLEDGE.md patterns: anchored conflict marker search, clean dist/ after merge

## Expected Output

- Merge commit with all upstream commits integrated
- 8 conflict files resolved with fork additions preserved and upstream changes taken
