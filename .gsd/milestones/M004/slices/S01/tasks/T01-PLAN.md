---
estimated_steps: 4
estimated_files: 3
---

# T01: Populate pi-ai model registry from snapshot

**Slice:** S01 — CI Failure Fix and Verification
**Milestone:** M004

## Description

The `pi-ai` model registry is currently empty, which causes a TypeScript error in `agent.ts` when assigning the default model. This task populates the registry at module load time by importing from the models.dev snapshot and mapping the data to internal `Model<Api>` format.

## Steps

1. Open `packages/pi-ai/src/models.ts` and examine the current registry structure
2. Add imports for `MODELS_DEV_SNAPSHOT` from `./models-dev-snapshot.ts` and `mapModelsDevModel` from `./models-dev-mapper.ts`
3. At module load time (top level of the file), iterate over the snapshot providers and their models, map each to `Model<Api>` format using the mapper, and store in the registry
4. Ensure `getModel` still returns `Model<Api> | undefined` to preserve models.dev runtime semantics

## Must-Haves

- [ ] Registry is populated at module load time from snapshot
- [ ] `getModel` return type remains `Model<Api> | undefined`
- [ ] No dependency on `pi-coding-agent` (avoid circular dependency)
- [ ] Models.dev architecture is preserved (no reversion to `models.generated.ts`)

## Verification

- `npm run build -w @gsd/pi-ai` succeeds without errors
- Manual check: add temporary log or inspect registry to confirm it's populated with models from snapshot

## Observability Impact

- Signals added/changed: Registry will be populated synchronously at module load time
- How a future agent inspects this: Can call `getModel` with a known model ID from snapshot to verify registry is populated
- Failure state exposed: If snapshot is corrupted or empty, registry will remain empty and `getModel` will return `undefined`

## Inputs

- `packages/pi-ai/src/models-dev-snapshot.ts` — bundled models.dev data
- `packages/pi-ai/src/models-dev-mapper.ts` — transforms models.dev format to internal format

## Expected Output

- `packages/pi-ai/src/models.ts` — modified to populate registry from snapshot at module load time
