---
estimated_steps: 5
estimated_files: 2
---

# T01: Build synthetic research and fact-check proof fixtures

**Slice:** S01 — Deterministic Runtime Fixture
**Milestone:** M007-aos64t

## Description

Create deterministic fixture assets for the live-proof milestone. The fixture must encode a realistic research output containing a known false claim, its expected corrected value, impact scope, and the directory layout needed for the runtime harness to exercise real fact-check behavior without depending on unstable external evidence sources.

## Steps

1. Inspect existing GSD test fixture patterns and choose a location that fits current test conventions.
2. Create a synthetic milestone/slice fixture with research output containing an Unknowns Inventory row whose claim is intentionally false and verifiable.
3. Encode the expected refutation outcome: corrected value, citations placeholder, impact level, and any aggregate status expectations needed by later assertions.
4. Keep the fixture self-contained and secret-free so tests can copy it into temp directories without additional setup.
5. Ensure the fixture contract is obvious from filenames/content so downstream runtime harness code can load it directly.

## Must-Haves

- [ ] Fixture includes research content with a known false claim and expected corrected value
- [ ] Fixture directory shape matches what the runtime modules expect
- [ ] Fixture is synthetic, deterministic, and contains no secrets
- [ ] Fixture content is explicit enough that downstream tests do not invent interpretation logic

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "fixture"`
- Manual inspection confirms the fixture declares the claim, expected correction, and impact scope plainly

## Inputs

- `.gsd/milestones/M007-aos64t/M007-aos64t-CONTEXT.md` — milestone intent and proof constraints
- `.gsd/milestones/M007-aos64t/M007-aos64t-ROADMAP.md` — S01 boundary contract and demo expectations
- `src/resources/extensions/gsd/tests/factcheck-coordinator.test.ts` — current fact-check artifact expectations and fixture style

## Expected Output

- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/...` — deterministic proof fixture assets for the runtime harness

## Observability Impact

- **What signals change:** Fixture introduces a canonical `FIXTURE-MANIFEST.json` that declares the synthetic milestone ID, slice ID, expected claim structure, and refutation expectations. This manifest becomes the contract boundary for downstream tests.
- **How a future agent inspects:** Read `FIXTURE-MANIFEST.json` to understand fixture shape without parsing code. Manifest includes `expectedClaimCount`, `expectedRefutationClaimId`, `expectedImpact`, and `expectedCorrectedValue` fields for direct assertion use.
- **What failure state becomes visible:** If fixture is malformed or missing required files, test code surfaces a structured error with `fixtureId`, `stage`, and `expectedPath` fields. This replaces silent undefined/inconsistent test state.
- **Diagnostics for debugging:** Fixture includes a `FIXTURE-README.md` documenting how to load the fixture, what the false claim represents, and what assertions downstream tests should make.
