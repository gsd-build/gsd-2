---
estimated_steps: 4
estimated_files: 2
---

# T03: Document fixture contract and downstream run procedure

**Slice:** S01 — Deterministic Runtime Fixture
**Milestone:** M007-aos64t

## Description

Document the fixture/harness contract so S02 can pick up the live proof run without rediscovering how the deterministic runtime setup works. This task turns the fixture from test code into a stable handoff surface.

## Steps

1. Record where the fixture lives and what claim/correction scenario it encodes.
2. Record the exact command or test entrypoint that exercises the fixture.
3. List the artifacts and prompt evidence S02 should inspect after a run.
4. Note any allowed determinism controls (for example external evidence stubbing boundaries) so later slices do not accidentally weaken the proof.

## Must-Haves

- [ ] Downstream run procedure is explicit and short
- [ ] Expected artifact paths and outputs are named concretely
- [ ] Determinism constraints are documented so the proof does not silently regress into helper-only testing

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
- Manual read-through confirms S02 can use the documented procedure without rereading M006 closeout notes

## Inputs

- `.gsd/milestones/M007-aos64t/slices/S01/S01-PLAN.md` — slice contract
- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T02-PLAN.md` — runtime harness behavior

## Expected Output

- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md` — this plan as the handoff contract for S02
- `.gsd/milestones/M007-aos64t/slices/S01/S01-SUMMARY.md` — later summary should lift this procedure directly
