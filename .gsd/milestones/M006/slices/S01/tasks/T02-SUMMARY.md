---
id: T02
parent: S01
milestone: M006
provides:
  - All 15 child-process services accept optional projectCwdOverride parameter for project-scoped config resolution
key_files:
  - src/web/captures-service.ts
  - src/web/cleanup-service.ts
  - src/web/doctor-service.ts
  - src/web/export-service.ts
  - src/web/forensics-service.ts
  - src/web/git-summary-service.ts
  - src/web/history-service.ts
  - src/web/hooks-service.ts
  - src/web/inspect-service.ts
  - src/web/knowledge-service.ts
  - src/web/recovery-diagnostics-service.ts
  - src/web/settings-service.ts
  - src/web/skill-health-service.ts
  - src/web/undo-service.ts
  - src/web/visualizer-service.ts
key_decisions:
  - Named parameter projectCwdOverride (not projectCwd) to avoid shadowing the destructured const { projectCwd } = config present in all 13 simple services and git-summary-service
patterns_established:
  - "functionName(existingParams, projectCwdOverride?: string)" with "resolveBridgeRuntimeConfig(undefined, projectCwdOverride)" — uniform across all 15 services
  - recovery-diagnostics-service passes projectCwdOverride through to bridge-level functions (collectSelectiveLiveStatePayload, collectCurrentProjectOnboardingState) that T01 already parameterized
observability_surfaces:
  - none — parameter threading only; observability unchanged from T01
duration: ~20min
verification_result: passed
completed_at: 2025-03-17
blocker_discovered: false
---

# T02: Thread project context through child-process services

**Added optional `projectCwdOverride?: string` parameter to every exported function in all 15 child-process service files, threading it to `resolveBridgeRuntimeConfig(undefined, projectCwdOverride)` for project-scoped config resolution.**

## What Happened

Mechanical parameter threading across 15 service files in `src/web/`. Each exported `collect*()`, `execute*()`, `resolve*()`, and `apply*()` function received an optional trailing `projectCwdOverride?: string` parameter. The parameter is forwarded to `resolveBridgeRuntimeConfig(undefined, projectCwdOverride)` so each service resolves config for the targeted project instead of the env-var default.

Special handling:
- **`recovery-diagnostics-service.ts`**: Also passes `projectCwdOverride` to `collectSelectiveLiveStatePayload()` and `collectCurrentProjectOnboardingState()` (T01 already parameterized those).
- **`git-summary-service.ts`**: Straightforward — the function destructures `config.projectCwd` after resolution, so the local binds correctly.
- **`doctor-service.ts`**: Both `collectDoctorData` and `applyDoctorFixes` (not in the original plan) were updated for completeness.

The parameter was named `projectCwdOverride` (not `projectCwd`) because all 13 simple services destructure `const { projectCwd } = config` immediately after resolving config. Using `projectCwd` as the parameter name would cause a TypeScript redeclaration error.

## Verification

- `rg "resolveBridgeRuntimeConfig\(\)" src/web/ -l` → only `bridge-service.ts` (all services now use the override form) ✅
- `npm run build` exits 0 ✅
- `npm run test:unit` → 1197 tests pass, 0 fail ✅

### Slice-level verification (partial — T02 is intermediate):
- `npm run test:unit` — ✅ all existing tests pass
- `npm run build` — ✅ TypeScript compilation succeeds
- `npm run test:unit -- --test-name-pattern "multi-project"` — not yet (T04)
- `npm run build:web-host` — not checked (T03+)

## Diagnostics

No new observability surfaces — this is pure parameter threading. The `resolveBridgeRuntimeConfig` function already logs/returns project-scoped config through the existing `BridgeRuntimeConfig` shape. When `projectCwdOverride` is `undefined`, all functions fall back to the env-var default, preserving existing behavior exactly.

## Deviations

- **Parameter name**: Used `projectCwdOverride` instead of `projectCwd` to avoid shadowing the destructured `const { projectCwd } = config` pattern present in nearly all service files. This matches the existing `projectCwdOverride` naming in `resolveBridgeRuntimeConfig` itself.
- **`applyDoctorFixes`**: Added `projectCwdOverride` to this function too — it wasn't listed in the task plan but is an exported function in `doctor-service.ts` that calls `resolveBridgeRuntimeConfig()` and would have been an inconsistency if left out.

## Known Issues

None.

## Files Created/Modified

- `src/web/captures-service.ts` — `collectCapturesData`, `resolveCaptureAction` accept `projectCwdOverride`
- `src/web/cleanup-service.ts` — `collectCleanupData`, `executeCleanup` accept `projectCwdOverride`
- `src/web/doctor-service.ts` — `collectDoctorData`, `applyDoctorFixes` accept `projectCwdOverride`
- `src/web/export-service.ts` — `collectExportData` accepts `projectCwdOverride`
- `src/web/forensics-service.ts` — `collectForensicsData` accepts `projectCwdOverride`
- `src/web/git-summary-service.ts` — `collectCurrentProjectGitSummary` accepts `projectCwdOverride`
- `src/web/history-service.ts` — `collectHistoryData` accepts `projectCwdOverride`
- `src/web/hooks-service.ts` — `collectHooksData` accepts `projectCwdOverride`
- `src/web/inspect-service.ts` — `collectInspectData` accepts `projectCwdOverride`
- `src/web/knowledge-service.ts` — `collectKnowledgeData` accepts `projectCwdOverride`
- `src/web/recovery-diagnostics-service.ts` — `collectCurrentProjectRecoveryDiagnostics` accepts `projectCwdOverride`, threads to bridge functions
- `src/web/settings-service.ts` — `collectSettingsData` accepts `projectCwdOverride`
- `src/web/skill-health-service.ts` — `collectSkillHealthData` accepts `projectCwdOverride`
- `src/web/undo-service.ts` — `collectUndoInfo`, `executeUndo` accept `projectCwdOverride`
- `src/web/visualizer-service.ts` — `collectVisualizerData` accepts `projectCwdOverride`
