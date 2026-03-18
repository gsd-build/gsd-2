# S01: Deterministic Runtime Fixture

**Goal:** Build a controlled proof fixture and runtime harness that exercises the real fact-check hook, dispatcher, and prompt-ingestion path with deterministic refutation inputs.
**Demo:** A repeatable verification command runs against fixture data, triggers the coordinator/runtime control path with a known false claim, and leaves stable expected artifacts and validation output for downstream live-proof slices.

## Must-Haves

- A deterministic fixture that represents at least one research result containing a known verifiable false claim and the expected corrected value.
- A runtime harness or controlled execution entrypoint that exercises the real post-unit hook, fact-check artifact writing, reroute decision logic, and planner prompt builders without reducing the proof to helper-only unit tests.
- Explicit validation helpers that assert on produced annotation files, FACTCHECK-STATUS.json, reroute target, and corrected prompt content.
- Durable fixture/output paths and documentation so S02 can run the live proof without rediscovering how the harness works.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
- `npx tsc --noEmit`
- Verification must prove: fixture execution writes per-claim and aggregate fact-check artifacts, produces a plan-impacting refutation, and exposes enough output for S02 to drive the full reroute proof run.
- Failure-path verification: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "failure"` must confirm that missing/invalid fixture data produces structured error output with stage identifier and expected artifact path, not silent pass or undefined behavior.

## Observability / Diagnostics

- Runtime signals: fixture validation output records which proof stage executed (research artifact load, coordinator artifact write, reroute eligibility, planner correction capture)
- Inspection surfaces: fixture directories under `.gsd/milestones/M007-aos64t/` or temp test fixtures, generated FACTCHECK-STATUS.json, per-claim files, and captured prompt snippets
- Failure visibility: validation output must identify the failed stage and expected artifact path/value; missing artifacts are assertion failures, not silent skips
- Redaction constraints: fixture data must be synthetic and contain no secrets or personal data

## Integration Closure

- Upstream surfaces consumed: `post-unit-hooks.ts`, `auto-recovery.ts`, `auto-dispatch.ts`, `auto-prompts.ts`, `factcheck.ts`, coordinator agent instructions
- New wiring introduced in this slice: deterministic runtime fixture/harness and validation entrypoint for live proof work
- What remains before the milestone is truly usable end-to-end: S02 must run the assembled reroute scenario; S03 must persist final validation/report artifacts

## Tasks

- [x] **T01: Build synthetic research and fact-check proof fixtures** `est:45m`
  - Why: S02 needs stable inputs with a known false claim and corrected value; without a deterministic fixture the live proof will be flaky or ambiguous.
  - Files: `.gsd/milestones/M007-aos64t/slices/S01/tasks/T01-PLAN.md`, `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/` or nearest existing fixture location
  - Do: Add fixture assets that model a real research output with an Unknowns Inventory containing a known refutable claim, expected corrected value, impact scope, and any required slice/milestone directory structure. Keep the fixture synthetic, explicit, and reusable by test/harness code.
  - Verify: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "fixture"`
  - Done when: Fixture assets can be loaded by test code without ad hoc setup and clearly encode the expected refutation outcome.
- [x] **T02: Add a runtime harness that exercises real hook, reroute, and prompt code paths** `est:1h15m`
  - Why: The milestone gap is live sequencing, not helper correctness. This task creates a controlled execution path that uses real runtime modules together.
  - Files: `src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`, `src/resources/extensions/gsd/post-unit-hooks.ts`, `src/resources/extensions/gsd/auto-dispatch.ts`, `src/resources/extensions/gsd/auto-prompts.ts`
  - Do: Implement a test/harness that loads the fixture, invokes the real post-unit hook/coordinator path or closest runtime entrypoint, confirms fact-check artifacts are written, evaluates reroute eligibility via real dispatch/recovery code, and captures planner prompt output using the actual prompt builders. Stub only the external evidence-fetch edge if needed for determinism; keep runtime orchestration real.
  - Verify: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
  - Done when: One test run proves artifact writing, reroute eligibility, and corrected prompt capture in sequence using real runtime modules.
- [x] **T03: Document fixture contract and downstream run procedure** `est:30m`
  - Why: S02 should be able to use the fixture immediately rather than reverse-engineering the harness.
  - Files: `.gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md`, `.gsd/milestones/M007-aos64t/slices/S01/S01-SUMMARY.md` (later), inline comments or a small README near fixture assets if warranted
  - Do: Record the fixture shape, command entrypoint, expected artifacts, and what remains for S02. Keep it concrete and aligned with the created harness.
  - Verify: Manual read-through plus `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
  - Done when: A future agent can locate the fixture, run it, and know which outputs to inspect without rereading M006 history.

## Files Likely Touched

- `src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/...`
- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T01-PLAN.md`
- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T02-PLAN.md`
- `.gsd/milestones/M007-aos64t/slices/S01/tasks/T03-PLAN.md`
