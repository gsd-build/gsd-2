---
estimated_steps: 4
estimated_files: 2
---

# T03: Document fixture contract and downstream run procedure

**Slice:** S01 — Deterministic Runtime Fixture
**Milestone:** M007-aos64t

## Description

Document the fixture/harness contract so S02 can pick up the live proof run without rediscovering how the deterministic runtime setup works. This task turns the fixture from test code into a stable handoff surface.

---

# S02 HANDOFF CONTRACT

**Purpose:** This document serves as the authoritative handoff for S02. Read this section to understand how to use the fixture without reverse-engineering the harness.

## 1. Fixture Location and Scenario

**Path:**
```
src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/
```

**Contract file:**
```
FIXTURE-MANIFEST.json
```

**Scenario encoded:**
- **Known false claim:** C001 asserts `@synthetic/lib version is 4.1.0` (training-data recall)
- **Corrected value:** `5.2.0` (synthetic npm registry lookup)
- **Impact level:** `slice` — triggers reroute to `plan-slice`
- **Outcome:** Plan-impacting refutation with reroute eligibility

**Synthetic guarantee:** `@synthetic/lib` is fictional. No external network calls required.

## 2. Command Entrypoint

**Primary verification command:**
```bash
node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts
```

**Failure-path verification:**
```bash
node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "failure"
```

**Expected result:** 30 tests pass (21 fixture tests + 9 runtime harness tests)

## 3. Artifacts S02 Should Inspect After a Run

**Aggregate status:**
```
M999-PROOF/slices/S01/factcheck/FACTCHECK-STATUS.json
```
Key fields:
- `overallStatus: "has-refutations"`
- `planImpacting: true`
- `rerouteTarget: "plan-slice"`
- `planImpactingClaims: ["C001"]`

**Refuted claim annotation:**
```
M999-PROOF/slices/S01/factcheck/claims/C001.json
```
Key fields:
- `verdict: "refuted"`
- `correctedValue: "5.2.0"`
- `impact: "slice"`
- `citations: [...]`

**S02-ready outputs from harness:**
```typescript
{
  fixtureId: "factcheck-runtime-proof-v1",
  expectedRefutationClaimId: "C001",
  expectedCorrectedValue: "5.2.0",
  rerouteTarget: "plan-slice",
  planImpacting: true,
  correctedValue: "5.2.0",
  impact: "slice"
}
```

## 4. Determinism Controls

**What is deterministic:**
- All fixture data is synthetic (no real packages, no secrets, no personal data)
- Claim annotations and aggregate status are pre-computed
- No external network calls required to exercise the harness

**What remains real:**
- Runtime module loading (post-unit-hooks.ts, auto-recovery.ts, auto-prompts.ts)
- Stage sequencing (fixture-load → hook-execution → artifact-write → reroute-detection → prompt-capture)
- Error structure validation (FixtureValidationError with stage/expectedPath)

**What S02 must NOT weaken:**
- Do not replace real runtime modules with mocks for the primary proof
- Do not add external evidence fetching that introduces network flake
- Do not bypass the FixtureValidationError structure for failure tests

**Allowed stubbing boundary:**
- External evidence fetching (npm registry, GitHub API) — already synthetic in this fixture
- Time-based assertions — use the `checkedAt` field from status, not `Date.now()`

## 5. Runtime Module Integration Points

**Modules verified by harness:**
- `post-unit-hooks.ts` → `resolveHookArtifactPath(unitId)`
- `auto-recovery.ts` → `resolveExpectedArtifactPath(unitType, unitId)`
- `auto-prompts.ts` → `buildExecuteTaskPrompt(taskPlan)`

**Harness stage sequence:**
1. `fixture-load` — Load manifest and verify structure
2. `hook-execution` — Verify resolveHookArtifactPath exists
3. `artifact-write` — Verify resolveExpectedArtifactPath exists
4. `reroute-detection` — Extract rerouteTarget from status
5. `prompt-capture` — Extract correctedValue from refuted claim

## 6. Failure Visibility

If fixture is malformed or missing, tests fail with:
```typescript
interface FixtureValidationError {
  fixtureId: string;      // "missing" or from manifest
  stage: string;          // "manifest-load" | "manifest-parse" | "artifact-parse"
  expectedPath: string;   // Full path to expected file
  message: string;        // Human-readable error
}
```

This structure ensures S02 can assert on specific failure modes rather than catching generic errors.

---

## Steps (T03 execution)

1. Record where the fixture lives and what claim/correction scenario it encodes. ✅
2. Record the exact command or test entrypoint that exercises the fixture. ✅
3. List the artifacts and prompt evidence S02 should inspect after a run. ✅
4. Note any allowed determinism controls so later slices do not accidentally weaken the proof. ✅

## Must-Haves

- [x] Downstream run procedure is explicit and short
- [x] Expected artifact paths and outputs are named concretely
- [x] Determinism constraints are documented so the proof does not silently regress into helper-only testing

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
- Manual read-through confirms S02 can use the documented procedure without rereading M006 closeout notes

## Inputs

- `.gsd/milestones/M007-aos64t/slices/S01/S01-PLAN.md` — slice contract
- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T02-PLAN.md` — runtime harness behavior

## Expected Output

- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md` — this plan as the handoff contract for S02
- `.gsd/milestones/M007-aos64t/slices/S01/S01-SUMMARY.md` — later summary should lift this procedure directly
