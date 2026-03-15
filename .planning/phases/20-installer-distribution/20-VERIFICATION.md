---
phase: 20-installer-distribution
verified: 2026-03-14T21:00:00Z
status: human_needed
score: 12/12 automated must-haves verified
re_verification: false
human_verification:
  - test: "Push to release/* branch and confirm GitHub Actions builds signed installers"
    expected: "All three matrix jobs complete; a draft GitHub Release is created with .dmg (macOS universal), .msi (Windows), and .AppImage + .deb (Linux) artifacts attached; no Gatekeeper warning on macOS install; no SmartScreen warning on Windows install"
    why_human: "Requires Apple Developer ID and GPG secrets configured in repo; actual CI execution cannot be verified locally; signed installer smoke-test requires macOS and Windows hardware"
  - test: "Build v1, publish v2 to GitHub Releases, launch v1"
    expected: "'Update ready — restart to apply' banner appears in the Sidebar footer within seconds of launch; clicking the banner triggers download and app restarts on new version"
    why_human: "Requires two deployed releases to compare version numbers; update check hits live GitHub Releases JSON endpoint; restart behavior cannot be verified without a running Tauri binary"
  - test: "Open docs/index.html in a browser at 375px viewport width (Chrome DevTools mobile emulation)"
    expected: "All three download buttons visible and stacked vertically; no horizontal overflow; headline and feature cards readable; footer present"
    why_human: "Responsive layout verification requires visual inspection — flexbox/grid wrapping behavior depends on rendered pixel widths"
  - test: "Enable GitHub Pages in repo settings (Source: GitHub Actions) and push a docs/** change to main"
    expected: "pages.yml workflow runs; page deploys to the GitHub Pages URL; download buttons link correctly to GitHub Releases artifacts"
    why_human: "GitHub Pages must be manually enabled in the repository settings UI before the deploy workflow can succeed — this is a one-time user action Claude cannot perform"
---

# Phase 20: Installer Distribution Verification Report

**Phase Goal:** Mission Control ships as a signed, auto-updating native installer for macOS and Windows with a public landing page — reproducible via GitHub Actions CI from a single `release/*` push
**Verified:** 2026-03-14T21:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pushing to a `release/*` branch triggers the GitHub Actions release workflow | VERIFIED | `.github/workflows/release.yml` line 5: `branches: ['release/*']`; `workflow_dispatch` also present |
| 2 | Workflow matrix builds on macos-latest, windows-latest, and ubuntu-22.04 | VERIFIED | Matrix include block confirmed at lines 17–22 of release.yml |
| 3 | Each runner uses `tauri-apps/tauri-action@v0` to produce platform-specific installers | VERIFIED | `tauri-apps/tauri-action@v0` step present; macOS uses `--target universal-apple-darwin`; args matrix wires platform-specific builds |
| 4 | A draft GitHub Release is created automatically with all artifacts attached | VERIFIED | `releaseDraft: true` in tauri-action `with` block; `tauri-action@v0` auto-uploads artifacts |
| 5 | macOS build wires APPLE_CERTIFICATE secret for code signing | VERIFIED | Apple cert import step gated on `matrix.platform == 'macos-latest'`; `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` all present in env |
| 6 | Windows build uses self-signed certificate (acceptable for v2.0 demo) | VERIFIED | `bundle.windows.certificateThumbprint: null` in tauri.conf.json; no WINDOWS_CERTIFICATE setup — self-signed fallback confirmed per user decision |
| 7 | Linux build GPG-signs the AppImage | VERIFIED | GPG sign step at end of release.yml; gated on `ubuntu-22.04`; uses `find src-tauri/target -name "*.AppImage"` |
| 8 | App checks for updates on every launch | VERIFIED | `useAppUpdater.ts` calls `invokeIfTauri('check_for_updates')` inside `useEffect([], [])` — runs on mount |
| 9 | Update check hits GitHub Releases JSON endpoint — zero infrastructure cost | VERIFIED | `plugins.updater.endpoints: ["https://github.com/gsd-build/gsd-2/releases/latest/download/latest.json"]` in tauri.conf.json |
| 10 | "Update ready — restart to apply" notification appears in Sidebar when update available | VERIFIED | `{updateReady && <div>...<button>...</button></div>}` rendered in Sidebar.tsx between Settings (line 139) and ConnectionStatus (line 182); GSD cyan `#5BC8F0` text confirmed |
| 11 | Landing page loads with headline and platform download buttons | VERIFIED | `docs/index.html` line 191: `<h1>Build real software without the noise.</h1>`; 3 download CTAs link to `github.com/gsd-build/gsd-2/releases/latest/download/{artifact}` |
| 12 | GitHub Pages deploy workflow triggers on push to main | VERIFIED | `.github/workflows/pages.yml` triggers on `push: branches: [main], paths: ['docs/**']` and `workflow_dispatch`; uses `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4` |

