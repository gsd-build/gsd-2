---
estimated_steps: 5
estimated_files: 0
---

# T04: Final verification sweep

**Slice:** S02 — Test Green + Session Picker Dispatch + Final Verification
**Milestone:** M010

## Description

Run the complete verification sequence to confirm all milestone success criteria are met. This is a verification-only task — no code changes unless failures are discovered.

## Steps

1. `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` — must return empty
2. `npm run build` — must exit 0
3. `npm run build:web-host` — must exit 0
4. `npm run test:unit` — must pass with zero failures
5. `npm run test:integration` — must pass with zero failures

## Must-Haves

- [ ] Zero conflict markers anywhere
- [ ] Both builds exit 0
- [ ] All tests pass
- [ ] No new warnings

## Verification

- All 5 commands above pass — milestone success criteria are met

## Observability Impact

- **Conflict markers:** `rg "^<<<<<<<|^>>>>>>>|^=======$" src/ web/ packages/ .github/` — empty output means clean merge. Any match is a critical failure with file:line location.
- **Build signals:** `npm run build` and `npm run build:web-host` exit codes — 0 is pass, non-zero includes TypeScript diagnostic with file:line:col.
- **Test signals:** `npm run test:unit` and `npm run test:integration` produce structured pass/fail counts with assertion diffs on failure. Zero failures is the success gate.
- **Failure inspection:** All five commands emit structured diagnostics (file paths, line numbers, assertion diffs) — a future agent can re-run any single command to isolate a regression.

## Inputs

- All prior tasks in S01 and S02 completed

## Expected Output

- All success criteria verified — milestone ready for summary
