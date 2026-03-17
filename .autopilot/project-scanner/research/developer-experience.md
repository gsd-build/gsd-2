// [Project Scanner - Developer Experience Research]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Developer Experience Research

## Ratings

- Testing coverage in CI: Needs Improvement
- VS Code extension quality gates: Missing
- Native-engine validation: Needs Improvement
- Local setup ergonomics: Needs Improvement
- Verification contract clarity: Needs Improvement

## Findings

### 1. CI covers only part of the actual test surface

- Evidence:
  - `package.json:50`
  - `package.json:52`
  - `.github/workflows/ci.yml:48`
  - `.github/workflows/ci.yml:51`
  - `packages/pi-ai/src/providers/google-shared.test.ts:1`
  - `packages/pi-coding-agent/src/core/session-manager.test.ts:1`
  - `packages/pi-tui/src/components/__tests__/input.test.ts:1`
  - `src/resources/extensions/browser-tools/tests/browser-tools-unit.test.cjs:1`
- Impact: important packages can regress without failing the default PR pipeline.

### 2. VS Code extension is outside the monorepo’s normal quality gates

- Evidence:
  - `package.json:15`
  - `tsconfig.extensions.json:10`
  - `.github/workflows/ci.yml:42`
  - `vscode-extension/package.json:171`
- Impact: extension breakage can ship independently of core CLI health.

### 3. Native validation is fragmented relative to release risk

- Evidence:
  - `package.json:55`
  - `packages/native/package.json:12`
  - `packages/native/src/__tests__/xxhash.test.mjs:1`
  - `.github/workflows/build-native.yml:65`
  - `.github/workflows/build-native.yml:141`
- Impact: release confidence for platform packages is lower than it should be.

### 4. Source setup is heavier than the docs imply

- Evidence:
  - `package.json:59`
  - `scripts/postinstall.js:9`
  - `scripts/postinstall.js:21`
  - `docs/getting-started.md:3`
  - `docs/getting-started.md:23`
- Impact: contributors can incur hidden Playwright downloads and slower setup, especially in CI or constrained environments.

### 5. Verification expectations are stronger in docs than in enforcement

- Evidence:
  - `README.md:154`
  - `README.md:397`
  - `README.md:418`
  - `package.json:39`
  - `package.json:51`
  - `.github/workflows/ci.yml:36`
- Impact: documentation implies a stronger lint/test contract than the repo actually enforces.

## Additional Notes

- `test:coverage` exists but thresholds are very low: `package.json:51`.
- There is no root `lint` script and no lint step in CI.
- There is no benchmark/perf-regression job even though performance is an important product property.
