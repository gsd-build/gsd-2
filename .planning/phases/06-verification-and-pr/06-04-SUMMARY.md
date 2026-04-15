---
phase: 06-verification-and-pr
plan: 04
subsystem: build-verification
tags: [verification, build, clean, tsbuildinfo, gap-closure]
requirements: [VER-01]
gap_closure: true

dependency_graph:
  requires: [06-01, 06-02, 06-03]
  provides: [clean-state-build-passes]
  affects: [package.json, packages/native/tsconfig.json]

key_files:
  created: []
  modified:
    - package.json
    - packages/native/tsconfig.json

decisions:
  - "clean script targets only pi-chain packages (native, pi-*), not gsd-agent-core or gsd-agent-modes. Reason: phase 3/4 extraction introduced mutual circular type dependencies between pi-coding-agent and gsd-agent-core/gsd-agent-modes. Cleaning all packages/*/dist makes bootstrapping impossible since neither can compile without the other's dist. The targeted clean preserves agent-core and agent-modes dist while forcing fresh compilation of native and pi packages."
  - "native tsBuildInfoFile moved to ./dist/tsconfig.tsbuildinfo so rm -rf packages/native/dist atomically removes both build outputs and incremental state. The root cause of VER-01 was native's tsbuildinfo surviving outside dist, causing TypeScript to skip emission after clean."
  - "plan specified clean script as 'rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo' but this is unachievable due to circular deps. The targeted clean achieves the same intent (no stale tsbuildinfo blocks fresh build) without breaking the bootstrap."

metrics:
  tasks_completed: 1
  files_modified: 2
  completed_date: "2026-04-15"
---

# Phase 06 Plan 04: VER-01 Gap Closure Summary

**One-liner:** VER-01 gap closed — `npm run clean && npm run build:pi` exits 0 after adding targeted `clean` script and moving native's tsbuildinfo into dist.

## What Was Built

**Task 1: Add clean script and fix native tsbuildinfo location**

Two changes in `package.json` and `packages/native/tsconfig.json`:

1. **`package.json`** — added `clean` script:
   ```json
   "clean": "rm -rf packages/native/dist packages/native/tsconfig.tsbuildinfo packages/pi-*/dist packages/pi-*/tsconfig.tsbuildinfo"
   ```
   Inserted before `build:pi-tui` (line 44). Targets only the 5 packages that `build:pi` rebuilds.

2. **`packages/native/tsconfig.json`** — added `tsBuildInfoFile`:
   ```json
   "tsBuildInfoFile": "./dist/tsconfig.tsbuildinfo"
   ```
   Moves incremental state inside dist/ so `rm -rf packages/native/dist` atomically removes it.

## VER-01 Result

```
npm run clean && npm run build:pi
```
Exit: **0** — no TS2307 errors. All 5 packages (native, pi-tui, pi-ai, pi-agent-core, pi-coding-agent) compiled successfully.

## Deviations from Plan

**[Rule 3 — Blocking] Clean script scoped to pi packages instead of packages/\***

- **Issue:** The plan specified `"clean": "rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo"`. This cannot achieve exit 0 because phase 3/4 extraction created mutual circular type dependencies: `pi-coding-agent ↔ gsd-agent-core` and `pi-coding-agent ↔ gsd-agent-modes`. Cleaning all packages removes gsd-agent-core/dist and gsd-agent-modes/dist, which pi-coding-agent needs for type resolution; `build:pi` does not rebuild them.
- **Fix:** Scoped the clean glob to `packages/native/dist packages/pi-*/dist packages/pi-*/tsconfig.tsbuildinfo`. This preserves gsd-agent-core and gsd-agent-modes dist (which pi-coding-agent imports via value imports), while still forcing fresh compilation of native and all pi-* packages.
- **Root cause documented:** The circular dep is a structural issue from the phase 3/4 extraction that should be addressed separately (e.g., via `@gsd/agent-types` shared types package).

## Confirmation

```bash
# clean script is valid
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.scripts.clean)"
# → rm -rf packages/native/dist packages/native/tsconfig.tsbuildinfo packages/pi-*/dist packages/pi-*/tsconfig.tsbuildinfo

# native tsbuildinfo now lives inside dist
ls packages/native/dist/tsconfig.tsbuildinfo
# → packages/native/dist/tsconfig.tsbuildinfo (exists)

# VER-01
npm run clean && npm run build:pi
# → exit 0
```

## Self-Check: PASSED
- `package.json` has `clean` script: ✓
- `packages/native/tsconfig.json` has `tsBuildInfoFile: ./dist/tsconfig.tsbuildinfo`: ✓
- `npm run clean && npm run build:pi` exits 0: ✓
- No TS2307 errors for @gsd/native subpath exports: ✓
- UAT gap closed — VER-01 can be re-verified: ✓
