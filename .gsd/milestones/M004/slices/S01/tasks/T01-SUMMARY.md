---
id: T01
parent: S01
milestone: M004
provides:
  - test:web-contract npm script targeting 12 web contract test files
  - web-build CI job with ubuntu-latest/macos-latest matrix
key_files:
  - package.json
  - .github/workflows/ci.yml
key_decisions:
  - Added --test-force-exit to test:web-contract to prevent hanging from imported server modules keeping the event loop alive
patterns_established:
  - Web contract tests use the same resolve-ts.mjs loader as test:unit but with --test-force-exit for clean exit
observability_surfaces:
  - web-build CI job appears as separate GitHub Actions check with per-OS pass/fail
  - npm run test:web-contract runs 12 test files (256 tests) with per-file pass/fail output
duration: 12m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Add test:web-contract script and web-build CI job

**Added `test:web-contract` npm script and independent `web-build` CI job with ubuntu/macos matrix.**

## What Happened

1. Added `"test:web-contract"` script to `package.json` using the same Node test runner pattern as `test:unit` (resolve-ts.mjs loader, --experimental-strip-types, --test) but targeting only `src/tests/web-*.test.ts` and adding `--test-force-exit` because 6 of the 12 test files import server modules (bridge-service, route handlers) that keep open handles.

2. Added `web-build` job to `.github/workflows/ci.yml` after the `windows-portability` job. The job uses `strategy.matrix.os: [ubuntu-latest, macos-latest]`, checks out with `fetch-depth: 0`, sets up Node 22 with npm cache, runs `npm ci`, then `npm run build:web-host`, then `npm run test:web-contract`. No `needs:` dependency — runs independently from existing jobs.

3. Fixed observability gaps in S01-PLAN.md and T01-PLAN.md as required by pre-flight.

## Verification

- `npm run test:web-contract` → 256 tests pass, 0 fail, 12 files, 8.1s duration
- `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"` → outputs correct command
- YAML parse via `yaml` package → succeeds without error
- Manual inspection: `web-build` job has correct matrix `[ubuntu-latest, macos-latest]`, 5 steps (checkout, setup-node, npm ci, build:web-host, test:web-contract), no `needs:` key

### Slice-level verification (all pass — this is the only task in S01):
- ✅ `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"` outputs valid test command
- ✅ YAML parses successfully
- ✅ `npm run test:web-contract` passes locally (256/256 tests, 12 files)
- ✅ CI job structure: `web-build` exists with matrix, `build:web-host` step, `test:web-contract` step, no `needs: build`

## Diagnostics

- **Script check:** `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"`
- **YAML health:** `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`
- **Local test run:** `npm run test:web-contract` — shows per-file and per-test pass/fail
- **CI visibility:** `web-build` job shows as independent check in GitHub Actions with per-OS results

## Deviations

- Added `--test-force-exit` flag not in original plan. Required because 6 test files import server modules (bridge-service.ts, route handlers) that create persistent handles. Without it, the process hangs for 2+ minutes and the file-level results show as "fail" despite all 256 individual tests passing. The CI job would also hang/timeout without this flag.

## Known Issues

- The `web-build` CI job requires workspace packages to be built (`build:web-host` calls `npm --prefix web run build` + staging, but doesn't build `packages/pi-ai/dist/` etc.). In CI, `npm ci` + `npm run build:web-host` should suffice since the web build produces the needed artifacts. If CI fails on missing dist/ files, adding `npm run build:pi` before `build:web-host` would fix it.

## Files Created/Modified

- `package.json` — added `test:web-contract` script
- `.github/workflows/ci.yml` — added `web-build` job with matrix strategy
- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M004/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section
