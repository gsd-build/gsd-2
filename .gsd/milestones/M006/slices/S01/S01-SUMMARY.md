---
id: S01
parent: M006
milestone: M006
provides:
  - Map-based bridge registry keyed by resolved project path (`projectBridgeRegistry`)
  - getProjectBridgeServiceForCwd(projectCwd) — registry-based bridge lookup/create API
  - resolveProjectCwd(request) — reads ?project= from URL, URL-decodes, falls back to GSD_WEB_PROJECT_CWD env var
  - resolveBridgeRuntimeConfig(env?, projectCwdOverride?) — extended with runtime override
  - All 8 bridge-level aggregate functions accept optional projectCwd parameter
  - All 15 child-process service functions accept optional projectCwdOverride parameter
  - All 26 project-scoped API routes call resolveProjectCwd(request) and pass projectCwd downstream
  - pty-manager.ts getOrCreateSession() accepts optional projectCwd
  - getProjectBridgeService() backward-compatible shim delegates to registry
  - resetBridgeServiceForTests() clears full registry (disposes all bridges)
  - 8-case contract test proving multi-bridge coexistence and backward compatibility
requires: []
affects:
  - S02
key_files:
  - src/web/bridge-service.ts
  - src/tests/web-multi-project-contract.test.ts
  - web/lib/pty-manager.ts
key_decisions:
  - "D061: Registry keyed by resolve(projectCwd) with Map<string, BridgeService> — explicit disposal only, no concurrent-request races"
  - "D062: resolveProjectCwd(request) reads ?project= query parameter with env-var fallback — stateless, debuggable, SSE-compatible"
patterns_established:
  - "projectCwd ? getProjectBridgeServiceForCwd(projectCwd) : getProjectBridgeService()" for optional project targeting in bridge-level functions
  - "const projectCwd = resolveProjectCwd(request)" at top of every route handler, passed to service/bridge calls
  - "functionName(existingParams, projectCwdOverride?: string)" with "resolveBridgeRuntimeConfig(undefined, projectCwdOverride)" in all 15 child-process services
  - All new parameters are optional trailing params — backward compatible by construction
observability_surfaces:
  - Each registered bridge exposes BridgeRuntimeSnapshot via getSnapshot() with per-project projectCwd, phase, lastError, connectionCount
  - /api/boot?project=X returns bridge snapshot for project X
  - /api/live-state?project=X returns project-targeted live state
  - resolveProjectCwd deterministically resolves project context — never throws
  - resetBridgeServiceForTests disposes all bridges and clears registry
  - npm run test:unit -- --test-name-pattern "multi-project" re-verifies all 8 coexistence claims
drill_down_paths:
  - .gsd/milestones/M006/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M006/slices/S01/tasks/T03-SUMMARY.md
  - .gsd/milestones/M006/slices/S01/tasks/T04-SUMMARY.md
duration: ~1h30m
verification_result: passed
completed_at: 2026-03-17
---

# S01: Bridge registry and project-scoped API surface

**Replaced the bridge singleton with a Map-based registry, added `resolveProjectCwd(request)` for `?project=` query parameter resolution, and threaded project context through all 15 child-process services, 26 API routes, and 8 bridge-level aggregate functions — proven by 8-case contract test and full regression (1205 tests, both builds green).**

## What Happened

The work proceeded in four stages, converting the single-project bridge architecture to a multi-project-capable registry without breaking any existing behavior:

