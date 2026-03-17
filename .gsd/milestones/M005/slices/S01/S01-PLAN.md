# S01: Theme Foundation and NavRail Toggle

**Goal:** Wire the complete theme mechanism — light CSS variables, ThemeProvider, FOIT prevention, hardcoded oklch conversion, and a working NavRail toggle — so the user can switch between light, dark, and system themes.
**Demo:** Click the NavRail toggle to cycle system → light → dark; the dashboard, sidebar, terminal, and roadmap all switch immediately; reload with OS light mode and no localStorage shows the light theme without flash.

## Must-Haves

- Light `:root` CSS variable values using monochrome zero-chroma `oklch(L 0 0)` for all base tokens
- Dark `.dark` CSS variable values preserving current dark values, including `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`
- All hardcoded oklch in `.markdown-body` and `.file-viewer-code` converted to CSS variable references or scoped `.dark`/`:root` selectors
- ThemeProvider wired in `layout.tsx` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`
- `suppressHydrationWarning` on `<html>` element
- Theme toggle button in NavRail footer cycling system → light → dark with appropriate icons (Monitor/Sun/Moon)
- `npm run build` passes

## Verification

- `npm run build` exits 0
- `rg "oklch" web/app/globals.css | grep -v "^.*--" | grep -v "^.*\/\*" | grep -v "^\s*$"` — no raw oklch outside CSS variable definitions
- `rg "ThemeProvider" web/app/layout.tsx` — confirms provider is wired
- `rg "suppressHydrationWarning" web/app/layout.tsx` — confirms FOIT prevention
- `rg "theme" web/components/gsd/sidebar.tsx` — confirms toggle is present
- Visual: start dev server, toggle through system/light/dark, confirm base surfaces render correctly
- Diagnostic: in browser console, `getComputedStyle(document.documentElement).getPropertyValue('--background')` returns light value without `.dark` class, dark value with `.dark` class

## Tasks

- [x] **T01: Write light-mode CSS variables and scope dark values** `est:45m`
  - Why: The `:root` and `.dark` sections currently hold identical dark values. Light mode needs its own zero-chroma values, and `.dark` must explicitly carry the dark values for all tokens including custom ones.
  - Files: `web/app/globals.css`
  - Do: Replace `:root` values with light-mode monochrome oklch values (high lightness, zero chroma). Keep `.dark` values as the current dark values. Add light-mode values for `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground` in `:root` and ensure dark values for these are in `.dark`. Convert all hardcoded oklch in `.markdown-body` and `.file-viewer-code` sections to CSS variable references or scope them under `.dark`/`:root` selectors. Remove the "Monochrome IDE Theme - Always Dark" comment since it's no longer accurate.
  - Verify: `npm run build` passes. `rg "oklch" web/app/globals.css` shows oklch only inside `:root`/`.dark` variable definitions, `@theme inline` block, and scoped selectors — no bare oklch in `.markdown-body` or `.file-viewer-code`.
  - Done when: Light and dark CSS variable sets exist with distinct values, all hardcoded oklch are converted, and the build passes.

- [x] **T02: Wire ThemeProvider and add NavRail toggle** `est:30m`
  - Why: The ThemeProvider exists but isn't imported. The layout needs `suppressHydrationWarning`. The NavRail needs a toggle button.
  - Files: `web/app/layout.tsx`, `web/components/gsd/sidebar.tsx`, `web/components/theme-provider.tsx`
  - Do: Import and wrap children in `layout.tsx` with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`. Add `suppressHydrationWarning` to the `<html>` element. In `sidebar.tsx`, add a theme toggle button in the footer section (between Settings and LogOut). The button should use `useTheme()` from `next-themes` to read and cycle the theme: system (Monitor icon) → light (Sun icon) → dark (Moon icon). Import icons from `lucide-react`. Verify the existing `theme-provider.tsx` is compatible with these props.
  - Verify: `npm run build` passes. `rg "ThemeProvider" web/app/layout.tsx` shows import and usage. `rg "suppressHydrationWarning" web/app/layout.tsx` confirms the attribute. Theme toggle renders in sidebar and cycling works.
  - Done when: ThemeProvider wraps the app, FOIT is prevented, and the toggle cycles through all three states with visual feedback.

## Observability / Diagnostics

- **CSS variable inspection:** In browser DevTools, inspect any element → Computed tab shows resolved `--background`, `--foreground`, etc. Values differ between light/dark proving the theme split works.
- **Theme state:** `document.documentElement.classList.contains('dark')` in console → confirms which class is active.
- **FOIT check:** Hard-reload with "Disable cache" and slow 3G throttle → page should never flash white-on-dark or dark-on-light during hydration.
- **Build failure surface:** `npm run build` will fail with CSS parse errors if variable syntax is broken — the build log names the exact file and line.
- **Failure path:** If a CSS variable is undefined, the browser renders `oklch(0 0 0)` (black) — visually obvious. DevTools shows the variable as invalid in the Styles pane.

## Files Likely Touched

- `web/app/globals.css`
- `web/app/layout.tsx`
- `web/components/gsd/sidebar.tsx`
- `web/components/theme-provider.tsx` (read/verify, likely no changes needed)
