# S01: Big-Bang Merge + Conflict Resolution

**Goal:** Merge all 223 upstream commits from v2.22.0→v2.28.0, resolve all 8 conflict files, clean stale artifacts, and achieve green builds.
**Demo:** `npm run build` and `npm run build:web-host` both exit 0. `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` returns empty. `git log --oneline v2.22.0..v2.28.0 | wc -l` shows 223 commits in fork history.

## Must-Haves

- All 223 upstream commits present in fork history
- All 8 conflict files resolved (`.gitignore`, `src/cli.ts`, `src/resource-loader.ts`, `src/resources/extensions/gsd/state.ts`, `packages/pi-coding-agent/src/core/settings-manager.ts`, `src/resources/extensions/gsd/tests/derive-state-db.test.ts`, `src/resources/extensions/gsd/workspace-index.ts`, `src/tests/github-client.test.ts`)
- Zero conflict markers in any file
- `npm run build` exits 0
- `npm run build:web-host` exits 0

## Verification

- `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` — returns empty
- `git log --oneline v2.22.0..HEAD | wc -l` — includes all 223 upstream commits
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0

## Tasks

- [x] **T01: Execute merge and resolve all 8 conflict files** `est:45m`
  - Why: The merge itself and conflict resolution are the core risk of this milestone. 8 files have conflicts; 10 hunks total. The most nuanced is `state.ts` where both fork and upstream modify `deriveState`.
  - Files: `.gitignore`, `src/cli.ts`, `src/resource-loader.ts`, `src/resources/extensions/gsd/state.ts`, `packages/pi-coding-agent/src/core/settings-manager.ts`, `src/resources/extensions/gsd/tests/derive-state-db.test.ts`, `src/resources/extensions/gsd/workspace-index.ts`, `src/tests/github-client.test.ts`
  - Do: Run `git merge v2.28.0 --no-edit`. For each conflicted file, read the conflict hunks, determine the correct resolution (keep fork additions + take upstream changes), resolve, and stage. For `cli.ts`: keep fork web mode launch path + take upstream session picker + headless additions. For `state.ts`: keep fork modifications + take upstream changes (different regions of `deriveState`). For `.gitignore`: take upstream additions, keep fork additions. For test files: take upstream test updates, adjust any fork-specific assertions. After resolving all, run `rg "^<<<<<<<|^>>>>>>>|^=======$"` across the full tree to catch any missed markers. Complete the merge commit.
  - Verify: `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` returns empty; `git log --oneline v2.22.0..HEAD | wc -l` shows 223+ commits
  - Done when: Merge commit exists with zero conflict markers anywhere in the codebase

- [x] **T02: Clean stale artifacts and fix both builds** `est:30m`
  - Why: Large merges leave orphaned `.d.ts` files in `packages/*/dist/` that cause TS5055 errors (documented in KNOWLEDGE.md). Post-merge build errors from import path changes or renamed modules must be fixed.
  - Files: `packages/*/dist/` (clean), any files with build errors
  - Do: `rm -rf packages/*/dist/`. Run `npm run build`. Fix any TypeScript errors — likely candidates: import path changes from upstream refactoring, new module exports, renamed functions. Run `npm run build:web-host`. Fix any web build errors. Repeat until both exit 0.
  - Verify: `npm run build` exit 0; `npm run build:web-host` exit 0
  - Done when: Both build commands pass clean with no errors

## Observability / Diagnostics

- **Conflict marker scan:** `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` — must return empty after merge. Non-empty output means unresolved conflicts.
- **Merge history audit:** `git log --oneline v2.22.0..HEAD | wc -l` — must show 223+ commits. Fewer means the merge didn't land all upstream commits.
- **Build health:** `npm run build` and `npm run build:web-host` exit codes. Non-zero with TS errors typically means stale `.d.ts` in `packages/*/dist/` (KNOWLEDGE.md pattern) or import path drift from upstream refactoring.
- **Fork preservation check:** `rg "webMode|--web" src/cli.ts` — must show fork's web mode additions survived the merge. `rg "deriveState" src/resources/extensions/gsd/state.ts` — must show fork's state derivation logic.
- **Failure visibility:** If builds fail post-merge, TypeScript error output includes file paths and line numbers. Stale dist artifacts are the most common cause (TS5055 errors).

## Files Likely Touched

- `.gitignore`
- `src/cli.ts`
- `src/resource-loader.ts`
- `src/resources/extensions/gsd/state.ts`
- `packages/pi-coding-agent/src/core/settings-manager.ts`
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts`
- `src/resources/extensions/gsd/workspace-index.ts`
- `src/tests/github-client.test.ts`
- `packages/*/dist/` (cleaned)
