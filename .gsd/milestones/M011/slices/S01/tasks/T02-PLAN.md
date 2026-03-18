---
estimated_steps: 5
estimated_files: 5
---

# T02: PWA manifest, icons, and layout metadata

**Slice:** S01 — PWA Install Prompt with Serwist
**Milestone:** M011

## Description

Create the PWA manifest, generate required icon sizes, and wire PWA metadata into the Next.js layout. Chrome's PWA installability checker requires a valid `manifest.json` with at least a 192×192 icon, `display: standalone`, and proper `name`/`start_url` fields. Without these, the install prompt will never appear regardless of the service worker.

Per D094 and D097, icons are pre-generated and committed — no build-time generation dependency.

## Steps

1. Generate PWA icons from the existing SVG source (`web/public/icon.svg`):
   Use `sips` (macOS built-in) to create the required sizes. The SVG is 180×180 — we need 192×192 and 512×512.
   
   **Important:** `sips` cannot directly handle SVG files. Instead, use the existing `apple-icon.png` (180×180) as source for 192×192 (slight upscale — acceptable for an icon that's a geometric shape). For 512×512, the quality loss from upscaling a 180px raster is noticeable, so use a different approach:
   
   Option A (preferred): Use `qlmanage` which can render SVG at arbitrary sizes:
   ```bash
   cd web/public
   qlmanage -t -s 192 -o . icon.svg && mv icon.svg.png icon-192x192.png
   qlmanage -t -s 512 -o . icon.svg && mv icon.svg.png icon-512x512.png
   ```
   
   Option B (fallback): Use `sips` to resample the apple-icon.png:
   ```bash
   cd web/public
   sips -z 192 192 apple-icon.png --out icon-192x192.png
   sips -z 512 512 apple-icon.png --out icon-512x512.png
   ```
   
   Verify both files exist and are the correct dimensions:
   ```bash
   sips -g pixelHeight -g pixelWidth web/public/icon-192x192.png web/public/icon-512x512.png
   ```

2. Create `web/public/manifest.json`:
   ```json
   {
     "name": "GSD — Autonomous Coding Agent",
     "short_name": "GSD",
     "description": "The evolution of Get Shit Done — one command, walk away, come back to a built project.",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#1a1a1a",
     "theme_color": "#1a1a1a",
     "icons": [
       {
         "src": "/icon-192x192.png",
         "sizes": "192x192",
         "type": "image/png",
         "purpose": "any"
       },
       {
         "src": "/icon-512x512.png",
         "sizes": "512x512",
         "type": "image/png",
         "purpose": "any"
       }
     ]
   }
   ```
   The dark background/theme colors (`#1a1a1a`) match the `.dark` oklch background value from globals.css (`oklch(0.145 0 0)` ≈ `#1a1a1a`). GSD defaults to dark theme.

3. Update `web/app/layout.tsx` metadata to include PWA fields:
   - Add `manifest: "/manifest.json"` to the metadata export
   - Add `applicationName: "GSD"` to metadata
   - Add `appleWebApp` config: `{ capable: true, statusBarStyle: "default", title: "GSD" }`
   
   The existing `metadata` export already has `title`, `description`, and `icons`. Extend it — don't replace existing fields.
   
   Example additions to the existing `metadata` object:
   ```typescript
   export const metadata: Metadata = {
     // ... existing title, description, icons fields ...
     applicationName: 'GSD',
     manifest: '/manifest.json',
     appleWebApp: {
       capable: true,
       statusBarStyle: 'default',
       title: 'GSD',
     },
   }
   ```

4. Add a `viewport` export to `web/app/layout.tsx` if not already present:
   ```typescript
   export const viewport: Viewport = {
     themeColor: '#1a1a1a',
   }
   ```
   Import `Viewport` from `next` alongside the existing `Metadata` import.

5. Rebuild and verify:
   ```bash
   npm run build:web-host
   test -f dist/web/standalone/public/manifest.json && echo "PASS: manifest in standalone" || echo "FAIL"
   test -f dist/web/standalone/public/icon-192x192.png && echo "PASS: 192 icon in standalone" || echo "FAIL"
   test -f dist/web/standalone/public/icon-512x512.png && echo "PASS: 512 icon in standalone" || echo "FAIL"
   node -e "const m=JSON.parse(require('fs').readFileSync('web/public/manifest.json','utf8')); console.log(m.display==='standalone'&&m.icons.length>=2?'PASS: manifest valid':'FAIL')"
   ```

## Must-Haves

- [ ] `web/public/icon-192x192.png` exists, is 192×192
- [ ] `web/public/icon-512x512.png` exists, is 512×512
- [ ] `web/public/manifest.json` exists with display=standalone, name, start_url, 2+ icons
- [ ] layout.tsx metadata includes `manifest: '/manifest.json'` and `applicationName`
- [ ] layout.tsx has `appleWebApp` metadata for iOS PWA support
- [ ] `npm run build:web-host` exits 0
- [ ] manifest.json and icon PNGs appear in `dist/web/standalone/public/`

## Verification

- `sips -g pixelHeight -g pixelWidth web/public/icon-192x192.png` → 192×192
- `sips -g pixelHeight -g pixelWidth web/public/icon-512x512.png` → 512×512
- `node -e "const m=JSON.parse(require('fs').readFileSync('web/public/manifest.json','utf8')); console.log(m.display==='standalone' && m.icons.length>=2 ? 'PASS' : 'FAIL')"` → "PASS"
- `npm run build:web-host` exits 0
- `test -f dist/web/standalone/public/manifest.json && echo "PASS"` → "PASS"

## Observability Impact

- **Build-time:** `manifest.json` and icon PNGs (`icon-192x192.png`, `icon-512x512.png`) must appear in `dist/web/standalone/public/` after `npm run build:web-host`. Their absence means Next.js static file copying failed.
- **Browser inspection:** Chrome DevTools → Application → Manifest shows parsed manifest with name, icons, display mode, and theme color. Invalid manifest fields surface as warnings in this panel.
- **PWA installability:** Chrome DevTools → Application → "Manifest" section shows installability status. Missing icons or invalid display mode prevent the install prompt and are reported as specific errors (e.g., "No matching service worker detected" or "No supplied icon is at least 192px square").
- **iOS:** `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags render in `<head>` — inspect with View Source or Elements panel.
- **Failure visibility:** A missing or malformed manifest.json results in a 404 in the Network tab and a console warning. Missing viewport themeColor means the browser chrome won't tint on mobile.

## Inputs

- `web/public/icon.svg` — existing SVG icon source (180×180 viewBox)
- `web/public/apple-icon.png` — existing 180×180 PNG (fallback source)
- `web/app/layout.tsx` — current state after T01 (has SwRegister wired in)
- `web/app/globals.css` — dark theme uses `oklch(0.145 0 0)` for background (≈ #1a1a1a)
- T01 completed: build script is `next build && serwist build`, sw.js generates successfully

## Expected Output

- `web/public/icon-192x192.png` — new, 192×192 PNG icon
- `web/public/icon-512x512.png` — new, 512×512 PNG icon
- `web/public/manifest.json` — new, PWA manifest with dark theme
- `web/app/layout.tsx` — updated with manifest link, applicationName, appleWebApp, viewport themeColor
