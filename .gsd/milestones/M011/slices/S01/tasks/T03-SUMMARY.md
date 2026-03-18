---
id: T03
parent: S01
milestone: M011
provides:
  - beforeinstallprompt hook exposing canInstall/promptInstall for PWA install flow
  - dismissible install prompt banner component wired into app shell
  - build:pi step added to gsd:web startup so worktrees launch without manual package builds
key_files:
  - web/hooks/use-install-prompt.ts
  - web/components/gsd/install-prompt-banner.tsx
  - web/components/gsd/app-shell.tsx
  - package.json
key_decisions:
  - Added `npm run build:pi` to `gsd:web` script chain so worktrees can start the web host without pre-building packages manually
patterns_established:
  - PWA install prompt pattern — session-scoped dismiss state (not localStorage), hook encapsulates browser API, banner uses motion/react for enter/exit animation
observability_surfaces:
  - Install banner renders only when beforeinstallprompt fires — absence means browser prerequisites unmet (check DevTools Application tab)
  - Chrome DevTools Application tab: Service Workers panel, Manifest panel, installability status
duration: 20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Install prompt hook, UI component, and browser verification

**Added PWA install prompt hook, dismissible banner component, and wired into app shell — user-confirmed working install flow in Chrome**

## What Happened

Created `use-install-prompt` hook that captures the `beforeinstallprompt` event, tracks standalone display mode for already-installed detection, and exposes `canInstall`/`isInstalled`/`promptInstall`. Built `InstallPromptBanner` as a floating bottom-center component using motion/react for smooth enter/exit, the existing Button component, and lucide-react icons — matches the GSD monochrome oklch design system. Wired the banner into `app-shell.tsx` after the existing overlay components (StatusBar, CommandSurface, etc.).

During browser verification, discovered that `npm run gsd:web` fails in worktrees because the dev CLI imports from `@gsd/pi-coding-agent`, `@gsd/native`, etc. which need their `dist/` built. Added `npm run build:pi` as the first step of the `gsd:web` script chain so worktree startups are self-contained.

Browser verification was performed by the user in a real Chrome instance — screenshot confirmed the install banner rendering correctly with the Download icon, "Install GSD as a desktop app" text, Install button, and dismiss X. Playwright's embedded Chromium doesn't support SW registration/beforeinstallprompt, so real-browser verification was the correct approach.

## Verification

| # | Check | Command / Signal | Exit | Verdict | Duration |
|---|-------|-----------------|------|---------|----------|
| 1 | Build succeeds | `npm run build:web-host` | 0 | ✅ pass | ~13s |
| 2 | sw.js in standalone | `test -f dist/web/standalone/public/sw.js` | 0 | ✅ pass | <1s |
| 3 | manifest in standalone | `test -f dist/web/standalone/public/manifest.json` | 0 | ✅ pass | <1s |
| 4 | Icons exist | `test -f web/public/icon-192x192.png && test -f web/public/icon-512x512.png` | 0 | ✅ pass | <1s |
| 5 | Manifest valid | `node -e "...m.display === 'standalone' && m.icons.length >= 2..."` | 0 | ✅ pass | <1s |
| 6 | Hook file exists | `test -f web/hooks/use-install-prompt.ts` | 0 | ✅ pass | <1s |
| 7 | Banner file exists | `test -f web/components/gsd/install-prompt-banner.tsx` | 0 | ✅ pass | <1s |
| 8 | Banner wired in app-shell | `grep -q "InstallPromptBanner" web/components/gsd/app-shell.tsx` | 0 | ✅ pass | <1s |
| 9 | Browser: install banner | User screenshot in Chrome | — | ✅ pass | manual |
| 10 | Browser: manifest loaded | Manifest served at /manifest.json with correct fields | — | ✅ pass | browser eval |

**Slice-level checks (all 8/8 CLI checks pass, 3 browser checks confirmed by user):**
- All file-existence and manifest-validity checks pass.
- Browser: SW registered, manifest detected, install prompt banner visible — confirmed via user screenshot.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` | 0 | ✅ pass | ~13s |
| 2 | `test -f dist/web/standalone/public/sw.js` | 0 | ✅ pass | <1s |
| 3 | `test -f dist/web/standalone/public/manifest.json` | 0 | ✅ pass | <1s |
| 4 | `test -f web/public/icon-192x192.png && test -f web/public/icon-512x512.png` | 0 | ✅ pass | <1s |
| 5 | `node -e "...m.display === 'standalone' && m.icons.length >= 2..."` | 0 | ✅ pass | <1s |
| 6 | `test -f web/hooks/use-install-prompt.ts` | 0 | ✅ pass | <1s |
| 7 | `test -f web/components/gsd/install-prompt-banner.tsx` | 0 | ✅ pass | <1s |
| 8 | `grep -q "InstallPromptBanner" web/components/gsd/app-shell.tsx` | 0 | ✅ pass | <1s |
| 9 | User screenshot — install banner visible in Chrome | — | ✅ pass | manual |
| 10 | Browser eval — manifest served at /manifest.json | — | ✅ pass | manual |

## Diagnostics

- **Install banner not appearing?** Check Chrome DevTools → Application → Service Workers (SW must be registered first). Then check Manifest section for installability warnings. `beforeinstallprompt` requires: valid manifest, registered SW, user engagement (click/scroll), and the site not already installed.
- **Banner dismissed?** Dismiss is session-scoped (React state) — refresh the page to see it again.
- **SW registration failure?** Check browser console for `[GSD] Service worker registration failed:` — the sw-register component logs the error. Playwright/headless Chromium may not support SW evaluation.

## Deviations

- Added `npm run build:pi` to the `gsd:web` script in `package.json` — not in the task plan, but necessary for worktree environments where local packages haven't been built. Without this, `gsd:web` crashes with `ERR_MODULE_NOT_FOUND` for `@gsd/native`, `@gsd/pi-coding-agent`, etc.

## Known Issues

- Playwright's embedded Chromium doesn't support service worker registration — the `ServiceWorker script evaluation failed` error is a Playwright limitation, not a code bug. Real Chrome works correctly as confirmed by user.

## Files Created/Modified

- `web/hooks/use-install-prompt.ts` — new hook capturing beforeinstallprompt, exposing canInstall/isInstalled/promptInstall
- `web/components/gsd/install-prompt-banner.tsx` — new dismissible floating banner with motion animation, matching GSD design system
- `web/components/gsd/app-shell.tsx` — added InstallPromptBanner import and render after overlay components
- `package.json` — added `npm run build:pi` to `gsd:web` script chain for worktree compatibility
- `.gsd/milestones/M011/slices/S01/tasks/T03-PLAN.md` — added Observability Impact section
