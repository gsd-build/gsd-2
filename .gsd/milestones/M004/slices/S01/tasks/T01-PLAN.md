---
estimated_steps: 4
estimated_files: 2
---

# T01: Add test:web-contract script and web-build CI job

**Slice:** S01 — CI Web-Build Job
**Milestone:** M004

## Description

Add a focused `test:web-contract` npm script that runs only the 12 web contract test files, then add a `web-build` job to `ci.yml` that builds the web host and runs those tests on ubuntu-latest and macos-latest.

## Steps

1. Add `"test:web-contract"` script to `package.json` using the same Node test runner invocation pattern as `test:unit` but targeting only `src/tests/web-*.test.ts`
2. Add `web-build` job to `.github/workflows/ci.yml` after the existing `build` job with: `strategy.matrix.os: [ubuntu-latest, macos-latest]`, checkout with `fetch-depth: 0`, setup Node 22 with npm cache, `npm ci`, `npm run build:web-host`, `npm run test:web-contract`. No `needs:` dependency on other jobs.
3. Verify `npm run test:web-contract` passes locally
4. Verify YAML parses correctly

## Must-Haves

- [ ] `test:web-contract` npm script targeting `src/tests/web-*.test.ts` (12 files)
- [ ] `web-build` CI job with matrix `[ubuntu-latest, macos-latest]`
- [ ] Job runs `build:web-host` then `test:web-contract`
- [ ] Job is independent — no `needs:` dependency on `build` or other jobs
- [ ] YAML is syntactically valid

## Verification

- `npm run test:web-contract` passes locally with 12 test files executing
- `node -e "const y=require('js-yaml');const f=require('fs');y.load(f.readFileSync('.github/workflows/ci.yml','utf8'))"` succeeds
- Manual inspection: `web-build` job has correct matrix, steps, and no `needs: build`

## Observability Impact

- **New CI signal:** `web-build` job produces per-OS (ubuntu, macos) pass/fail checks visible in GitHub Actions. Previously, web host build and web contract tests had zero CI coverage.
- **New local command:** `npm run test:web-contract` lets any developer or agent run just the 12 web contract tests without running the full suite.
- **Failure visibility:** If `build:web-host` breaks, the `web-build` job fails at the build step. If a web contract test regresses, it fails at the test step. Step-level logs distinguish the two.
- **Inspection surface:** `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"` confirms the script exists and its value.

## Inputs

- `package.json` — existing `test:unit` script for invocation pattern reference
- `.github/workflows/ci.yml` — existing `build` job for formatting/convention reference

## Expected Output

- `package.json` — new `test:web-contract` script added
- `.github/workflows/ci.yml` — new `web-build` job added after existing jobs
