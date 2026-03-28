---
phase: 01-password-auth-and-cookie-sessions
plan: 01
subsystem: auth
tags: [scrypt, hmac-sha256, node:crypto, timingSafeEqual, session-tokens, rate-limiting]

# Dependency graph
requires: []
provides:
  - hashPassword/verifyPassword via scrypt with random salt
  - createSessionToken/verifySessionToken with HMAC-SHA256 signing
  - getOrCreateSessionSecret/rotateSessionSecret with 0o600 file permissions
  - setPassword/getPasswordHash stored in dedicated web-auth.json
  - checkRateLimit in-memory IP rate limiter (5 attempts/60s window)
affects:
  - 01-02 (login API route uses hashPassword, verifyPassword, checkRateLimit, createSessionToken)
  - 01-03 (auth middleware uses verifySessionToken, getOrCreateSessionSecret)
  - 04 (settings UI uses setPassword, getPasswordHash)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - scrypt password hashing with 16-byte random salt returning "salt_hex:hash_hex"
    - HMAC-SHA256 session tokens as "base64url_payload.hex_signature"
    - timingSafeEqual for all HMAC/hash comparisons (no string equality)
    - Dedicated web-auth.json for web auth data (separate from web-preferences.json)
    - Session secret rotation on password change (AUTH-07)
    - gsdDir optional parameter pattern for testable file paths

key-files:
  created:
    - src/web/web-session-auth.ts
    - src/web/web-password-storage.ts
    - web/lib/rate-limit.ts
    - web/lib/__tests__/web-session-auth.test.ts
    - web/lib/__tests__/rate-limit.test.ts
    - web/lib/__tests__/web-password-storage.test.ts
  modified: []

key-decisions:
  - "Named password storage module web-password-storage.ts (not web-auth-storage.ts) because src/web/web-auth-storage.ts already exists for OAuth credential storage"
  - "Use .ts extensions in imports (not .js) to match project convention and Node 22+ native TypeScript execution"
  - "timingSafeEqual used for both password hash comparison and HMAC signature comparison (AUTH-10)"

patterns-established:
  - "Pattern 1: gsdDir optional parameter — all file-based functions accept optional gsdDir for testability; fall back to appRoot when undefined"
  - "Pattern 2: 0o600 file mode — all auth-sensitive files (web-auth.json, web-session-secret) written with restrictive permissions"
  - "Pattern 3: Read-modify-write — setPassword reads existing file, merges passwordHash key, writes back to preserve other keys"

requirements-completed: [AUTH-01, AUTH-04, AUTH-05, AUTH-07, AUTH-10]

# Metrics
duration: 15min
completed: 2026-03-28
---

# Phase 01 Plan 01: Auth Crypto Primitives Summary

**scrypt password hashing + HMAC-SHA256 session tokens + dedicated web-auth.json storage + IP rate limiter, all using node:crypto with timingSafeEqual throughout**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-28T19:14:45Z
- **Completed:** 2026-03-28T19:29:55Z
- **Tasks:** 2
- **Files modified:** 6 created

## Accomplishments

- `web-session-auth.ts`: scrypt password hashing, HMAC-SHA256 session tokens, session secret lifecycle with 0o600 file permissions
- `web-password-storage.ts`: stores web UI password hash in dedicated `web-auth.json` (isolated from `web-preferences.json` to prevent hash leak via GET /api/preferences)
- `rate-limit.ts`: in-memory IP rate limiter — 5 attempts per 60-second window, returns `resetAt` timestamp for client countdown
- 27 unit tests total (15 + 6 + 6) — all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: web-session-auth.ts crypto module with tests** - `70580d13` (feat)
2. **Import fix: .ts extensions** - `13b9141b` (fix)
3. **Task 2: web-password-storage.ts + rate-limit.ts with tests** - `b297971e` (feat)

_Note: TDD tasks have RED (failing test) then GREEN (implementation) pattern_

## Files Created/Modified

- `src/web/web-session-auth.ts` — hashPassword, verifyPassword, createSessionToken, verifySessionToken, getOrCreateSessionSecret, rotateSessionSecret + SessionPayload type
- `src/web/web-password-storage.ts` — setPassword, getPasswordHash using dedicated web-auth.json
- `web/lib/rate-limit.ts` — checkRateLimit, _testResetRateLimits
- `web/lib/__tests__/web-session-auth.test.ts` — 15 tests for crypto module
- `web/lib/__tests__/rate-limit.test.ts` — 6 tests for rate limiter
- `web/lib/__tests__/web-password-storage.test.ts` — 6 tests for password storage

## Decisions Made

- Named the module `web-password-storage.ts` instead of `web-auth-storage.ts` because the latter already exists for OAuth credentials. Creating a same-named file would replace OAuth storage functionality.
- Used `.ts` import extensions throughout (not `.js`) to match project convention used in `src/web/settings-service.ts` and others, and to work correctly when Node 22+ runs `.ts` files natively in tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renamed web-auth-storage.ts to web-password-storage.ts**
- **Found during:** Task 2 (web-auth-storage.ts creation)
- **Issue:** `src/web/web-auth-storage.ts` already exists — it implements `FileOnboardingAuthStorage` for OAuth/API key credentials and is imported by `onboarding-service.ts`. Creating the plan's file at the same path would have destroyed existing OAuth storage functionality.
- **Fix:** Created `web-password-storage.ts` instead. Same exports (`setPassword`, `getPasswordHash`), same web-auth.json storage. Only the filename differs from the plan.
- **Files modified:** `src/web/web-password-storage.ts` (created), test file renamed accordingly
- **Verification:** All 6 password storage tests pass
- **Committed in:** `b297971e` (Task 2 commit)

**2. [Rule 3 - Blocking] Changed import extensions from .js to .ts**
- **Found during:** Task 2 (running tests)
- **Issue:** Plan's code snippets used `.js` imports (`./web-session-auth.js`). When Node 22+ runs `.ts` files natively, it can't resolve `.js` imports for files that exist only as `.ts`. Project convention (verified in `settings-service.ts`) uses `.ts` extensions.
- **Fix:** Changed all relative imports to use `.ts` extensions.
- **Files modified:** `src/web/web-session-auth.ts`, `src/web/web-password-storage.ts`
- **Verification:** All 27 tests pass after fix
- **Committed in:** `13b9141b`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking)
**Impact on plan:** Both auto-fixes required for correct operation. No scope creep — all plan requirements met.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All crypto primitives ready for Plan 02 (login API route)
- `checkRateLimit` ready for use in POST /api/auth/login
- `verifyPassword` + `getPasswordHash` ready for login handler
- `createSessionToken` + `getOrCreateSessionSecret` ready for session creation
- `verifySessionToken` ready for auth middleware (Plan 03)
- `setPassword` ready for settings UI (Phase 04)

## Self-Check: PASSED

All created files exist on disk and all commits are present in git history.

---
*Phase: 01-password-auth-and-cookie-sessions*
*Completed: 2026-03-28*
