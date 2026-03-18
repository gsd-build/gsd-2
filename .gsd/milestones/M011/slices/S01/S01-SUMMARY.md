---
id: S01
parent: M011
milestone: M011
provides:
  - Serwist service worker build chain (configurator mode, Turbopack-compatible)
  - sw.js generated and staged into dist/web/standalone/public/
  - PWA manifest with display:standalone, dark theme colors, 2 icon sizes
  - beforeinstallprompt hook and dismissible install prompt banner
  - Client-side SW registration component (production-only)
requires:
  - slice: none
    provides: first slice — no dependencies
affects:
  - S02
key_files:
  - web/serwist.config.js
  - web/app/sw.ts
  - web/app/sw-register.tsx
  - web/app/layout.tsx
  - web/public/manifest.json
  - web/public/icon-192x192.png
  - web/public/icon-512x512.png
  - web/hooks/use-install-prompt.ts
  - web/components/gsd/install-prompt-banner.tsx
  - web/components/gsd/app-shell.tsx
  - web/package.json
  - web/.gitignore
  - package.json
key_decisions:
  - D099 — Serwist configurator mode keeps next.config.mjs untouched; serwist build runs as CLI post-step
  - D100 — PWA icons pre-generated and committed, no build-time generation
  - D093 — Install prompt + app shell caching only, no offline functionality (GSD is localhost-only)
patterns_established:
  - Serwist configurator mode — serwist.config.js at web root, `next build && serwist build` in package.json, next.config.mjs untouched
  - PWA install prompt — session-scoped dismiss state (React state, not localStorage), hook encapsulates browser API, banner uses motion/react animation
  - SW registration guard — production-only via process.env.NODE_ENV check in sw-register.tsx
observability_surfaces:
  - "[GSD] Service worker registered:" browser console log on success
  - "[GSD] Service worker registration failed:" browser console error on failure
  - serwist build stdout reports precache URL count and total size during build
  - Chrome DevTools Application tab — Service Workers panel and Manifest panel
  - dist/web/standalone/public/sw.js existence confirms build chain success
  - Install banner renders only when beforeinstallprompt fires — absence means browser prerequisites unmet
drill_down_paths:
  - .gsd/milestones/M011/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M011/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M011/slices/S01/tasks/T03-SUMMARY.md
duration: ~38m
verification_result: passed
completed_at: 2026-03-18
---

# S01: PWA Install Prompt with Serwist

**GSD web host is a valid PWA — Serwist service worker builds with Turbopack, manifest and icons are wired, and the install prompt banner appears in Chrome for desktop app installation**

## What Happened

Three tasks assembled the full PWA stack:

**T01 (Serwist integration)** installed `serwist`, `@serwist/next`, `@serwist/cli`, and `esbuild`, then configured the service worker using configurator mode. This creates `serwist.config.js` at the web root pointing at `app/sw.ts` as the source and `public/sw.js` as output. The build script became `next build && serwist build` — a separate CLI step that does not wrap or modify `next.config.mjs` (critical for standalone output packaging). The service worker uses `defaultCache` from `@serwist/next/worker` with precaching, skip-waiting, clients-claim, and navigation preload. A client-side `sw-register.tsx` component registers the SW only in production mode. The full chain (`next build` → `serwist build` → `stage:web-host`) succeeds without Turbopack compatibility issues — 343 precached URLs at 15.3 MB, no `--webpack` fallback needed.

**T02 (manifest + icons)** generated 192×192 and 512×512 PNGs from the existing `icon.svg` using macOS `qlmanage` for crisp native-resolution rendering. Created `manifest.json` with `display: standalone`, dark theme colors (`#1a1a1a`), GSD branding, and both icon entries. Wired `manifest`, `applicationName`, `appleWebApp`, and `viewport` with `themeColor` into `layout.tsx`'s metadata exports.

**T03 (install prompt)** created the `use-install-prompt` hook that captures `beforeinstallprompt`, tracks standalone display mode for already-installed detection, and exposes `canInstall`/`isInstalled`/`promptInstall`. Built `InstallPromptBanner` as a floating bottom-center component using motion/react for smooth enter/exit animation, matching the GSD monochrome oklch design system. Wired into `app-shell.tsx`. Also added `npm run build:pi` to the `gsd:web` script chain so worktrees can start the web host without pre-building packages manually.

Browser verification was performed in a real Chrome instance — screenshot confirmed the install banner rendering correctly with Download icon, descriptive text, Install button, and dismiss X. Playwright's embedded Chromium doesn't support SW registration/beforeinstallprompt, so real-browser verification was the correct approach.

## Verification

All 8 CLI-verifiable slice plan checks pass:

