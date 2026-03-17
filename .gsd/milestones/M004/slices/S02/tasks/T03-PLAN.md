---
estimated_steps: 7
estimated_files: 0
---

# T03: Verify documentation accuracy

**Slice:** S02 — Web Mode Documentation
**Milestone:** M004

## Description

Systematically verify that every path, command, view name, env var, and cross-reference in the new and updated docs matches the actual codebase. Fix any discrepancies found.

## Steps

1. Extract all file paths referenced in `docs/web-mode.md` and verify each exists
2. Verify all 6 view names match `KNOWN_VIEWS` in `web/components/gsd/app-shell.tsx`
3. Verify CLI flags (`--web`, `web start`, `web stop`) match `src/cli-web-branch.ts`
4. Verify `GSD_WEB_*` env vars match `src/web-mode.ts` spawn env
5. Verify all `[text](./path)` cross-references across all 8 files resolve to existing targets
6. Verify command classification (20 surface, 9 passthrough, 1 help) matches `web/lib/browser-slash-command-dispatch.ts`
7. Verify API route count matches `ls web/app/api/ | wc -l`

## Must-Haves

- [ ] Zero documentation-vs-codebase mismatches after this task
- [ ] All cross-reference links resolve

## Verification

- All 7 checks pass — run as bash commands and grep/diff checks
- If discrepancies found, fix them and re-verify

## Inputs

- `docs/web-mode.md` — from T01
- All updated docs — from T02
- Source files for truth: `src/web-mode.ts`, `src/cli-web-branch.ts`, `web/components/gsd/app-shell.tsx`, `web/lib/browser-slash-command-dispatch.ts`, `web/app/api/`

## Observability Impact

This task is verification-only — no runtime signals change. Observability:

- **Inspection surface:** The 7 bash verification checks themselves are the observability. Each produces a pass/fail result.
- **Failure visibility:** Any mismatch between docs and source code is surfaced as a concrete diff (expected vs actual) in the task summary.
- **Future agent signal:** After this task, the T03-SUMMARY.md records all checks passed/failed, so downstream agents know the docs are verified accurate or which items need attention.

## Expected Output

- No new files — corrections applied to existing docs if needed
- All 7 verification checks pass
