# M004: Post-M003 Upstream Drift Reconciliation and CI Restoration

**Vision:** Reconcile local `main` with newer upstream changes, fix the TypeScript build failure in `@gsd/pi-agent-core`, and restore verified CI-ready state without regressing the models.dev architecture.

## Success Criteria

- The TypeScript build error in `packages/pi-agent-core/src/agent.ts` line 105 is resolved
- The `@gsd/pi-ai` model registry is populated at module load time from the models.dev snapshot
- Local `npm run build` succeeds across all packages
- Local verification commands pass (build, unit tests, scenario tests)
- The models.dev registry architecture from M001/M002/M003 is preserved
- Local `main` is in a clean, verified state ready for later explicit update of `models.dev-registration-pr`

## Key Risks / Unknowns

- **Additional workflow failures may surface after the TypeScript error is fixed** — The research notes this is "likely yes or possible"; verification must be thorough enough to catch other issues
- **Snapshot staleness** — The bundled snapshot was generated on 2026-03-14; if models.dev data has changed significantly, it may need regeneration (12h cache policy per D002)

## Proof Strategy

- **TypeScript build failure → retire in S01** by populating the `pi-ai` model registry from snapshot and adding non-null assertion for the known default model
- **Additional failures → retire in S01** by running full verification suite after the fix and addressing any issues that surface

## Verification Classes

- Contract verification: TypeScript build, unit tests (`npm test -w @gsd/pi-ai`), scenario tests
- Integration verification: Cross-package build verification, model registry initialization from snapshot
- Operational verification: Clean git status, verified local `main` ready for later PR update
- UAT / human verification: None — this is internal reconciliation work

## Milestone Definition of Done

This milestone is complete only when all are true:

- The `@gsd/pi-agent-core` TypeScript build error is resolved
- All local verification commands pass (build, unit tests, scenario tests)
- The models.dev architecture (runtime fetching, snapshot fallback, user overrides) is preserved
- Local `main` has a clean working tree
- Decision log is updated with the reconciliation approach

## Requirement Coverage

- Covers: R013 (reconcile newer upstream changes), R014 (restore CI compliance), R015 (leave local `main` verified and ready)
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [ ] **S01: CI Failure Fix and Verification** `risk:high` `depends:[]`
  > After this: Local build and test suite pass; the `pi-ai` model registry is populated from snapshot at module load time; the TypeScript error in `agent.ts` is resolved; local `main` is verified and ready for later PR update

## Boundary Map

### S01 → (external)

Produces:
- Initialized `pi-ai` model registry populated from `models-dev-snapshot.ts` at module load time
- Non-null assertion for default model in `agent.ts` with known-safe model from snapshot
- Clean build/test verification that mirrors current GitHub workflow expectations

Consumes:
- `packages/pi-ai/src/models-dev-snapshot.ts` — bundled models.dev data (102 providers, 2311KB)
- `packages/pi-ai/src/models-dev-mapper.ts` — transforms models.dev format to internal `Model<Api>` format
- Existing M001/M002/M003 architecture decisions (D001-D025)
