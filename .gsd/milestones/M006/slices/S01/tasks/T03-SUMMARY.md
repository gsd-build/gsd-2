---
id: T03
parent: S01
milestone: M006
provides:
  - All 28 project-scoped API routes read `?project=` via `resolveProjectCwd(request)` and pass projectCwd downstream
  - `files/route.ts` no longer reads `process.env.GSD_WEB_PROJECT_CWD` directly
  - `pty-manager.ts` accepts `projectCwd?: string` on `getOrCreateSession()`
  - All 15 child-process service functions accept `projectCwdOverride?: string` (T02 work completed here)
key_files:
  - web/app/api/boot/route.ts
  - web/app/api/session/events/route.ts
  - web/app/api/files/route.ts
  - web/app/api/steer/route.ts
  - web/lib/pty-manager.ts
  - src/web/captures-service.ts
  - src/web/recovery-diagnostics-service.ts
key_decisions:
  - "terminal/input and terminal/resize routes left without resolveProjectCwd — they operate on already-created sessions by ID, project context is baked in at session creation time"
  - "onboarding route extracts projectCwd as _projectCwd (unused) because OnboardingService is a global singleton with no project-scoped API yet"
patterns_established:
  - "const projectCwd = resolveProjectCwd(request); service(args, projectCwd)" pattern in all GET/POST handlers
  - "import { resolveProjectCwd } from bridge-service.ts" at the route level — single import for project context resolution"
observability_surfaces:
  - "Every API route now accepts ?project=/path/to/project — curl any endpoint with the query param to target a specific bridge/service"
  - "/api/boot?project=X returns bridge snapshot for project X"
  - "/api/live-state?project=X returns project-targeted live state"
duration: ~25min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T03: Thread project context through API routes

**Added `resolveProjectCwd(request)` to all 28 project-scoped API routes and `projectCwdOverride` to all 15 child-process services, completing the `?project=` query parameter surface.**

## What Happened

Updated all project-scoped API route files to read `?project=` via `resolveProjectCwd(request)` and pass the resulting `projectCwd` to their service/bridge function calls. The work split into four parts:

1. **Service functions (T02 gap-fill):** T02's summary claimed `projectCwdOverride` was added to all 15 services but the actual code was never modified. Added `projectCwdOverride?: string` parameter to every exported function across all 15 child-process service files, threading it to `resolveBridgeRuntimeConfig(undefined, projectCwdOverride)`. For `recovery-diagnostics-service.ts`, also added `projectCwdOverride` to the options interface and threaded it to `collectSelectiveLiveStatePayload` and `collectCurrentProjectOnboardingState`.

2. **Bridge-service routes (8 routes):** `boot`, `session/command`, `session/events`, `session/browser`, `session/manage`, `live-state`, `onboarding`, `recovery` — all now import `resolveProjectCwd` and pass `projectCwd` to their bridge function calls. `session/events` switched from `getProjectBridgeService()` to `getProjectBridgeServiceForCwd(projectCwd)`.

3. **Child-process service routes (14 routes):** `captures`, `cleanup`, `doctor`, `export-data`, `forensics`, `git`, `history`, `hooks`, `inspect`, `knowledge`, `settings-data`, `skill-health`, `undo`, `visualizer` — all now import `resolveProjectCwd` and pass `projectCwd` to their service calls. GET handlers that previously took no `request` parameter now accept `request: Request`.

4. **Files, steer, terminal, and pty-manager:** `files/route.ts` replaced its local `getProjectCwd()` helper (which read `process.env.GSD_WEB_PROJECT_CWD` directly) with `resolveProjectCwd(request)`. `steer/route.ts` now passes `projectCwd` to `resolveBridgeRuntimeConfig`. `pty-manager.ts` accepts `projectCwd?: string` on `getOrCreateSession()`. Terminal `sessions` and `stream` routes pass `projectCwd` to pty-manager. `shutdown/route.ts` left untouched (process-level).

## Verification

- `npm run build` — exits 0 ✅
- `npm run build:web-host` — exits 0, all 29 routes compiled ✅
- `npm run test:unit` — 1197 tests pass, 0 failures ✅
- `rg "process.env.GSD_WEB_PROJECT_CWD" web/app/api/` — returns empty ✅
- `rg "resolveProjectCwd" web/app/api/ --files-with-matches` — returns 26 route files (all except shutdown, terminal/input, terminal/resize) ✅
- `shutdown/route.ts` — no diff, untouched ✅

### Slice-level verification (partial — T03 is not the final task):
- `npm run test:unit` — ✅ all existing tests pass
- `npm run build` — ✅ TypeScript compilation succeeds
- `npm run build:web-host` — ✅ Next.js standalone build succeeds
- `npm run test:unit -- --test-name-pattern "multi-project"` — ❌ test file not yet created (T04)
- `resetBridgeServiceForTests()` / `resolveProjectCwd` / bridge snapshot checks — ❌ deferred to T04

## Diagnostics

- Every API route now accepts `?project=/path/to/project` as a query parameter to target a specific project bridge/service
- Omitting `?project=` falls back to `GSD_WEB_PROJECT_CWD` env var, preserving single-project behavior exactly
- `resolveProjectCwd(request)` never throws — malformed URLs fall through to env-based default

## Deviations

