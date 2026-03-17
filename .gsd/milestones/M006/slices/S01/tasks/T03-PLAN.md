---
estimated_steps: 5
estimated_files: 30
---

# T03: Thread project context through API routes

**Slice:** S01 — Bridge registry and project-scoped API surface
**Milestone:** M006

## Description

Update all 28 project-scoped API route files to read `?project=` via `resolveProjectCwd(request)` and pass the resulting `projectCwd` to their service/bridge function calls. Also update `web/lib/pty-manager.ts` to accept a `projectCwd` parameter. Skip `shutdown/route.ts` (process-level, no project context).

## Steps

1. **Update routes that call bridge-service aggregate functions directly.** These routes import functions from `bridge-service.ts`. Add `import { resolveProjectCwd } from "...bridge-service.ts"` (or extend the existing import). Call `const projectCwd = resolveProjectCwd(request)` and pass it to the bridge function. Add `request: Request` parameter to handlers that lack it (some GET handlers don't take `request`).
   - `web/app/api/boot/route.ts` — `GET(request)` → `collectBootPayload(projectCwd)`
   - `web/app/api/session/command/route.ts` — `POST(request)` → `sendBridgeInput(payload, projectCwd)`
   - `web/app/api/session/events/route.ts` — `GET(request)` → `getProjectBridgeServiceForCwd(projectCwd)` (import it too)
   - `web/app/api/session/browser/route.ts` — `GET(request)` → `collectSessionBrowserPayload({...}, projectCwd)`
   - `web/app/api/session/manage/route.ts` — `POST(request)` → `renameSessionInCurrentProject(payload, projectCwd)`
   - `web/app/api/live-state/route.ts` — `GET(request)` → `collectSelectiveLiveStatePayload(domains, projectCwd)`
   - `web/app/api/onboarding/route.ts` — add `projectCwd` plumbing to onboarding functions as appropriate
   - `web/app/api/recovery/route.ts` — `GET(request)` → `collectCurrentProjectRecoveryDiagnostics(projectCwd)`

2. **Update routes that call child-process service functions.** Each route imports a `collect*` or `execute*` function from `src/web/*-service.ts`. Import `resolveProjectCwd` from `bridge-service.ts`, extract projectCwd, pass it.
   - `web/app/api/captures/route.ts` — `collectCapturesData(projectCwd)`, `resolveCaptureAction(request, projectCwd)`
   - `web/app/api/cleanup/route.ts` — `collectCleanupData(projectCwd)`, `executeCleanup(..., projectCwd)`
   - `web/app/api/doctor/route.ts` — `collectDoctorData(scope, projectCwd)`
   - `web/app/api/export-data/route.ts` — `collectExportData(format, projectCwd)`
   - `web/app/api/forensics/route.ts` — `collectForensicsData(projectCwd)`
   - `web/app/api/git/route.ts` — `collectCurrentProjectGitSummary(projectCwd)`
   - `web/app/api/history/route.ts` — `collectHistoryData(projectCwd)`
   - `web/app/api/hooks/route.ts` — `collectHooksData(projectCwd)`
   - `web/app/api/inspect/route.ts` — `collectInspectData(projectCwd)`
   - `web/app/api/knowledge/route.ts` — `collectKnowledgeData(projectCwd)`
   - `web/app/api/settings-data/route.ts` — `collectSettingsData(projectCwd)`
   - `web/app/api/skill-health/route.ts` — `collectSkillHealthData(projectCwd)`
   - `web/app/api/undo/route.ts` — `collectUndoInfo(projectCwd)`, `executeUndo(projectCwd)`
   - `web/app/api/visualizer/route.ts` — `collectVisualizerData(projectCwd)`

3. **Update `steer/route.ts`.** It directly calls `resolveBridgeRuntimeConfig()` and reads from the config. Import `resolveProjectCwd`, extract projectCwd from request, pass to `resolveBridgeRuntimeConfig(undefined, projectCwd)`.

4. **Update `files/route.ts` and `pty-manager.ts`.** These read `process.env.GSD_WEB_PROJECT_CWD` directly:
   - `web/app/api/files/route.ts`: Replace local `getProjectCwd()` with `resolveProjectCwd(request)`. Import it from `bridge-service.ts`. Thread the value through to `getGsdRoot()` and `getRootForMode()`.
   - `web/lib/pty-manager.ts`: Add `projectCwd?: string` parameter to `getOrCreateSession()` and any other functions that read `process.env.GSD_WEB_PROJECT_CWD`. Use the parameter when provided, fall back to env var.
   - `web/app/api/terminal/sessions/route.ts`, `web/app/api/terminal/stream/route.ts`, `web/app/api/terminal/input/route.ts`, `web/app/api/terminal/resize/route.ts`: Import `resolveProjectCwd`, extract from request, pass to pty-manager functions.

5. **Verify builds.** Run `npm run build` and `npm run build:web-host` to confirm all route files compile.

## Must-Haves

- [ ] Every project-scoped route imports and calls `resolveProjectCwd(request)` to extract project context
- [ ] `projectCwd` is passed to every service/bridge function call in every route
- [ ] Route handlers that previously took no `request` parameter now accept `request: Request`
- [ ] `files/route.ts` no longer reads `process.env.GSD_WEB_PROJECT_CWD` directly — uses `resolveProjectCwd`
- [ ] `pty-manager.ts` accepts `projectCwd?: string` on relevant functions
- [ ] `shutdown/route.ts` is untouched (process-level, no project context)
- [ ] `npm run build` and `npm run build:web-host` both pass

## Verification

- `npm run build` exits 0
- `npm run build:web-host` exits 0
- `npm run test:unit && npm run test:integration` — all existing tests pass unchanged
- `rg "process.env.GSD_WEB_PROJECT_CWD" web/app/api/` returns empty (all routes use `resolveProjectCwd` now, except `pty-manager.ts` which is in `web/lib/`)

## Inputs

- T01 output: `resolveProjectCwd(request)` and `getProjectBridgeServiceForCwd(projectCwd)` exported from `bridge-service.ts`
- T02 output: All 15 service functions accept `projectCwd?: string`
- All 28 route files in `web/app/api/` — current state with no `?project=` support
- `web/lib/pty-manager.ts` — currently reads `process.env.GSD_WEB_PROJECT_CWD` directly

## Expected Output

- All 28 project-scoped route files modified with `resolveProjectCwd(request)` calls
- `web/lib/pty-manager.ts` modified with `projectCwd?: string` parameter
- Both builds pass
