# M011 — Research

**Date:** 2026-03-18
**Status:** Complete

## Summary

M011 has three distinct concerns: (1) a separate `web.yml` CI workflow, (2) npm packaging verification for the web standalone host, and (3) PWA install prompt via Serwist. The codebase is well-prepared for all three — existing CI patterns in `ci.yml` and `build-native.yml` provide clear templates, `validate-pack.js` is ready to be extended, and the web icons/metadata are partially in place. The main complexity is in PWA integration: the project is on Next.js 16.2.0 (Turbopack default), but Serwist has a dedicated `@serwist/turbopack` package and a "configurator mode" that runs the service worker build as a separate step after `next build`, making it bundler-agnostic. This is the correct path — it avoids the Webpack fallback that other guides recommend.

The three concerns are nearly independent and form a natural slice order: CI first (validates everything else), packaging verification second (depends on build working), PWA last (additive feature layer). The CI slice is lowest risk and highest foundational value.

## Recommendation

**Three slices in order: CI workflow → Packaging verification → PWA install prompt.**

1. **CI (S01):** Create `.github/workflows/web.yml` mirroring `ci.yml` triggers (push to `main`/`feat/**`, PR to `main`). Steps: checkout, Node 22, `npm ci`, `npm --prefix web ci`, `npm run build`, `npm run build:web-host`, run web contract tests. Single `ubuntu-latest` runner — macOS is unnecessary since the web host has no native-binary dependency (node-pty compiles from source on both platforms and the standalone output is JS). The web contract tests are pure Node.js (no Playwright), so no browser install is needed.

2. **Packaging (S02):** Extend `validate-pack.js` to verify `dist/web/standalone/server.js` and a sample of critical web host files are present in the tarball. This is simpler than a separate validation — the existing script already does `npm pack` + `tar tzf` + install test.

3. **PWA (S03):** Use Serwist's configurator mode (`@serwist/next/config` + `@serwist/cli` + `serwist`) with `@serwist/turbopack` for the React provider. This runs `serwist build` after `next build` — bundler-agnostic, no Webpack fallback needed. Service worker does app shell caching only (no offline). Generate 192×192 and 512×512 PNG icons from the existing SVG. Add `manifest.json` with dark theme colors. Add `beforeinstallprompt` handler as a React hook + browser install prompt UI.

## Implementation Landscape

### Key Files

- `.github/workflows/ci.yml` — Template for web.yml structure (triggers, Node setup, cache)
- `.github/workflows/build-native.yml` — Reference for matrix/artifact patterns (not needed for web.yml)
- `scripts/validate-pack.js` — Extend with `dist/web/standalone/server.js` check in `requiredFiles`
- `scripts/stage-web-standalone.cjs` — Copies standalone build to `dist/web/standalone/` (packaging source of truth)
- `web/next.config.mjs` — Must be updated for Serwist configurator mode (no `withSerwistInit` wrapper needed — configurator mode uses an external `serwist.config.js`)
- `web/package.json` — Add serwist deps, update build script to `next build && serwist build`
- `web/app/layout.tsx` — Add manifest link metadata, `SerwistProvider`, PWA metadata
- `web/app/sw.ts` — New service worker source file
- `web/public/manifest.json` — New PWA manifest
- `web/public/` — Needs 192×192 and 512×512 PNG icons (generated from existing `icon.svg`)
- `web/app/globals.css` — Dark theme colors for manifest `theme_color` / `background_color` reference
- `package.json` — Root `build:web-host` script may need updating if `serwist build` must run in the web dir

### Build Order

**Prove CI first.** A green web.yml on push to main validates the entire build pipeline and makes packaging and PWA changes verifiable from CI itself. Packaging verification (S02) is a small extension to existing infrastructure. PWA (S03) is the only slice with new dependencies and meaningful code — it should come last so the CI pipeline already guards against regressions.

Within S03 (PWA), prove the service worker builds successfully before wiring the install prompt UI. The Serwist integration touches `next.config.mjs` (which is load-bearing for standalone output), so verify `npm run build:web-host` still produces a working standalone host after each change.

### Verification Approach

**S01 (CI):**
- `web.yml` triggers on push to main and PRs
- Job exits 0 on ubuntu-latest: `npm run build:web-host` succeeds, web contract tests pass
- Verify by pushing to a feat/ branch and confirming GitHub Actions shows the web job green

**S02 (Packaging):**
- `npm run validate-pack` exits 0 and output includes "dist/web/standalone/server.js" in critical files check
- Running `npm pack` + `tar tzf` manually shows the web standalone directory is present

**S03 (PWA):**
- `npm run build:web-host` still exits 0 after Serwist integration
- `dist/web/standalone/public/sw.js` exists after build (service worker was generated)
- `web/public/manifest.json` exists with correct fields
- `gsd --web` opens browser → DevTools Application tab shows service worker registered and manifest detected
- Install prompt appears (on supported browsers — Chrome, Edge) when the app meets PWA criteria

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Service worker generation | Serwist (`@serwist/next/config` + `@serwist/cli` + `serwist`) | Modern fork of next-pwa, maintained, has Turbopack support via configurator mode |
| Service worker React provider | `@serwist/turbopack` (`SerwistProvider`) | Handles SW registration with disable-in-dev support, purpose-built for Turbopack Next.js |
| PWA icon generation | `sharp` or `sips` (macOS built-in) | SVG→PNG at 192×192 and 512×512 from existing `web/public/icon.svg` |
| Install prompt handler | `beforeinstallprompt` Web API | Standard browser API — no library needed |

## Constraints

