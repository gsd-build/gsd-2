---
id: T01
parent: S01
milestone: M007-aos64t
provides:
  - Deterministic fact-check proof fixture with synthetic research output containing a known false claim
  - FIXTURE-MANIFEST.json contract boundary for downstream tests
  - Expected factcheck artifacts (annotations + aggregate status) for runtime proof assertions
key_files:
  - src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/FIXTURE-MANIFEST.json
  - src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/S01-RESEARCH.md
  - src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/factcheck/FACTCHECK-STATUS.json
  - src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/factcheck/claims/C001.json
  - src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts
key_decisions:
  - D073: Fact-check runtime fixtures use FIXTURE-MANIFEST.json as the contract boundary, encoding expected claim count, refutation claim ID, impact level, and corrected value for direct assertion use by downstream tests
patterns_established:
  - Synthetic-only fixture data with explicit redaction constraints (no secrets, no personal data)
  - Structured failure-state visibility via FixtureValidationError shape with fixtureId, stage, expectedPath, message fields
observability_surfaces:
  - FIXTURE-MANIFEST.json declares expected outcomes and required files for validation
  - Test failures include fixtureId, stage, and expectedPath for debugging
duration: 45m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Build synthetic research and fact-check proof fixtures

**Created deterministic fixture assets for live fact-check runtime proof with a known false claim (C001) producing plan-impacting refutation.**

## What Happened

Fixed pre-flight issues in S01-PLAN.md (added failure-path verification step) and T01-PLAN.md (added Observability Impact section), then created the fixture assets:

1. **FIXTURE-MANIFEST.json** — Contract boundary declaring expected claim count (3), refutation claim ID (C001), expected corrected value (5.2.0), impact level (slice), and planImpacting flag (true). Also includes synthetic-only data guarantee.

2. **S01-RESEARCH.md** — Synthetic research output with Unknowns Inventory table containing three claims. C001 claims `@synthetic/lib version is 4.1.0` (training-data recall) which is intentionally false.

3. **Claim annotations** — C001.json (REFUTED, correctedValue: "5.2.0", impact: slice), C002.json (CONFIRMED), C003.json (INCONCLUSIVE). All include timestamps, citations, and notes.

4. **FACTCHECK-STATUS.json** — Aggregate status showing has-refutations, planImpacting: true, rerouteTarget: plan-slice, with counts and cycle state.

5. **FIXTURE-README.md** — Documentation for loading the fixture, expected assertions, and failure-state visibility.

6. **factcheck-runtime-fixture.test.ts** — 21 tests covering manifest loading, research parsing, claim validation, aggregate status verification, and failure-state error structure.

## Verification

All 21 fixture tests pass:

```
node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts
# tests 21
# pass 21
# fail 0
```

Tests verify:
- Manifest loads and has required fields
- Manifest declares expected refutation (C001, slice impact, 5.2.0 corrected value)
- Research output is parseable and claims match manifest
- C001 is refuted with corrected value
- Aggregate status shows has-refutations and planImpacting
- Failure-state produces structured errors

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "fixture"` | 0 | ✅ pass | ~105ms |
| 2 | `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts` | 0 | ✅ pass | ~115ms |

## Diagnostics

To inspect the fixture:
- Read `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/FIXTURE-MANIFEST.json` for expected outcomes
- Read `FIXTURE-README.md` for loading instructions and assertion patterns
- Test failures include `fixtureId`, `stage`, and `expectedPath` fields

## Deviations

None. All steps from the task plan completed as specified.

## Known Issues

None. TypeScript compilation errors in `headless.ts` are pre-existing and unrelated to this task.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/FIXTURE-MANIFEST.json` — Contract boundary for fixture assertions
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/FIXTURE-README.md` — Documentation for fixture usage
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/S01-RESEARCH.md` — Synthetic research output with Unknowns Inventory
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/factcheck/FACTCHECK-STATUS.json` — Aggregate status (has-refutations, planImpacting)
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/factcheck/claims/C001.json` — REFUTED claim with corrected value
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/factcheck/claims/C002.json` — CONFIRMED claim
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/M999-PROOF/slices/S01/factcheck/claims/C003.json` — INCONCLUSIVE claim
- `src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts` — 21 tests for fixture validation
- `.gsd/milestones/M007-aos64t/slices/S01/S01-PLAN.md` — Added failure-path verification step
- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T01-PLAN.md` — Added Observability Impact section
