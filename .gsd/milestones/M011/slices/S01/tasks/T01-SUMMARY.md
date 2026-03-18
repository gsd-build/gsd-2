---
id: T01
parent: S01
milestone: M011
provides:
  - Serwist service worker build chain integrated with Next.js 16.1.6 Turbopack
  - sw.js generated and staged into standalone output
  - Client-side SW registration component wired into layout
key_files:
  - web/serwist.config.js
  - web/app/sw.ts
  - web/app/sw-register.tsx
  - web/app/layout.tsx
  - web/package.json
  - web/.gitignore
key_decisions:
  - Plan specified only `serwist` + `@serwist/next` but `@serwist/cli` + `esbuild` are also required for `serwist build` CLI
patterns_established:
  - Serwist configurator mode — `serwist.config.js` at web root, `serwist build` as post-step after `next build`, next.config.mjs untouched
observability_surfaces:
  - "[GSD] Service worker registered:" console log in production browser
  - "[GSD] Service worker registration failed:" console error on failure
  - serwist build stdout reports precache URL count and total size during build
  - dist/web/standalone/public/sw.js existence confirms build chain success
duration: 15m
verification_result: passed
completed_at: 2026-03-18T15:28:00-04:00
blocker_discovered: false
---

# T01: Serwist service worker integration and build verification

**Integrated Serwist configurator mode with Next.js 16.1.6 Turbopack — `npm run build:web-host` generates sw.js (343 precached URLs, 15.3 MB) in standalone output with next.config.mjs untouched**

## What Happened

Installed Serwist packages and configured the service worker using configurator mode. This runs `serwist build` as a separate CLI step after `next build`, keeping `next.config.mjs` completely untouched (critical for standalone output packaging).

Created four new files:
- `web/serwist.config.js` — configurator mode config pointing at `app/sw.ts` as source and `public/sw.js` as output, with git-rev-based revision for the `/` precache entry
- `web/app/sw.ts` — service worker source using `defaultCache` from `@serwist/next/worker` with precaching, skip-waiting, clients-claim, and navigation preload (no offline fallback per D093)
- `web/app/sw-register.tsx` — client component that registers `/sw.js` only in production mode
- Wired `SwRegister` into `web/app/layout.tsx` inside the `<body>` tag after ThemeProvider

Updated `web/package.json` build script from `next build` to `next build && serwist build`, and added `public/sw.js` to `web/.gitignore`.

The full build chain (`next build` with Turbopack → `serwist build` → `stage:web-host`) succeeds without any Turbopack compatibility issues. No `--webpack` fallback was needed.

## Verification

- `npm run build:web-host` exits 0 — full chain succeeds
- `dist/web/standalone/public/sw.js` exists (61,982 bytes)
- `git diff web/next.config.mjs` — empty, no changes
- `grep "serwist build" web/package.json` — confirms build script updated
- `grep "sw.js" web/.gitignore` — confirms gitignore entry
- Serwist build output: "The service worker will precache 343 URLs, totaling 15.3 MB"

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` | 0 | ✅ pass | 13.8s |
| 2 | `test -f dist/web/standalone/public/sw.js` | 0 | ✅ pass | <1s |
| 3 | `git diff web/next.config.mjs` (empty) | 0 | ✅ pass | <1s |
| 4 | `grep "serwist build" web/package.json` | 0 | ✅ pass | <1s |
| 5 | `grep "sw.js" web/.gitignore` | 0 | ✅ pass | <1s |

Slice-level checks (partial — T01 is intermediate):

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| V1 | `npm run build:web-host` exits 0 | ✅ pass | |
| V2 | `sw.js` exists in standalone | ✅ pass | |
| V3 | `manifest.json` exists | ❌ expected fail | T02 task |
| V4 | Icons exist | ❌ expected fail | T02 task |
| V5 | Manifest valid | ❌ expected fail | T02 task |

## Diagnostics

- **Build-time:** `serwist build` reports precache URL count and total size to stdout. Errors go to stderr.
- **Runtime:** `[GSD] Service worker registered: <scope>` logged to browser console on success. `[GSD] Service worker registration failed: <error>` on failure.
- **Inspection:** Chrome DevTools → Application → Service Workers shows registration status. `dist/web/standalone/public/sw.js` existence confirms build chain worked.
- **SW registration only runs in production mode** — `process.env.NODE_ENV === "production"` guard prevents stale caching during development.

## Deviations

- **Added `@serwist/cli` and `esbuild` as devDependencies.** The plan specified only `serwist` + `@serwist/next`, but the `serwist build` CLI lives in `@serwist/cli` (not in the `serwist` package). `esbuild` is a required peer dependency of `@serwist/cli`. Without these, `serwist: command not found` on build. This is documented in the Serwist configurator mode install docs but was missed in the task plan.
- **Worktree required root `npm install` + `npm run build:pi-ai`** before the web build could succeed. Pre-existing workspace deps (chalk, react-markdown, shiki, yaml, remark-gfm) and `packages/pi-ai/dist/oauth.js` were missing. This is a worktree setup issue, not a Serwist issue.

## Known Issues

None. Turbopack compatibility confirmed — no `--webpack` fallback needed.

## Files Created/Modified

- `web/serwist.config.js` — new, configurator mode config for `serwist build` CLI
- `web/app/sw.ts` — new, service worker source with defaultCache runtime caching
- `web/app/sw-register.tsx` — new, client component for production-only SW registration
- `web/app/layout.tsx` — added SwRegister import and render in body
- `web/package.json` — added serwist, @serwist/next deps; added @serwist/cli, esbuild devDeps; updated build script
- `web/.gitignore` — added `public/sw.js` entry
