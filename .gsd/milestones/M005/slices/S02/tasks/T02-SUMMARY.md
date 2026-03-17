---
id: T02
parent: S02
milestone: M005
provides:
  - Light/dark status color pairs in all remaining GSD component files (14 files)
key_files:
  - web/components/gsd/settings-panels.tsx
  - web/components/gsd/knowledge-captures-panel.tsx
  - web/components/gsd/onboarding/step-optional.tsx
  - web/components/gsd/activity-view.tsx
  - web/components/gsd/status-bar.tsx
  - web/components/gsd/app-shell.tsx
key_decisions: []
patterns_established:
  - "Modifier-prefixed status colors follow the same pattern: hover:text-red-400 → hover:text-red-600 dark:hover:text-red-400"
  - "Fractional opacity variants: text-emerald-300/80 → text-emerald-600/80 dark:text-emerald-300/80"
  - "Grep verification for modifier-prefixed patterns requires `grep -v 'dark:'` (not `grep -v 'dark:text-COLOR-400'`) because dark: may be prefixed with hover:/group-hover: etc."
observability_surfaces:
  - "rg \"text-(emerald|amber|red|blue)-(300|400)\" web/components/gsd/ -g \"*.tsx\" | grep -v \"dark:\" — empty output confirms complete coverage"
duration: 12m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Fix Hardcoded Status Colors in Remaining Components

**Converted ~43 hardcoded dark-mode-only status color utilities to light/dark pairs across 14 component files, achieving zero unmatched instances directory-wide.**

## What Happened

Applied the mechanical `text-COLOR-{300,400}` → `text-COLOR-600 dark:text-COLOR-{300,400}` transformation across all remaining GSD component files. The initial grep revealed 43 unmatched instances across 14 files (12 planned + `app-shell.tsx` and `step-provider.tsx` discovered during grep).

Processing order:
1. Medium-impact: `settings-panels.tsx` (11 refs), `knowledge-captures-panel.tsx` (11 refs)
2. Low-impact: 8 files with 2-4 refs each — activity-view, sidebar, roadmap, status-bar, shell-terminal, step-authenticate, step-ready, step-optional
3. Single-ref: scope-badge, file-content-viewer, app-shell, step-provider

Special patterns handled:
- `hover:text-red-400` → `hover:text-red-600 dark:hover:text-red-400` (shell-terminal)
- `text-emerald-300/80` → `text-emerald-600/80 dark:text-emerald-300/80` (step-optional)
- `text-emerald-400/80` → `text-emerald-600/80 dark:text-emerald-400/80` (step-provider)
- `text-amber-300` → `text-amber-600 dark:text-amber-300` (status-bar, app-shell)

After initial sed pass, discovered duplicate `dark:` entries from overlapping sed patterns in 4 files — cleaned with targeted dedup pass.

## Verification

- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:" | wc -l` → **0** ✅
- `rg "text-emerald-400" ... | grep -v "dark:text-emerald-400"` — 1 hit is `dark:group-hover:text-emerald-400` (properly paired) ✅
- `rg "text-red-400" ... | grep -v "dark:text-red-400"` — 1 hit is `dark:hover:text-red-400` (properly paired) ✅
- `rg "text-amber-400" ... | grep -v "dark:text-amber-400"` — empty ✅
- `rg "text-amber-300" ... | grep -v "dark:text-amber-300"` — empty ✅
- `rg "text-blue-400" ... | grep -v "dark:text-blue-400"` — empty ✅
- No duplicate `dark:.*dark:` patterns except legitimate multi-modifier lines ✅
- `npm run build` — exits 0 ✅

## Diagnostics

- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — any non-empty output reveals a missed conversion with exact file:line
- Light-mode visual: missed conversions appear as invisible or low-contrast text on white backgrounds. Status bar amber text and step-optional emerald badges are highest-risk surfaces.

## Deviations

- Plan listed 12 files; actual work covered 14 files — `app-shell.tsx` (1 `text-amber-300`) and `onboarding/step-provider.tsx` (1 `text-emerald-400/80`) had hits not in the original plan.
- Initial sed pass produced duplicate `dark:text-COLOR-600 dark:text-COLOR-400` in 4 files from overlapping pattern matches — cleaned in a dedup pass.

## Known Issues

- Slice-level grep checks `grep -v "dark:text-emerald-400"` show 2 false-positive hits from modifier-prefixed variants (`dark:group-hover:text-emerald-400`, `dark:hover:text-red-400`). These are correctly paired — the definitive check is `| grep -v "dark:" | wc -l` returning 0.

## Files Created/Modified

- `web/components/gsd/settings-panels.tsx` — 11 status color conversions (red, amber, emerald)
- `web/components/gsd/knowledge-captures-panel.tsx` — 11 status color conversions (red, amber, emerald)
- `web/components/gsd/activity-view.tsx` — 4 status icon color conversions (blue, emerald, red, amber)
- `web/components/gsd/onboarding/step-optional.tsx` — 3 emerald badge/status conversions including /80 opacity
- `web/components/gsd/onboarding/step-authenticate.tsx` — 2 emerald conversions (badge, icon)
- `web/components/gsd/onboarding/step-ready.tsx` — 2 emerald icon conversions
- `web/components/gsd/sidebar.tsx` — 2 status icon conversions (emerald, amber)
- `web/components/gsd/roadmap.tsx` — 2 milestone status icon conversions (emerald, amber)
- `web/components/gsd/status-bar.tsx` — 2 amber-300 conversions (worst-case contrast fix)
- `web/components/gsd/shell-terminal.tsx` — 1 hover:text-red-400 conversion
- `web/components/gsd/scope-badge.tsx` — 1 amber badge conversion
- `web/components/gsd/file-content-viewer.tsx` — 1 blue link conversion
- `web/components/gsd/app-shell.tsx` — 1 amber-300 conversion
- `web/components/gsd/onboarding/step-provider.tsx` — 1 emerald-400/80 conversion
