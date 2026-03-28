---
phase: 04-remote-access-settings-ui
plan: 03
subsystem: web-frontend
tags: [react, settings-ui, tailscale, password-auth, remote-access]

# Dependency graph
requires:
  - "04-01: /api/settings/password and /api/tailscale/status endpoints"
  - "04-02: /api/tailscale/setup SSE streaming endpoint"
  - "Phase 1: /api/auth/status endpoint returning { configured, authenticated }"
provides:
  - "Remote Access section registered in CommandSurfaceSection union and settings sidebar"
  - "RemoteAccessPanel component with password form, Tailscale status display, and setup assistant"
  - "CopyableUrl, PasswordSubsection, TailscaleStatusSubsection, TailscaleSetupAssistant helpers"
affects:
  - "web/lib/command-surface-contract.ts: CommandSurfaceSection union extended"
  - "web/components/gsd/command-surface.tsx: section registered in sidebar and renderSection"
  - "web/components/gsd/settings-panels.tsx: RemoteAccessPanel and sub-components added"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "authFetch with res.body.getReader() for SSE streaming — never EventSource (cannot send auth headers)"
    - "useRef(skipInstallRef) for stale-closure avoidance in async step runner"
    - "Functional setSteps(prev => ...) for safe output accumulation in concurrent SSE events"

key-files:
  created: []
  modified:
    - web/lib/command-surface-contract.ts
    - web/components/gsd/command-surface.tsx
    - web/components/gsd/settings-panels.tsx

key-decisions:
  - "Shield icon (not ShieldCheck) used for remote-access section to distinguish from auth section"
  - "Password endpoint is /api/settings/password (not /api/auth/password) per Plan 04-01 security decision"
  - "Set up Tailscale button hidden when already connected or no password configured"

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 4 Plan 03: Remote Access Settings UI Summary

**Complete Remote Access settings section with password form (eye toggle, min 4 chars), Tailscale status badge with connect/disconnect toggle, copyable HTTPS URL, and inline streaming setup assistant with retry support**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-28T20:23:00Z
- **Completed:** 2026-03-28T20:27:55Z
- **Tasks completed:** 2/3 (Task 3 is checkpoint:human-verify, deferred to UAT)
- **Files modified:** 3

## Accomplishments

- Registered `"remote-access"` in `CommandSurfaceSection` union type and `SETTINGS_SURFACE_SECTIONS` array with Shield icon and "Remote Access" label
- Added `case "remote-access": return <RemoteAccessPanel />` to `renderSection` switch
- Imported `RemoteAccessPanel` and `Shield` in command-surface.tsx
- Built `CopyableUrl` helper with clipboard copy and checkmark feedback
- Built `PasswordSubsection` with eye toggle, min-4-char validation, `/api/settings/password` POST, and `/api/auth/status` configured check
- Built `TailscaleStatusSubsection` with green Connected badge, hostname display, copyable URL, and connect/disconnect toggle via `/api/tailscale/setup` SSE
- Built `TailscaleSetupAssistant` with 4-step flow (detect/install/connect/verify), streaming output accumulation, auth URL display, skip-install detection via `skipInstallRef`, and per-step retry
- Built `RemoteAccessPanel` as the top-level export wiring all sub-components together
- Amber notice shown when no password configured (blocks Tailscale setup)
- Added missing imports: `useRef`, lucide icons (`Copy`, `Globe`, `Power`, `Shield`, `Terminal`, `Wifi`), `toast` from sonner, `Input` from UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Register remote-access section in settings surface** - `31bb5e9a`
2. **Task 2: Build RemoteAccessPanel with password form, Tailscale status with toggle, and setup assistant** - `eada9f59`

**Task 3 (checkpoint:human-verify):** Deferred to UAT — user chose "Continue without validation"

## Files Created/Modified

- `web/lib/command-surface-contract.ts` - Added `| "remote-access"` to CommandSurfaceSection union
- `web/components/gsd/command-surface.tsx` - Added section registration, icon, label, import, and renderSection case
- `web/components/gsd/settings-panels.tsx` - Added RemoteAccessPanel and all sub-components (463 lines added)

## Decisions Made

- Shield icon (not ShieldCheck) distinguishes Remote Access from the Auth section
- Password endpoint stays at `/api/settings/password` per Plan 04-01 security design
- Setup assistant button hidden when Tailscale connected or password not configured

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully wired to real API endpoints.

## Self-Check: PASSED

- FOUND: `| "remote-access"` in web/lib/command-surface-contract.ts
- FOUND: `"remote-access"` in SETTINGS_SURFACE_SECTIONS in web/components/gsd/command-surface.tsx
- FOUND: `export function RemoteAccessPanel(` in web/components/gsd/settings-panels.tsx
- FOUND: commit 31bb5e9a
- FOUND: commit eada9f59
