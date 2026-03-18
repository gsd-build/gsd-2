---
id: T01
parent: S02
milestone: M011
provides:
  - web standalone file checks in validate-pack.js (server.js, manifest.json, sw.js)
key_files:
  - scripts/validate-pack.js
key_decisions:
  - none
patterns_established:
  - Extend requiredFiles array to gate new build outputs in the npm tarball
observability_surfaces:
  - "npm run validate-pack prints MISSING: <path> for each absent file, exits 1 on failure"
duration: 15m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Extend validate-pack.js with web standalone file checks

**Added dist/web/standalone/{server.js, public/manifest.json, public/sw.js} to the requiredFiles array in validate-pack.js so npm tarball validation covers the web host output from S01.**

## What Happened

The `requiredFiles` array in `scripts/validate-pack.js` was extended with three new entries that verify S01's web standalone output is included in the npm tarball: `dist/web/standalone/server.js` (Next.js standalone entry), `dist/web/standalone/public/manifest.json` (PWA manifest), and `dist/web/standalone/public/sw.js` (Serwist service worker). The array now has 6 required files total (3 original + 3 new).

The build and validation had to be run in the M011 worktree because the main repo checkout is on `main` which doesn't have S01's Serwist/manifest commits yet — those live on the `milestone/M011` branch.

Pre-flight observability gaps were also fixed: added `## Observability / Diagnostics` to `S02-PLAN.md` and `## Observability Impact` to `T01-PLAN.md`.

## Verification

- `npm run build:web-host` — exits 0, produces all three web standalone files
- `npm run validate-pack` — exits 0, output shows "Critical files present." with no MISSING lines
- `grep -q 'dist/web/standalone/server.js' scripts/validate-pack.js` — confirms the check was added

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run validate-pack` | 0 | ✅ pass | 44s |
| 2 | `grep -q 'dist/web/standalone/server.js' scripts/validate-pack.js` | 0 | ✅ pass | <1s |
| 3 | `npm run build:web-host` | 0 | ✅ pass | 13s |
| 4 | `ls dist/web/standalone/server.js dist/web/standalone/public/manifest.json dist/web/standalone/public/sw.js` | 0 | ✅ pass | <1s |

## Diagnostics

Run `npm run validate-pack` locally — it packs a tarball, lists contents, and checks each entry in the `requiredFiles` array. Missing files print `MISSING: <path>` to stdout and cause exit 1. No secrets or runtime state involved.

## Deviations

Previous session attempted to build and validate in the main repo directory (on `main` branch), which lacks S01's Serwist/manifest files. Switched to the M011 worktree where S01's commits live. The `validate-pack.js` edit was applied identically in both locations via git's shared working tree.

## Known Issues

None.

## Files Created/Modified

- `scripts/validate-pack.js` — added 3 web standalone entries to the `requiredFiles` array
- `.gsd/milestones/M011/slices/S02/S02-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M011/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section
