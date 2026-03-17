---
estimated_steps: 4
estimated_files: 15
---

# T02: Thread project context through child-process services

**Slice:** S01 — Bridge registry and project-scoped API surface
**Milestone:** M006

## Description

Add an optional `projectCwd?: string` parameter to every exported function in the 15 child-process service files under `src/web/`. When provided, pass it to `resolveBridgeRuntimeConfig(undefined, projectCwd)` so the service resolves config for the targeted project instead of the env-var default. This is mechanical but must be done carefully to preserve all existing call signatures (new param is trailing/optional).

## Steps

1. **Update the 13 simple child-process services.** Each follows the same pattern: an exported async function calls `resolveBridgeRuntimeConfig()` at the top. For each file, add `projectCwd?: string` as the last parameter to every exported function, and change `resolveBridgeRuntimeConfig()` → `resolveBridgeRuntimeConfig(undefined, projectCwd)`. Files:
   - `src/web/captures-service.ts` — `collectCapturesData(projectCwd?)`, `resolveCaptureAction(request, projectCwd?)`
   - `src/web/cleanup-service.ts` — `collectCleanupData(projectCwd?)`, `executeCleanup(..., projectCwd?)`
   - `src/web/doctor-service.ts` — `collectDoctorData(scope?, projectCwd?)`
   - `src/web/export-service.ts` — `collectExportData(format?, projectCwd?)`
   - `src/web/forensics-service.ts` — `collectForensicsData(projectCwd?)`
   - `src/web/history-service.ts` — `collectHistoryData(projectCwd?)`
   - `src/web/hooks-service.ts` — `collectHooksData(projectCwd?)`
   - `src/web/inspect-service.ts` — `collectInspectData(projectCwd?)`
   - `src/web/knowledge-service.ts` — `collectKnowledgeData(projectCwd?)`
   - `src/web/settings-service.ts` — `collectSettingsData(projectCwd?)`
   - `src/web/skill-health-service.ts` — `collectSkillHealthData(projectCwd?)`
   - `src/web/undo-service.ts` — `collectUndoInfo(projectCwd?)`, `executeUndo(projectCwd?)`
   - `src/web/visualizer-service.ts` — `collectVisualizerData(projectCwd?)`

2. **Update `git-summary-service.ts`.** This one has a more complex structure. Add `projectCwd?: string` to `collectCurrentProjectGitSummary()`. Thread it through to `resolveBridgeRuntimeConfig(undefined, projectCwd)`. It may also call bridge functions that now accept `projectCwd` — pass it through.

3. **Update `recovery-diagnostics-service.ts`.** Add `projectCwd?: string` to `collectCurrentProjectRecoveryDiagnostics()`. This service calls `collectCurrentProjectOnboardingState()` and `collectSelectiveLiveStatePayload()` from `bridge-service.ts` — pass `projectCwd` to those calls as well (T01 already added the parameter). Also pass to `resolveBridgeRuntimeConfig(undefined, projectCwd)`.

4. **Verify.** Run `npm run build` to confirm all 15 services type-check with the new optional parameters. Run `npm run test:unit` to confirm no existing tests break.

## Must-Haves

- [ ] Every exported function in all 15 service files accepts `projectCwd?: string`
- [ ] All `resolveBridgeRuntimeConfig()` calls changed to `resolveBridgeRuntimeConfig(undefined, projectCwd)`
- [ ] `recovery-diagnostics-service.ts` passes `projectCwd` to bridge-level functions
- [ ] Existing function signatures remain backward compatible (new param is optional and trailing)
- [ ] `npm run build` passes

## Verification

- `npm run build` exits 0
- `npm run test:unit` passes — no existing service-calling tests break
- `rg "resolveBridgeRuntimeConfig\(\)" src/web/` returns only `bridge-service.ts` (all services now use the override form)

## Inputs

- T01 output: `src/web/bridge-service.ts` with `resolveBridgeRuntimeConfig(env?, projectCwdOverride?)` signature, bridge-level functions accepting `projectCwd?`
- All 15 service files in `src/web/` — each currently calls `resolveBridgeRuntimeConfig()` with no args

## Expected Output

- All 15 `src/web/*-service.ts` files modified with `projectCwd?: string` parameters threaded to `resolveBridgeRuntimeConfig(undefined, projectCwd)`
