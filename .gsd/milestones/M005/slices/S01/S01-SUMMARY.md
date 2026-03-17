---
id: S01
parent: M005
milestone: M005
provides:
  - Light-mode `:root` CSS variable values (monochrome, zero-chroma oklch) for all 38 base tokens
  - Dark-mode `.dark` CSS variable values preserving all original dark values plus custom tokens
  - Light and dark values for `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`
  - New `--code-line-number` token for file viewer line numbers
  - All hardcoded oklch in `.markdown-body` and `.file-viewer-code` converted to CSS variable references
  - ThemeProvider wired in root layout with `attribute="class"`, `defaultTheme="system"`, `enableSystem`
  - `suppressHydrationWarning` on `<html>` element preventing FOIT
  - NavRail theme toggle button cycling system → light → dark with Monitor/Sun/Moon icons
  - Theme-aware logo switching (black on light, white on dark) via Tailwind dark: variant classes
requires: []
affects:
  - S02
key_files:
  - web/app/globals.css
  - web/app/layout.tsx
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/app-shell.tsx
key_decisions:
  - Light-mode base tokens use inverted lightness scale (bg 0.09→0.98, fg 0.9→0.15) with zero chroma, matching the dark theme's monochrome aesthetic
  - Custom semantic tokens (--success, --warning, --info) use lower lightness in light mode for contrast on white backgrounds
  - Introduced --code-line-number as new token to replace hardcoded oklch in file viewer line numbers
  - Theme-dependent static assets use paired dark:/hidden Tailwind classes instead of JS-driven src switching — zero JS cost, no hydration flash
  - Client components using useTheme must guard with mounted state to avoid hydration mismatches (documented in KNOWLEDGE.md)
  - Toggle placed between Settings and LogOut in NavRail footer for discoverability without disrupting primary nav flow
patterns_established:
  - All color values live exclusively inside `:root` and `.dark` variable definitions; component sections reference only `var(--*)` tokens
  - Theme-dependent assets use paired dark:/hidden classes (dark:hidden + hidden dark:block) instead of JS src switching
  - Client components using useTheme must guard with mounted state and show neutral fallback during SSR
observability_surfaces:
  - DevTools Computed tab — inspect any element to see resolved `--background` etc. values flip between themes
  - Console — `getComputedStyle(document.documentElement).getPropertyValue('--background')` returns light/dark value based on `.dark` class
  - Console — `document.documentElement.classList.contains('dark')` confirms active theme class
  - localStorage key "theme" shows user's selected mode (system/light/dark)
  - data-testid="sidebar-theme-toggle" title attribute shows current mode name
  - Build — `npm run build` and `npm run build:web-host` catch CSS parse errors with file/line reference
drill_down_paths:
  - .gsd/milestones/M005/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S01/tasks/T02-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-17
---

# S01: Theme Foundation and NavRail Toggle

**Wired complete light/dark theme mechanism — distinct CSS variable sets, ThemeProvider with FOIT prevention, NavRail toggle cycling system/light/dark, and theme-aware logo — so the user can switch themes with immediate visual effect across all base surfaces.**

## What Happened

Two tasks delivered the full theme foundation:

**T01 (CSS variable split)** replaced the identical `:root`/`.dark` dark-mode blocks with a proper light/dark split. Light-mode `:root` received 38 monochrome zero-chroma oklch values with inverted lightness (background 0.98, foreground 0.15, border 0.85, etc.). The `.dark` section preserved all original dark values and gained explicit custom tokens (`--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`). A new `--code-line-number` token was introduced and registered in `@theme inline` for Tailwind consumption. All 11 hardcoded oklch values in `.markdown-body` and `.file-viewer-code` were replaced with `var(--*)` references — no bare oklch remains outside variable definitions.

**T02 (ThemeProvider + toggle)** imported ThemeProvider in `layout.tsx` with `attribute="class"`, `defaultTheme="system"`, and `enableSystem`. Added `suppressHydrationWarning` to `<html>` to prevent hydration flash. In `sidebar.tsx`, added a theme toggle button in the NavRail footer (between Settings and LogOut) that cycles system → light → dark with Monitor/Sun/Moon icons from lucide-react, guarded by a mounted state to prevent SSR/client mismatch. Fixed the hardcoded white logo in `app-shell.tsx` by replacing it with paired `<img>` elements using `dark:hidden` / `hidden dark:block` classes to show the correct logo variant per theme.

## Verification

