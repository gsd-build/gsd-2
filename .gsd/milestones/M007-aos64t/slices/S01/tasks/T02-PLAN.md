---
estimated_steps: 6
estimated_files: 4
---

# T02: Add a runtime harness that exercises real hook, reroute, and prompt code paths

**Slice:** S01 — Deterministic Runtime Fixture
**Milestone:** M007-aos64t

## Description

Build the controlled execution harness that closes the M006 proof gap at the slice level. The harness must use real runtime modules together: post-unit hook/coordinator triggering or the nearest real runtime entrypoint, fact-check artifact generation, reroute eligibility/detection, and planner prompt assembly with corrected evidence. External evidence retrieval may be controlled at the boundary for determinism, but the runtime orchestration itself must remain real.

## Steps

1. Trace the smallest real runtime entrypoints that cover hook execution, artifact writing, reroute checking, and prompt building.
2. Implement a test file that copies the fixture into a temp directory and runs the runtime flow in sequence.
3. Stub or constrain only the external evidence-fetch/scout edge if deterministic runtime proof requires it.
4. Assert on written annotation files, FACTCHECK-STATUS.json fields, reroute target, and prompt content containing the corrected value.
5. Add stage-specific assertion messages so failures identify whether hook execution, artifact writing, reroute detection, or prompt ingestion broke.
6. Keep the harness reusable by S02 for the live reroute proof run.

## Must-Haves

- [ ] Harness exercises real runtime modules, not helper-only unit logic
- [ ] Test asserts artifact writing, reroute eligibility/target, and corrected prompt content in one sequence
- [ ] Any mocking is limited to the external evidence boundary and documented clearly
- [ ] Failure output identifies the broken stage explicitly

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
- `npx tsc --noEmit`

## Observability Impact

- Signals added/changed: test-stage assertions for hook execution, artifact write, reroute decision, prompt capture
- How a future agent inspects this: run the test file and inspect emitted temp-dir artifact paths/assertion messages
- Failure state exposed: missing artifact path, wrong reroute target, absent corrected prompt content

## Inputs

- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T01-PLAN.md` — fixture contract
- `src/resources/extensions/gsd/post-unit-hooks.ts` — hook execution path
- `src/resources/extensions/gsd/auto-recovery.ts` — reroute logic
- `src/resources/extensions/gsd/auto-dispatch.ts` — dispatch ordering
- `src/resources/extensions/gsd/auto-prompts.ts` — planner prompt assembly

## Expected Output

- `src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts` — controlled runtime harness proving the assembled path at slice scope