**T01 — Bridge registry and helpers.** Replaced `projectBridgeSingleton` with `const projectBridgeRegistry = new Map<string, BridgeService>()`. Added `getProjectBridgeServiceForCwd(projectCwd)` which resolves the path, checks the registry, and creates on miss. Added `resolveProjectCwd(request)` which reads `?project=` from the URL, URL-decodes it, and falls back to `GSD_WEB_PROJECT_CWD` env var (wrapped in try/catch — never throws). Extended `resolveBridgeRuntimeConfig` with optional `projectCwdOverride` parameter. Converted `getProjectBridgeService()` to a backward-compatible shim delegating to the registry. Threaded `projectCwd?: string` through all 8 bridge-level aggregate functions (`collectBootPayload`, `sendBridgeInput`, `collectSelectiveLiveStatePayload`, `collectSessionBrowserPayload`, `renameSessionInCurrentProject`, `collectCurrentProjectOnboardingState`, `emitProjectLiveStateInvalidation`, `refreshProjectBridgeAuth`). Updated `resetBridgeServiceForTests` to dispose all registry entries.

**T02 — Service parameter threading (planned).** The original executor wrote a summary claiming service changes but didn't modify the actual source files. This gap was discovered and resolved during T03.

**T03 — Route and service threading.** Completed the T02 service work (adding `projectCwdOverride?: string` to every exported function in all 15 child-process services) and threaded `resolveProjectCwd(request)` through all 26 project-scoped API routes. Routes that previously had no `request` parameter on GET handlers were updated to accept it. `files/route.ts` replaced its local `getProjectCwd()` helper (which read `process.env.GSD_WEB_PROJECT_CWD` directly) with `resolveProjectCwd(request)`. `pty-manager.ts` now accepts `projectCwd?: string` on `getOrCreateSession()`. Two routes (`terminal/input`, `terminal/resize`) were intentionally excluded — they operate on already-created sessions by ID, where project context is baked in at creation time. `shutdown/route.ts` was excluded — it's process-level with no project context.

**T04 — Contract test and regression.** Wrote `web-multi-project-contract.test.ts` with 8 test cases proving: distinct instances for different paths, idempotent lookup, independent command routing, subscriber isolation (SSE events from bridge A don't appear on bridge B), URL parameter reading with decoding, env-var fallback, backward-compatible shim, and registry reset. Full regression: 1205 unit tests pass (0 fail), both `npm run build` and `npm run build:web-host` exit 0.

## Verification

- `npm run test:unit` — **1205 pass, 0 fail** (8 new multi-project tests added)
- `npm run test:unit -- --test-name-pattern "multi-project"` — all 8 coexistence tests pass
- `npm run build` — TypeScript compilation exits 0
- `npm run build:web-host` — Next.js standalone build exits 0 with all 29 routes compiled
- `rg "projectBridgeSingleton" src/web/bridge-service.ts` — empty (singleton fully removed)
- `rg "resolveProjectCwd" web/app/api/ --files-with-matches` — 26 route files (all except shutdown, terminal/input, terminal/resize)
- `rg "projectCwdOverride" src/web/ --files-with-matches` — 16 service files (15 child-process + bridge-service)
- `rg "process.env.GSD_WEB_PROJECT_CWD" web/app/api/` — empty (no more direct env reads in routes)

## Requirements Advanced

- R020 (multi-project workspace) — S01 delivers the foundational server-side architecture: bridge registry, project-scoped API surface, and multi-bridge coexistence proof. The browser-side (store switching, project discovery, context-aware launch) remains for S02–S03.

## Requirements Validated

- none — R020 requires end-to-end completion through S03 for validation

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **T02 was a no-op commit.** The executor wrote a task summary but didn't modify any service files. T03 discovered this when route compilation failed (services didn't accept `projectCwdOverride` yet) and completed both T02 and T03 work together. The T02 summary is inaccurate about what was actually shipped — T03's summary documents this.
- **`terminal/input` and `terminal/resize` left without `resolveProjectCwd`.** These routes operate on already-created PTY sessions by ID — project context is baked in at session creation time via `getOrCreateSession(id, projectCwd)`. Adding redundant resolution would have no effect.
- **`onboarding` route reads `resolveProjectCwd` but discards it as `_projectCwd`.** The `OnboardingService` is a global singleton with no project-scoped API yet. Called for forward consistency.

