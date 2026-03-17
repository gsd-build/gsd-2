---
estimated_steps: 5
estimated_files: 8
---

# T02: Build read-only child-process services and API routes for history, inspect, hooks, and export

**Slice:** S07 — Remaining Command Surfaces
**Milestone:** M003

## Description

Build 4 child-process services and 4 matching API routes for the read-only data surfaces: history, inspect, hooks, and export. Each service follows the exact pattern established by `src/web/forensics-service.ts` (113 lines): resolve the upstream module path via `resolveBridgeRuntimeConfig()`, spawn a child process with `--import resolve-ts.mjs --experimental-strip-types`, import the module via `pathToFileURL`, call the data function, and write JSON to stdout. Each API route follows the exact pattern of `web/app/api/forensics/route.ts` (26 lines): thin GET handler that calls the service function and returns `Response.json()`.

**Critical constraint:** All upstream extension modules use `.js` import extensions (Node ESM). They CANNOT be directly imported by the web host (Turbopack fails on `.js→.ts` resolution). The child-process pattern is mandatory — see KNOWLEDGE entry "Turbopack Cannot Resolve .js→.ts Extension Imports".

## Steps

1. **Create `src/web/history-service.ts`** following forensics-service.ts pattern:
   - Import `execFile` from `node:child_process`, `existsSync` from `node:fs`, `join` from `node:path`
   - Import `resolveBridgeRuntimeConfig` from `./bridge-service.ts`
   - Import `HistoryData` type from `../../web/lib/remaining-command-types.ts`
   - Resolve module path: `join(packageRoot, "src", "resources", "extensions", "gsd", "metrics.ts")`
   - Resolve loader: `join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")`
   - Child script logic:
     ```js
     const mod = await import(pathToFileURL(process.env.GSD_HISTORY_MODULE).href);
     const ledger = mod.loadLedgerFromDisk(process.env.GSD_HISTORY_BASE);
     const units = ledger ? ledger.units : [];
     const totals = mod.getProjectTotals(units);
     const byPhase = mod.aggregateByPhase(units);
     const bySlice = mod.aggregateBySlice(units);
     const byModel = mod.aggregateByModel(units);
     process.stdout.write(JSON.stringify({ units, totals, byPhase, bySlice, byModel }));
     ```
   - Set env vars: `GSD_HISTORY_MODULE` = module path, `GSD_HISTORY_BASE` = projectCwd
   - Export `async function collectHistoryData(): Promise<HistoryData>`

2. **Create `src/web/inspect-service.ts`** following the same pattern:
   - Resolve module: `commands.ts` in the GSD extension directory
   - Child script: import the module, reconstruct handleInspect logic:
     ```js
     const { existsSync, readFileSync } = await import("node:fs");
     const { join } = await import("node:path");
     const base = process.env.GSD_INSPECT_BASE;
     const gsdDir = join(base, ".gsd");
     // Read gsd-db.json for schema version
     let schemaVersion = null;
     const dbPath = join(gsdDir, "gsd-db.json");
     if (existsSync(dbPath)) {
       try { const db = JSON.parse(readFileSync(dbPath, "utf-8")); schemaVersion = db.schema_version ?? null; } catch {}
     }
     // Count decisions, requirements, artifacts from gsd-db.json
     let decisions = [], requirements = [], artifacts = [];
     if (existsSync(dbPath)) {
       try {
         const db = JSON.parse(readFileSync(dbPath, "utf-8"));
         decisions = db.decisions || [];
         requirements = db.requirements || [];
         artifacts = db.artifacts || [];
       } catch {}
     }
     const result = {
       schemaVersion,
       counts: { decisions: decisions.length, requirements: requirements.length, artifacts: artifacts.length },
       recentDecisions: decisions.slice(-5).reverse().map(d => ({ id: d.id, decision: d.decision, choice: d.choice })),
       recentRequirements: requirements.slice(-5).reverse().map(r => ({ id: r.id, status: r.status, description: r.description })),
     };
     process.stdout.write(JSON.stringify(result));
     ```
   - Note: inspect reads from gsd-db.json directly — no upstream module import needed for the data. But still use child process for consistency + to access the project filesystem. Actually, inspect data is just file reads, so this could be a direct `readFileSync` in the service (not a child process). Use direct file reads since gsd-db.json is just JSON — no `.js` extension imports needed. Still structure it as an async function matching the same export pattern.
   - Export `async function collectInspectData(): Promise<InspectData>`

3. **Create `src/web/hooks-service.ts`** following forensics-service.ts pattern:
   - Resolve module: `post-unit-hooks.ts` in the GSD extension directory
   - Child script:
     ```js
     const mod = await import(pathToFileURL(process.env.GSD_HOOKS_MODULE).href);
     // getHookStatus() reads from module-level state — but that state is empty in a fresh child process
     // Instead, read preferences to get hook configs, then build status from config
     // Actually, getHookStatus() depends on runtime state (activeHook, hookQueue, cycleCounts) which won't exist in a child process.
     // Fallback: use formatHookStatus() or read hooks from preferences file directly.
     ```
   - **Important nuance:** `getHookStatus()` reads runtime state (module-level variables) that only exist in the running GSD process, not in a child process. The child approach won't have that state. Instead, build hook status from preferences config:
     - Read `.gsd/preferences.json` or call `resolvePostUnitHooks()` + `resolvePreDispatchHooks()` from preferences.ts
     - Build entries from the config (name, type, enabled, targets) with empty activeCycles (only available at runtime)
   - Child script should: import preferences.ts, call resolvePostUnitHooks(base) and resolvePreDispatchHooks(base), map them into HookStatusEntry[], also call formatHookStatus() for the formatted string
   - Export `async function collectHooksData(): Promise<HooksData>`

