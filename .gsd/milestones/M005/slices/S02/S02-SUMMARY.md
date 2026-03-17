---
id: S02
parent: M005
milestone: M005
provides:
  - All dark-mode-only Tailwind status colors converted to light/dark pairs across 18 GSD component files
  - Zero unmatched text-{emerald,amber,red,blue}-{300,400} instances in web/components/gsd/
  - Both npm run build and npm run build:web-host passing after color audit
  - Visual verification of all major surfaces in both light and dark themes
requires:
  - slice: S01
    provides: Working ThemeProvider, NavRail toggle, CSS variable light/dark split
affects: []
key_files:
  - web/components/gsd/command-surface.tsx
  - web/components/gsd/visualizer-view.tsx
  - web/components/gsd/diagnostics-panels.tsx
  - web/components/gsd/remaining-command-panels.tsx
  - web/components/gsd/settings-panels.tsx
  - web/components/gsd/knowledge-captures-panel.tsx
  - web/components/gsd/activity-view.tsx
  - web/components/gsd/status-bar.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/onboarding/step-optional.tsx
  - web/components/gsd/onboarding/step-provider.tsx
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/roadmap.tsx
  - web/components/gsd/shell-terminal.tsx
  - web/components/gsd/scope-badge.tsx
  - web/components/gsd/file-content-viewer.tsx
  - web/components/gsd/onboarding/step-authenticate.tsx
  - web/components/gsd/onboarding/step-ready.tsx
key_decisions: []
patterns_established:
  - "Mechanical color conversion: text-COLOR-400 → text-COLOR-600 dark:text-COLOR-400; text-COLOR-300 → text-COLOR-600 dark:text-COLOR-300"
  - "Fractional opacity variants follow the same pattern: text-red-400/80 → text-red-600/80 dark:text-red-400/80"
  - "Modifier-prefixed patterns: hover:text-red-400 → hover:text-red-600 dark:hover:text-red-400; group-hover:text-emerald-400 → group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
  - "Translucent backgrounds (bg-*-500/10, border-*-500/20) work on both themes — left unchanged"
  - "Authoritative grep check is `| grep -v 'dark:'` not per-color like `grep -v 'dark:text-emerald-400'` — the latter produces false positives on modifier-prefixed pairs"
observability_surfaces:
  - "`rg \"text-(emerald|amber|red|blue)-(300|400)\" web/components/gsd/ -g \"*.tsx\" | grep -v \"dark:\"` — any output is a missed conversion with exact file:line"
  - "`npm run build` and `npm run build:web-host` exit codes — non-zero means syntax regression from class string edits"
drill_down_paths:
  - .gsd/milestones/M005/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M005/slices/S02/tasks/T03-SUMMARY.md
duration: 37m
verification_result: passed
completed_at: 2026-03-17
---

# S02: Component Color Audit and Visual Verification

**Converted ~137 dark-mode-only Tailwind status colors to light/dark pairs across 18 component files, achieving zero unmatched instances and passing both production builds.**

## What Happened

S01 delivered the theme foundation — ThemeProvider, NavRail toggle, CSS variable light/dark split. But ~129+ hardcoded dark-mode-optimized Tailwind status colors (e.g., `text-amber-300` with ~1.7:1 contrast on white) remained across 16+ component files, making status text invisible or barely readable in light mode.

**T01** tackled the four highest-impact files first — `command-surface.tsx`, `visualizer-view.tsx`, `diagnostics-panels.tsx`, and `remaining-command-panels.tsx` — converting ~94 instances. The mechanical transformation pattern was established: `text-COLOR-400` → `text-COLOR-600 dark:text-COLOR-400`, with consistent handling of fractional opacity variants (`text-red-400/80`) and modifier-prefixed patterns (`hover:text-red-400`, `group-hover:text-emerald-400`).

**T02** completed the remaining files. The initial grep revealed 43 more instances across 14 files — 12 planned plus 2 discovered during grep (`app-shell.tsx` and `onboarding/step-provider.tsx`). An initial sed pass produced duplicate `dark:` entries in 4 files from overlapping patterns, cleaned in a dedup pass. After T02, zero unmatched instances remained directory-wide.

**T03** ran both production builds and performed visual spot-checking. `npm run build` passed clean. `npm run build:web-host` initially failed due to a stray closing brace in `step-optional.tsx` (leftover from T01/T02 edits) — removed and re-ran successfully. Dev server visual spot-check confirmed correct rendering in both themes across Dashboard, Roadmap, Visualizer, Activity Log, and Settings.