**Score:** 12/12 truths verified (automated)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/release.yml` | Complete release CI pipeline with matrix build and signing | VERIFIED | 114 lines; matrix: macos-latest/windows-latest/ubuntu-22.04; tauri-action@v0; releaseDraft:true; APPLE_CERTIFICATE env on macOS; TAURI_SIGNING_PRIVATE_KEY on all platforms |
| `src-tauri/tauri.conf.json` | Bundle config with signing stubs and updater endpoint | VERIFIED | `bundle.macOS.signingIdentity: null`, `bundle.windows.certificateThumbprint: null`, `bundle.linux` present; `plugins.updater.endpoints` wired to GitHub Releases |
| `src-tauri/Cargo.toml` | tauri-plugin-updater dependency | VERIFIED | `tauri-plugin-updater = "2"` and `tokio = { version = "1", features = ["rt"] }` present at lines 23–24 |
| `src-tauri/src/lib.rs` | updater plugin registered + check_for_updates/install_update IPC commands | VERIFIED | `tauri_plugin_updater::Builder::new().build()` at line 31; `check_for_updates` (line 94) and `install_update` (line 104) defined and added to `generate_handler![]` |
| `packages/mission-control/src/hooks/useAppUpdater.ts` | React hook exposing updateReady + installUpdate | VERIFIED | Exports `useAppUpdater`; `AppUpdaterState` interface exported; `invokeIfTauri` dynamic import pattern for Tauri/browser compatibility |
| `packages/mission-control/src/components/layout/Sidebar.tsx` | UpdateBanner between Settings and ConnectionStatus | VERIFIED | `useAppUpdater` imported at line 10; hook called at line 49; `updateReady` conditional block at lines 158–178; DOM order: Settings (139) → UpdateBanner (158) → ConnectionStatus (181) |
| `docs/index.html` | Single-file landing page with download CTAs | VERIFIED | 243 lines; all CSS inlined in `<style>` block; Google Fonts via CDN link; headline, 3 download buttons, feature grid, footer present |
| `.github/workflows/pages.yml` | GitHub Pages deployment workflow | VERIFIED | Triggers on `push: branches:[main], paths:['docs/**']`; deploys `docs/` via upload-pages-artifact + deploy-pages |
| `packages/mission-control/tests/release-workflow.test.ts` | 9 structural assertions for release workflow YAML | VERIFIED | All 9 tests pass (confirmed by `bun test` run: 9 pass, 0 fail) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/release.yml` | `src-tauri/` | `tauri build` via `tauri-apps/tauri-action@v0` | WIRED | `tauri-apps/tauri-action@v0` step present with `args: ${{ matrix.args }}`; matrix supplies `--target universal-apple-darwin` for macOS |
| `release.yml` | `APPLE_CERTIFICATE` GitHub secret | `env: APPLE_CERTIFICATE` in both macOS cert import step and tauri-action step | WIRED | Pattern `APPLE_CERTIFICATE` found on lines 69 and 92 of release.yml; cert import step present |
| `release.yml` | `TAURI_SIGNING_PRIVATE_KEY` GitHub secret | `env: TAURI_SIGNING_PRIVATE_KEY` in tauri-action step (all platforms) | WIRED | Lines 98–99 of release.yml; present in shared env block, not gated by platform |
| `useAppUpdater.ts` | `src-tauri/src/lib.rs` | `invoke('check_for_updates')` Tauri IPC | WIRED | `invokeIfTauri('check_for_updates')` in useEffect; `check_for_updates` IPC command registered in lib.rs generate_handler![] |
| `Sidebar.tsx` | `useAppUpdater` | `import { useAppUpdater } from '@/hooks/useAppUpdater'` | WIRED | Import at line 10 of Sidebar.tsx; hook destructured at line 49; `updateReady`, `installing`, `installUpdate` all consumed in JSX |
| `docs/index.html` download buttons | `https://github.com/gsd-build/gsd-2/releases/latest` | `href` linking to platform-specific artifact download URLs | WIRED | Three `href` attributes containing `releases/latest/download/` confirmed in index.html lines 196, 200, 204 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DIST-01 | 20-01-PLAN.md | GitHub Actions release pipeline — triggers on `release/*` push or manual dispatch; matrix macOS/Windows/Linux; produces `.dmg`, `.msi`+`.exe`, `.AppImage`+`.deb`; draft GitHub Release created | SATISFIED | `.github/workflows/release.yml` fully implements: trigger, 3-platform matrix, tauri-action@v0, releaseDraft:true |
| DIST-02 | 20-01-PLAN.md | Code signing — macOS: Apple Developer ID via GitHub secret; Windows: self-signed for v2.0; Linux: GPG signed AppImage | SATISFIED | macOS cert import step wired; `bundle.macOS.signingIdentity: null` (env-driven); `bundle.windows.certificateThumbprint: null` (self-signed); GPG step on ubuntu-22.04 |
| DIST-03 | 20-02-PLAN.md | Auto-update — Tauri updater plugin, check on launch, background download, "Update ready" notification in sidebar footer, GitHub Releases JSON endpoint | SATISFIED (automated checks) | tauri-plugin-updater wired; useAppUpdater hook checks on mount; UpdateBanner in Sidebar; GitHub Releases endpoint configured. Full end-to-end requires human verification with deployed releases |
| DIST-04 | 20-03-PLAN.md | Landing page — GSD branding, headline, download buttons linking to latest GitHub Release, "Powered by GSD 2", responsive | SATISFIED (automated checks) | docs/index.html present with all required content; pages.yml deploys on push to main. Mobile responsiveness and live Pages deploy require human verification |