4. **Create `src/web/export-service.ts`** following the child-process pattern:
   - Resolve module: `export.ts` in the GSD extension directory
   - Child script accepts format param via env var:
     ```js
     const mod = await import(pathToFileURL(process.env.GSD_EXPORT_MODULE).href);
     const format = process.env.GSD_EXPORT_FORMAT || "markdown";
     const basePath = process.env.GSD_EXPORT_BASE;
     // Call writeExportFile which returns file path, then read the content
     const filePath = mod.writeExportFile(basePath, format);
     if (filePath) {
       const { readFileSync } = await import("node:fs");
       const content = readFileSync(filePath, "utf-8");
       const { basename } = await import("node:path");
       process.stdout.write(JSON.stringify({ content, format, filename: basename(filePath) }));
     } else {
       process.stdout.write(JSON.stringify({ content: "No metrics data available for export.", format, filename: "export.md" }));
     }
     ```
   - The function should accept a `format` parameter: `async function collectExportData(format: "markdown" | "json" = "markdown"): Promise<ExportResult>`

5. **Create the 4 API route files** matching the forensics route pattern exactly:
   - `web/app/api/history/route.ts` — GET, calls `collectHistoryData()`, returns `Response.json(payload)`
   - `web/app/api/inspect/route.ts` — GET, calls `collectInspectData()`
   - `web/app/api/hooks/route.ts` — GET, calls `collectHooksData()`
   - `web/app/api/export-data/route.ts` — GET, reads `format` from `searchParams`, calls `collectExportData(format)`. Uses `export-data` path (not `export`) to avoid collision with Next.js reserved paths.
   - All routes: `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`, try/catch with 500 error response.

6. **Verify:** Run `npm run build` — must succeed.

## Must-Haves

- [ ] `src/web/history-service.ts` exists, exports `collectHistoryData()`, uses child-process pattern with metrics.ts
- [ ] `src/web/inspect-service.ts` exists, exports `collectInspectData()`, reads gsd-db.json
- [ ] `src/web/hooks-service.ts` exists, exports `collectHooksData()`, uses child-process with preferences to build hook entries
- [ ] `src/web/export-service.ts` exists, exports `collectExportData(format)`, uses child-process with export.ts
- [ ] 4 API routes exist under `web/app/api/` and export GET functions
- [ ] `npm run build` succeeds

## Verification

- `npm run build` — exit 0
- All 4 service files exist: `ls src/web/{history,inspect,hooks,export}-service.ts`
- All 4 route files exist: `ls web/app/api/{history,inspect,hooks,export-data}/route.ts`

## Inputs

- `src/web/forensics-service.ts` — **primary pattern reference** (113 lines). Read this file first — every service follows its structure: imports, module path resolution, loader path resolution, existence check, child script as template string, execFile with env vars, stdout parse
- `web/app/api/forensics/route.ts` — **primary route pattern** (26 lines). Read this too — every route follows it
- `src/web/bridge-service.ts` — provides `resolveBridgeRuntimeConfig()` which returns `{ packageRoot, projectCwd }`
- `web/lib/remaining-command-types.ts` — T01 output, provides typed return shapes for services
- Upstream modules (for understanding what functions to call in child scripts):
  - `src/resources/extensions/gsd/metrics.ts` — `loadLedgerFromDisk(base)`, `getProjectTotals(units)`, `aggregateByPhase(units)`, `aggregateBySlice(units)`, `aggregateByModel(units)`
  - `src/resources/extensions/gsd/commands.ts` — `InspectData` interface (but data comes from gsd-db.json, not function calls)
  - `src/resources/extensions/gsd/post-unit-hooks.ts` — `getHookStatus()` (runtime state), `formatHookStatus()` 
  - `src/resources/extensions/gsd/preferences.ts` — `resolvePostUnitHooks(base)`, `resolvePreDispatchHooks(base)` (for static hook config)
  - `src/resources/extensions/gsd/export.ts` — `writeExportFile(basePath, format)`

## Observability Impact

- Signals added: each service throws descriptive errors if module/file not found or child process fails (matching forensics-service.ts error pattern)
- How a future agent inspects: `curl http://localhost:3000/api/history`, `curl http://localhost:3000/api/inspect`, etc.
- Failure state exposed: API returns `{ error: "message" }` with HTTP 500

## Expected Output

- `src/web/history-service.ts` — ~120 lines, child-process service for metrics ledger + aggregations
- `src/web/inspect-service.ts` — ~60 lines, direct file read service for gsd-db.json introspection
- `src/web/hooks-service.ts` — ~100 lines, child-process service for hook config + status
- `src/web/export-service.ts` — ~100 lines, child-process service for export generation
- `web/app/api/history/route.ts` — ~26 lines, thin GET route
- `web/app/api/inspect/route.ts` — ~26 lines, thin GET route
- `web/app/api/hooks/route.ts` — ~26 lines, thin GET route
- `web/app/api/export-data/route.ts` — ~30 lines, GET route with format param