## Verification

- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:" | wc -l` → **0** ✅
- Individual color checks (emerald-400, amber-400, amber-300, red-400, blue-400) — all 0 ✅
- `npm run build` — exit 0 ✅
- `npm run build:web-host` — exit 0 ✅
- Browser visual spot-check: Dashboard, Roadmap, Visualizer, Activity Log, Settings — all pass in both themes ✅

## Requirements Advanced

- R113 — S02 completed the component integration half of the light theme work; all hardcoded status colors now have dark: variant pairs

## Requirements Validated

- R113 — Both S01 (foundation) and S02 (component audit) are complete. ThemeProvider wired, NavRail toggle works, CSS variables split, all hardcoded colors fixed, both builds pass, visual verification confirms correct rendering in both themes. R113 is now validated.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Plan listed 16 component files; actual work covered 18 — `app-shell.tsx` (1 `text-amber-300`) and `onboarding/step-provider.tsx` (1 `text-emerald-400/80`) were discovered during grep and not in the original plan.
- T02's initial sed pass produced duplicate `dark:` entries in 4 files from overlapping patterns — required a dedup pass.
- T03 found a stray closing brace in `step-optional.tsx` from T01/T02 edits that broke `build:web-host` — removed before final verification.

## Known Limitations

- The grep-based invariant only catches the 5 specific status color patterns (`text-{emerald,amber,red,blue}-{300,400}`). Other Tailwind color utilities (e.g., `text-gray-400`, `text-yellow-500`) outside this set are not audited. These may need attention if they have contrast issues in light mode, but they were not in scope for this slice.
- Visual spot-check covered major surfaces but did not exercise every possible UI state (e.g., all error conditions, empty states, edge-case command surface combinations).

## Follow-ups

- none

## Files Created/Modified

- `web/components/gsd/command-surface.tsx` — ~34 status color conversions
- `web/components/gsd/visualizer-view.tsx` — ~14 status color conversions
- `web/components/gsd/diagnostics-panels.tsx` — ~18 status color conversions
- `web/components/gsd/remaining-command-panels.tsx` — ~14 status color conversions
- `web/components/gsd/settings-panels.tsx` — 11 status color conversions
- `web/components/gsd/knowledge-captures-panel.tsx` — 11 status color conversions
- `web/components/gsd/activity-view.tsx` — 4 status color conversions
- `web/components/gsd/onboarding/step-optional.tsx` — 3 emerald conversions + stray brace fix
- `web/components/gsd/onboarding/step-authenticate.tsx` — 2 emerald conversions
- `web/components/gsd/onboarding/step-ready.tsx` — 2 emerald conversions
- `web/components/gsd/sidebar.tsx` — 2 status icon conversions
- `web/components/gsd/roadmap.tsx` — 2 milestone status conversions
- `web/components/gsd/status-bar.tsx` — 2 amber-300 conversions (worst-case contrast fix)
- `web/components/gsd/shell-terminal.tsx` — 1 hover:text-red-400 conversion
- `web/components/gsd/scope-badge.tsx` — 1 amber badge conversion
- `web/components/gsd/file-content-viewer.tsx` — 1 blue link conversion
- `web/components/gsd/app-shell.tsx` — 1 amber-300 conversion
- `web/components/gsd/onboarding/step-provider.tsx` — 1 emerald-400/80 conversion

## Forward Intelligence

### What the next slice should know
- M005 is now complete (both S01 and S02 done). The milestone definition of done is fully satisfied: both builds pass, no raw oklch outside scoped definitions, no dark-only status colors without dark: pairs, visual verification confirms correct rendering.

### What's fragile
- The grep-based color invariant (`grep -v "dark:"`) is the safety net for this work. Any new component that adds `text-{emerald,amber,red,blue}-{300,400}` without a `dark:` pair will break light mode readability. This should be part of a pre-commit or CI lint rule if the pattern needs to be enforced long-term.
- `step-optional.tsx` had a stray brace from mechanical edits — when doing bulk class string transformations, verify build after each batch of files.

### Authoritative diagnostics
- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — the definitive check. Any output names the exact file:line of a regression.
- Both `npm run build` and `npm run build:web-host` catch syntax regressions from class string edits.

### What assumptions changed
- Plan assumed 16 files with ~129 instances — actual count was 18 files with ~137 instances. Two files (`app-shell.tsx`, `step-provider.tsx`) were missed in the original research scan.
