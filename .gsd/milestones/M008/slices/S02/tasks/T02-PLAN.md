---
estimated_steps: 5
estimated_files: 3
---

# T02: Build UpdateBanner component and wire into app-shell

**Slice:** S02 — Browser Update UI
**Milestone:** M008

## Description

Create the `UpdateBanner` client component that fetches version info from `GET /api/update`, conditionally renders when an update is available, handles the update trigger flow with polling, and shows success/error feedback. Then wire it into `app-shell.tsx` as a one-line addition between the header and the error banner.

The component is a standard React client component using `useState`/`useEffect` for data fetching. It polls during active updates (every 3s) and stops when status leaves `running`. After a successful update, it shows a "restart required" message since `process.env.GSD_VERSION` is stale until process restart.

**Relevant skill:** `frontend-design` — load for styling guidance if needed. The banner should match the existing workspace UI style (similar to the error banner pattern in app-shell.tsx).

## Steps

1. Create `web/components/gsd/update-banner.tsx`:
   - `'use client'` directive at top
   - Define response type: `{ currentVersion: string, latestVersion: string, updateAvailable: boolean, updateStatus: string, error?: string }`
   - On mount (`useEffect`), fetch `GET /api/update` — set version info state
   - Render nothing if `updateAvailable === false` or data not loaded
   - Render banner with: current version, available version, "Update" button
   - "Update" button onClick: `POST /api/update`, then start polling interval (`setInterval` every 3s on `GET /api/update`) — update state from response
   - While `updateStatus === 'running'`: show spinner/loading indicator, disable button
   - When `updateStatus === 'success'`: show "Update complete — restart GSD to use vX.Y.Z", hide update button
   - When `updateStatus === 'error'`: show error message from `error` field, re-enable button for retry
   - Clean up polling interval on unmount and when status leaves `running`

2. Style the banner:
   - Use a subtle info-style banner bar (blue/accent tones for available, green for success, red for error)
   - Match the existing workspace chrome styling — reference the error banner div in app-shell.tsx for spacing and layout patterns
   - Use Tailwind classes consistent with the existing UI (dark mode aware)

3. Wire into `app-shell.tsx`:
   - Import `UpdateBanner` from `@/components/gsd/update-banner`
   - Render `<UpdateBanner />` inside `WorkspaceChrome`, between the `<header>` closing tag and the workspace-error-banner div (around line ~210)
   - This is a one-line addition — the component handles its own conditional rendering

4. Verify: run `npm run build:web-host` to confirm no type errors
5. Verify: start web mode, check banner appears/doesn't appear based on version comparison

## Must-Haves

- [ ] Client component (`'use client'`) — does NOT import any Node.js modules
- [ ] Fetches via `fetch('/api/update')` — no direct service imports
- [ ] Conditionally renders only when `updateAvailable === true`
- [ ] Polls every 3s during active update (status `running`), stops when status changes
- [ ] Shows "restart GSD to use vX.Y.Z" on success (not "update complete" with no action)
- [ ] Shows error message on failure with retry capability
- [ ] Properly cleans up polling interval on unmount
- [ ] Wired into app-shell.tsx WorkspaceChrome layout

## Verification

- `npm run build:web-host` exits 0
- Visual browser check: banner renders between header and error banner area
- Visual browser check: banner absent when on latest version
- Visual browser check: update flow shows loading → success/error states

## Inputs

- `web/app/api/update/route.ts` — T01 output; provides GET/POST `/api/update` endpoints
- `web/components/gsd/app-shell.tsx` — `WorkspaceChrome` component, insertion point around line ~210 between header and error banner div
- T01's API contract: GET returns `{ currentVersion, latestVersion, updateAvailable, updateStatus, error? }`, POST returns 202/409

## Expected Output

- `web/components/gsd/update-banner.tsx` — new client component with conditional banner, update trigger, polling, and status feedback
- `web/components/gsd/app-shell.tsx` — modified with `UpdateBanner` import and render (1-2 lines changed)