- `npm run build` → exits 0 ✅
- `rg "oklch" web/app/globals.css | grep -v "^.*--" | grep -v "^.*\/\*" | grep -v "^\s*$"` → empty (no raw oklch outside variable definitions) ✅
- `rg "ThemeProvider" web/app/layout.tsx` → shows import and `<ThemeProvider>` wrapper ✅
- `rg "suppressHydrationWarning" web/app/layout.tsx` → confirms attribute on `<html>` ✅
- `rg "theme" web/components/gsd/sidebar.tsx` → confirms useTheme import and toggle implementation ✅
- Browser visual verification: toggle cycles through all three modes, CSS variables flip, logo switches between black/white ✅
- Console diagnostic: `getComputedStyle(document.documentElement).getPropertyValue('--background')` returns distinct values per theme ✅

## Requirements Advanced

- R113 — Theme foundation is wired: CSS variable light/dark split, ThemeProvider with system detection, NavRail toggle cycling, FOIT prevention, and localStorage persistence all work. Component-level color audit (S02) remains before full validation.

## Requirements Validated

- none (R113 requires S02 completion for full validation)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Logo fix added in T02:** Not in the original plan, but the user reported the white-only logo was invisible on light backgrounds. Fixed with paired Tailwind dark: variant images — a direct consequence of enabling light mode.
- **`--code-line-number` token added in T01:** The file viewer line number color had no existing semantic match, so a new CSS token was introduced rather than reusing an imperfect match.
- **Worktree dependency fix in T01:** Installed missing `shiki`, `react-markdown`, `remark-gfm` in the worktree's `web/` to unblock `npm run build:web-host`. These are pre-existing missing dependencies for `file-content-viewer.tsx`, not caused by this slice.

## Known Limitations

- **Component-level status colors still dark-only:** ~129 hardcoded Tailwind status colors (e.g., `text-amber-300`, `text-emerald-400`) across 16 component files will have poor contrast or be unreadable on light backgrounds. These are S02's scope.
- **Worktree dependency gap:** `shiki`, `react-markdown`, `remark-gfm` may need explicit addition to the main repo's `web/package.json` if not already there (they're used via dynamic imports).

## Follow-ups

- S02 must add `dark:` variant pairs to all ~129 hardcoded status colors across 16 component files to complete light-mode readability.
- Consider adding `shiki`, `react-markdown`, `remark-gfm` to the main repo's `web/package.json` explicitly if worktree builds remain a concern.

## Files Created/Modified

- `web/app/globals.css` — Light/dark CSS variable split for all 38 base tokens + 5 custom tokens; all hardcoded oklch converted to var() references; new `--code-line-number` token
- `web/app/layout.tsx` — Added ThemeProvider wrapper with class-based theming and suppressHydrationWarning
- `web/components/gsd/sidebar.tsx` — Added theme toggle button with useTheme, Monitor/Sun/Moon icons, mounted guard
- `web/components/gsd/app-shell.tsx` — Fixed logo to switch between black/white SVG per theme using Tailwind dark: variant classes

## Forward Intelligence

### What the next slice should know
- The CSS variable system is complete — every color in `:root` and `.dark` has a distinct value. S02 only needs to add `dark:` pairs to Tailwind utility classes in component files, not touch `globals.css`.
- The `dark:` variant pair pattern is already demonstrated by the logo fix in `app-shell.tsx` — use `text-emerald-600 dark:text-emerald-400` style, not CSS variables, for the component-level status colors.
- The translucent backgrounds (`bg-*-500/10`, `border-*-500/20`) work on both themes and should not need changes.

### What's fragile
- **Light-mode custom token contrast** — The light-mode `--success` (0.45), `--warning` (0.55), `--info` (0.45) values were chosen for white-background contrast but haven't been visually stress-tested on every surface that uses them. If a surface composites these over a non-white background, contrast may degrade.
- **Mounted guard requirement** — Any new component that calls `useTheme()` must include the mounted guard pattern or it will produce hydration mismatch warnings. This is documented in KNOWLEDGE.md but easy to forget.

### Authoritative diagnostics
- `document.documentElement.classList.contains('dark')` — definitively shows which theme class is active
- `localStorage.getItem('theme')` — shows the persisted user preference (system/light/dark)
- `getComputedStyle(document.documentElement).getPropertyValue('--background')` — confirms which CSS variable set is resolved
- `npm run build` — catches CSS parse errors in globals.css with file/line reference

### What assumptions changed
- The plan assumed the logo was fine — it was hardcoded to white-only and needed a theme-aware fix as part of this slice.
- The plan assumed no new CSS tokens were needed — `--code-line-number` had to be introduced because no existing semantic token matched the file viewer line number color.
