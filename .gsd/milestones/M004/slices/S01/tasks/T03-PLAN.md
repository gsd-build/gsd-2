---
estimated_steps: 5
estimated_files: 2
---

# T03: Run full verification and record decisions

**Slice:** S01 — CI Failure Fix and Verification
**Milestone:** M004

## Description

After fixing the TypeScript error, run the full verification suite to ensure no additional failures surface. The research warns that the visible TypeScript error may be only the first blocker. Once all verification passes, record the reconciliation decisions and update project state.

## Steps

1. Run `npm run build` from the root to verify all packages build successfully
2. Run `npm test -w @gsd/pi-ai` to verify the 32 unit tests pass (including live models.dev verification)
3. Run scenario tests: `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js`
4. Check `git status` to confirm clean working tree
5. If any additional failures surface, investigate and fix before proceeding
6. Once all verification passes, append reconciliation decisions to `.gsd/DECISIONS.md` (D026: populate registry from snapshot, D027: non-null assertion for known model)
7. Update `.gsd/STATE.md` to reflect M004 completion

## Must-Haves

- [ ] Root build succeeds (`npm run build`)
- [ ] Unit tests pass (`npm test -w @gsd/pi-ai`)
- [ ] Scenario tests pass (9 tests)
- [ ] Git status is clean
- [ ] Decisions recorded in `.gsd/DECISIONS.md`
- [ ] State updated in `.gsd/STATE.md`

## Verification

- All build and test commands exit with code 0
- `git status --short` returns empty output
- `.gsd/DECISIONS.md` contains D026 and D027
- `.gsd/STATE.md` reflects M004 complete

## Observability Impact

- Signals added/changed: Decision log provides durable trace of reconciliation approach
- How a future agent inspects this: Read `.gsd/DECISIONS.md` for D026-D027 to understand the fix
- Failure state exposed: If verification fails, the specific failing command provides the diagnostic signal

## Inputs

- Prior tasks T01 and T02 completed
- `.gsd/DECISIONS.md` — existing decisions to append to
- `.gsd/STATE.md` — current state to update

## Expected Output

- `.gsd/DECISIONS.md` — appended with D026 (registry initialization) and D027 (non-null assertion)
- `.gsd/STATE.md` — updated to show M004 complete
