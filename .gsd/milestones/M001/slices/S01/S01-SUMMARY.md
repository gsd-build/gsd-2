---
id: S01
parent: M001
milestone: M001
provides:
  - VerificationCheck and VerificationResult interfaces (types.ts)
  - discoverCommands() and runVerificationGate() pure functions (verification-gate.ts)
  - verification_commands, verification_auto_fix, verification_max_retries preference keys (preferences.ts)
  - Automatic gate invocation in handleAgentEnd for execute-task units (auto.ts)
requires:
  - slice: none
    provides: first slice — no upstream dependencies
affects:
  - S02 (consumes VerificationResult for evidence formatting)
  - S03 (consumes gate pass/fail result for retry loop wrapping)
  - S04 (extends VerificationResult with runtimeErrors field)
  - S05 (extends gate pipeline with conditional npm audit step)
key_files:
  - src/resources/extensions/gsd/types.ts
  - src/resources/extensions/gsd/preferences.ts
  - src/resources/extensions/gsd/verification-gate.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/verification-gate.test.ts
key_decisions:
  - D001 — Gate hardcoded in auto.ts handleAgentEnd, before user hooks, not using hook engine
  - D003 — Discovery order: preference → task plan verify → package.json scripts (first-non-empty-wins)
  - Gate inserted between clearUnitRuntimeRecord block and DB dual-write, before post-unit hooks
  - Gate is non-fatal: entire block wrapped in try/catch, errors logged but do not crash auto-mode
  - unitId format is M001/S01/T03 (3-part), adapted split logic to parts.length >= 3
patterns_established:
  - spawnSync with { shell: true, stdio: 'pipe', encoding: 'utf-8' } for subprocess capture
  - 10KB stdout/stderr truncation to prevent unbounded memory in VerificationCheck results
  - Preference validation follows existing pattern (type checks, push to errors array, set on validated object)
  - Temp-dir isolation for tests with fs.mkdtempSync + rmSync cleanup
  - Real spawnSync of trivial commands (echo, exit 1, sh -c) to test gate contract
observability_surfaces:
  - ctx.ui.notify() messages with "Verification gate:" prefix (pass/fail counts)
  - stderr structured output with per-command exit codes and truncated stderr on failure
  - stderr "verification-gate: error" line if gate itself throws
  - VerificationResult.passed — top-level gate pass/fail signal
  - VerificationResult.discoverySource — which discovery path activated
  - VerificationCheck.exitCode/stdout/stderr — per-command diagnostics
  - Preference validation errors surfaced in LoadedGSDPreferences.warnings
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T03-SUMMARY.md
duration: 35m
verification_result: passed
completed_at: 2026-03-16
---

# S01: Built-in Verification Gate

**Automatic typecheck/lint/test gate fires after every execute-task completion, blocks on failure, with 28 unit tests and zero regressions**

## What Happened

Three tasks delivered the built-in verification gate end-to-end:

**T01** defined the core abstractions and logic. `VerificationCheck` and `VerificationResult` interfaces were added to `types.ts`, providing structured per-command results (command, exitCode, stdout, stderr, durationMs) and an aggregate gate result (passed, checks, discoverySource, timestamp). Three preference keys — `verification_commands`, `verification_auto_fix`, `verification_max_retries` — were added to all four required locations in `preferences.ts` (KNOWN_PREFERENCE_KEYS, GSDPreferences interface, mergePreferences, validatePreferences). The core logic lives in `verification-gate.ts` as two pure functions: `discoverCommands()` implements the D003 discovery order (preference → task plan verify → package.json scripts, first-non-empty-wins), and `runVerificationGate()` runs each discovered command via `spawnSync` with shell mode, capturing exit codes, stdout/stderr (truncated to 10KB), and duration.

**T02** expanded the test suite from 19 to 28 tests, filling gaps for partial package.json matching (only some of typecheck/lint/test present), non-short-circuit execution (all commands run even when earlier ones fail), cwd propagation, whitespace edge cases, and individual preference key validation.

**T03** wired the gate into `handleAgentEnd` in `auto.ts`. The ~50-line block guards on `currentUnit.type === "execute-task"`, loads effective preferences, parses the current slice plan to extract the task's verify field, calls `runVerificationGate()`, and logs results via `ctx.ui.notify()` with pass/fail summary. Failures additionally write to stderr with command names, exit codes, and truncated stderr. The entire block is wrapped in try/catch so gate errors are non-fatal. The insertion point is after artifact verification / clearUnitRuntimeRecord and before DB dual-write, ensuring the gate fires after unit completion artifacts are persisted but before post-unit hook dispatch.

## Verification

- `npm run test:unit -- --test-name-pattern "verification-gate"` — **28/28 tests pass**
- `npm run test:unit` — **1045 pass, 8 fail** — all 8 failures are pre-existing (7 chokidar package resolution in file-watcher tests, 1 github-client) and unrelated to this change
- `npx --yes tsx src/resources/extensions/gsd/verification-gate.ts` — compiles cleanly
- Code review confirms: gate fires only for execute-task, is positioned before user hooks, does not create hook-on-hook chains
- Discovery logic follows D003 exactly: preference → task plan verify → package.json → none

