# M011: CI/CD, Packaging & PWA

**Vision:** The web host has CI protection, npm packaging is verified end-to-end, and users can install GSD as a desktop PWA from the browser.

## Success Criteria

- Running `gsd --web` and opening Chrome DevTools → Application shows a registered service worker and a valid manifest
- The browser install prompt appears on supported browsers (Chrome, Edge) when visiting the running web host
- A user can install GSD as a standalone desktop app from the browser install prompt
- Pushing to `main` or a `feat/**` branch triggers `.github/workflows/web.yml`, which builds the web host and runs contract tests on `ubuntu-latest`
- `npm run validate-pack` exits 0 and verifies `dist/web/standalone/server.js` is present in the tarball
- `npm run build:web-host` still exits 0 after all changes (standalone output preserved)

## Key Risks / Unknowns

- **Serwist configurator mode on Next.js 16.2.0 Turbopack** — The `@serwist/turbopack` package and configurator mode are newer than the Webpack integration. If they produce build errors with this specific Turbopack version, the build pipeline breaks. Fallback: add `--webpack` to the web build command.
- **`next.config.mjs` is load-bearing** — Standalone output depends on this config. Any Serwist integration that corrupts it breaks the entire packaging pipeline.

## Proof Strategy

- Serwist + Turbopack compatibility → retire in S01 by proving `npm run build:web-host` exits 0 with Serwist configured, `sw.js` is generated in the standalone output, and the manifest is detected in browser DevTools
- `next.config.mjs` stability → retire in S01 by verifying standalone output is identical in structure before and after Serwist integration

## Verification Classes

- Contract verification: `npm run validate-pack` with extended web host checks, `npm run build:web-host` exit 0, `sw.js` existence in standalone output
- Integration verification: Browser DevTools Application tab confirms service worker registration and manifest detection; install prompt appears on supported browsers
- Operational verification: `web.yml` GitHub Actions workflow runs green on push to `feat/**` branch
- UAT / human verification: PWA installs as standalone desktop app from browser prompt; the installed app opens to the GSD workspace

## Milestone Definition of Done

This milestone is complete only when all are true:

- PWA manifest, service worker, and install prompt are live in the web host
- `npm run build:web-host` exits 0 with Serwist integration
- `sw.js` exists in `dist/web/standalone/public/` after build
- `npm run validate-pack` exits 0 and verifies web standalone presence
- `.github/workflows/web.yml` exists and runs green on push
- All existing CI (`ci.yml`, `build-native.yml`) still passes
- Success criteria are re-checked against live browser behavior

## Requirement Coverage

- Covers: R112 (web CI workflow — primary owner S02), R130 (web.yml — primary owner S02), R131 (npm tarball includes web standalone — primary owner S02), R132 (all CI green on main — primary owner S02), R133 (PWA install prompt — primary owner S01)
- Partially covers: none
- Leaves for later: R111 (documentation — M004 scope), R020 (multi-project — M006 scope), R121–R124 (editor — M009 scope), R125–R129 (upstream merge — M010 scope, already validated/deferred)
- Orphan risks: none — all active requirements relevant to M011 are mapped

## Slices

- [x] **S01: PWA Install Prompt with Serwist** `risk:medium` `depends:[]`
  > After this: Running `gsd --web` in Chrome shows a service worker in DevTools Application tab, a valid manifest is detected, and the browser install prompt appears — a user can install GSD as a desktop app.
- [ ] **S02: Web CI Workflow & Packaging Verification** `risk:low` `depends:[S01]`
  > After this: Pushing to a `feat/**` branch triggers `web.yml` which builds the web host (including Serwist), runs contract tests, and validates that `dist/web/standalone/server.js` is in the npm tarball — all green on `ubuntu-latest`.

## Boundary Map

### S01 → S02

Produces:
- `web/public/manifest.json` — PWA manifest with name, icons, theme color, display mode
- Serwist integration in `web/package.json` build script (`next build && serwist build`)
- `sw.js` generated in `web/public/` (gitignored build artifact) during `npm run build:web-host`
- 192×192 and 512×512 PNG icons in `web/public/`
- `beforeinstallprompt` handler hook and install prompt UI component in `web/`
- Proven: `npm run build:web-host` exits 0 with Serwist, standalone output structure preserved

Consumes:
- nothing (first slice)

### S02 output

Produces:
- `.github/workflows/web.yml` — separate CI workflow for web host build + contract tests + packaging validation
- Extended `scripts/validate-pack.js` — checks for `dist/web/standalone/server.js` in tarball
- Proven: workflow runs green on push, `npm run validate-pack` exits 0 with web host checks
