---
phase: 15-tauri-shell
plan: "05"
subsystem: infra
tags: [tauri, rust, desktop, build-pipeline, windows]

# Dependency graph
requires:
  - phase: 15-04
    provides: IPC commands (folder dialog, keychain, open_external, get_platform, restart_bun, retry_dep_check)
  - phase: 15-03
    provides: dep_check.rs and dep_screen.html for dependency gating
  - phase: 15-02
    provides: bun_manager.rs for Bun lifecycle management
  - phase: 15-01
    provides: src-tauri/ scaffold, Cargo.toml, tauri.conf.json, lib.rs builder chain
provides:
  - "tauri:dev npm script at repo root — single command opens native desktop window"
  - "tauri:build npm script for production installer bundling"
  - "build script in packages/mission-control/package.json for bun bundle step"
  - "Human-verified SC-1: native Tauri window opens and renders Mission Control at http://localhost:4000"
affects: [16-updater, 17-packaging, 20-release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "beforeDevCommand in tauri.conf.json starts Bun before Tauri opens the webview window"
    - "tauri:dev delegates to tauri CLI which reads src-tauri/tauri.conf.json from repo root"
    - "Generated icons/ directory committed to satisfy tauri-build requirement"
    - "Tauri 2 traits (Emitter, Manager) require explicit use imports — not re-exported from tauri prelude"

key-files:
  created:
    - "src-tauri/icons/ — generated placeholder icons required by tauri-build"
  modified:
    - "package.json — tauri:dev and tauri:build scripts added"
    - "packages/mission-control/package.json — build script added"
    - "src-tauri/tauri.conf.json — removed invalid plugins.window-state JSON block"
    - "src-tauri/src/bun_manager.rs — added use tauri::Emitter"
    - "src-tauri/src/dep_check.rs — added use tauri::Emitter"
    - "src-tauri/src/lib.rs — added use tauri::Manager; fixed StateFlags::ALL to StateFlags::all()"
    - "src-tauri/Cargo.toml — fixed keyring feature windows-native"

key-decisions:
  - "StateFlags::ALL (constant) is not valid — correct call is StateFlags::all() (bitflags method)"
  - "keyring crate feature on Windows is windows-native, not default-credential"
  - "plugins.window-state JSON block in tauri.conf.json is not a valid Tauri 2 config key — removed; plugin registered in Rust Builder chain only"
  - "tauri::Emitter and tauri::Manager must be explicitly imported in any file calling app.emit() or app.get_webview_window()"
  - "SC-2 through SC-5 deferred as acceptable for M2: Bun kill on close, dep screen, window-state restore, tauri:build installer"

patterns-established:
  - "Tauri 2 trait imports (Emitter, Manager) must be explicit — not available via wildcard use tauri::*"

requirements-completed:
  - TAURI-06

# Metrics
duration: 45min
completed: 2026-03-13
---

# Phase 15 Plan 05: Build Pipeline + Human Verify Summary

**tauri:dev and tauri:build npm scripts wired; SC-1 human-verified — native Tauri window opens Mission Control on Windows after fixing Emitter/Manager imports, StateFlags::all(), keyring feature flag, and removing invalid tauri.conf.json block**

## Performance

- **Duration:** ~45 min (Task 1 scripting + fix iteration during verification)
- **Started:** 2026-03-13T12:05:00Z
- **Completed:** 2026-03-13T13:00:00Z
- **Tasks:** 2 of 2 complete
- **Files modified:** 8

## Accomplishments

- Added `tauri:dev` and `tauri:build` to root `package.json` — single-command desktop launch from repo root
- Added `build` script to `packages/mission-control/package.json` for production Bun bundle step
- Fixed 6 Rust/config compile errors that prevented the window from opening (committed as `39dd6cf`)
- SC-1 human-verified: `npm run tauri:dev` opens a native Tauri window rendering Mission Control at http://localhost:4000

## Task Commits

Each task was committed atomically:

1. **Task 1: Add tauri:dev and tauri:build scripts** - `713e2b9` (chore)
2. **Task 2: Fix Rust compile errors + SC-1 verified** - `39dd6cf` (fix)

**Prior checkpoint docs commit:** `88f022e` (docs — awaiting human-verify)

## Files Created/Modified

- `package.json` — `tauri:dev` and `tauri:build` scripts added at repo root
- `packages/mission-control/package.json` — `build` script: `bun build src/frontend.tsx --outdir public/dist --target browser`
- `src-tauri/tauri.conf.json` — removed invalid `plugins.window-state` JSON block (plugin registered in Rust, not JSON config)
- `src-tauri/src/bun_manager.rs` — added `use tauri::Emitter` for `app.emit()` calls
- `src-tauri/src/dep_check.rs` — added `use tauri::Emitter` for `app.emit()` calls
- `src-tauri/src/lib.rs` — added `use tauri::Manager`; changed `StateFlags::ALL` to `StateFlags::all()`
- `src-tauri/Cargo.toml` — fixed keyring feature: `default-credential` → `windows-native`
- `src-tauri/icons/` — generated placeholder icons directory (required by tauri-build)

## Decisions Made

- `StateFlags::ALL` is not a valid associated constant on the bitflags type — `StateFlags::all()` is the correct bitflags method
- `keyring` on Windows requires the `windows-native` feature, not `default-credential`
- `plugins.window-state` is not a valid top-level key in `tauri.conf.json` (Tauri 2) — plugin config lives entirely in the Rust Builder chain
- `tauri::Emitter` and `tauri::Manager` traits must be explicitly imported in every file that calls `.emit()` or `.get_webview_window()`; they are not re-exported from the tauri prelude
- SC-2 through SC-5 deferred as acceptable for M2: Bun kill on close, dep screen, window-state position restore, and `tauri:build` installer production

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing `use tauri::Emitter` in bun_manager.rs**
- **Found during:** Task 2 (verification — Rust compile error)
- **Issue:** `app.emit()` calls in bun_manager.rs failed to compile — `Emitter` trait not in scope
- **Fix:** Added `use tauri::Emitter;` to bun_manager.rs
- **Files modified:** `src-tauri/src/bun_manager.rs`
- **Verification:** Cargo build succeeded
- **Committed in:** `39dd6cf`

**2. [Rule 1 - Bug] Missing `use tauri::Emitter` in dep_check.rs**
- **Found during:** Task 2 (verification — Rust compile error)
- **Issue:** `app.emit()` calls in dep_check.rs failed to compile — `Emitter` trait not in scope
- **Fix:** Added `use tauri::Emitter;` to dep_check.rs
- **Files modified:** `src-tauri/src/dep_check.rs`
- **Verification:** Cargo build succeeded
- **Committed in:** `39dd6cf`

**3. [Rule 1 - Bug] Missing `use tauri::Manager` in lib.rs**
- **Found during:** Task 2 (verification — Rust compile error)
- **Issue:** `app.get_webview_window()` call in lib.rs failed — `Manager` trait not in scope
- **Fix:** Added `use tauri::Manager;` to lib.rs
- **Files modified:** `src-tauri/src/lib.rs`
- **Verification:** Cargo build succeeded
- **Committed in:** `39dd6cf`

**4. [Rule 1 - Bug] `StateFlags::ALL` → `StateFlags::all()`**
- **Found during:** Task 2 (verification — Rust compile error)
- **Issue:** `StateFlags::ALL` is not a valid associated constant on the window-state bitflags type
- **Fix:** Changed `StateFlags::ALL` to `StateFlags::all()` in lib.rs
- **Files modified:** `src-tauri/src/lib.rs`
- **Verification:** Cargo build succeeded; window-state plugin initialises correctly
- **Committed in:** `39dd6cf`

**5. [Rule 1 - Bug] Removed invalid `plugins.window-state` block from tauri.conf.json**
- **Found during:** Task 2 (verification — tauri CLI parse/reject)
- **Issue:** `plugins.window-state` is not a recognised Tauri 2 config key; tauri CLI rejected the config
- **Fix:** Removed the JSON block; window-state is fully configured via Rust Builder chain
- **Files modified:** `src-tauri/tauri.conf.json`
- **Verification:** `tauri dev` parsed config without errors
- **Committed in:** `39dd6cf`

**6. [Rule 1 - Bug] Fixed keyring Cargo feature: `default-credential` → `windows-native`**
- **Found during:** Task 2 (verification — Cargo feature resolution error)
- **Issue:** `keyring` crate does not have a `default-credential` feature for Windows target
- **Fix:** Updated `[target.'cfg(target_os = "windows")'.dependencies]` keyring entry to `features = ["windows-native"]`
- **Files modified:** `src-tauri/Cargo.toml`
- **Verification:** Cargo build succeeded; keyring compiled on Windows
- **Committed in:** `39dd6cf`

**7. [Rule 3 - Blocking] Added generated `icons/` directory**
- **Found during:** Task 2 (verification — tauri-build panic on missing icons)
- **Issue:** `tauri-build` panics at startup when `src-tauri/icons/` does not exist
- **Fix:** Generated default icon set and committed `src-tauri/icons/`
- **Files modified:** `src-tauri/icons/` (new directory)
- **Verification:** `tauri dev` proceeded past build step without panic
- **Committed in:** `39dd6cf`

---

**Total deviations:** 7 auto-fixed (6 Rule 1 bugs, 1 Rule 3 blocking)
**Impact on plan:** All auto-fixes were required for the Rust crate to compile and the Tauri window to open. No scope creep. SC-2 through SC-5 explicitly deferred as M2-acceptable.

## Issues Encountered

Tauri 2 trait visibility is stricter than Tauri 1 — `Emitter` and `Manager` are not re-exported via the prelude, requiring explicit `use` imports in every consuming module. This was the root cause of 3 of the 7 fixes applied during verification.

## User Setup Required

None — no further external service configuration required. Rust toolchain and Tauri CLI are standard developer prerequisites already present.

## Next Phase Readiness

- Phase 15 (Tauri Shell) is complete for M2 milestone — SC-1 verified, native window opens and renders Mission Control
- SC-2 (Bun kill on close), SC-3 (dep screen), SC-4 (window-state restore), SC-5 (`tauri:build` installer) deferred to a future cleanup pass
- Phase 16 (updater) and Phase 17 (packaging) can proceed — the Tauri shell foundation is functional
- First production build will need production-quality icons before `tauri:build` output is distributable

---
*Phase: 15-tauri-shell*
*Completed: 2026-03-13*
