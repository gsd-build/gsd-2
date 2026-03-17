---
id: T01
parent: S02
milestone: M005
provides:
  - Light/dark status color pairs in 4 highest-impact GSD component files
key_files:
  - web/components/gsd/command-surface.tsx
  - web/components/gsd/visualizer-view.tsx
  - web/components/gsd/diagnostics-panels.tsx
  - web/components/gsd/remaining-command-panels.tsx
key_decisions: []
patterns_established:
  - "Mechanical pattern: text-COLOR-400 → text-COLOR-600 dark:text-COLOR-400; text-COLOR-300 → text-COLOR-600 dark:text-COLOR-300; fractional opacity variants like text-red-400/80 → text-red-600/80 dark:text-red-400/80; modifier-prefixed patterns like hover:text-red-400 → hover:text-red-600 dark:hover:text-red-400"
observability_surfaces:
  - "rg 'text-(emerald|amber|red|blue)-(300|400)' <file> | grep -v 'dark:' — empty means fully converted"
duration: 10m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Fix Hardcoded Status Colors in High-Impact Components

**Converted ~94 hardcoded dark-mode-only status color utilities to light/dark pairs across 4 files**

## What Happened

Applied a mechanical 1:1 transformation to all `text-emerald-400`, `text-amber-400`, `text-amber-300`, `text-red-400`, and `text-blue-400` instances in the 4 highest-impact component files. Each instance was converted to a light-mode base class + `dark:` variant pair (e.g., `text-emerald-600 dark:text-emerald-400`).

The transformation correctly handled:
- Bare class instances (`text-red-400` → `text-red-600 dark:text-red-400`)
- Fractional opacity variants (`text-red-400/80` → `text-red-600/80 dark:text-red-400/80`)
- Modifier-prefixed patterns (`hover:text-red-400` → `hover:text-red-600 dark:hover:text-red-400`, `group-hover:text-emerald-400` → `group-hover:text-emerald-600 dark:group-hover:text-emerald-400`)
- Left `bg-*` and `border-*` patterns untouched (translucent backgrounds work in both themes)
- `text-amber-300` mapped to `text-amber-600 dark:text-amber-300` (consistent 600 base for light mode)

## Verification

- Per-file grep `rg "text-(emerald|amber|red|blue)-(300|400)" <file> | grep -v "dark:"` returns empty for all 4 files — **PASS**
- `npm run build` exits 0 — **PASS**

### Slice-level verification (partial — T01 is intermediate task):
| Check | Status | Notes |
|-------|--------|-------|
| emerald-400 without dark: pair | PARTIAL | 4 target files clean; 13 remaining in T02 files |
| amber-400 without dark: pair | PARTIAL | 4 target files clean; 11 remaining in T02 files |
| amber-300 without dark: pair | PARTIAL | 4 target files clean; 4 remaining in T02 files |
| red-400 without dark: pair | PARTIAL | 4 target files clean; 7 remaining in T02 files |
| blue-400 without dark: pair | PARTIAL | 4 target files clean; 2 remaining in T02 files |
| Total unmatched | 44 | All in T02 scope files |
| npm run build | PASS | |
| npm run build:web-host | NOT RUN | T03 verification task |

## Diagnostics

Inspect converted status with: `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — any output reveals unmatched dark-mode-only instances. For per-file checks, target a specific file path.

## Deviations

None — the plan was followed exactly.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/command-surface.tsx` — converted ~34 status color instances to light/dark pairs
- `web/components/gsd/visualizer-view.tsx` — converted ~14 status color instances to light/dark pairs
- `web/components/gsd/diagnostics-panels.tsx` — converted ~18 status color instances to light/dark pairs
- `web/components/gsd/remaining-command-panels.tsx` — converted ~14 status color instances to light/dark pairs
- `.gsd/milestones/M005/slices/S02/S02-PLAN.md` — added Observability/Diagnostics section and failure-path verification check
- `.gsd/milestones/M005/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section
