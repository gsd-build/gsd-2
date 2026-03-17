---
estimated_steps: 6
estimated_files: 6
---

# T03: Build mutation services, steer route, and wire all store load actions

**Slice:** S07 — Remaining Command Surfaces
**Milestone:** M003

## Description

Build the 2 mutation services (undo, cleanup) with GET+POST routes, the steer route (GET for OVERRIDES.md), and wire all 7 store load functions into the workspace store. The mutation services follow the child-process pattern for their POST handlers (which need to call upstream functions that modify state). The store load functions follow the `loadForensicsDiagnostics` pattern: fetch from API, update phase state, return data.

## Steps

1. **Create `src/web/undo-service.ts`** with two functions:
   - `collectUndoInfo(): Promise<UndoInfo>` — reads `completed-units.json` from `join(gsdRoot, "completed-units.json")` directly (plain JSON, no child process needed). Parse the file, find the last entry, count total entries, and look up associated commits using the activity log directory. Return `UndoInfo` shape from T01 types.
   - `executeUndo(): Promise<UndoResult>` — **child-process pattern** required because undo calls upstream's `handleUndo` which modifies git state and files. The child script should:
     ```js
     const { pathToFileURL } = await import("node:url");
     const mod = await import(pathToFileURL(process.env.GSD_UNDO_MODULE).href);
     // Replicate handleUndo's core logic: read completed-units.json, pop last entry,
     // find commits, revert them, remove from completed-units, uncheck task in plan
     ```
     However, `handleUndo` requires an `ExtensionCommandContext` which we can't provide in a child process. Instead, implement the core undo logic directly in the child script:
     - Read completed-units.json, identify last entry
     - Find commits in activity log via `findCommitsForUnit`
     - Revert commits with `git revert --no-commit`
     - Remove the entry from completed-units.json
     - Call `uncheckTaskInPlan` to uncheck the plan
     - Return success/failure message
   - Use `resolveBridgeRuntimeConfig()` for paths.

2. **Create `src/web/cleanup-service.ts`** with two functions:
   - `collectCleanupData(): Promise<CleanupData>` — **child-process pattern** because it calls `nativeBranchList` and `nativeForEachRef` from native-git-bridge.ts (which uses .js imports). Child script:
     ```js
     const mod = await import(pathToFileURL(process.env.GSD_CLEANUP_MODULE).href);
     const basePath = process.env.GSD_CLEANUP_BASE;
     const branches = mod.nativeBranchList(basePath, "gsd/*");
     const mainBranch = mod.nativeDetectMainBranch(basePath);
     const merged = mod.nativeBranchListMerged(basePath, mainBranch, "gsd/*");
     const mergedSet = new Set(merged);
     const refs = mod.nativeForEachRef(basePath, "refs/gsd/snapshots/");
     // Map to CleanupBranch[] and CleanupSnapshot[]
     process.stdout.write(JSON.stringify({ branches: branchList, snapshots: snapshotList }));
     ```
   - `executeCleanup(deleteBranches: string[], pruneSnapshots: string[]): Promise<CleanupResult>` — child-process pattern, calls `nativeBranchDelete` and `nativeUpdateRef` to remove specified branches/snapshots.

3. **Create `web/app/api/undo/route.ts`** with GET + POST:
   - GET: calls `collectUndoInfo()`, returns `Response.json(payload)`
   - POST: calls `executeUndo()`, returns result or error
   - Both: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, try/catch pattern

4. **Create `web/app/api/cleanup/route.ts`** with GET + POST:
   - GET: calls `collectCleanupData()`, returns branch/snapshot listing
   - POST: reads body `{ branches: string[], snapshots: string[] }`, calls `executeCleanup(...)`, returns result
   - Same pattern as undo route