- **Next.js 16.2.0 uses Turbopack by default.** The `@serwist/next` Webpack integration (`withSerwistInit`) does NOT work with Turbopack. Must use the configurator mode or `@serwist/turbopack` package.
- **`output: 'standalone'` in `next.config.mjs` is load-bearing.** The entire packaging pipeline depends on standalone output. Any Serwist integration must preserve this config option.
- **`web/` is NOT an npm workspace.** It has its own `package.json` and `package-lock.json`. CI must run `npm --prefix web ci` separately after `npm ci`.
- **`node-pty` is a native module in `web/package.json`.** It requires C++ compilation. Ubuntu CI runners have build-essential; macOS has Xcode CLI tools. Both handle this, but it adds ~15s to install.
- **Web contract tests are pure Node.js** (use `node:test`, NOT Playwright). They can run in CI without browser installation. Integration tests DO use Playwright but are heavier and probably not worth adding to web.yml initially.
- **`web/public/` must contain `sw.js` after build.** Serwist configurator mode runs `serwist build` which generates `public/sw.js`. This file should be `.gitignore`d since it's a build artifact.
- **Icons: Only 32×32 and 180×180 PNGs exist.** PWA requires 192×192 and 512×512. The 180×180 SVG source (`icon.svg`) is available for generation.
- **D093 scopes PWA to install prompt + app shell caching only.** No offline functionality, no IndexedDB, no background sync. The service worker should use `defaultCache` for app shell assets only.
- **Existing `build:web-host` script is `npm --prefix web run build && npm run stage:web-host`.** If Serwist changes the web build command to `next build && serwist build`, the root-level script doesn't need changing — only `web/package.json`'s `build` script changes.
- **`git rev-parse HEAD` used by Serwist for precache revision.** In CI this works fine. In standalone packaged host, git may not be available — use crypto.randomUUID() fallback as shown in Serwist docs.

## Common Pitfalls

- **Serwist Webpack mode on Turbopack** — Using `withSerwistInit` wrapper in `next.config.mjs` will fail at build time on Next.js 16.2.0 because Turbopack is the default bundler. Must use configurator mode or `@serwist/turbopack` package.
- **Service worker caching in development** — If the SW is registered in dev mode, it will cache stale assets and cause confusing behavior. Disable via `SerwistProvider disable={process.env.NODE_ENV === "development"}` or skip registration entirely in dev.
- **Standalone output + public/sw.js** — The `stage-web-standalone.cjs` script copies `web/public/` to `dist/web/standalone/public/`. The generated `sw.js` in `web/public/` will be included automatically. Verify it appears in the staged output.
- **manifest.json not linked** — Next.js doesn't auto-detect `public/manifest.json`. Must add explicit `<link rel="manifest">` via metadata in `layout.tsx` or a `<Head>` component.
- **CI node-pty compilation failure** — On ubuntu-latest, `node-pty` requires `python3` and `make`. These are pre-installed on GitHub Actions ubuntu-latest runners. If compilation fails, add `apt-get install -y python3 make gcc` step.
- **Separate npm ci for web/** — Forgetting `npm --prefix web ci` in web.yml will cause `npm --prefix web run build` to fail with missing dependencies.

## Open Risks

- **Serwist configurator mode maturity.** The configurator mode and `@serwist/turbopack` package are newer than the Webpack integration. If they produce build errors with Next.js 16.2.0's specific Turbopack version, the fallback is to add `--webpack` to the build command (acceptable since only the web build uses it).
- **PWA installability criteria.** Chrome requires a valid manifest, service worker, and HTTPS (or localhost). Since GSD runs on localhost, HTTPS is not needed. But if Chrome's PWA criteria change or tighten, the install prompt may not appear.
- **`serwist build` in CI.** The `serwist build` step runs after `next build` and generates `public/sw.js` by reading `.next/` build output. If the CLI has path resolution issues in CI (different cwd), it may fail. Test early.
- **Icon generation tooling.** If `sharp` is unavailable in CI and `sips` (macOS-only) isn't either, pre-generating and committing the PNGs is the safe fallback. Since the icons change rarely, committing them is reasonable.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GitHub Actions | bobmatnyc/claude-mpm-skills@github-actions | available (230 installs) |
| PWA | alinaqi/claude-bootstrap@pwa-development | available (643 installs) |
| GitHub Actions | github-workflows (local) | installed |

The local `github-workflows` skill is already installed and covers GitHub Actions workflow creation. The external PWA skill has high install count but the Serwist docs are sufficient for this scope (install prompt only, no offline).

## Sources

- Serwist Next.js getting started: `withSerwistInit` pattern and service worker template (source: [Serwist docs](https://serwist.pages.dev/docs/next/getting-started))
- Serwist configurator mode: bundler-agnostic approach that works with both Webpack and Turbopack (source: [Serwist config docs](https://serwist.pages.dev/docs/next/config))
- Serwist Turbopack integration: `@serwist/turbopack` package with `SerwistProvider` and `defaultCache` (source: [Serwist turbo docs](https://serwist.pages.dev/docs/next/turbo))
- Next.js 16.2.0 uses Turbopack as default bundler; Serwist requires `--webpack` flag or configurator mode (source: [LogRocket blog](https://blog.logrocket.com/nextjs-16-pwa-offline-support/))
- `@serwist/next` v9.5.7 peer-requires `next >=14.0.0` and `@serwist/cli ^9.5.7` (source: npm registry)
- `@serwist/turbopack` v9.5.7 peer-requires `esbuild >=0.25.0 <1.0.0` or `esbuild-wasm` (source: npm registry)
