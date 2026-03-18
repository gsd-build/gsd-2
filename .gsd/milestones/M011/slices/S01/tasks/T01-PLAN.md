---
estimated_steps: 8
estimated_files: 6
---

# T01: Serwist service worker integration and build verification

**Slice:** S01 — PWA Install Prompt with Serwist
**Milestone:** M011

## Description

Install Serwist packages and configure the service worker using **configurator mode** — this runs `serwist build` as a separate CLI step after `next build`, keeping `next.config.mjs` completely untouched. This is the safest approach because `next.config.mjs` is load-bearing for standalone output (the entire packaging pipeline depends on it).

The configurator mode uses:
- `serwist.config.js` at the web/ root — points at `app/sw.ts` as source, `public/sw.js` as output
- `@serwist/next/config` — the `serwist()` function that reads Next.js build output for precache manifest
- `@serwist/next/worker` — provides `defaultCache` runtime caching strategies
- `serwist build` CLI — compiles the service worker after `next build`

**This is the highest-risk task in S01.** If `serwist build` fails with Next.js 16.1.6's Turbopack output, the fallback is `--webpack` flag on the build command. The task must verify the complete build chain succeeds.

**Important Serwist skill note:** Load the `frontend-design` skill for UI component patterns if needed, but the core work here is build infrastructure. No UI changes in this task.

## Steps

1. Install Serwist packages in `web/`:
   ```bash
   cd web && npm install serwist @serwist/next
   ```
   These are the only two packages needed for configurator mode. Do NOT install `@serwist/turbopack` (that's the SerwistProvider approach — we're using manual registration instead).

2. Create `web/serwist.config.js` — the configurator mode config file:
   ```javascript
   // @ts-check
   import { spawnSync } from "node:child_process";
   import { serwist } from "@serwist/next/config";

   const revision = (() => {
     try {
       const r = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
       if (r.stdout?.trim()) return r.stdout.trim();
     } catch {}
     return crypto.randomUUID();
   })();

   export default serwist({
     swSrc: "app/sw.ts",
     swDest: "public/sw.js",
     additionalPrecacheEntries: [{ url: "/", revision }],
   });
   ```
   Note: `crypto.randomUUID()` fallback handles CI/packaged environments where git may not be available.

3. Create `web/app/sw.ts` — the service worker source file:
   ```typescript
   /// <reference no-default-lib="true" />
   /// <reference lib="esnext" />
   /// <reference lib="webworker" />
   import { defaultCache } from "@serwist/next/worker";
   import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
   import { Serwist } from "serwist";

   declare global {
     interface WorkerGlobalScope extends SerwistGlobalConfig {
       __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
     }
   }

   declare const self: ServiceWorkerGlobalScope;

   const serwist = new Serwist({
     precacheEntries: self.__SW_MANIFEST,
     skipWaiting: true,
     clientsClaim: true,
     navigationPreload: true,
     runtimeCaching: defaultCache,
   });

   serwist.addEventListeners();
   ```
   **Important:** Per D093, NO offline fallback page. No `fallbacks` config. This is app-shell caching only.

4. Create `web/app/sw-register.tsx` — client component for manual SW registration:
   ```tsx
   "use client";

   import { useEffect } from "react";

   export function SwRegister() {
     useEffect(() => {
       if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
         navigator.serviceWorker
           .register("/sw.js")
           .then((reg) => {
             console.log("[GSD] Service worker registered:", reg.scope);
           })
           .catch((err) => {
             console.error("[GSD] Service worker registration failed:", err);
           });
       }
     }, []);

     return null;
   }
   ```
   This only registers in production mode — avoids stale caching issues in development.

5. Wire `SwRegister` into `web/app/layout.tsx`:
   Add `import { SwRegister } from "./sw-register"` and render `<SwRegister />` inside the `<body>` tag, before or after the ThemeProvider.

6. Update `web/package.json` build script:
   Change `"build": "next build"` to `"build": "next build && serwist build"`.
   Leave all other scripts unchanged.

7. Add `sw.js` to `web/.gitignore`:
   Append `public/sw.js` to the existing `.gitignore` in `web/`. This is a generated build artifact.

8. Build and verify:
   ```bash
   npm run build:web-host
   ```
   Then check:
   ```bash
   test -f dist/web/standalone/public/sw.js && echo "PASS: sw.js in standalone output" || echo "FAIL"
   ```
   Also verify `next.config.mjs` is unchanged:
   ```bash
   git diff web/next.config.mjs  # should be empty
   ```
   **If `serwist build` fails:** Check if it's a Turbopack compatibility issue. Fallback: add `--webpack` to the Next.js build step (`next build --webpack && serwist build`). If using the fallback, note it in the task summary for S02 CI integration.

## Must-Haves

- [ ] `serwist` and `@serwist/next` installed in web/package.json
- [ ] `web/serwist.config.js` exists with configurator mode config
- [ ] `web/app/sw.ts` exists with defaultCache from `@serwist/next/worker`
- [ ] `web/app/sw-register.tsx` exists as client component with production-only registration
- [ ] `SwRegister` wired into `web/app/layout.tsx`
- [ ] `web/package.json` build script is `next build && serwist build`
- [ ] `public/sw.js` in `web/.gitignore`
- [ ] `npm run build:web-host` exits 0
- [ ] `dist/web/standalone/public/sw.js` exists after build
- [ ] `web/next.config.mjs` is NOT modified

## Verification

- `npm run build:web-host` exits 0
- `test -f dist/web/standalone/public/sw.js && echo "PASS"` → "PASS"
- `git diff web/next.config.mjs` → empty (no changes to next.config)
- `grep "serwist build" web/package.json` → confirms build script updated
- `grep "sw.js" web/.gitignore` → confirms gitignore updated

## Observability Impact

- **New runtime signal:** `[GSD] Service worker registered: <scope>` logged to browser console on successful SW registration in production
- **New runtime signal:** `[GSD] Service worker registration failed: <error>` logged to browser console on SW registration failure
- **Build-time signal:** `serwist build` step outputs precache manifest stats and errors to stdout/stderr during `npm run build:web-host`
- **Inspection surface:** `dist/web/standalone/public/sw.js` — existence confirms build chain succeeded; absence means `serwist build` or staging failed
- **Failure state:** If `serwist build` fails, the entire `npm run build:web-host` exits non-zero; stderr contains the Serwist error. If SW registration fails at runtime, browser console shows the error — no silent failures.

## Inputs

- `web/next.config.mjs` — must NOT be modified (standalone output is load-bearing)
- `web/package.json` — current state with `"build": "next build"` script
- `web/app/layout.tsx` — current layout with ThemeProvider, metadata, icons
- `web/.gitignore` — current gitignore for web directory
- Serwist configurator mode docs: `serwist.config.js` uses `serwist()` from `@serwist/next/config`, `sw.ts` uses `defaultCache` from `@serwist/next/worker`, build script becomes `next build && serwist build`

## Expected Output

- `web/package.json` — updated with serwist deps and build script
- `web/serwist.config.js` — new configurator mode config
- `web/app/sw.ts` — new service worker source
- `web/app/sw-register.tsx` — new client-side registration component
- `web/app/layout.tsx` — modified to include SwRegister
- `web/.gitignore` — updated with sw.js entry
- `dist/web/standalone/public/sw.js` — generated service worker in standalone output (build artifact)