## Known Limitations

- **No bridge lifecycle management.** Bridges are created on first access and only disposed via `resetBridgeServiceForTests()` or process shutdown. No idle eviction, no memory pressure handling, no max-instance cap. This is acceptable for S01 — lifecycle policy can be added when real multi-project usage reveals the need.
- **SSE stream cleanup hangs.** All web contract test files (not just the new one) report process-level "failure" due to `Promise resolution is still pending but the event loop has already resolved` — SSE ReadableStream handles stay open. All individual test cases pass. This is pre-existing.
- **OnboardingService is not project-scoped.** The onboarding route reads `?project=` but doesn't thread it to the service. This is fine — onboarding is a user-level concern, not project-scoped.

## Follow-ups

- none — all planned work for S01 is complete

## Files Created/Modified

- `src/web/bridge-service.ts` — replaced singleton with Map registry, added `getProjectBridgeServiceForCwd`, `resolveProjectCwd`, extended `resolveBridgeRuntimeConfig`, updated all aggregate functions, updated `resetBridgeServiceForTests`
- `src/web/captures-service.ts` — added `projectCwdOverride` to `collectCapturesData`, `resolveCaptureAction`
- `src/web/cleanup-service.ts` — added `projectCwdOverride` to `collectCleanupData`, `executeCleanup`
- `src/web/doctor-service.ts` — added `projectCwdOverride` to `collectDoctorData`, `applyDoctorFixes`
- `src/web/export-service.ts` — added `projectCwdOverride` to `collectExportData`
- `src/web/forensics-service.ts` — added `projectCwdOverride` to `collectForensicsData`
- `src/web/git-summary-service.ts` — added `projectCwdOverride` to `collectCurrentProjectGitSummary`
- `src/web/history-service.ts` — added `projectCwdOverride` to `collectHistoryData`
- `src/web/hooks-service.ts` — added `projectCwdOverride` to `collectHooksData`
- `src/web/inspect-service.ts` — added `projectCwdOverride` to `collectInspectData`
- `src/web/knowledge-service.ts` — added `projectCwdOverride` to `collectKnowledgeData`
- `src/web/recovery-diagnostics-service.ts` — added `projectCwdOverride` to options interface and inner calls
- `src/web/settings-service.ts` — added `projectCwdOverride` to `collectSettingsData`
- `src/web/skill-health-service.ts` — added `projectCwdOverride` to `collectSkillHealthData`
- `src/web/undo-service.ts` — added `projectCwdOverride` to `collectUndoInfo`, `executeUndo`
- `src/web/visualizer-service.ts` — added `projectCwdOverride` to `collectVisualizerData`
- `web/app/api/boot/route.ts` — added `resolveProjectCwd`, passes to `collectBootPayload`
- `web/app/api/captures/route.ts` — added `resolveProjectCwd`, passes to service calls
- `web/app/api/cleanup/route.ts` — added `resolveProjectCwd`, passes to service calls
- `web/app/api/doctor/route.ts` — added `resolveProjectCwd`, passes to service calls
- `web/app/api/export-data/route.ts` — added `resolveProjectCwd`, passes to `collectExportData`
- `web/app/api/files/route.ts` — replaced local `getProjectCwd()` with `resolveProjectCwd(request)`
- `web/app/api/forensics/route.ts` — added `resolveProjectCwd`, passes to `collectForensicsData`
- `web/app/api/git/route.ts` — added `resolveProjectCwd`, passes to `collectCurrentProjectGitSummary`
- `web/app/api/history/route.ts` — added `resolveProjectCwd`, passes to `collectHistoryData`
- `web/app/api/hooks/route.ts` — added `resolveProjectCwd`, passes to `collectHooksData`
- `web/app/api/inspect/route.ts` — added `resolveProjectCwd`, passes to `collectInspectData`
- `web/app/api/knowledge/route.ts` — added `resolveProjectCwd`, passes to `collectKnowledgeData`
- `web/app/api/live-state/route.ts` — added `resolveProjectCwd`, passes to `collectSelectiveLiveStatePayload`
- `web/app/api/onboarding/route.ts` — added `resolveProjectCwd`, extracted as `_projectCwd`
- `web/app/api/recovery/route.ts` — added `resolveProjectCwd`, passes via options
- `web/app/api/session/browser/route.ts` — added `resolveProjectCwd`, passes to `collectSessionBrowserPayload`
- `web/app/api/session/command/route.ts` — added `resolveProjectCwd`, passes to `sendBridgeInput`
- `web/app/api/session/events/route.ts` — switched to `getProjectBridgeServiceForCwd(projectCwd)`
- `web/app/api/session/manage/route.ts` — added `resolveProjectCwd`, passes to `renameSessionInCurrentProject`
- `web/app/api/settings-data/route.ts` — added `resolveProjectCwd`, passes to `collectSettingsData`
- `web/app/api/skill-health/route.ts` — added `resolveProjectCwd`, passes to `collectSkillHealthData`
- `web/app/api/steer/route.ts` — added `resolveProjectCwd`, passes to `resolveBridgeRuntimeConfig`
- `web/app/api/terminal/sessions/route.ts` — added `resolveProjectCwd`, passes to `getOrCreateSession`
- `web/app/api/terminal/stream/route.ts` — added `resolveProjectCwd`, passes to `getOrCreateSession`
- `web/app/api/undo/route.ts` — added `resolveProjectCwd`, passes to service calls
- `web/app/api/visualizer/route.ts` — added `resolveProjectCwd`, passes to `collectVisualizerData`
- `web/lib/pty-manager.ts` — added `projectCwd?: string` to `getOrCreateSession()`
- `src/tests/web-multi-project-contract.test.ts` — new 8-case contract test for multi-bridge coexistence

