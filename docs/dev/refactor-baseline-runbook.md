# GSD-2 Refactor Baseline Runbook

Project/App: GSD-2
File Purpose: Operator runbook for Phase 0 baseline measurement and comparison during the long-running refactor.

## Purpose

Use this runbook to capture repeatable before/after measurements for the long-running refactor. The baseline harness is read-only unless `--output` is provided, and it does not change production behavior.

## Quick Start

Run a human-readable baseline:

```bash
npm run baseline:refactor
```

Run a JSON baseline:

```bash
npm run baseline:refactor -- --json
```

Persist a baseline outside the repo:

```bash
npm run baseline:refactor -- --json --output /tmp/gsd-refactor-baseline-before.json
```

Compare the current checkout against a previous baseline:

```bash
npm run baseline:refactor -- --compare /tmp/gsd-refactor-baseline-before.json
```

## Optional Timed Commands

Command timings are opt-in because they can be slower and may create ignored build/test output. Use `--command label=command` for each command to time:

```bash
npm run baseline:refactor -- \
  --command test-compile='npm run test:compile' \
  --command baseline='npm run baseline:refactor -- --json'
```

Startup timing should be captured after build output exists:

```bash
npm run baseline:refactor -- \
  --command startup='GSD_STARTUP_TIMING=1 node dist/loader.js --version'
```

## Report Shape

The JSON report includes:

- `schemaVersion`
- `schema.requiredMetrics`
- `prompt`
- `context`
- `distTest`
- `workspace`
- `commands`
- `metrics`
- `comparison`, when `--compare` is provided

The flat `metrics` map is the stable comparison surface for later phases. Prefer comparing values from `metrics` instead of reading nested fields directly.

## Required Metrics

Phase 0 requires these scalar metrics:

- `prompt.fileCount`
- `prompt.totalChars`
- `prompt.totalBytes`
- `prompt.totalLines`
- `context.fileCount`
- `context.totalChars`
- `context.totalBytes`
- `context.totalLines`
- `distTest.exists`
- `distTest.fileCount`
- `distTest.bytes`

Later phases may add metrics, but they must not remove or rename these without increasing `schemaVersion`.

## Phase Gates

Before starting a phase that changes behavior, capture a baseline:

```bash
npm run baseline:refactor -- --json --output /tmp/gsd-refactor-before-phase-N.json
```

After the phase is implemented and verified, compare:

```bash
npm run baseline:refactor -- --compare /tmp/gsd-refactor-before-phase-N.json
```

For Phase 2 token/context work, the prompt metrics are the primary gate. For Phase 3 build/test speed work, use opt-in command timings.

## Verification

Run the focused baseline fixture gate:

```bash
npm run baseline:refactor:gate
```

Run the full Phase 0 gate:

```bash
npm run baseline:refactor:phase0
```

Run the compiled test path:

```bash
npm run test:compile
node --import ./scripts/dist-test-resolve.mjs --test dist-test/src/tests/refactor-baseline.test.js
```