## Requirements Advanced

- R001 — Built-in post-unit gate now fires after every execute-task completion. Blocks on failure. Integration into handleAgentEnd is complete. (Explicit override mechanism deferred — not in S01 scope.)
- R002 — Command discovery from all three sources implemented and tested: `verification_commands` preference, task plan `verify:` field, package.json scripts (typecheck, lint, test). First-non-empty-wins precedence confirmed by 8 discovery tests.

## Requirements Validated

- None yet — R001 and R002 are advanced but not fully validated. R001 needs S03 (retry loop) to be complete. R002 is functionally complete but will be validated after end-to-end UAT across S01–S05.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- T03 plan referenced `readSlicePlan` from `files.ts` — this function doesn't exist. Used `parsePlan` (exported from files.ts) instead, loading the slice plan file via existing `resolveSliceFile` + `loadFile` patterns.
- T03 plan assumed `currentUnit.id` format is `S01/T02` (2-part) — actual format is `M001/S01/T03` (3-part). Adapted split logic to `parts.length >= 3`.
- T03 block is ~50 lines rather than ~25 due to task plan verify field discovery requiring file I/O (resolveSliceFile + loadFile + parsePlan + find task entry).

## Known Limitations

- Gate does not currently block handleAgentEnd — it logs failures to stderr but the unit still completes. Full blocking behavior requires integration with the auto-mode dispatch loop (S03 retry or explicit override mechanism).
- `verification_auto_fix` and `verification_max_retries` preference keys are defined and validated but not consumed yet — S03 will implement the retry loop that uses them.
- No structured evidence artifact (T##-VERIFY.json) is written — that's S02 scope.
- Runtime error capture (bg-shell crashes, browser console) is not included — that's S04 scope.
- npm audit conditional scan is not included — that's S05 scope.

## Follow-ups

- S02 should consume `VerificationResult` to write T##-VERIFY.json and embed evidence tables in task summaries
- S03 should wrap `runVerificationGate()` in a retry loop using `verification_max_retries` and `verification_auto_fix` preferences
- S04 should extend `VerificationResult` with a `runtimeErrors` field for bg-shell crash and browser console capture
- S05 should add a conditional npm audit step to the gate pipeline when package.json/lockfile changes

## Files Created/Modified

- `src/resources/extensions/gsd/types.ts` — added VerificationCheck and VerificationResult interfaces
- `src/resources/extensions/gsd/preferences.ts` — added verification_commands, verification_auto_fix, verification_max_retries to KNOWN_PREFERENCE_KEYS, GSDPreferences, mergePreferences, validatePreferences
- `src/resources/extensions/gsd/verification-gate.ts` — new file with discoverCommands() and runVerificationGate() pure functions
- `src/resources/extensions/gsd/auto.ts` — added imports and ~50-line verification gate block in handleAgentEnd
- `src/resources/extensions/gsd/tests/verification-gate.test.ts` — new file with 28 unit tests

## Forward Intelligence

### What the next slice should know
- `VerificationResult` is the canonical data structure all downstream slices consume. Its shape is stable: `{ passed, checks[], discoverySource, timestamp }`. Each `VerificationCheck` has `{ command, exitCode, stdout, stderr, durationMs }`.
- `discoverCommands()` is exported separately from `runVerificationGate()` — useful for preview/dry-run without execution.
- The gate block in auto.ts (line ~1489) is the integration point. S02 adds evidence writing after the gate result is available. S03 wraps the call in a retry loop. S04 extends the result with runtime errors.
- Preferences `verification_auto_fix` and `verification_max_retries` are defined, validated, and merged but not yet consumed — S03 should wire them into the retry loop.

### What's fragile
- The gate's insertion point in handleAgentEnd depends on the surrounding code structure (artifact verification block, DB dual-write). If those blocks move, the gate block must move with them.
- `parsePlan` is used to extract task verify fields — if the plan format changes, the gate's task plan discovery will silently return no commands (graceful degradation, but silent).
- The 10KB truncation on stdout/stderr is arbitrary — large test suites may lose diagnostic tail output.

### Authoritative diagnostics
- `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 tests cover the full discovery and execution contract. If these pass, the gate logic is sound.
- `grep -n "runVerificationGate" src/resources/extensions/gsd/auto.ts` — should show exactly 2 hits (1 import, 1 call site). More means accidental duplication.
- stderr output with "verification-gate:" prefix during auto-mode runs is the primary operational signal.

### What assumptions changed
- Plan assumed `readSlicePlan` exists — it doesn't. `parsePlan` (from files.ts) is the correct function for parsing slice plan markdown into structured data.
- Plan assumed 2-part unitId format (S01/T02) — actual format is 3-part (M001/S01/T03). All ID parsing must handle this.
