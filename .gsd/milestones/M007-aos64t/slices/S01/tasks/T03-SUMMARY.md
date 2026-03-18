---
id: T03
parent: S01
milestone: M007-aos64t
provides:
  - Authoritative handoff contract for S02 documenting fixture location, scenario, commands, artifacts, and determinism constraints
  - S01-SUMMARY.md with slice-level summary lifting the run procedure directly
key_files:
  - .gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md
  - .gsd/milestones/M007-aos64t/slices/S01/S01-SUMMARY.md
key_decisions: []
patterns_established: []
observability_surfaces:
  - T03-PLAN.md serves as the single-source handoff document for S02
  - S01-SUMMARY.md provides slice-level context with quick reference for downstream use
duration: 25m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Document fixture contract and downstream run procedure

**Documented the fixture/harness contract as an authoritative handoff for S02 with explicit commands, artifact paths, and determinism constraints.**

## What Happened

Updated T03-PLAN.md with the S02 handoff contract containing:

1. **Fixture location and scenario** — Path to fixture, contract file, and the false claim scenario (C001: `@synthetic/lib version is 4.1.0` → corrected to `5.2.0`)

2. **Command entrypoints** — Primary verification command and failure-path verification command

3. **Artifacts to inspect** — Concrete paths and key fields for aggregate status, refuted claim, and S02-ready outputs from the harness

4. **Determinism controls** — What is deterministic (synthetic data, pre-computed annotations), what remains real (runtime module loading, stage sequencing), and what S02 must NOT weaken (no replacing real modules with mocks, no external network calls, no bypassing FixtureValidationError)

5. **Runtime module integration points** — Documented the three modules verified by the harness and the five-stage sequence

6. **Failure visibility** — Documented the FixtureValidationError structure for failure-state assertions

Created S01-SUMMARY.md as the slice-level summary containing:
- Complete narrative of all three tasks (T01, T02, T03)
- Quick reference section for S02 with command, key artifacts table, and S02 inputs
- Determinism constraints in a concise format
- Full verification evidence and diagnostics

## Verification

All 30 fixture tests pass, confirming the documented procedures are accurate:

```
node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts
# tests 30
# pass 30
# fail 0
```

Manual read-through confirms S02 can use the documented procedure without rereading M006 closeout notes — the handoff contract in T03-PLAN.md and the quick reference in S01-SUMMARY.md provide all necessary information.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts` | 0 | ✅ pass | ~98ms |

## Diagnostics

To use the handoff contract:
- Read `.gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md` for the authoritative S02 run procedure
- Read `.gsd/milestones/M007-aos64t/slices/S01/S01-SUMMARY.md` for slice-level context and quick reference
- Run tests and look for `=== Runtime Harness Sequence ===` output to verify stage execution

## Deviations

None. All steps from the task plan completed as specified.

## Known Issues

TypeScript compilation errors in `headless.ts` and missing `packages/pi-ai/dist/index.js` are pre-existing and unrelated to this task. The `npm run test` command fails due to these build issues, but the specific slice verification command (`node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`) passes all 30 tests.

## Files Created/Modified

- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md` — Updated with S02 handoff contract (fixture location, commands, artifacts, determinism constraints)
- `.gsd/milestones/M007-aos64t/slices/S01/S01-SUMMARY.md` — Created slice-level summary with quick reference for S02
