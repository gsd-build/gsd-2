---
id: T01
parent: S01
milestone: M010
provides:
  - Merge commit integrating all 223 upstream v2.22.0→v2.28.0 commits
  - 8 conflict files resolved with fork additions preserved
key_files:
  - .gitignore
  - src/cli.ts
  - src/resource-loader.ts
  - src/resources/extensions/gsd/state.ts
  - packages/pi-coding-agent/src/core/settings-manager.ts
  - src/resources/extensions/gsd/tests/derive-state-db.test.ts
  - src/resources/extensions/gsd/workspace-index.ts
  - src/tests/github-client.test.ts
key_decisions:
  - Kept fork's detailed DB-avoidance comment in state.ts over upstream's shorter version (more context for future agents)
  - Merged fork's roadmapMeta passthrough into upstream's parallelized workspace-index.ts
  - Combined both sides' getRepoInfo test assertions (upstream's gsd-2 check + fork's no-slash checks)
patterns_established:
  - Union resolution for .gitignore (keep both sides' additions in separate sections)
  - For cli.ts: fork feature blocks go before upstream feature blocks to maintain chronological order
observability_surfaces:
  - "rg '^<<<<<<<|^>>>>>>>|^=======$' src/ web/ packages/ .github/" — must return empty (conflict marker scan)
  - "git log --oneline v2.22.0..HEAD | wc -l" — must show 489+ commits (223 upstream + fork)
  - "rg 'webMode|--web' src/cli.ts" — verifies fork web mode survived merge
  - "rg 'deriveState' src/resources/extensions/gsd/state.ts" — verifies fork state logic survived
duration: 12m
verification_result: passed
completed_at: 2026-03-18T12:57:00-04:00
blocker_discovered: false
---

# T01: Execute merge and resolve all 8 conflict files

**Merged v2.28.0 (223 upstream commits) into fork, resolving all 8 conflict files with zero markers remaining and all fork additions preserved.**

## What Happened

Ran `git merge v2.28.0 --no-edit` which stopped with conflicts in exactly the 8 expected files. Resolved each systematically:

1. **`.gitignore`** — Union: kept fork's section structure, added upstream's stale lock file section (pnpm-lock.yaml, bun.lock).
2. **`src/cli.ts`** (2 hunks) — Hunk 1: added both fork's `web`/`webPath` flags and upstream's `_selectedSessionPath` to CliFlags. Hunk 2: kept fork's web mode blocks, added upstream's `sessions` picker and `headless` subcommand blocks.
3. **`src/resource-loader.ts`** (2 hunks) — Hunk 1: took upstream's broader fs import list (adds `chmodSync`, `statSync`). Hunk 2: kept fork's NON_EXTENSION_FILES cleanup AND added upstream's `makeTreeWritable(destExtensions)` call.
4. **`src/resources/extensions/gsd/state.ts`** (2 hunks) — Hunk 1: kept fork's explanatory DB-removal comment. Hunk 2: kept fork's more detailed DB-avoidance comment over upstream's shorter version (same intent, more context).
5. **`packages/pi-coding-agent/src/core/settings-manager.ts`** — Added upstream's `editMode` property to Settings interface.
6. **`src/resources/extensions/gsd/tests/derive-state-db.test.ts`** — Took upstream's corrected test assertions (requirements read from disk correctly now that test fixture writes REQUIREMENTS.md to disk).
7. **`src/resources/extensions/gsd/workspace-index.ts`** — Took upstream's parallelized `Promise.all` slice indexing, preserved fork's `roadmapMeta` passthrough (risk, depends, demo).
8. **`src/tests/github-client.test.ts`** — Combined both: upstream's `gsd-2` repo name check + fork's no-slash assertions.

## Verification

- Conflict marker scan: `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` returned empty (exit 1 = no matches).
- Commit count: `git log --oneline v2.22.0..HEAD | wc -l` = 489 (223 upstream + 266 fork commits).
- Fork preservation: `rg "webMode|--web" src/cli.ts` shows fork web mode code present. `rg "deriveState" src/resources/extensions/gsd/state.ts` shows fork state derivation logic present.
- Merge commit: `f192e2cb Merge tag 'v2.28.0' into milestone/M010`.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `rg "^<<<<<<<\|^>>>>>>>\|^=======$" src/ web/ packages/ .github/` | 1 (no matches) | ✅ pass | <1s |
| 2 | `git log --oneline v2.22.0..HEAD \| wc -l` | 0 | ✅ pass (489 commits) | <1s |
| 3 | `rg "webMode\|--web" src/cli.ts` | 0 | ✅ pass (4 matches) | <1s |
| 4 | `rg "deriveState" src/resources/extensions/gsd/state.ts` | 0 | ✅ pass (5 matches) | <1s |

### Slice-level verification (partial — T01 is not the final task):

| # | Command | Status | Notes |
|---|---------|--------|-------|
| 1 | Conflict marker scan | ✅ pass | Zero markers |
| 2 | Commit count (223+ upstream) | ✅ pass | 489 total |
| 3 | `npm run build` | ⏳ pending | T02 responsibility |
| 4 | `npm run build:web-host` | ⏳ pending | T02 responsibility |

## Diagnostics

- Inspect merge: `git log --oneline -1` shows merge commit hash and message.
- Verify any specific file's resolution: `git diff HEAD~1..HEAD -- <file>` to see what the merge changed.
- If merge is corrupt: `git reset --hard HEAD~1` and re-attempt.

## Deviations

None — all 8 conflicts matched the dry-run prediction exactly.

## Known Issues

- Builds (`npm run build`, `npm run build:web-host`) have not been run yet — that's T02's responsibility. Post-merge build errors are expected (stale dist/, import path changes).

## Files Created/Modified

- `.gitignore` — Added upstream's stale lock file section
- `src/cli.ts` — Merged fork web mode + upstream sessions/headless features
- `src/resource-loader.ts` — Took upstream's Nix-compatible fs imports + makeTreeWritable, kept fork's helper cleanup
- `src/resources/extensions/gsd/state.ts` — Kept fork's DB-avoidance comments, took upstream's equivalent code path
- `packages/pi-coding-agent/src/core/settings-manager.ts` — Added upstream's editMode setting
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — Took upstream's corrected disk-read assertions
- `src/resources/extensions/gsd/workspace-index.ts` — Took upstream's parallel indexing, preserved fork's roadmapMeta
- `src/tests/github-client.test.ts` — Combined both sides' getRepoInfo assertions
