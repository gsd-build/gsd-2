---
estimated_steps: 6
estimated_files: 1
---

# T01: Write Light-Mode CSS Variables and Scope Dark Values

**Slice:** S01 — Theme Foundation and NavRail Toggle
**Milestone:** M005

## Description

Replace the identical `:root`/`.dark` dark values in `globals.css` with a proper light/dark split. Write light-mode monochrome zero-chroma values in `:root`, keep dark values in `.dark`, add light-mode values for custom tokens (`--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`), and convert all hardcoded oklch in `.markdown-body` and `.file-viewer-code` sections to CSS variable references or scoped selectors.

## Steps

1. Read `web/app/globals.css` to understand current structure and token inventory
2. Write light-mode `:root` values — all base tokens use `oklch(L 0 0)` with high lightness values (flipping the dark palette: where dark used `oklch(0.15 0 0)` for background, light uses `oklch(0.98 0 0)`, etc.)
3. Ensure `.dark` section has all current dark values including `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`
4. Add light-mode values for custom tokens in `:root`: `--success` (dark green), `--warning` (dark amber), `--info` (dark blue), `--terminal` (light bg), `--terminal-foreground` (dark text)
5. Convert hardcoded oklch values in `.markdown-body` section to CSS variable references or `:root`/`.dark` scoped selectors
6. Convert hardcoded oklch values in `.file-viewer-code` section to CSS variable references or `:root`/`.dark` scoped selectors

## Must-Haves

- [ ] `:root` has distinct light-mode values (monochrome, zero-chroma) for all tokens
- [ ] `.dark` has all dark values including custom tokens that were previously only in `:root`
- [ ] No bare oklch values in `.markdown-body` or `.file-viewer-code` sections
- [ ] `npm run build` passes

## Verification

- `npm run build` exits 0
- `rg "oklch" web/app/globals.css` — oklch appears only inside `:root`/`.dark` variable definitions, `@theme inline` block, and explicitly scoped selectors
- No raw oklch in `.markdown-body` or `.file-viewer-code` that isn't behind a CSS variable or scope selector

## Inputs

- `web/app/globals.css` — current 278-line file with identical `:root`/`.dark` dark values, ~15 hardcoded oklch in markdown-body and file-viewer-code sections
- M005 research color mapping table for reference values

## Expected Output

- `web/app/globals.css` — light/dark CSS variable split complete, all hardcoded oklch converted

## Observability Impact

- **What changes:** `:root` CSS variables now resolve to light-mode values by default. Dark values only apply under `.dark` class. Components using `var(--background)` etc. automatically respond to theme class.
- **How to inspect:** Open DevTools → Elements → `<html>` → toggle `.dark` class on/off. All `--*` custom properties in Computed tab should flip between light and dark values.
- **Failure visibility:** If a variable is missing from either `:root` or `.dark`, the affected surface renders with the wrong lightness or falls through to initial value (black) — visually obvious. `npm run build` catches CSS syntax errors.