All four requirement IDs declared across plans (DIST-01, DIST-02, DIST-03, DIST-04) are accounted for. No orphaned requirements found — REQUIREMENTS.md traceability table marks all four DIST-* as Complete for Phase 20.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/index.html` | 217 | `Screenshot coming soon — build with npm run tauri:build` | Info | Intentional placeholder for pre-release page; does not block any download CTA or landing page goal; expected to be replaced after first successful `tauri:build` |

No blocker or warning-level anti-patterns found. The screenshot placeholder is the only item and does not affect goal achievement — all CTAs, headline, features, and footer are fully present.

---

## Human Verification Required

### 1. Signed installer smoke-test

**Test:** Push a branch named `release/v2.0-test` to the remote, wait for GitHub Actions to complete all three matrix jobs.
**Expected:** Draft release created with `.dmg` (macOS universal), `.msi` (Windows x64), `.AppImage` and `.deb` (Linux) attached. Download and install `.dmg` on macOS — no Gatekeeper warning if APPLE_CERTIFICATE secret is configured. Download and install `.msi` on Windows — expected SmartScreen warning is acceptable for v2.0 (self-signed by design).
**Why human:** Requires GitHub Actions to execute with real secrets (APPLE_CERTIFICATE, TAURI_SIGNING_PRIVATE_KEY etc.) and requires macOS + Windows hardware for installer smoke-test.

### 2. Auto-update end-to-end

**Test:** Build and install v1.0. Push v2.0 to GitHub Releases with a valid `latest.json` signed by `TAURI_SIGNING_PRIVATE_KEY`. Launch the v1.0 app.
**Expected:** "Update ready — restart to apply" banner appears in the sidebar footer within seconds of app launch. Clicking the banner shows "Installing…", then the app restarts on v2.0.
**Why human:** Requires two deployed GitHub Releases and a running Tauri binary; the update check hits a live network endpoint; restart behaviour cannot be validated statically.

### 3. Landing page mobile layout

**Test:** Open `docs/index.html` in Chrome DevTools at 375px viewport width.
**Expected:** All three download buttons visible (vertically stacked via flex-wrap); no horizontal overflow; `h1` headline readable at clamped font-size; feature grid single-column; footer wraps cleanly.
**Why human:** Flexbox `flex-wrap: wrap` and CSS Grid `repeat(auto-fit, minmax(240px, 1fr))` responsive behaviour requires rendered pixel widths to verify — cannot be confirmed by static file inspection alone.

### 4. GitHub Pages live deploy

**Pre-requisite (user action):** Enable GitHub Pages in repository Settings → Pages → Source → "GitHub Actions".
**Test:** Push any change to `docs/` on the `main` branch. Wait for the `pages.yml` workflow to complete.
**Expected:** `pages.yml` workflow runs and reports success; the published GitHub Pages URL loads the landing page with the GSD palette, headline, and download CTAs.
**Why human:** Requires the one-time manual Pages enablement step in GitHub repo settings; Claude cannot perform this programmatically.

---

## Gaps Summary

No automated gaps. All 12 observable truths verified, all 9 artifacts confirmed substantive and wired, all 4 requirement IDs satisfied. The four items flagged for human verification are inherently untestable statically — they require either CI secret execution, live network endpoints, rendered browser viewports, or a one-time UI action in GitHub settings.

---

_Verified: 2026-03-14T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
