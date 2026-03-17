---
id: S01
parent: M004
milestone: M004
provides:
  - test:web-contract npm script targeting 12 web contract test files (256 tests)
  - web-build CI job with ubuntu-latest/macos-latest matrix, independent from existing jobs
requires: []
affects:
  - S02
key_files:
  - package.json
  - .github/workflows/ci.yml
key_decisions:
  - Added --test-force-exit to test:web-contract because 6 of 12 test files import server modules (bridge-service, route handlers) that keep open handles, causing the Node test runner to hang for 2+ minutes after all tests pass
patterns_established:
  - Web contract tests use the same resolve-ts.mjs loader as test:unit but with --test-force-exit for clean exit
  - CI web jobs run independently (no needs: dependency) with OS matrix strategy matching the target deployment platforms
observability_surfaces:
  - web-build CI job appears as separate GitHub Actions check with per-OS pass/fail
  - npm run test:web-contract runs 12 test files (256 tests) with per-file pass/fail output
drill_down_paths:
  - .gsd/milestones/M004/slices/S01/tasks/T01-SUMMARY.md
duration: 12m
verification_result: passed
completed_at: 2026-03-17
---

# S01: CI Web-Build Job

**Independent `web-build` CI job with ubuntu/macos matrix running `build:web-host` and 256 web contract tests.**

## What Happened

Added a `test:web-contract` npm script to `package.json` using the existing Node test runner pattern (resolve-ts.mjs loader, --experimental-strip-types) targeting `src/tests/web-*.test.ts`. The script includes `--test-force-exit` because 6 of the 12 test files import server modules (bridge-service.ts, Next.js route handlers) that create persistent handles — without it the process hangs for 2+ minutes after all tests pass and file-level results report as "fail" despite all individual tests passing.

Added a `web-build` job to `.github/workflows/ci.yml` with `strategy.matrix.os: [ubuntu-latest, macos-latest]`. The job checks out with `fetch-depth: 0`, sets up Node 22 with npm cache, runs `npm ci`, then `npm run build:web-host`, then `npm run test:web-contract`. No `needs:` key — the job runs independently and in parallel with existing CI jobs.

## Verification

- `npm run test:web-contract` → 256 tests pass, 0 fail, 12 files, ~8s
- `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"` → outputs correct command
- YAML parse via `yaml` package → succeeds without error
- CI job structure: `web-build` exists with matrix `[ubuntu-latest, macos-latest]`, 5 steps (checkout, setup-node, npm ci, build:web-host, test:web-contract), no `needs:` key

## Requirements Advanced

- R112 — CI web-build job is structurally complete: `test:web-contract` script exists and passes locally (256/256), `web-build` CI job has correct matrix, steps, and independence. Full validation deferred until the first CI run on push confirms platform-specific behavior on ubuntu-latest and macos-latest.

## Requirements Validated

- none — R112 awaits first real CI run for full validation

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- R111 — Primary owning slice corrected from M004/S01 to M004/S02 (S02 is the documentation slice; S01 is CI only)
- R112 — Primary owning slice corrected from M004/S03 to M004/S01 (M004 has only S01 and S02; S01 is the CI slice)

## Deviations

- Added `--test-force-exit` flag not in the original plan. Required because 6 test files import server modules that keep open handles, causing hangs and false file-level failures. This is documented in KNOWLEDGE.md.

## Known Limitations

- The CI job has not yet run on GitHub Actions. Local verification confirms the scripts work and the YAML is structurally correct, but platform-specific issues (Linux build paths, Next.js standalone build on ubuntu) will only surface on the first real push.
- If CI fails on missing `dist/` files from workspace packages, adding `npm run build:pi` before `build:web-host` would fix it.

## Follow-ups

- Monitor the first CI run after merge to confirm `web-build` passes on both ubuntu-latest and macos-latest. If Linux-specific failures appear, they are the primary technical risk identified in the milestone roadmap.

## Files Created/Modified

- `package.json` — added `test:web-contract` script
- `.github/workflows/ci.yml` — added `web-build` job with matrix strategy

## Forward Intelligence

### What the next slice should know
- S02 (documentation) is fully independent from S01. No files overlap. The CI job established here does not affect documentation work.
- The `test:web-contract` script and `web-build` CI job are the only S01 deliverables — docs references to CI should point at `.github/workflows/ci.yml`.

### What's fragile
- `build:web-host` on Linux CI — the standalone Next.js build has only run on macOS locally. GitHub Actions ubuntu runners may surface platform-specific failures (the primary technical risk in the milestone roadmap).
- The `--test-force-exit` flag masks underlying open-handle cleanup. If new test files import more server modules, the flag handles it, but understanding which files create persistent handles matters if the flag is ever removed.

### Authoritative diagnostics
- `npm run test:web-contract` — per-file and per-test pass/fail with timing; the single source of truth for web contract test health
- `web-build` job in GitHub Actions — per-OS pass/fail visible as a separate check

### What assumptions changed
- Original plan estimated 15 web contract test files; actual count is 12 files with 256 tests
- `--test-force-exit` was not anticipated but is required for reliable CI execution
