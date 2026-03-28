---
phase: 01-password-auth-and-cookie-sessions
plan: 02
subsystem: auth
tags: [login-endpoint, logout-endpoint, session-cookie, rate-limiting, edge-crypto, proxy, web-mode]

# Dependency graph
requires:
  - 01-01 (hashPassword, verifyPassword, createSessionToken, verifySessionToken, getOrCreateSessionSecret, checkRateLimit, setPassword, getPasswordHash)
provides:
  - POST /api/auth/login — rate-limited password verify + 30-day HttpOnly/Secure/SameSite=Strict cookie
  - POST /api/auth/logout — clears gsd-session cookie with maxAge=0
  - GET /api/auth/status — { configured, authenticated } with cookie + bearer support
  - POST /api/auth/set-password — hashes password, rotates secret, updates process.env
  - proxy.ts — async cookie check (crypto.subtle HMAC) before bearer token fallback
  - web-mode.ts — session secret injected as GSD_WEB_SESSION_SECRET at startup
affects:
  - 01-03 (auth middleware uses proxy cookie check and these auth API routes)
  - 04 (settings UI calls set-password endpoint)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Node.js auth routes read session secret live from disk via getOrCreateSessionSecret() (not from stale env var)
    - Edge Runtime cookie verification via crypto.subtle HMAC (zero additional dependencies)
    - Constant-time comparison in Edge Runtime via charCodeAt XOR loop (AUTH-10)
    - Auth routes exempt from credential checks but NOT from Origin validation (AUTH-09)
    - set-password updates process.env.GSD_WEB_SESSION_SECRET immediately after rotation

key-files:
  created:
    - web/app/api/auth/login/route.ts
    - web/app/api/auth/logout/route.ts
    - web/app/api/auth/status/route.ts
    - web/app/api/auth/set-password/route.ts
  modified:
    - web/proxy.ts
    - src/web-mode.ts

key-decisions:
  - "Auth routes use .ts import extensions (not .js) to match Next.js/web workspace convention, consistent with web/app/api/preferences/route.ts"
  - "verifySessionCookieEdge uses crypto.subtle directly (not jose) because our token is a custom HMAC, not a JWT — no jose benefit"
  - "status route checks bearer token before cookie (fast path for localhost users who always have bearer)"

patterns-established:
  - "Pattern 4: Live secret reads — all Node.js auth routes call getOrCreateSessionSecret() directly, never read from process.env.GSD_WEB_SESSION_SECRET"
  - "Pattern 5: Auth endpoint exemption placement — Origin check runs for ALL /api/* routes; /api/auth/* exemption comes AFTER the Origin block"

requirements-completed: [AUTH-02, AUTH-03, AUTH-05, AUTH-06, AUTH-08, AUTH-09, AUTH-10]

# Metrics
duration: 15min
completed: 2026-03-28
---

# Phase 01 Plan 02: Auth API Routes + Proxy Cookie Auth Summary

**Four auth API routes + Edge-compatible cookie verification in proxy.ts + session secret injection in web-mode.ts, preserving the existing bearer token localhost flow**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-28T19:30:00Z
- **Completed:** 2026-03-28T19:45:00Z
- **Tasks:** 2
- **Files modified:** 4 created, 2 modified

## Accomplishments

- `web/app/api/auth/login/route.ts`: POST endpoint — rate-limits by IP (5/60s), verifies scrypt password, reads session secret live from disk, sets 30-day HttpOnly/Secure/SameSite=Strict cookie
- `web/app/api/auth/logout/route.ts`: POST endpoint — clears `gsd-session` cookie with maxAge=0
- `web/app/api/auth/status/route.ts`: GET endpoint — returns `{ configured, authenticated }`, supports both cookie and bearer token auth, reads secret live from disk
- `web/app/api/auth/set-password/route.ts`: POST endpoint — calls `setPassword()` (hashes + rotates secret), then updates `process.env.GSD_WEB_SESSION_SECRET` for immediate proxy pickup
- `web/proxy.ts`: converted to async, adds `verifySessionCookieEdge()` using `crypto.subtle` HMAC with constant-time comparison, auth routes exempt from credentials (Origin check still runs), cookie check before bearer fallback
- `src/web-mode.ts`: imports `getOrCreateSessionSecret`, reads secret at startup, injects as `GSD_WEB_SESSION_SECRET` in spawned process env

## Task Commits

Each task was committed atomically:

1. **Task 1: auth API routes (login, logout, status, set-password)** — `75aac561`
2. **Task 2: proxy.ts cookie auth + web-mode.ts session secret injection** — `f88d0ecb`

## Files Created/Modified

- `web/app/api/auth/login/route.ts` — POST login handler with rate limiting, scrypt verify, cookie set
- `web/app/api/auth/logout/route.ts` — POST logout handler, clears cookie
- `web/app/api/auth/status/route.ts` — GET status handler, { configured, authenticated }
- `web/app/api/auth/set-password/route.ts` — POST set/change password, rotates secret
- `web/proxy.ts` — async proxy with cookie session verification and narrowed auth exemption
- `src/web-mode.ts` — session secret read and injected at launch time

## Decisions Made

- Used `.ts` import extensions in the four new Next.js route files (consistent with `web/app/api/preferences/route.ts` which also uses `../../../../src/app-paths.ts`)
- `verifySessionCookieEdge` in proxy.ts uses `crypto.subtle` directly (no jose). Our token format is `base64url(payload).hex(HMAC)` — a custom format that jose's JWT utilities don't simplify. `crypto.subtle` is built into every Edge Runtime with zero dependencies.
- `GET /api/auth/status` checks bearer token first (fast path for existing localhost users), then falls through to cookie check.

## Deviations from Plan

None — plan executed exactly as written.

The import paths in the plan spec (`from "../../../../src/web/web-auth-storage.ts"`) were adjusted to `"../../../../../src/web/web-password-storage.ts"` to reflect:
1. The path depth from `web/app/api/auth/*/route.ts` (5 levels up, not 4)
2. The renamed module `web-password-storage.ts` documented in Plan 01's deviation

This is not a plan deviation but a correct implementation of the `<important_deviation>` instruction provided in the execution prompt.

## Issues Encountered

None beyond the import path correction noted above.

## User Setup Required

None.

## Next Phase Readiness

- All auth API routes ready for Plan 03 (auth middleware)
- `proxy.ts` cookie check ready — Plan 03 will add the middleware wrapper
- Session secret injection works end-to-end: set-password → rotates → updates process.env → proxy picks up immediately

## Self-Check: PASSED

All created/modified files confirmed present and commits verified in git history.
