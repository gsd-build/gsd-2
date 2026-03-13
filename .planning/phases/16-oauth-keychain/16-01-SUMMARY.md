---
phase: 16-oauth-keychain
plan: "01"
subsystem: auth
tags: [rust, tauri, oauth, pkce, keychain, reqwest, sha2, base64]

requires:
  - phase: 15-tauri-shell
    provides: commands.rs, lib.rs, keyring integration, gsd:// URI scheme stub

provides:
  - PKCE S256 code challenge generation (generate_pkce)
  - OAuth URL builders for Anthropic and GitHub Copilot
  - Token exchange and refresh via reqwest
  - ~/.gsd/auth.json writer/deleter
  - 7 Tauri IPC commands: get_active_provider, start_oauth, complete_oauth, save_api_key, get_provider_status, change_provider, check_and_refresh_token
  - gsd://oauth/callback handler that emits oauth-callback event to frontend

affects:
  - 16-02 (TypeScript auth-api.ts calls these commands)
  - 17 (auth state used across app)
  - 18 (depends on 16 + 17)

tech-stack:
  added:
    - reqwest 0.12 (json + rustls-tls, no default features)
    - base64 0.22
    - sha2 0.10
    - rand 0.8
  patterns:
    - Rust async commands with Option/bool returns (never panic, eprintln! errors)
    - PKCE S256: 32 random bytes -> base64url verifier; SHA-256(verifier) -> base64url challenge
    - ISO 8601 date arithmetic without chrono dep (ymd_to_days / days_to_ymd Euclidean calendar)
    - Keychain keys scoped under service "gsd-mission-control"

key-files:
  created:
    - src-tauri/src/oauth.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "reqwest rustls-tls (not native-tls) chosen for cross-platform TLS without OS cert store dependency"
  - "rand 0.8 added (not 0.9) for RngCore::fill_bytes compatibility with existing Tauri dependency tree"
  - "ISO 8601 parsing/formatting implemented without chrono to avoid new heavy dependency — Euclidean calendar algorithm"
  - "UriSchemeContext does not implement Emitter directly; app.app_handle().emit() required (Rule 1 auto-fix during Task 5)"
  - "pkce_verifier_{state} keychain key scoped by state param to support concurrent OAuth flows"

requirements-completed: [AUTH-02, AUTH-03, AUTH-05]

duration: 43min
completed: "2026-03-13"
---

# Phase 16 Plan 01: Rust OAuth Backend Summary

**PKCE S256 OAuth flow, keychain token storage, and gsd://oauth/callback event emission wired into Tauri 2 via reqwest + sha2 + base64**

## Performance

- **Duration:** 43 min
- **Started:** 2026-03-13T17:28:18Z
- **Completed:** 2026-03-13T18:11:34Z
- **Tasks:** 5
- **Files modified:** 4 (Cargo.toml, oauth.rs new, commands.rs, lib.rs)

## Accomplishments

- `oauth.rs` created with full PKCE generation (S256), Anthropic/GitHub Copilot auth URL builders, async token exchange, async token refresh, and `~/.gsd/auth.json` writer
- 7 new Tauri IPC commands added to `commands.rs`: OAuth flow commands + provider status + token refresh check
- `lib.rs` updated to replace stub gsd:// handler with real one that parses code+state and emits `oauth-callback` event to frontend
- All 7 commands registered in `invoke_handler![]`; `cargo check` exits 0

## Task Commits

1. **Task 16-01-01: Add dependencies** - `7a46f33` (chore)
2. **Task 16-01-02: Create oauth.rs** - `78359ab` (feat)
3. **Task 16-01-03: Add IPC commands to commands.rs** - `b0323ea` (feat)
4. **Task 16-01-04: Update lib.rs** - `80182ab` (feat)
5. **Task 16-01-05: Verification + emit fix** - `7918629` (fix)

## Files Created/Modified

- `src-tauri/Cargo.toml` - Added reqwest 0.12 (json+rustls-tls), base64 0.22, sha2 0.10, rand 0.8
- `src-tauri/src/oauth.rs` - PKCE generation, auth URL builders, token exchange/refresh, auth.json I/O
- `src-tauri/src/commands.rs` - 7 new OAuth commands + result structs + ISO 8601 helpers
- `src-tauri/src/lib.rs` - mod oauth, real gsd:// callback handler, 7 new commands in invoke_handler

## Decisions Made

- Used `rustls-tls` (not `native-tls`) for reqwest to avoid OpenSSL/OS cert store dependency on Windows
- Added `rand 0.8` (not 0.9) to match what Tauri's own dependency graph resolves to, avoiding duplicate rand versions
- Implemented ISO 8601 parsing and formatting without `chrono` — used a pure arithmetic Euclidean calendar algorithm to keep the dependency footprint minimal
- `pkce_verifier_{state}` keychain key scoped per state string to handle concurrent OAuth flows without collision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UriSchemeContext does not implement Emitter — use app.app_handle().emit()**
- **Found during:** Task 5 (cargo check verification)
- **Issue:** `app` inside `register_uri_scheme_protocol` closure is `UriSchemeContext<'_, R>`, which does not implement `tauri::Emitter`. Calling `app.emit()` directly fails to compile.
- **Fix:** Changed `app.emit("oauth-callback", params)` to `app.app_handle().emit("oauth-callback", params)` — `app_handle()` returns the real `AppHandle` which does implement `Emitter`.
- **Files modified:** `src-tauri/src/lib.rs`
- **Verification:** `cargo check` exits 0 after fix
- **Committed in:** `7918629`

---

**Total deviations:** 1 auto-fixed (Rule 1 — compile error / bug)
**Impact on plan:** Required fix; no scope creep. Single-line change, semantically identical to plan intent.

## Issues Encountered

- First `cargo check` run aborted with "not enough space on disk" (C: drive had only 236MB free). Fixed by running `cargo clean` (freed 5.5 GiB of stale artifacts) before retrying. Compilation succeeded on second attempt.

## Next Phase Readiness

- All Rust OAuth infrastructure is in place; plan 16-02 TypeScript auth API layer (`auth-api.ts`, `useAuthGuard`, `useTokenRefresh`) can now call these commands via `invoke()`
- `oauth-callback` event is emitted on successful gsd:// callback — frontend listener in 16-02 hooks up to it

## Self-Check: PASSED

- src-tauri/src/oauth.rs: FOUND
- src-tauri/src/commands.rs: FOUND
- src-tauri/src/lib.rs: FOUND
- .planning/phases/16-oauth-keychain/16-01-SUMMARY.md: FOUND
- Commits 7a46f33, 78359ab, b0323ea, 80182ab, 7918629: all FOUND

---
*Phase: 16-oauth-keychain*
*Completed: 2026-03-13*
