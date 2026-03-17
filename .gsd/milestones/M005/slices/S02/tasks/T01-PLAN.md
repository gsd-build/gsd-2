---
estimated_steps: 5
estimated_files: 4
---

# T01: Fix Hardcoded Status Colors in High-Impact Components

**Slice:** S02 — Component Color Audit and Visual Verification
**Milestone:** M005

## Description

The four highest-impact files contain ~94 of the ~129 hardcoded dark-mode-optimized status color utilities. Convert each to a light/dark pair using the standard Tailwind pattern: add the light-mode class and prefix the existing dark-mode class with `dark:`.

## Steps

1. Open `web/components/gsd/command-surface.tsx` (~34 refs). Find all `text-emerald-400`, `text-amber-400`, `text-amber-300`, `text-red-400`, `text-blue-400`. Prepend the light-mode variant (e.g., `text-emerald-600`) and prefix existing with `dark:` (e.g., `dark:text-emerald-400`). Leave `bg-*-500/N` and `border-*-500/N` unchanged.
2. Open `web/components/gsd/visualizer-view.tsx` (~29 refs). Apply same mechanical transformation.
3. Open `web/components/gsd/diagnostics-panels.tsx` (~17 refs). Apply same transformation.
4. Open `web/components/gsd/remaining-command-panels.tsx` (~14 refs). Apply same transformation.
5. Run `npm run build` to confirm no syntax errors from the class changes.

## Must-Haves

- [ ] All `text-emerald-400` in these 4 files have `text-emerald-600 dark:text-emerald-400`
- [ ] All `text-amber-400` → `text-amber-600 dark:text-amber-400`
- [ ] All `text-amber-300` → `text-amber-600 dark:text-amber-300`
- [ ] All `text-red-400` → `text-red-600 dark:text-red-400`
- [ ] All `text-blue-400` → `text-blue-600 dark:text-blue-400`
- [ ] `npm run build` passes

## Verification

- For each file: `rg "text-(emerald|amber|red|blue)-(300|400)" <file> | grep -v "dark:"` returns empty
- `npm run build` exits 0

## Inputs

- S01 complete (theme mechanism and CSS variable split in place)
- Research color mapping table from M005-RESEARCH.md

## Observability Impact

- **Signals changed:** None (this is a CSS class-only change with no runtime behavioral signals).
- **Inspection method:** `rg "text-(emerald|amber|red|blue)-(300|400)" <file> | grep -v "dark:"` — empty means the file is fully converted. Non-empty output reveals remaining unmatched dark-mode-only status colors.
- **Failure state:** Missed conversions manifest as invisible or low-contrast status text in light mode. Visual inspection of the command surface, visualizer, diagnostics panels, and remaining-command panels in light theme is the definitive check.
- **Build gate:** `npm run build` catches any syntax errors from malformed class strings.

## Expected Output

- `web/components/gsd/command-surface.tsx` — all status colors have dark: pairs
- `web/components/gsd/visualizer-view.tsx` — all status colors have dark: pairs
- `web/components/gsd/diagnostics-panels.tsx` — all status colors have dark: pairs
- `web/components/gsd/remaining-command-panels.tsx` — all status colors have dark: pairs
