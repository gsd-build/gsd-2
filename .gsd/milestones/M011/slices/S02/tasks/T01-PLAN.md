---
estimated_steps: 3
estimated_files: 1
---

# T01: Extend validate-pack.js with web standalone file checks

**Slice:** S02 — Web CI Workflow & Packaging Verification
**Milestone:** M011

## Description

The existing `scripts/validate-pack.js` validates that critical files are present in the npm tarball before publishing. It currently checks for `dist/loader.js`, `packages/pi-coding-agent/dist/index.js`, and `scripts/link-workspace-packages.cjs`. S01 added the full Serwist + Next.js standalone build chain, which produces `dist/web/standalone/` via `stage-web-standalone.cjs`. This task extends the required-files list so the packaging pipeline also proves the web host is included (R131).

## Steps

1. Open `scripts/validate-pack.js` and locate the `requiredFiles` array (around line 60).
2. Add three new entries to the array:
   - `'dist/web/standalone/server.js'` — the Next.js standalone server entry point
   - `'dist/web/standalone/public/manifest.json'` — the PWA manifest (from S01)
   - `'dist/web/standalone/public/sw.js'` — the Serwist service worker (from S01)
3. Run `npm run validate-pack` and confirm exit 0 with no MISSING lines.

## Must-Haves

- [ ] `requiredFiles` array includes `dist/web/standalone/server.js`
- [ ] `requiredFiles` array includes `dist/web/standalone/public/manifest.json`
- [ ] `requiredFiles` array includes `dist/web/standalone/public/sw.js`
- [ ] `npm run validate-pack` exits 0

## Verification

- `npm run validate-pack` exits 0
- Output contains "Critical files present." with no "MISSING" lines
- `grep 'dist/web/standalone/server.js' scripts/validate-pack.js` returns a match

## Inputs

- `scripts/validate-pack.js` — existing script with `requiredFiles` array to extend
- `dist/web/standalone/` — S01 already built this output; files exist in the worktree

## Expected Output

- `scripts/validate-pack.js` — updated with 3 new entries in the `requiredFiles` array (total 6 required files)
