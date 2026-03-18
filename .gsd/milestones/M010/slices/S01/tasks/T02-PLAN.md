---
estimated_steps: 5
estimated_files: 6
---

# T02: Clean stale artifacts and fix both builds

**Slice:** S01 — Big-Bang Merge + Conflict Resolution
**Milestone:** M010

## Description

After the merge commit, stale `.d.ts` files in `packages/*/dist/` may cause TS5055 errors. Clean all dist directories, then run both builds and fix any errors from import path changes, renamed modules, or new upstream exports.

## Steps

1. `rm -rf packages/*/dist/` to clear stale build artifacts
2. Run `npm run build` — fix any TypeScript errors (likely: import path changes from upstream refactoring, new module references, renamed functions from auto.ts decomposition)
3. Run `npm run build:web-host` — fix any web build errors (the web skin should be clean since `src/web/` and `web/` have zero upstream changes, but verify)
4. If either build fails, diagnose the error, apply the minimal fix, and re-run
5. Iterate until both builds exit 0

## Must-Haves

- [ ] `packages/*/dist/` cleaned before first build attempt
- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build` — exit 0
- `npm run build:web-host` — exit 0

## Observability Impact

- **Build exit codes** are the primary signal: `npm run build` and `npm run build:web-host` must both exit 0.
- **TS5055 errors** (duplicate declarations) after a merge indicate stale `.d.ts` files in `packages/*/dist/` — the fix is always `rm -rf packages/*/dist/` before rebuilding.
- **Import-path errors** (TS2307 "Cannot find module") indicate upstream refactoring moved or renamed modules — trace the import to the new path via `rg` or `find`.
- **Type errors** (TS2339, TS2345) indicate upstream changed function signatures or exports — read the upstream file to see the new shape.
- **Diagnostic commands:** `npm run build 2>&1 | head -50` shows the first errors. `npm run build:web-host 2>&1 | tail -20` shows exit status.
- **Failure state visibility:** Any committed build-fix changes will appear in `git diff HEAD~1..HEAD` after the auto-commit.

## Inputs

- T01's merge commit with all conflicts resolved
- KNOWLEDGE.md: "Clean dist/ Before Rebuilding After Merge"

## Expected Output

- Both builds passing clean
- Any build-fix changes committed
