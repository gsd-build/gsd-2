---
id: T01
parent: S01
milestone: M005
provides:
  - Light-mode `:root` CSS variable values (monochrome, zero-chroma oklch)
  - Dark-mode `.dark` CSS variable values including all custom tokens
  - New `--code-line-number` token for file viewer line numbers
  - All hardcoded oklch in `.markdown-body` and `.file-viewer-code` converted to CSS variable references
key_files:
  - web/app/globals.css
key_decisions:
  - Introduced `--code-line-number` as a new token to replace hardcoded oklch in file viewer line numbers
  - Light-mode custom tokens use darker/lower-lightness variants for contrast on white (e.g. --success dark:0.65 → light:0.45)
  - Light-mode `:root` values invert the lightness scale symmetrically (background 0.09→0.98, foreground 0.9→0.15, etc.)
patterns_established:
  - All color values live exclusively inside `:root` and `.dark` variable definitions; component sections reference only `var(--*)` tokens
observability_surfaces:
  - DevTools Computed tab: inspect any element to see resolved `--background` etc. values flip between themes
  - Console: `getComputedStyle(document.documentElement).getPropertyValue('--background')` returns light/dark value based on `.dark` class presence
  - Build: `npm run build:web-host` catches CSS parse errors with file/line reference
duration: 15m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Write Light-Mode CSS Variables and Scope Dark Values

**Replaced identical dark `:root`/`.dark` blocks with proper light/dark split; converted all hardcoded oklch in markdown-body and file-viewer-code to CSS variable references.**

## What Happened

The existing `globals.css` had identical dark-mode values in both `:root` and `.dark`, and ~11 hardcoded `oklch(...)` values in `.markdown-body` and `.file-viewer-code` sections.

1. **Light-mode `:root`**: Wrote distinct light-mode values for all 38 base tokens. Lightness values are inverted from dark (background 0.09→0.98, foreground 0.9→0.15, border 0.22→0.85, etc.). All base tokens remain monochrome zero-chroma.

2. **Light-mode custom tokens**: Added `--success` (0.45 0.15 145 — darker green for white bg), `--warning` (0.55 0.15 85 — darker amber), `--info` (0.45 0.1 250 — darker blue), `--terminal` (0.96 — light bg), `--terminal-foreground` (0.2 — dark text).

3. **Dark `.dark` section**: Preserved all original dark values and added the custom tokens (`--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`) that were previously only in `:root`.

4. **New `--code-line-number` token**: Created to replace the hardcoded `oklch(0.35 0 0)` in `.file-viewer-code .line::before`. Light: 0.55, Dark: 0.35. Registered in `@theme inline` as `--color-code-line-number`.

5. **Hardcoded oklch conversion**: All 11 hardcoded oklch values in `.markdown-body` and `.file-viewer-code` replaced with `var(--*)` references:
   - `.file-viewer-code .line:hover` background → `var(--muted)`
   - `.file-viewer-code .line::before` color → `var(--code-line-number)`
   - `.markdown-body` color → `var(--foreground)`
   - `.markdown-body h1/h2` border → `var(--border)`
   - `.markdown-body blockquote` border → `var(--border)`, color → `var(--muted-foreground)`
   - `.markdown-body hr` border → `var(--border)`
   - `.markdown-body strong` color → `var(--foreground)`
   - `.markdown-body del` color → `var(--muted-foreground)`
   - `.markdown-body input[type="checkbox"]` accent-color → `var(--success)`

6. **Worktree dependency fix**: Installed missing `shiki`, `react-markdown`, `remark-gfm` in web/ (pre-existing issue — these are dynamic imports in `file-content-viewer.tsx` but weren't in `package.json` dependencies for the worktree).

## Verification

- `rg "oklch" web/app/globals.css | grep -v "^.*--" | grep -v "^.*\/\*" | grep -v "^\s*$"` → **empty** (PASS)
- No oklch in `.markdown-body` or `.file-viewer-code` sections → **PASS**
- `npm run build:web-host` → **exits 0** (PASS)

### Slice-level checks (T01 scope):
- ✅ No raw oklch outside CSS variable definitions
- ⏳ ThemeProvider in layout.tsx (T02)
- ⏳ suppressHydrationWarning in layout.tsx (T02)
- ⏳ Theme toggle in sidebar (T02)

## Diagnostics

- **Inspect variables**: DevTools → Elements → select `<html>` → Computed tab shows all `--*` properties with resolved oklch values
- **Theme test**: In console, `document.documentElement.classList.toggle('dark')` should flip all variable values
- **Missing variable detection**: If a token is absent from either `:root` or `.dark`, the affected surface renders black (oklch fallback) — visually obvious

## Deviations

- Added `--code-line-number` as a new CSS token not in the original plan — needed because the file viewer line number color had no existing semantic match. Registered it in `@theme inline` block for Tailwind consumption.
- Installed `shiki`, `react-markdown`, `remark-gfm` as worktree dependencies to unblock `npm run build:web-host`. These are a pre-existing worktree issue, not caused by CSS changes.

## Known Issues

- The `web/package.json` may need `shiki`, `react-markdown`, `remark-gfm` added as explicit dependencies in the main repo if not already there (they're used via dynamic imports in `file-content-viewer.tsx`).

## Files Created/Modified

- `web/app/globals.css` — Light/dark CSS variable split; all hardcoded oklch converted to var() references; new `--code-line-number` token
- `.gsd/milestones/M005/slices/S01/S01-PLAN.md` — Added Observability / Diagnostics section and diagnostic verification check
- `.gsd/milestones/M005/slices/S01/tasks/T01-PLAN.md` — Added Observability Impact section
