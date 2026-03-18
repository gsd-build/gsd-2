# S01: PWA Install Prompt with Serwist

**Goal:** GSD's web host is a valid PWA with a service worker, manifest, and install prompt — users can install it as a standalone desktop app from the browser.
**Demo:** Running `gsd --web` in Chrome shows a registered service worker and valid manifest in DevTools Application tab, the browser install prompt appears, and the user can install GSD as a desktop app.

## Must-Haves

- Serwist service worker generates successfully during `npm run build:web-host` (configurator mode, not webpack wrapper)
- `sw.js` exists in `dist/web/standalone/public/` after build
- `web/public/manifest.json` with correct name, icons, display: standalone, dark theme colors
- 192×192 and 512×512 PNG icons committed to `web/public/`
- `beforeinstallprompt` hook captures the deferred prompt event
- Install prompt UI component renders when PWA criteria are met
- `npm run build:web-host` exits 0 with Serwist configured (standalone output preserved)
- `next.config.mjs` is NOT wrapped or modified by Serwist (configurator mode keeps it untouched)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (browser DevTools verification of SW + manifest + install prompt)
- Human/UAT required: yes (install prompt appearance and desktop app installation)

## Verification

- `npm run build:web-host` exits 0
- `test -f dist/web/standalone/public/sw.js && echo "sw.js exists"` → "sw.js exists"
- `test -f dist/web/standalone/public/manifest.json && echo "manifest exists"` → "manifest exists"
- `test -f web/public/icon-192x192.png && test -f web/public/icon-512x512.png && echo "icons exist"` → "icons exist"
- `node -e "const m = JSON.parse(require('fs').readFileSync('web/public/manifest.json','utf8')); console.log(m.display === 'standalone' && m.icons.length >= 2 ? 'manifest valid' : 'FAIL')"` → "manifest valid"
- Browser: DevTools → Application tab shows service worker registered at `/sw.js`
- Browser: DevTools → Application → Manifest shows valid manifest with icons
- Browser: Install prompt appears in Chrome/Edge (localhost satisfies HTTPS requirement)

## Observability / Diagnostics

- Runtime signals: Service worker registration success/failure logged to browser console via sw-register component
- Inspection surfaces: Chrome DevTools Application tab (Service Workers section, Manifest section); `dist/web/standalone/public/sw.js` existence after build
- Failure visibility: SW registration errors appear in browser console; `serwist build` step outputs errors to stderr during build
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `web/next.config.mjs` (read-only — NOT modified), `web/app/layout.tsx` (metadata + SW registrar), `scripts/stage-web-standalone.cjs` (copies public/ to standalone — no changes needed)
- New wiring introduced in this slice: `serwist.config.js` (configurator mode config), `app/sw.ts` (service worker source), `app/sw-register.tsx` (client-side registration component), `web/public/manifest.json`, `web/hooks/use-install-prompt.ts`, install prompt UI component in app shell
- What remains before the milestone is truly usable end-to-end: S02 (web.yml CI workflow + packaging verification)

## Tasks

- [x] **T01: Serwist service worker integration and build verification** `est:1h`
  - Why: Retires the primary technical risk — Serwist configurator mode building successfully on Next.js 16.1.6 with Turbopack. Proves `npm run build:web-host` still exits 0 and `sw.js` appears in standalone output.
  - Files: `web/package.json`, `web/serwist.config.js`, `web/app/sw.ts`, `web/app/sw-register.tsx`, `web/app/layout.tsx`, `web/.gitignore`
  - Do: Install `serwist` and `@serwist/next` in web/. Create `serwist.config.js` using `@serwist/next/config` (configurator mode — does NOT wrap next.config.mjs). Create `app/sw.ts` with defaultCache from `@serwist/next/worker`. Create `app/sw-register.tsx` client component for manual registration. Wire registrar into `layout.tsx`. Update web `build` script to `next build && serwist build`. Add `sw.js` to web/.gitignore. Run `npm run build:web-host` and verify exit 0 + sw.js in standalone output.
  - Verify: `npm run build:web-host` exits 0; `test -f dist/web/standalone/public/sw.js`
  - Done when: Build succeeds with Serwist configured, sw.js exists in `dist/web/standalone/public/`, and `next.config.mjs` is unchanged.

- [x] **T02: PWA manifest, icons, and layout metadata** `est:30m`
  - Why: A valid PWA requires a manifest with icons and proper metadata. Without these, Chrome won't show the install prompt regardless of the service worker.
  - Files: `web/public/manifest.json`, `web/public/icon-192x192.png`, `web/public/icon-512x512.png`, `web/app/layout.tsx`
  - Do: Generate 192×192 and 512×512 PNGs from `web/public/icon.svg` using `sips` (macOS). Create `manifest.json` with name "GSD", short_name "GSD", display "standalone", dark theme colors, icon entries. Add manifest link and PWA metadata (applicationName, appleWebApp) to layout.tsx's metadata export. Rebuild and verify manifest appears in standalone output.
  - Verify: `npm run build:web-host` exits 0; `test -f dist/web/standalone/public/manifest.json`; manifest JSON is valid with display=standalone and 2+ icons.
  - Done when: Icons committed, manifest.json in public/, metadata wired in layout.tsx, and manifest appears in standalone build output.

- [x] **T03: Install prompt hook, UI component, and browser verification** `est:1h`
  - Why: The install prompt is the user-facing demo surface for this slice — without it, users can't install GSD as a desktop app. Browser verification proves the entire PWA stack (SW + manifest + prompt) works end-to-end.
  - Files: `web/hooks/use-install-prompt.ts`, `web/components/gsd/install-prompt-banner.tsx`, `web/components/gsd/app-shell.tsx`
  - Do: Create `use-install-prompt` hook that captures `beforeinstallprompt`, exposes `canInstall` boolean and `promptInstall()` function. Create `InstallPromptBanner` component — a tasteful, dismissible banner or button that appears when `canInstall` is true. Wire into app-shell.tsx. Build production, start with `gsd --web`, verify in Chrome DevTools: service worker registered, manifest detected, install prompt appears.
  - Verify: `npm run build:web-host` exits 0. Browser verification: DevTools Application tab shows SW + manifest. Install prompt UI renders in Chrome.
  - Done when: Install prompt appears in Chrome when visiting the running web host, and clicking it triggers the browser's native install dialog.

## Files Likely Touched

- `web/package.json` — add serwist + @serwist/next dependencies, update build script
- `web/serwist.config.js` — new, configurator mode config
- `web/app/sw.ts` — new, service worker source
- `web/app/sw-register.tsx` — new, client-side SW registration component
- `web/app/layout.tsx` — wire SW registrar, add PWA metadata, manifest link
- `web/.gitignore` — add sw.js (generated build artifact)
- `web/public/manifest.json` — new, PWA manifest
- `web/public/icon-192x192.png` — new, generated from icon.svg
- `web/public/icon-512x512.png` — new, generated from icon.svg
- `web/hooks/use-install-prompt.ts` — new, beforeinstallprompt hook
- `web/components/gsd/install-prompt-banner.tsx` — new, install prompt UI
- `web/components/gsd/app-shell.tsx` — wire install prompt banner