## Forward Intelligence

### What the next slice should know
- Every API route now accepts `?project=/path/to/project`. S02's browser store and SSE connections should append this query parameter to all API calls and EventSource URLs when targeting a non-default project.
- `getProjectBridgeServiceForCwd(projectCwd)` creates bridges lazily on first access. S02 does NOT need to pre-create bridges — just call the API with `?project=` and the server handles it.
- `resolveProjectCwd(request)` falls back to `GSD_WEB_PROJECT_CWD` env var. Single-project behavior is unchanged by default. S02 only needs to add `?project=` when the user explicitly switches projects.
- The `session/events` SSE route now uses `getProjectBridgeServiceForCwd(projectCwd)` directly — each SSE connection subscribes to the correct bridge. S02's per-project SSE connections will get events only from their own bridge.

### What's fragile
- **T02 summary vs reality.** T02's summary claims work was done but the code wasn't modified. If any future process trusts T02's summary without verifying the code, it will be misled. T03's summary documents this accurately.
- **Bridge registry has no lifecycle management.** Created bridges stay in the registry until `resetBridgeServiceForTests()` or process exit. If S02's project discovery creates many bridges, there's no eviction. This is fine for a handful of projects but could be a concern for large dev roots.

### Authoritative diagnostics
- `npm run test:unit -- --test-name-pattern "multi-project"` — proves registry identity, command independence, subscriber isolation, project resolution, backward compat, and reset in ~10s
- `rg "resolveProjectCwd" web/app/api/ --files-with-matches | wc -l` should be 26 — confirms route threading coverage
- `rg "projectCwdOverride" src/web/ --files-with-matches | wc -l` should be 16 — confirms service threading coverage

### What assumptions changed
- The plan estimated 28 routes needed threading. Actual count is 26 — `terminal/input` and `terminal/resize` don't need it (they use pre-created session IDs), and `shutdown` is process-level.
- T02 was planned as a separate task but shipped as part of T03 due to the no-op commit issue. The work is complete but attributed to T03.
