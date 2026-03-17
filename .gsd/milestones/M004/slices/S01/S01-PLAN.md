# S01: CI Web-Build Job

**Goal:** A dedicated `web-build` CI job runs on ubuntu-latest and macos-latest, builds the web host, runs web contract tests, and reports independently from existing jobs.
**Demo:** Push triggers a `web-build` job that runs `build:web-host` and `test:web-contract` on both platforms — visible in the CI workflow run.

## Must-Haves

- `test:web-contract` npm script exists in `package.json` targeting `src/tests/web-*.test.ts`
- `web-build` job in `ci.yml` with `strategy.matrix.os: [ubuntu-latest, macos-latest]`
- Job installs deps, runs `build:web-host`, runs `test:web-contract`
- Job has no `needs:` dependency on the existing `build` job — runs in parallel
- YAML is syntactically valid

## Verification

- `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"` outputs a valid test command
- `npx yaml-lint .github/workflows/ci.yml` or manual parse succeeds
- `npm run test:web-contract` passes locally
- CI job structure: `web-build` job exists with matrix, `build:web-host` step, `test:web-contract` step, no `needs: build`

## Tasks

- [x] **T01: Add test:web-contract script and web-build CI job** `est:30m`
  - Why: The CI pipeline has zero web coverage — `build:web-host` and web contract tests never run. This task adds both the npm script and the CI job.
  - Files: `package.json`, `.github/workflows/ci.yml`
  - Do: (1) Add `"test:web-contract": "node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-*.test.ts"` to `package.json` scripts. (2) Add a `web-build` job to `ci.yml` after the existing `build` job block, with `strategy.matrix.os: [ubuntu-latest, macos-latest]`, checkout, setup Node 22 with npm cache, `npm ci`, `npm run build:web-host`, `npm run test:web-contract`. No `needs:` dependency on other jobs. Match existing CI step naming and formatting conventions.
  - Verify: `npm run test:web-contract` passes locally (12 test files). `node -e "const y=require('js-yaml');const f=require('fs');y.load(f.readFileSync('.github/workflows/ci.yml','utf8'))"` parses without error. Inspect the YAML for correct matrix, step names, and no `needs: build`.
  - Done when: `test:web-contract` runs all 12 web contract test files successfully; `ci.yml` has a syntactically valid `web-build` job with the correct matrix and steps; the job is independent from existing jobs.

## Observability / Diagnostics

- **CI visibility:** The `web-build` job appears as a separate check in GitHub Actions. Matrix entries show per-OS pass/fail independently from the main `build` job.
- **Local inspection:** `npm run test:web-contract` runs the 12 web contract tests via Node test runner; output shows per-file pass/fail and summary counts.
- **Failure signals:** A failing `web-build` job indicates either `build:web-host` compilation failure or a web contract test regression. Check the step-level logs to distinguish build vs test failure.
- **Script verification:** `node -e "const p=require('./package.json'); console.log(p.scripts['test:web-contract'])"` prints the test command — confirms the script exists and targets the right glob.
- **YAML health:** `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` validates CI config parses without error.

## Files Likely Touched

- `package.json`
- `.github/workflows/ci.yml`
