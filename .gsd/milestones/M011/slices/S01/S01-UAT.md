# S01: PWA Install Prompt with Serwist — UAT

**Milestone:** M011
**Written:** 2026-03-18

## UAT Type

- UAT mode: mixed (artifact-driven CLI checks + live-runtime browser verification)
- Why this mode is sufficient: PWA installability requires a real browser (service worker registration, manifest detection, beforeinstallprompt). Build artifacts verify the pipeline; browser verification proves the user-facing experience.

## Preconditions

- `npm run build:web-host` has been run and exited 0
- `gsd --web` (or `npm run gsd:web`) is running and accessible at `http://localhost:3000`
- Using Chrome or Edge (Firefox/Safari don't support beforeinstallprompt)
- The site is NOT already installed as a PWA (uninstall first if it is)

## Smoke Test

Open `http://localhost:3000` in Chrome → wait 2-3 seconds for engagement requirement → a floating install banner should appear at the bottom center of the page with "Install GSD as a desktop app" text and an Install button.

## Test Cases

### 1. Build pipeline produces service worker

1. Run `npm run build:web-host`
2. Check `dist/web/standalone/public/sw.js` exists
3. Check file is non-empty (>1KB)
4. **Expected:** Build exits 0, sw.js is present and substantial (should be ~60KB+ with precache manifest)

### 2. Build pipeline produces manifest and icons

1. Run `npm run build:web-host`
2. Check `dist/web/standalone/public/manifest.json` exists
3. Check `dist/web/standalone/public/icon-192x192.png` exists
4. Check `dist/web/standalone/public/icon-512x512.png` exists
5. **Expected:** All three static assets present in standalone output

### 3. Manifest content is valid

1. Read `web/public/manifest.json`
2. Verify `display` is `"standalone"`
3. Verify `icons` array has at least 2 entries (192×192 and 512×512)
4. Verify `name` is `"GSD"`
5. Verify `theme_color` is `"#1a1a1a"`
6. **Expected:** All fields match PWA installability requirements

### 4. Service worker registers in browser

1. Open `http://localhost:3000` in Chrome
2. Open DevTools → Application → Service Workers
3. **Expected:** A service worker registered at scope `/` with source `/sw.js` is listed and active

### 5. Manifest detected in browser

1. Open `http://localhost:3000` in Chrome
2. Open DevTools → Application → Manifest
3. **Expected:** Manifest panel shows name "GSD", display "standalone", theme color "#1a1a1a", and both icon entries with correct dimensions

### 6. Install prompt banner appears

1. Open `http://localhost:3000` in Chrome (not already installed)
2. Scroll or click anywhere on the page (user engagement requirement)
3. Wait 2-3 seconds
4. **Expected:** A floating banner appears at the bottom center with a Download icon, "Install GSD as a desktop app" text, an "Install" button, and an X dismiss button

### 7. Install prompt triggers native dialog

1. With the install banner visible, click the "Install" button
2. **Expected:** Chrome's native "Install app?" dialog appears with the GSD icon and name

### 8. Banner dismisses correctly

1. With the install banner visible, click the X (dismiss) button
2. **Expected:** Banner animates out and disappears
3. Refresh the page
4. **Expected:** Banner reappears (dismiss is session-scoped, not persistent)

### 9. Banner hidden when already installed

1. Install GSD as a PWA via the install prompt
2. Open `http://localhost:3000` in Chrome (in a regular browser tab, not the installed PWA)
3. **Expected:** Install banner does NOT appear (the hook detects `display-mode: standalone` match)

### 10. next.config.mjs unchanged

1. Run `git diff web/next.config.mjs`
2. **Expected:** No changes — Serwist configurator mode does not modify the Next.js config

## Edge Cases

### Playwright/headless Chromium

1. Attempt to open the site in Playwright's embedded Chromium
2. **Expected:** Service worker evaluation may fail with "ServiceWorker script evaluation failed" — this is a known Playwright limitation, not a code bug. The install banner will NOT appear. This does not indicate a problem.

### No user engagement

1. Open `http://localhost:3000` in a fresh Chrome tab
2. Do NOT interact with the page at all (no clicks, no scrolls)
3. **Expected:** `beforeinstallprompt` may not fire until the browser's engagement threshold is met. The banner appears only after sufficient engagement. This is browser-controlled, not a bug.

### HTTP (non-localhost)

1. If serving on a non-localhost HTTP address (e.g., http://192.168.x.x:3000)
2. **Expected:** PWA installability fails — Chrome requires HTTPS for non-localhost origins. Service worker will not register. This is a browser security requirement, not a code bug.

## Failure Signals

- `npm run build:web-host` exits non-zero → Serwist build step failed (check stderr for serwist config errors)
- `sw.js` missing from `dist/web/standalone/public/` → stage script didn't copy from web/public/ or serwist build didn't generate it
- DevTools shows no service worker → sw-register.tsx may not be rendering (check it's imported in layout.tsx and NODE_ENV is "production")
- DevTools Manifest panel shows warnings → manifest.json has missing required fields or icon references are broken
- Install banner never appears → Check DevTools Application tab for installability errors; check console for "[GSD] Service worker registration failed:"
- `serwist build` reports "0 URLs to precache" → serwist.config.js is misconfigured or .next/ output is missing

## Not Proven By This UAT

- Offline functionality — intentionally excluded per D093 (GSD is localhost-only)
- CI/CD pipeline — S02 scope
- npm packaging includes sw.js — S02 scope (validate-pack)
- iOS/Safari PWA install — Safari uses a different install mechanism (Add to Home Screen), not tested
- Service worker update lifecycle — cache invalidation, skipWaiting behavior on new deployments

## Notes for Tester

- The install prompt has a browser-controlled engagement threshold — you may need to interact with the page (click, scroll) before it appears. Give it a few seconds.
- If you've previously installed GSD as a PWA, uninstall it first (right-click the app icon → Uninstall) to see the install prompt again.
- `serwist build` output during `npm run build:web-host` shows precache stats — "343 URLs, 15.3 MB" is the expected baseline. If these numbers change dramatically, something in the build changed.
- The install banner uses `motion/react` for animation — if animations look janky, it's likely a Reduced Motion OS preference issue, not a code bug.
