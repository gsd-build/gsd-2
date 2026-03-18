---
id: S02
parent: M008
milestone: M008
provides:
  - GET /api/update route returning version check + update state
  - POST /api/update route spawning async npm install -g with 202/409 semantics
  - Module-level singleton tracking update lifecycle (idle → running → success | error)
  - UpdateBanner client component with conditional rendering, trigger, polling, and status feedback
  - Wired into app-shell.tsx WorkspaceChrome between header and error banner
requires: []
affects:
  - S03
  - S04
  - S05
key_files:
  - src/web/update-service.ts
  - web/app/api/update/route.ts
  - web/components/gsd/update-banner.tsx
  - web/components/gsd/app-shell.tsx
key_decisions:
  - Inline npm registry fetch instead of importing checkForUpdates() — avoids Turbopack .js→.ts extension resolution failures
  - Module-level singleton for cross-request state tracking in Next.js API routes — simplest approach for single-process deployment model
  - POST fetches latest version before triggering so targetVersion is captured in state
  - Orange for available/running, emerald for success, destructive/red for error — matches workspace chrome tone system
patterns_established:
  - Module-level singleton for async child process state tracking across HTTP request boundaries
  - Client component fetch+poll pattern with interval cleanup on status change and unmount
  - data-testid convention for banner elements (update-banner, update-banner-message, update-banner-action, update-banner-retry)
observability_surfaces:
  - GET /api/update returns { currentVersion, latestVersion, updateAvailable, updateStatus, error?, targetVersion? }
  - updateStatus transitions: idle → running → success | error
  - error field contains stderr from failed npm install
  - data-testid selectors on all banner elements for automated inspection
drill_down_paths:
  - .gsd/milestones/M008/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S02/tasks/T02-SUMMARY.md
duration: 13m
verification_result: passed
completed_at: 2026-03-18
---

# S02: Browser Update UI

**GET/POST `/api/update` route with async npm install and an UpdateBanner component that shows version availability, triggers updates, polls progress, and displays success/error feedback inline.**

## What Happened

T01 built the server-side infrastructure: `update-service.ts` with three exports — `checkForUpdate()` fetches the npm registry directly (inline, ~20 lines) and compares via `compareSemver` (safe pure-function import from `update-check.ts`), `triggerUpdate()` spawns `npm install -g gsd-pi@latest` as a detached child process and tracks state in a module-level singleton, and `getUpdateStatus()` returns the current state. The API route (`web/app/api/update/route.ts`) follows the doctor route pattern: GET returns combined version info + update state JSON, POST triggers the update (202 if started, 409 if already running), both with `Cache-Control: no-store`.

T02 built the client component: `UpdateBanner` fetches GET on mount, conditionally renders when an update is available or an update is in progress/completed. Three visual states — orange banner with Update button when a new version is available, orange with spinner during update, emerald on success ("restart GSD to use vX.Y.Z"), red on error with Retry button. Polling (3s interval) starts on POST success and cleans up when status leaves `running` or on unmount. Wired into `app-shell.tsx` WorkspaceChrome with a 2-line change between the header and error banner div.

## Verification

- `npm run build:web-host` exits 0 — route manifest includes `/api/update`
- All three deliverable files exist with correct content
- `UpdateBanner` imported and rendered in `app-shell.tsx`
- Browser verification: banner renders with orange styling showing version diff
- Browser assertions (5/5): `[data-testid='update-banner']` visible, "Update available" text present, version strings present, Update button accessible
- `curl /api/update` returns valid JSON with expected shape
- POST returns 202 with `{ triggered: true }`, concurrent POST returns 409
- `compareSemver` imported from safe pure-function path (not full `checkForUpdates`)
- `spawn()` used (not `execSync`) for async child process

## Requirements Advanced

- R117 — Fully delivered: banner appears when update available, async trigger via POST, polling progress, success/error feedback.

## Requirements Validated

- R117 — Build passes, API returns correct shape, browser banner renders with version info and action controls. Status transitions implemented end-to-end.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- Used orange instead of sky-blue for available/running banner state per user preference during execution.
- POST handler fetches latest version before triggering to capture targetVersion in state — minor enhancement over plan.

## Known Limitations

- End-to-end update flow (running → success/error) only exercisable in production installs since triggering a real `npm install -g gsd-pi@latest` in dev would modify the global installation.
- Update state singleton resets on server restart (by design — no persistence needed).
- No automatic page reload after update success — user must manually restart GSD process.

## Follow-ups

- None

## Files Created/Modified

- `src/web/update-service.ts` — new: update service with `checkForUpdate()`, `triggerUpdate()`, `getUpdateStatus()`, module-level singleton
- `web/app/api/update/route.ts` — new: GET/POST API route, 202/409/500 semantics, no-store caching
- `web/components/gsd/update-banner.tsx` — new: client component with fetch, conditional render, trigger, 3s polling, spinner, status feedback
- `web/components/gsd/app-shell.tsx` — modified: added UpdateBanner import and render between header and error banner (2 lines)

## Forward Intelligence

### What the next slice should know
- The update banner is positioned between `</header>` and the error banner div in `app-shell.tsx` WorkspaceChrome. Any new banners should coordinate positioning relative to these two.
- The `/api/update` route uses `force-dynamic` and `runtime = "nodejs"` — same pattern as doctor/forensics routes.

### What's fragile
- Module-level singleton state in `update-service.ts` — if Next.js hot-reloads the module during dev, state resets. This is fine for production (single load) but can confuse during development.
- The inline npm registry fetch has a 5s timeout (`AbortController`) — if the registry is slow, the banner may not appear on the first check.

### Authoritative diagnostics
- `GET /api/update` — single endpoint returns all version info plus update lifecycle state; this is the ground truth for banner behavior.
- `data-testid="update-banner"` — presence/absence in DOM definitively answers whether the banner is showing.

### What assumptions changed
- Original plan assumed importing `checkForUpdates()` from `update-check.ts` — actual implementation used inline fetch because `checkForUpdates` has transitive deps that break Turbopack (documented in KNOWLEDGE.md as the .js→.ts extension issue).
