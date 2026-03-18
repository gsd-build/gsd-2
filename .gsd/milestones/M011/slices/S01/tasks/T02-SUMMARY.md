---
id: T02
parent: S01
milestone: M011
provides:
  - PWA manifest with display:standalone, dark theme colors, and two icon sizes
  - 192×192 and 512×512 PNG icons generated from SVG source via qlmanage
  - Layout metadata with manifest link, applicationName, appleWebApp, and viewport themeColor
key_files:
  - web/public/manifest.json
  - web/public/icon-192x192.png
  - web/public/icon-512x512.png
  - web/app/layout.tsx
key_decisions:
  - Used qlmanage (macOS Quick Look) to render SVG at target sizes — produces crisp icons without upscale artifacts from raster source
patterns_established:
  - PWA icons pre-generated and committed per D094/D097 — no build-time generation dependency
observability_surfaces:
  - Chrome DevTools → Application → Manifest shows parsed manifest with name, icons, display mode, theme color
  - Missing/malformed manifest surfaces as 404 in Network tab and console warning
  - apple-mobile-web-app-capable and status-bar-style meta tags visible in page source <head>
duration: ~3 min
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: PWA manifest, icons, and layout metadata

**Added PWA manifest with standalone display mode, generated 192×192 and 512×512 icons from SVG, and wired manifest/appleWebApp/viewport metadata into layout.tsx**

## What Happened

Generated PWA icons at 192×192 and 512×512 using `qlmanage -t -s <size>` against the existing `icon.svg` — this renders the SVG at native resolution at each target size, avoiding upscale artifacts from the 180×180 raster `apple-icon.png`. Created `manifest.json` with `display: standalone`, dark theme colors (`#1a1a1a` matching the oklch background), GSD branding, and both icon entries. Updated `layout.tsx` to export `manifest`, `applicationName`, and `appleWebApp` in the Metadata object, added a `Viewport` export with `themeColor`, and imported the `Viewport` type from `next`. Build exits 0 with all three new static assets appearing in `dist/web/standalone/public/`.

## Verification

- Icon dimensions verified via `sips -g pixelHeight -g pixelWidth` — both correct (192×192, 512×512)
- Manifest JSON validated: `display === 'standalone'` and `icons.length >= 2` → PASS
- Build exits 0 with 346 precached URLs (15.3 MB)
- All three new files present in standalone output: `manifest.json`, `icon-192x192.png`, `icon-512x512.png`
- Layout source confirmed: `manifest`, `applicationName`, `appleWebApp`, `themeColor` all present
- Slice-level checks: sw.js exists, manifest exists, icons exist, manifest valid — all pass

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `sips -g pixelHeight -g pixelWidth web/public/icon-192x192.png` | 0 | ✅ pass | <1s |
| 2 | `sips -g pixelHeight -g pixelWidth web/public/icon-512x512.png` | 0 | ✅ pass | <1s |
| 3 | `node -e "…m.display==='standalone' && m.icons.length>=2…"` | 0 | ✅ pass | <1s |
| 4 | `npm run build:web-host` | 0 | ✅ pass | 13.2s |
| 5 | `test -f dist/web/standalone/public/manifest.json` | 0 | ✅ pass | <1s |
| 6 | `test -f dist/web/standalone/public/icon-192x192.png` | 0 | ✅ pass | <1s |
| 7 | `test -f dist/web/standalone/public/icon-512x512.png` | 0 | ✅ pass | <1s |

## Diagnostics

- **Manifest inspection:** Chrome DevTools → Application → Manifest shows all fields. Invalid entries surface as warnings in this panel.
- **PWA installability:** Same panel shows installability status — missing icons or wrong display mode reported as specific errors.
- **iOS PWA:** `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags rendered in `<head>` by Next.js from the `appleWebApp` metadata export.
- **Theme color:** `<meta name="theme-color" content="#1a1a1a">` rendered from viewport export — tints browser chrome on mobile.

## Deviations

None — plan executed as written. Used Option A (qlmanage) for icon generation as the plan preferred.

## Known Issues

None.

## Files Created/Modified

- `web/public/icon-192x192.png` — new, 192×192 PNG icon generated from SVG via qlmanage
- `web/public/icon-512x512.png` — new, 512×512 PNG icon generated from SVG via qlmanage
- `web/public/manifest.json` — new, PWA manifest with standalone display, dark theme, two icons
- `web/app/layout.tsx` — added Viewport import, applicationName, manifest link, appleWebApp config, viewport export with themeColor
- `.gsd/milestones/M011/slices/S01/tasks/T02-PLAN.md` — added Observability Impact section
