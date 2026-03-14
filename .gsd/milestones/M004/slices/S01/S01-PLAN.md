# S01: CI Failure Fix and Verification

**Goal:** Resolve the TypeScript build error in `@gsd/pi-agent-core` by populating the `pi-ai` model registry from the models.dev snapshot at module load time, then verify the reconciled branch is ready for later PR update.

**Demo:** Local `npm run build` succeeds; `npm test -w @gsd/pi-ai` passes; scenario tests pass; git status is clean; the models.dev architecture is preserved.

## Must-Haves

- Model registry in `pi-ai` is populated at module load time from `models-dev-snapshot.ts`
- TypeScript error in `agent.ts` line 105 is resolved with non-null assertion
- Build and test suite pass locally
- Models.dev architecture (D001, D004, D006) is preserved — no reversion to `models.generated.ts`

## Verification

- `npm run build -w @gsd/pi-ai` — build succeeds
- `npm run build -w @gsd/pi-agent-core` — build succeeds
- `npm test -w @gsd/pi-ai` — all tests pass
- `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — 9 scenario tests pass
- `git status --short` — clean working tree

## Tasks

- [ ] **T01: Populate pi-ai model registry from snapshot** `est:20m`
  - Why: The `pi-ai` model registry is currently empty, causing the TypeScript error when `agent.ts` assigns the default model. Populating it from the snapshot satisfies the type system while preserving the models.dev architecture.
  - Files: `packages/pi-ai/src/models.ts`, `packages/pi-ai/src/models-dev-snapshot.ts`, `packages/pi-ai/src/models-dev-mapper.ts`
  - Do: Import from `models-dev-snapshot.ts` and `models-dev-mapper.ts` at the top of `models.ts`. Initialize the model registry by iterating over the snapshot data, mapping each provider's models to the internal `Model<Api>` format using the mapper, and storing them in the registry. Keep `getModel` return type as `Model<Api> | undefined` to preserve models.dev semantics.
  - Verify: `npm run build -w @gsd/pi-ai` succeeds
  - Done when: Model registry is populated at module load time; `getModel` returns models from snapshot; build passes

- [ ] **T02: Add non-null assertion for default model** `est:5m`
  - Why: The `agent.ts` default model assignment fails because TypeScript can't guarantee the model exists. Adding a non-null assertion is safe because the model is guaranteed to be in the snapshot.
  - Files: `packages/pi-agent-core/src/agent.ts`
  - Do: On line 105, add the non-null assertion operator (`!`) to the default model assignment. The model "gemini-2.5-flash-lite-preview-06-17" exists in the snapshot, so if it's missing at runtime that's a real error that should surface.
  - Verify: `npm run build -w @gsd/pi-agent-core` succeeds
  - Done when: TypeScript build error is resolved; build passes

- [ ] **T03: Run full verification and record decisions** `est:15m`
  - Why: The research warns that additional failures may surface after the TypeScript error is fixed. Full verification ensures we catch any other issues before declaring the milestone complete.
  - Files: `.gsd/DECISIONS.md`, `.gsd/STATE.md`
  - Do: Run the full verification suite (build, unit tests, scenario tests). If any additional failures surface, investigate and fix. Once all verification passes, record the reconciliation approach in `.gsd/DECISIONS.md` and update `.gsd/STATE.md` to reflect completion.
  - Verify: All verification commands pass; git status is clean; decisions recorded
  - Done when: All verification passes; decisions logged; milestone complete

## Files Likely Touched

- `packages/pi-ai/src/models.ts`
- `packages/pi-agent-core/src/agent.ts`
- `.gsd/DECISIONS.md`
- `.gsd/STATE.md`
