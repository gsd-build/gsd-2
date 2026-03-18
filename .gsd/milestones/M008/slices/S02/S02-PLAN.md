# S02: Browser Update UI

**Goal:** When a new GSD version is available on npm, a banner appears in the browser workspace; clicking "Update" triggers async npm install and shows progress.
**Demo:** Open web mode → if a newer version exists on npm, a banner appears below the header with the available version → click "Update" → banner shows progress/status → on success, banner shows "restart required" message.

## Must-Haves

- GET `/api/update` returns `{ currentVersion, latestVersion, updateAvailable, updateStatus, error? }`
- POST `/api/update` spawns `npm install -g gsd-pi@latest` asynchronously (returns 202), rejects concurrent updates (409)
- Module-level singleton tracks update status across requests (`idle | running | success | error`)
- `UpdateBanner` component renders conditionally when `updateAvailable=true`
- Banner polls GET while update is `running`, shows success/error feedback inline
- After successful update, banner shows "restart GSD to use vX.Y.Z" (process.env.GSD_VERSION is stale until restart)
- Wired into `app-shell.tsx` between header and error banner

## Proof Level

- This slice proves: integration
- Real runtime required: yes — version check hits npm registry, update spawns real child process
- Human/UAT required: yes — visual banner appearance and update flow

## Verification

- `npm run build:web-host` exits 0
- Browser verification: start web mode, confirm banner appears when a newer version exists (or is absent when on latest)
- Browser verification: click Update, confirm status transitions through running → success/error
- `curl http://localhost:PORT/api/update` returns valid JSON with expected shape

## Observability / Diagnostics

- Runtime signals: update status transitions (`idle → running → success | error`), stderr capture from child process
- Inspection surfaces: `GET /api/update` returns full state including `updateStatus`, `error`, and version info
- Failure visibility: `error` field in GET response contains stderr from failed `npm install`; `updateStatus: 'error'` persists until next update attempt
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `src/update-check.ts` (`compareSemver` only — pure function, no transitive deps), `process.env.GSD_VERSION` (set by `src/loader.ts`, inherited by web server)
- New wiring introduced: `UpdateBanner` in `app-shell.tsx`, `/api/update` route
- What remains before the milestone is truly usable end-to-end: S03 (theme defaults), S04 (remote questions), S05 (progress bar + terminal text size)

## Tasks

- [ ] **T01: Build update service and API route** `est:45m`
  - Why: Creates the server-side infrastructure — version check against npm registry, async update trigger via child process, and the GET/POST API endpoints. This is the foundation that the UI component will consume.
  - Files: `src/web/update-service.ts`, `web/app/api/update/route.ts`
  - Do: Create `update-service.ts` with `checkForUpdate()` (fetch npm registry, compare with `compareSemver`), `triggerUpdate()` (spawn child process, track in module-level singleton), `getUpdateStatus()`. Create route with GET (version check + status) and POST (trigger update, 202/409). Import `compareSemver` from `../update-check.ts` (safe — pure function). Use `process.env.GSD_VERSION` for current version. Follow `web/app/api/doctor/route.ts` pattern.
  - Verify: `npm run build:web-host` exits 0
  - Done when: GET `/api/update` returns valid JSON with `currentVersion`, `latestVersion`, `updateAvailable`, `updateStatus`; POST returns 202 and spawns child process; concurrent POST returns 409

- [ ] **T02: Build UpdateBanner component and wire into app-shell** `est:30m`
  - Why: Creates the user-facing update notification and action UI. Without this, the API exists but users have no way to see or trigger updates from the browser.
  - Files: `web/components/gsd/update-banner.tsx`, `web/components/gsd/app-shell.tsx`
  - Do: Create client component that fetches `GET /api/update` on mount. Conditionally render banner when `updateAvailable=true` showing current and latest version. "Update" button fires `POST /api/update`, then polls GET every 3s while status is `running`. Show success ("restart GSD to use vX.Y.Z") or error feedback inline. Wire into `app-shell.tsx` WorkspaceChrome — render between the header and the workspace-error-banner div.
  - Verify: `npm run build:web-host` exits 0; browser verification of banner rendering and update flow
  - Done when: Banner appears in browser when update is available; clicking Update triggers the flow with visible progress; banner shows restart message on success

## Files Likely Touched

- `src/web/update-service.ts` (new)
- `web/app/api/update/route.ts` (new)
- `web/components/gsd/update-banner.tsx` (new)
- `web/components/gsd/app-shell.tsx` (modified — add UpdateBanner import and render)
