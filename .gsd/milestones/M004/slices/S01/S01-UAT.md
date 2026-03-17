# S01: CI Web-Build Job — UAT

**Milestone:** M004
**Written:** 2026-03-17

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 produces two static artifacts (an npm script and a CI YAML job). All verification is structural inspection and local test execution — no running server, browser, or live CI run required.

## Preconditions

- Working directory is the M004 worktree with `npm ci` completed
- Node 22+ available
- `yaml` npm package available (already a project dependency)

## Smoke Test

Run `npm run test:web-contract` and confirm it exits 0 with all tests passing.

## Test Cases

### 1. test:web-contract script exists and is correct

1. Run: `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"`
2. **Expected:** Output contains `--test` and `--test-force-exit` and `src/tests/web-*.test.ts` and `resolve-ts.mjs`

### 2. test:web-contract passes locally

1. Run: `npm run test:web-contract`
2. **Expected:** 256 tests pass, 0 fail, 12 test files, process exits within ~15s (not hanging)

### 3. CI YAML parses without error

1. Run: `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('OK')"`
2. **Expected:** Output is `OK`, no errors

### 4. web-build job has correct matrix

1. Run: `node -e "const y=require('yaml');const f=require('fs');const ci=y.parse(f.readFileSync('.github/workflows/ci.yml','utf8'));console.log(JSON.stringify(ci.jobs['web-build'].strategy.matrix.os))"`
2. **Expected:** `["ubuntu-latest","macos-latest"]`

### 5. web-build job has no dependency on existing jobs

1. Run: `node -e "const y=require('yaml');const f=require('fs');const ci=y.parse(f.readFileSync('.github/workflows/ci.yml','utf8'));console.log(ci.jobs['web-build'].needs || 'INDEPENDENT')"`
2. **Expected:** `INDEPENDENT` (no `needs:` key present)

### 6. web-build job has all required steps

1. Run: `node -e "const y=require('yaml');const f=require('fs');const ci=y.parse(f.readFileSync('.github/workflows/ci.yml','utf8'));ci.jobs['web-build'].steps.forEach(s=>console.log(s.name||s.run))"`
2. **Expected:** Steps include checkout, Node setup, `npm ci`, `npm run build:web-host`, and `npm run test:web-contract` in that order

## Edge Cases

### Missing yaml package

1. If `require('yaml')` fails, install it: `npm ci` should provide it as a project dependency
2. **Expected:** After `npm ci`, yaml parse check works

### test:web-contract hangs without --test-force-exit

1. Inspect the script in package.json for `--test-force-exit` flag
2. **Expected:** Flag is present. Without it, 6 of 12 test files would keep the process alive for 2+ minutes after completion due to imported server modules holding open handles.

## Failure Signals

- `npm run test:web-contract` exits non-zero or reports any test failures
- YAML parse throws an error (malformed CI config)
- `web-build` job is missing from `ci.yml` or has a `needs:` dependency
- Matrix does not include both `ubuntu-latest` and `macos-latest`
- Steps are missing `build:web-host` or `test:web-contract`

## Requirements Proved By This UAT

- R112 — structural completeness: npm script exists with correct glob and flags, CI job has correct matrix/steps/independence. Full R112 validation requires a real CI run on push.

## Not Proven By This UAT

- Platform-specific CI behavior on ubuntu-latest (build:web-host has only run on macOS locally)
- Actual GitHub Actions execution and check reporting
- Whether `build:web-host` succeeds without a prior `build:pi` step in CI (potential missing dist/ issue)

## Notes for Tester

- The test count (256) may change as web contract tests are added/removed. The key signal is 0 failures, not an exact count.
- The `--test-force-exit` deviation from the plan is intentional and documented in KNOWLEDGE.md. Without it, CI would hang or timeout.
- This is a single-task slice — all verification is effectively task-level. The UAT confirms the assembled slice goal (independent CI job) rather than individual task mechanics.
