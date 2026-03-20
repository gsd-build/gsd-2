---
estimated_steps: 4
estimated_files: 3
---

# T02: Build run-manager.ts and update getDisplayMetadata

**Slice:** S04 — YAML Definitions + Run Snapshotting + GRAPH.yaml
**Milestone:** M001

## Description

Create the run lifecycle manager that snapshots YAML definitions into immutable run directories and generates the initial GRAPH.yaml. Then update `CustomWorkflowEngine.getDisplayMetadata()` to display the workflow's name from the definition instead of the hardcoded "Custom Pipeline" label.

This task depends on T01's `definition-loader.ts` and `graphFromDefinition()`.

**Relevant skills:** None required.

## Steps

1. **Create `run-manager.ts`** at `src/resources/extensions/gsd/run-manager.ts`:
   - Import `loadDefinition` and `WorkflowDefinition` from `./definition-loader.js`
   - Import `graphFromDefinition`, `writeGraph` from `./graph.js`
   - Import `copyFileSync`, `mkdirSync`, `existsSync`, `readdirSync`, `readFileSync` from `node:fs`
   - Import `join`, `basename` from `node:path`
   - Define `RunInfo` type: `{ runId: string; runDir: string; definitionName: string; createdAt: string }`
   - Export `createRun(basePath: string, definitionName: string, defsDir?: string)`:
     - Default `defsDir` to `join(basePath, "workflow-defs")`
     - Call `loadDefinition(defsDir, definitionName)` to parse + validate
     - Generate `runId` as `<name>-<ISO compact timestamp>-<4 random hex chars>` (e.g., `my-workflow-20260319T194500-a3f1`)
     - Create directory: `<basePath>/workflow-runs/<runId>/`
     - **Snapshot**: `copyFileSync(join(defsDir, definitionName + ".yaml"), join(runDir, "DEFINITION.yaml"))` — R007 requires exact byte copy, not serialize-then-write
     - Generate GRAPH.yaml: `graphFromDefinition(definition)` → `writeGraph(runDir, graph)`
     - Return `{ runDir, runId }`
   - Export `listRuns(basePath: string): RunInfo[]`:
     - Read `<basePath>/workflow-runs/` directory entries
     - For each subdirectory containing `DEFINITION.yaml`, parse to get name/createdAt
     - Return array sorted by creation time (newest first)
     - Return empty array if `workflow-runs/` directory doesn't exist

2. **Update `custom-workflow-engine.ts` — `buildGSDStateStub()`**:
   - Accept an optional `definitionName?: string` parameter
   - Attach `_definition: { name: definitionName }` to the stub's return object (alongside existing `_graph`)
   - In `deriveState()`, try to read `DEFINITION.yaml` from `this.runDir` via `yaml.parse()` to extract the name field. If missing, use `"Custom Pipeline"` as fallback. Pass this to `buildGSDStateStub(graph, definitionName)`.
   - In `getDisplayMetadata()`, read `_definition?.name` from `state.raw` for `engineLabel`, falling back to `"Custom Pipeline"`.

3. **Typecheck**: `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors

4. **Regression check**: Run existing tests:
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 pass
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all pass (from T01)

## Must-Haves

- [ ] `createRun` creates the run directory under `workflow-runs/`
- [ ] DEFINITION.yaml is an exact byte-copy of the source YAML file (R007 — `copyFileSync` not serialize+write)
- [ ] GRAPH.yaml is generated with all steps in "pending" status and correct dependencies
- [ ] `runId` includes a random suffix to prevent millisecond-collision naming
- [ ] `listRuns` returns metadata for existing runs (or empty array if none)
- [ ] `getDisplayMetadata` shows the workflow definition's `name` field instead of hardcoded "Custom Pipeline"
- [ ] Fallback to "Custom Pipeline" when no DEFINITION.yaml exists (backward compat with S03 tests)
- [ ] 0 type errors, 0 regressions on existing tests

## Verification

- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 still pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all still pass

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — T01 output: `loadDefinition`, `WorkflowDefinition` type
- `src/resources/extensions/gsd/graph.ts` — T01 output: `graphFromDefinition` function
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — existing file to modify
- S03 forward intelligence: `_graph` property on EngineState.raw is accessed via type assertion — use the same pattern for `_definition`
- D005: storage namespace is `workflow-runs/` under basePath
- R007: snapshot must be `copyFileSync` (exact byte copy), not serialize+write

## Expected Output

- `src/resources/extensions/gsd/run-manager.ts` — new file (~80 lines): `createRun` + `listRuns`
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — modified: `buildGSDStateStub` accepts definitionName, `deriveState` reads definition name, `getDisplayMetadata` uses it

## Observability Impact

- **New signal — `createRun` return value:** Returns `{ runId, runDir }` which can be logged/traced by callers to identify the created run directory and its unique ID.
- **New inspection surface — `DEFINITION.yaml`:** Each run directory now contains a frozen copy of the source definition. Agents or humans can `cat <runDir>/DEFINITION.yaml` to see exactly which definition was used.
- **New inspection surface — `listRuns()`:** Enumerate all runs with metadata (name, createdAt) for debugging which runs exist and when they were created.
- **Changed signal — `getDisplayMetadata().engineLabel`:** Now reads the workflow's `name` from `DEFINITION.yaml` instead of hardcoded `"Custom Pipeline"`. Falls back to `"Custom Pipeline"` for backward compatibility with pre-S04 runs (no DEFINITION.yaml).
- **Failure visibility:** `createRun` propagates `loadDefinition` validation errors (with specific field names and reasons). Directory creation failures surface via Node.js fs errors. `listRuns` silently skips unparseable run directories (no crash on corrupt data).