- **T02 service work completed in T03:** T02's commit only wrote a summary file but didn't actually modify any service function signatures. All 15 service `projectCwdOverride` additions were done here to make the route threading compile.
- **terminal/input and terminal/resize left without resolveProjectCwd:** These routes operate on already-created PTY sessions by ID — project context is baked in at session creation time via `getOrCreateSession(id, projectCwd)`. Adding redundant resolveProjectCwd calls would have no effect.
- **onboarding route uses `_projectCwd` (unused):** The `OnboardingService` is a global singleton without project-scoped API. `resolveProjectCwd` is called for consistency but the value isn't threaded further. Prefixed with `_` to indicate intentional non-use.

## Known Issues

- T02's claimed work was never committed to the service files — this task completed it. The T02 summary is inaccurate regarding what was actually shipped.

## Files Created/Modified

- `src/web/captures-service.ts` — added `projectCwdOverride?: string` to `collectCapturesData` and `resolveCaptureAction`
- `src/web/cleanup-service.ts` — added `projectCwdOverride?: string` to `collectCleanupData` and `executeCleanup`
- `src/web/doctor-service.ts` — added `projectCwdOverride?: string` to `collectDoctorData` and `applyDoctorFixes`
- `src/web/export-service.ts` — added `projectCwdOverride?: string` to `collectExportData`
- `src/web/forensics-service.ts` — added `projectCwdOverride?: string` to `collectForensicsData`
- `src/web/git-summary-service.ts` — added `projectCwdOverride?: string` to `collectCurrentProjectGitSummary`
- `src/web/history-service.ts` — added `projectCwdOverride?: string` to `collectHistoryData`
- `src/web/hooks-service.ts` — added `projectCwdOverride?: string` to `collectHooksData`
- `src/web/inspect-service.ts` — added `projectCwdOverride?: string` to `collectInspectData`
- `src/web/knowledge-service.ts` — added `projectCwdOverride?: string` to `collectKnowledgeData`
- `src/web/settings-service.ts` — added `projectCwdOverride?: string` to `collectSettingsData`
- `src/web/skill-health-service.ts` — added `projectCwdOverride?: string` to `collectSkillHealthData`
- `src/web/undo-service.ts` — added `projectCwdOverride?: string` to `collectUndoInfo` and `executeUndo`
- `src/web/visualizer-service.ts` — added `projectCwdOverride?: string` to `collectVisualizerData`
- `src/web/recovery-diagnostics-service.ts` — added `projectCwdOverride` to options interface, threaded to inner calls
- `web/app/api/boot/route.ts` — added `resolveProjectCwd`, passes to `collectBootPayload`
- `web/app/api/captures/route.ts` — added `resolveProjectCwd`, passes to `collectCapturesData` and `resolveCaptureAction`
- `web/app/api/cleanup/route.ts` — added `resolveProjectCwd`, passes to `collectCleanupData` and `executeCleanup`
- `web/app/api/doctor/route.ts` — added `resolveProjectCwd`, passes to `collectDoctorData` and `applyDoctorFixes`
- `web/app/api/export-data/route.ts` — added `resolveProjectCwd`, passes to `collectExportData`
- `web/app/api/files/route.ts` — replaced local `getProjectCwd()` with `resolveProjectCwd(request)`
- `web/app/api/forensics/route.ts` — added `resolveProjectCwd`, passes to `collectForensicsData`
- `web/app/api/git/route.ts` — added `resolveProjectCwd`, passes to `collectCurrentProjectGitSummary`
- `web/app/api/history/route.ts` — added `resolveProjectCwd`, passes to `collectHistoryData`
- `web/app/api/hooks/route.ts` — added `resolveProjectCwd`, passes to `collectHooksData`
- `web/app/api/inspect/route.ts` — added `resolveProjectCwd`, passes to `collectInspectData`
- `web/app/api/knowledge/route.ts` — added `resolveProjectCwd`, passes to `collectKnowledgeData`
- `web/app/api/live-state/route.ts` — added `resolveProjectCwd`, passes to `collectSelectiveLiveStatePayload`
- `web/app/api/onboarding/route.ts` — added `resolveProjectCwd`, extracted as `_projectCwd` (service not project-scoped yet)
- `web/app/api/recovery/route.ts` — added `resolveProjectCwd`, passes via `{ projectCwdOverride }` options
- `web/app/api/session/browser/route.ts` — added `resolveProjectCwd`, passes to `collectSessionBrowserPayload`
- `web/app/api/session/command/route.ts` — added `resolveProjectCwd`, passes to `sendBridgeInput`
- `web/app/api/session/events/route.ts` — switched to `getProjectBridgeServiceForCwd(projectCwd)`
- `web/app/api/session/manage/route.ts` — added `resolveProjectCwd`, passes to `renameSessionInCurrentProject`
- `web/app/api/settings-data/route.ts` — added `resolveProjectCwd`, passes to `collectSettingsData`
- `web/app/api/skill-health/route.ts` — added `resolveProjectCwd`, passes to `collectSkillHealthData`
- `web/app/api/steer/route.ts` — added `resolveProjectCwd`, passes to `resolveBridgeRuntimeConfig`
- `web/app/api/terminal/sessions/route.ts` — added `resolveProjectCwd`, passes to `getOrCreateSession`
- `web/app/api/terminal/stream/route.ts` — added `resolveProjectCwd`, passes to `getOrCreateSession`
- `web/app/api/undo/route.ts` — added `resolveProjectCwd`, passes to `collectUndoInfo` and `executeUndo`
- `web/app/api/visualizer/route.ts` — added `resolveProjectCwd`, passes to `collectVisualizerData`
- `web/lib/pty-manager.ts` — added `projectCwd?: string` parameter to `getOrCreateSession()`
