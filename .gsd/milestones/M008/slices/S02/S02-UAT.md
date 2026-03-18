# S02: Browser Update UI — UAT

**Milestone:** M008
**Written:** 2026-03-18

## UAT Type

- UAT mode: mixed (artifact-driven build verification + live-runtime browser verification)
- Why this mode is sufficient: The API route and component are both server-rendered/client-hydrated — build verification confirms compile-time correctness, and browser verification confirms runtime rendering and interaction. Full update lifecycle (running → success) requires a real npm install and is noted as not-proven.

## Preconditions

- GSD web mode is running (`npm run build:web-host && npm run gsd:web` or equivalent)
- The server is accessible at `http://localhost:<PORT>` (default 3099)
- The installed GSD version (`process.env.GSD_VERSION`) is older than the latest version on npm (for update-available tests)

## Smoke Test

Navigate to the web workspace. If GSD is behind the latest npm version, an orange banner should be visible between the header and the workspace content showing "Update available: vX.Y.Z → vA.B.C" with an "Update" button.

## Test Cases

### 1. API Version Check

1. Run `curl http://localhost:3099/api/update`
2. **Expected:** JSON response with shape `{ currentVersion: string, latestVersion: string, updateAvailable: boolean, updateStatus: "idle" }`
3. Verify `currentVersion` matches the running GSD version
4. Verify `latestVersion` is a valid semver string
5. Verify response header includes `Cache-Control: no-store`

### 2. Banner Renders When Update Available

1. Open browser to GSD web workspace
2. Look at the area between the header bar and the main workspace content
3. **Expected:** An orange-tinted banner is visible with text "Update available: v{current} → v{latest}" and an "Update" button on the right

### 3. Banner Absent When On Latest Version

1. If your installed version matches the npm latest, open browser to GSD web workspace
2. **Expected:** No update banner is visible — the workspace starts immediately below the header

### 4. Update Trigger (POST)

1. Run `curl -X POST http://localhost:3099/api/update`
2. **Expected:** HTTP 202 response with body `{ "triggered": true }`
3. Immediately run `curl http://localhost:3099/api/update`
4. **Expected:** `updateStatus` is `"running"` and `targetVersion` is populated

### 5. Concurrent Update Rejection

1. While an update is running (status = "running"), run `curl -X POST http://localhost:3099/api/update`
2. **Expected:** HTTP 409 response with body `{ "error": "Update already in progress" }`

### 6. Banner Update Button Click

1. In the browser, click the "Update" button on the orange banner
2. **Expected:** The button disappears, the banner text changes to "Updating to vX.Y.Z…" with a spinning indicator
3. The banner continues to show the running state while the update progresses

### 7. Update Success State

1. After a successful update completes (npm install exits 0), observe the banner
2. **Expected:** The banner turns emerald/green with text "Update complete — restart GSD to use vX.Y.Z"
3. No action buttons are shown — the user needs to manually restart GSD

### 8. Update Error State

1. If the npm install fails (e.g., permissions error, network failure), observe the banner
2. **Expected:** The banner turns red with text "Update failed: {error message}" and a "Retry" button
3. Clicking "Retry" should attempt the update again

### 9. Banner data-testid Selectors

1. Open browser DevTools, inspect the banner element
2. **Expected:** The following data-testid attributes are present:
   - `update-banner` on the outer container
   - `update-banner-message` on the status text
   - `update-banner-action` on the Update button (when visible)
   - `update-banner-retry` on the Retry button (when in error state)

## Edge Cases

### Network Failure During Version Check

1. Start GSD web mode with no internet connectivity
2. Navigate to the workspace
3. **Expected:** No banner appears (version check fails gracefully, reports no update available)

### API Error Handling

1. Simulate an internal error (e.g., temporarily rename `update-service.ts`)
2. Run `curl http://localhost:3099/api/update`
3. **Expected:** HTTP 500 with `{ "error": "..." }` — not a crash or unhandled exception

### Rapid Update Button Clicks

1. Click the "Update" button multiple times quickly
2. **Expected:** Only one update process starts; subsequent clicks are handled by the `triggering` state guard and the 409 response from the API

## Failure Signals

- Update banner does not appear despite being on an older version → check `GET /api/update` response manually, verify `GSD_VERSION` env var is set
- Banner appears but shows wrong version → check `process.env.GSD_VERSION` and npm registry response
- Clicking Update produces no visible change → check browser network logs for POST /api/update response
- Banner stuck in "running" state indefinitely → check server logs for child process spawn errors
- Build fails → check for TypeScript errors in update-service.ts or update-banner.tsx

## Requirements Proved By This UAT

- R117 — Banner appearance when update available, async update trigger, progress polling, success/error feedback

## Not Proven By This UAT

- Actual end-to-end update lifecycle (running → success) — requires a real `npm install -g gsd-pi@latest` which modifies the global installation; test cases 7/8 describe expected behavior but can only be fully exercised in a production-like environment
- Auto-restart after update — not implemented (user must restart manually)

## Notes for Tester

- The banner only appears if the installed GSD version is behind npm latest. If you're on the latest version, test case 2/6/7/8 won't apply — verify test case 3 instead.
- Triggering the actual update (test case 6) will run `npm install -g gsd-pi@latest` — this modifies your global npm installation. Only do this if you're comfortable updating GSD.
- The "running → success" transition happens via a background child process — timing depends on npm install speed. Polling at 3s intervals means there may be a brief delay before the banner updates.
- The singleton state resets when the GSD server restarts, so after testing error states, a server restart will clear the error.
