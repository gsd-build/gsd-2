---
estimated_steps: 7
estimated_files: 3
---

# T01: Build update service and API route

**Slice:** S02 — Browser Update UI
**Milestone:** M008

## Description

Create the server-side update infrastructure: a service module that checks npm for newer versions and manages an async update process, plus a GET/POST API route that exposes this to the browser. The service uses a module-level singleton to track update status across requests, enabling the client to poll during an active update.

Key design decisions (from D082): use `spawn()` not `execSync`, return 202 immediately from POST, track status in-memory. The `compareSemver` function from `src/update-check.ts` is safe to import directly (pure function, zero transitive deps). The npm registry check is reimplemented inline (~20 lines) to avoid importing `checkForUpdates()` which has `.js` extension imports that break Turbopack (see KNOWLEDGE.md).

## Steps

1. Create `src/web/update-service.ts`:
   - Import `compareSemver` from `../update-check.ts` (pure function, no deps)
   - Read current version from `process.env.GSD_VERSION` (set by `src/loader.ts`, inherited by web server)
   - Implement `checkForUpdate()`: fetch `https://registry.npmjs.org/gsd-pi/latest`, extract `version` field, compare with `compareSemver`, return `{ currentVersion, latestVersion, updateAvailable }`
   - Define module-level state type: `{ status: 'idle' | 'running' | 'success' | 'error', error?: string, targetVersion?: string }`
   - Initialize module-level singleton: `let updateState = { status: 'idle' }`
   - Implement `triggerUpdate()`: reject if status is `running` (return false), set status to `running`, `spawn('npm', ['install', '-g', 'gsd-pi@latest'])`, collect stderr, on `close` set status to `success` (code 0) or `error` (with stderr), return true
   - Implement `getUpdateStatus()`: return current `updateState`

2. Create `web/app/api/update/route.ts`:
   - Set `runtime = "nodejs"`, `dynamic = "force-dynamic"` (follow doctor route pattern)
   - Import from `../../../../src/web/update-service.ts`
   - GET handler: call `checkForUpdate()` and `getUpdateStatus()`, return combined JSON `{ currentVersion, latestVersion, updateAvailable, updateStatus, error? }`
   - POST handler: call `triggerUpdate()`. If it returns false (already running), return 409. Otherwise return 202 with `{ triggered: true }`
   - Wrap both in try/catch with 500 error responses

3. Verify: run `npm run build:web-host` to confirm no type errors or import resolution issues

## Must-Haves

- [ ] `compareSemver` imported from `../update-check.ts` — NOT the full `checkForUpdates()` function (Turbopack `.js` extension issue)
- [ ] Module-level singleton state (not per-request) so status persists across GET polls during active update
- [ ] `spawn()` from `child_process` — NOT `execSync` (D082)
- [ ] POST returns 202 immediately; child process runs in background
- [ ] Concurrent POST while update is `running` returns 409
- [ ] GET returns `{ currentVersion, latestVersion, updateAvailable, updateStatus, error? }`
- [ ] stderr from failed `npm install` captured and surfaced in `error` field

## Verification

- `npm run build:web-host` exits 0 — no type errors, no import resolution failures
- Inspect the compiled route exists in `.next/` output
- JSON shape validation: GET response includes all required fields with correct types

## Observability Impact

- Signals added: `updateStatus` field transitions (`idle → running → success | error`), `error` field captures stderr from child process
- How a future agent inspects this: `curl http://localhost:PORT/api/update` returns full state JSON
- Failure state exposed: `updateStatus: 'error'` with `error` containing stderr text from `npm install` failure

## Inputs

- `src/update-check.ts` — `compareSemver(a: string, b: string): number` pure function (line reference from research)
- `web/app/api/doctor/route.ts` — reference pattern for API route structure (runtime, dynamic, try/catch)
- `src/web/bridge-service.ts` — reference for import path pattern (`../../../../src/web/`)
- `process.env.GSD_VERSION` — set by `src/loader.ts:90-94`, inherited by web server via `src/web-mode.ts:576-590`

## Expected Output

- `src/web/update-service.ts` — new file with `checkForUpdate()`, `triggerUpdate()`, `getUpdateStatus()`, module-level singleton state
- `web/app/api/update/route.ts` — new file with GET and POST handlers following existing API route conventions
