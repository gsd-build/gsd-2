---
phase: 01-password-auth-and-cookie-sessions
plan: 03
subsystem: auth
tags: [login-gate, dual-mode-auth, cookie-auth, bearer-token, react-component, password-form]

# Dependency graph
requires:
  - 01-02 (GET /api/auth/status, POST /api/auth/login, POST /api/auth/logout)
provides:
  - LoginGate React component (HTTPS shows login form, HTTP passes through)
  - clearAuth() — clears localStorage token and in-memory cache
  - logout() — calls POST /api/auth/logout, then clearAuth + reload
  - authFetch dual-mode: bearer on localhost, cookie-passthrough on HTTPS with 401 detection
affects:
  - All future plans using authFetch (now behaves correctly on HTTPS)
  - page.tsx wraps GSDAppShell with LoginGate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - LoginGate checks window.location.protocol to decide auth mode (HTTP bypass vs HTTPS gate)
    - Hard page reload after successful login ensures browser processes Set-Cookie (D-01)
    - motion/react animate prop with key increment triggers shake on wrong password (D-09)
    - useEffect + setInterval countdown for rate limit timer (D-10)
    - Auto-focus via useRef + useEffect when authState transitions to needs_login (D-03)

key-files:
  created:
    - web/components/gsd/login-gate.tsx
  modified:
    - web/lib/auth.ts
    - web/app/page.tsx

key-decisions:
  - "authFetch HTTPS path makes requests without Authorization header — browser sends session cookie automatically; on 401 clears local state and reloads (D-04, D-05)"
  - "LoginGate uses window.location.protocol check (not navigator or other detection) to stay consistent with the server-side Secure cookie behavior"
  - "Shake animation uses motion/react animate with key increment pattern (no AnimatePresence needed) — simpler than variants for one-shot effects"

patterns-established:
  - "Pattern 6: Dual-mode authFetch — isHttps() guard determines whether to require bearer token or pass request through for cookie auth"
  - "Pattern 7: Hard reload on login success — window.location.reload() ensures browser processes the Set-Cookie header from the login response"

requirements-completed: [AUTH-02, AUTH-03, AUTH-06]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 01 Plan 03: Login Gate UI Summary

**LoginGate component with dual-mode authFetch: bearer token on localhost, cookie-backed requests on HTTPS (Tailscale), all 10 UX decisions implemented**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-28T19:29:11Z
- **Completed:** 2026-03-28T19:31:08Z
- **Tasks:** 2 (1 auto, 1 checkpoint:human-verify)
- **Files modified:** 1 created, 2 modified

## Accomplishments

- `web/lib/auth.ts`: Added `isHttps()` helper, refactored `authFetch` for dual-mode operation (review concern #2 addressed), added `clearAuth()` and `logout()` exports
- `web/components/gsd/login-gate.tsx`: Full-screen login gate with GSD2 logo, password field with eye toggle, shake animation on wrong password, rate-limit countdown, auto-focus, hard reload on success, HTTP bypass
- `web/app/page.tsx`: Wrapped `GSDAppShell` with `LoginGate`

## Task Commits

Each task was committed atomically:

1. **Task 1: LoginGate component + dual-mode authFetch + page.tsx wiring** — `56280cde`
2. **Task 2: Checkpoint (human-verify)** — auto-approved (auto_advance: true); tests passed: 15/15 + 6/6

## Files Created/Modified

- `web/components/gsd/login-gate.tsx` — LoginGate wrapping component with full password auth UX
- `web/lib/auth.ts` — Extended with isHttps(), dual-mode authFetch, clearAuth(), logout()
- `web/app/page.tsx` — GSDAppShell wrapped with LoginGate

## Decisions Made

- `authFetch` HTTPS path passes requests through without an Authorization header — the browser sends the session cookie automatically. On 401, it calls `clearAuth()` and `window.location.reload()` to return the user to the login page (implements D-04 and D-05 without BroadcastChannel).
- The shake animation in `login-gate.tsx` uses a `shakeKey` state counter with `motion/react`'s `animate` prop rather than variants — simpler pattern for a one-shot animation that needs to re-trigger on repeated wrong password submissions.
- `window.location.protocol !== "https:"` check mirrors the server's `Secure` cookie flag behavior — the gate only activates where cookie auth can actually work.

## Deviations from Plan

None — plan executed exactly as written.

All 10 decisions (D-01 through D-10) are implemented:
- D-01: Hard reload on success (`window.location.reload()`)
- D-02: Loading spinner + disabled button during submit (`Loader2`, `loading` state)
- D-03: Auto-focus on mount and after wrong password (`useRef` + `useEffect`)
- D-04: 401 detection in authFetch HTTPS path → `clearAuth()` + reload
- D-05: Cross-tab logout via 401 detection (next API call triggers redirect)
- D-06: Minimum 4-char password enforced in button disabled logic and submit guard
- D-07: Eye/EyeOff toggle for password visibility
- D-08: No confirmation field
- D-09: Shake animation (`motion/react` with `shakeKey`) + "Wrong password" in red
- D-10: Rate limit countdown with `setInterval` + "Too many attempts. Try again in N seconds."

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Login gate is functional — Phase 01 auth UI is complete
- `clearAuth()` and `logout()` ready for use in settings UI (Phase 04)
- `authFetch` dual-mode ready for all API calls in HTTPS context
- All unit tests still pass (15 + 6 = 21 tests)

## Self-Check: PASSED

All created/modified files confirmed present and commit `56280cde` verified in git history.

---
*Phase: 01-password-auth-and-cookie-sessions*
*Completed: 2026-03-28*