5. **Create `web/app/api/steer/route.ts`** with GET only:
   - Read OVERRIDES.md via `readFileSync`. Path: `join(projectCwd, ".gsd", "OVERRIDES.md")`
   - No child process needed — plain markdown file read (same reasoning as KNOWLEDGE.md in S05, per D059)
   - Return `{ overridesContent: string | null }` (null if file doesn't exist)
   - `runtime = "nodejs"`, `dynamic = "force-dynamic"`

6. **Wire store load actions in `web/lib/gsd-workspace-store.tsx`:**
   - Add 7 load functions following `loadForensicsDiagnostics` pattern exactly:
     - `loadHistoryData`: fetch `/api/history`, patch `commandSurface.remainingCommands.history`
     - `loadInspectData`: fetch `/api/inspect`, patch `remainingCommands.inspect`
     - `loadHooksData`: fetch `/api/hooks`, patch `remainingCommands.hooks`
     - `loadExportData(format?)`: fetch `/api/export-data?format=...`, patch `remainingCommands.exportData`
     - `loadUndoInfo`: fetch `/api/undo`, patch `remainingCommands.undo`
     - `loadCleanupData`: fetch `/api/cleanup`, patch `remainingCommands.cleanup`
     - `loadSteerData`: fetch `/api/steer`, patch `remainingCommands.steer`
   - Add 2 mutation functions:
     - `executeUndoAction`: POST to `/api/undo`, return result
     - `executeCleanupAction(branches, snapshots)`: POST to `/api/cleanup`, return result
   - Each load function: set phase to "loading", fetch, on success set phase "loaded" + data + lastLoadedAt, on error set phase "error" + error message
   - Add all function names to the store's `ActionKeys` type union (where `loadForensicsDiagnostics`, `loadDoctorDiagnostics` etc are listed)
   - Export all functions via the `useGSDWorkspace` hook return value (same pattern as existing load functions)

## Must-Haves

- [ ] `src/web/undo-service.ts` exports `collectUndoInfo()` and `executeUndo()`
- [ ] `src/web/cleanup-service.ts` exports `collectCleanupData()` and `executeCleanup()`
- [ ] `web/app/api/undo/route.ts` exports GET + POST
- [ ] `web/app/api/cleanup/route.ts` exports GET + POST
- [ ] `web/app/api/steer/route.ts` exports GET
- [ ] 7 load functions + 2 mutation functions are in the store and exposed via useGSDWorkspace
- [ ] `npm run build` succeeds

## Verification

- `npm run build` — exit 0
- `rg "loadHistoryData|loadInspectData|loadHooksData|loadExportData|loadUndoInfo|loadCleanupData|loadSteerData" web/lib/gsd-workspace-store.tsx` — all 7 found
- All route files exist: `ls web/app/api/{undo,cleanup,steer}/route.ts`
- Both service files exist: `ls src/web/{undo,cleanup}-service.ts`

## Observability Impact

- Signals added: undo POST and cleanup POST return structured `{ success, message }` results; errors return `{ error: "message" }` with HTTP 500
- How a future agent inspects: `curl http://localhost:3000/api/undo`, `curl http://localhost:3000/api/cleanup`, `curl http://localhost:3000/api/steer`
- Failure state exposed: store phase transitions to "error" with error message, visible in panel components

## Inputs

- `src/web/forensics-service.ts` — **primary pattern reference** for child-process services. Read this file first.
- `web/app/api/forensics/route.ts` — **primary route pattern**. Read this too.
- `web/app/api/doctor/route.ts` — pattern reference for POST routes (doctor has fix action)
- `web/lib/gsd-workspace-store.tsx` — the store to extend. Search for `loadForensicsDiagnostics` to find the pattern: fetch, phase transitions, data patch
- `web/lib/remaining-command-types.ts` — T01 output with typed shapes
- `web/lib/command-surface-contract.ts` — T01 output with `CommandSurfaceRemainingState` and `remainingCommands` field
- `src/web/bridge-service.ts` — provides `resolveBridgeRuntimeConfig()` returning `{ packageRoot, projectCwd }`
- Upstream modules for child script logic:
  - `src/resources/extensions/gsd/undo.ts` — `findCommitsForUnit()`, `uncheckTaskInPlan()`, `extractCommitShas()`
  - `src/resources/extensions/gsd/native-git-bridge.ts` — `nativeBranchList()`, `nativeBranchListMerged()`, `nativeBranchDelete()`, `nativeForEachRef()`, `nativeUpdateRef()`, `nativeDetectMainBranch()`
  - `src/resources/extensions/gsd/paths.ts` — `gsdRoot(basePath)`

## Expected Output

- `src/web/undo-service.ts` — ~130 lines, read + mutate service for undo operations
- `src/web/cleanup-service.ts` — ~140 lines, read + mutate service for branch/snapshot cleanup
- `web/app/api/undo/route.ts` — ~45 lines, GET + POST route
- `web/app/api/cleanup/route.ts` — ~50 lines, GET + POST route
- `web/app/api/steer/route.ts` — ~30 lines, GET route for OVERRIDES.md
- `web/lib/gsd-workspace-store.tsx` — extended with 7 load functions + 2 mutation functions + hook exports