| # | Check | Command | Verdict |
|---|-------|---------|---------|
| 1 | Build succeeds | `npm run build:web-host` exit 0 | ✅ pass |
| 2 | sw.js in standalone | `test -f dist/web/standalone/public/sw.js` | ✅ pass |
| 3 | manifest in standalone | `test -f dist/web/standalone/public/manifest.json` | ✅ pass |
| 4 | Icons exist | `test -f web/public/icon-192x192.png && test -f web/public/icon-512x512.png` | ✅ pass |
| 5 | Manifest valid | `node -e "...m.display === 'standalone' && m.icons.length >= 2..."` → "manifest valid" | ✅ pass |
| 6 | Hook file exists | `test -f web/hooks/use-install-prompt.ts` | ✅ pass |
| 7 | Banner file exists | `test -f web/components/gsd/install-prompt-banner.tsx` | ✅ pass |
| 8 | Banner wired | `grep -q "InstallPromptBanner" web/components/gsd/app-shell.tsx` | ✅ pass |

Browser verification (user-confirmed in real Chrome):

| # | Check | Verdict |
|---|-------|---------|
| 9 | Service worker registered in DevTools Application tab | ✅ pass |
| 10 | Manifest detected in DevTools Application tab | ✅ pass |
| 11 | Install prompt banner visible and functional | ✅ pass |

## New Requirements Surfaced

- none

## Deviations

- **Extra devDependencies:** Plan specified `serwist` + `@serwist/next` only, but `@serwist/cli` (for `serwist build` CLI) and `esbuild` (peer dependency of `@serwist/cli`) are also required. Without these, `serwist: command not found` on build.
- **Worktree `gsd:web` fix:** Added `npm run build:pi` to the `gsd:web` script chain in root `package.json` so worktree environments can start the web host without pre-building local packages. Not in any task plan but necessary for worktree developer experience.

## Known Limitations

- **No offline support** — per D093, GSD is a localhost tool so offline caching doesn't make sense. The SW provides precaching for fast startup and meets PWA installability requirements only.
- **Playwright cannot verify SW/install prompt** — Playwright's embedded Chromium doesn't support service worker evaluation or `beforeinstallprompt`. Browser verification requires a real Chrome instance.
- **Dismiss is session-scoped** — dismissing the install banner resets on page refresh. This is intentional to keep the prompt discoverable without being persistent-annoying.

## Follow-ups

- none — S02 picks up CI/CD and packaging verification as planned.

## Files Created/Modified

- `web/serwist.config.js` — new, configurator mode config for `serwist build` CLI
- `web/app/sw.ts` — new, service worker source with defaultCache runtime caching
- `web/app/sw-register.tsx` — new, client component for production-only SW registration
- `web/app/layout.tsx` — added SwRegister import, manifest/applicationName/appleWebApp/viewport metadata
- `web/public/manifest.json` — new, PWA manifest with standalone display, dark theme, two icons
- `web/public/icon-192x192.png` — new, 192×192 PNG icon from SVG
- `web/public/icon-512x512.png` — new, 512×512 PNG icon from SVG
- `web/hooks/use-install-prompt.ts` — new, beforeinstallprompt hook
- `web/components/gsd/install-prompt-banner.tsx` — new, dismissible floating banner with motion animation
- `web/components/gsd/app-shell.tsx` — added InstallPromptBanner import and render
- `web/package.json` — added serwist deps, updated build script to `next build && serwist build`
- `web/.gitignore` — added `public/sw.js` entry
- `package.json` — added `npm run build:pi` to `gsd:web` script chain

## Forward Intelligence

### What the next slice should know
- `npm run build:web-host` now runs `next build && serwist build && stage:web-host` — the serwist step adds ~2s to build time and outputs precache stats to stdout
- The `serwist build` step reads `web/serwist.config.js` which must be in the web/ directory (not repo root) — this is the configurator mode convention
- `sw.js` is a gitignored build artifact in `web/public/` — it's generated fresh every build and copied to standalone output by `stage-web-standalone.cjs`

### What's fragile
- `web/serwist.config.js` hardcodes the sw.ts source path and public/sw.js output path — if the app directory structure changes, the config must be updated
- The `serwist build` CLI must run after `next build` completes — the `.next/` output directory must exist for precache manifest generation

### Authoritative diagnostics
- `serwist build` stdout reports exact precache URL count and total size — if these numbers are 0, the config is broken
- Chrome DevTools → Application → Service Workers is the only reliable way to verify SW registration (Playwright cannot)
- `dist/web/standalone/public/sw.js` existence is the single file-level proof that the full build chain worked

### What assumptions changed
- Plan assumed only `serwist` + `@serwist/next` packages needed — actually `@serwist/cli` + `esbuild` are also required for configurator mode
- Turbopack compatibility with Serwist was flagged as key risk — turned out to be a non-issue, no `--webpack` fallback needed
