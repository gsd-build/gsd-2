---
id: M005
provides:
  - Monochrome light theme with 38 base tokens + 5 custom semantic tokens (--success, --warning, --info, --terminal, --terminal-foreground) in zero-chroma oklch
  - Dark theme preserved under `.dark` selector with all original values
  - ThemeProvider wired with attribute="class", defaultTheme="system", enableSystem — no FOIT
  - NavRail theme toggle cycling system → light → dark with Monitor/Sun/Moon icons
  - Theme-aware logo switching via Tailwind dark: variant classes (zero JS cost)
  - All hardcoded oklch in globals.css converted to CSS variable references
  - All ~137 dark-mode-only Tailwind status colors converted to light/dark pairs across 18 component files
  - localStorage theme persistence via next-themes
  - New --code-line-number CSS token for file viewer line numbers
key_decisions:
  - "D067: Monochrome zero-chroma oklch values for light theme base tokens, matching dark theme's pure-gray aesthetic"
  - "D068: Two slices — S01 foundation + S02 component audit — split at mechanism/integration boundary"
  - "D069: dark: variant pairs (text-COLOR-600 dark:text-COLOR-400) over CSS variables for component status colors"
  - "D070: Paired <img> with Tailwind dark:/hidden classes for theme-dependent static assets"
patterns_established:
  - "All color values live exclusively inside :root and .dark variable definitions; component sections reference only var(--*) tokens"
  - "Theme-dependent assets use paired dark:/hidden classes (dark:hidden + hidden dark:block) instead of JS src switching"
  - "Client components using useTheme must guard with mounted state and show neutral fallback during SSR"
  - "Mechanical color conversion: text-COLOR-400 → text-COLOR-600 dark:text-COLOR-400; text-COLOR-300 → text-COLOR-600 dark:text-COLOR-300"
  - "Translucent backgrounds (bg-*-500/10, border-*-500/20) work on both themes — left unchanged"
observability_surfaces:
  - "DevTools Computed tab — inspect any element to see resolved CSS variable values flip between themes"
  - "Console: getComputedStyle(document.documentElement).getPropertyValue('--background') returns light/dark value"
  - "Console: document.documentElement.classList.contains('dark') confirms active theme class"
  - "localStorage key 'theme' shows user's selected mode (system/light/dark)"
  - "rg 'text-(emerald|amber|red|blue)-(300|400)' web/components/gsd/ -g '*.tsx' | grep -v 'dark:' — any output is a missed conversion"
  - "npm run build and npm run build:web-host catch CSS parse errors and syntax regressions"
requirement_outcomes:
  - id: R113
    from_status: active
    to_status: validated
    proof: "S01 delivered ThemeProvider, NavRail toggle, FOIT prevention, CSS variable light/dark split. S02 converted ~137 status colors to light/dark pairs across 18 files. Both builds pass. grep invariant returns 0 unmatched instances. Visual spot-check confirmed correct rendering in both themes."
duration: 67m
verification_result: passed
completed_at: 2026-03-17
---

# M005: Light Theme with System-Aware Toggle

**Delivered a monochrome light theme with system-aware default, manual NavRail toggle cycling system/light/dark, persistent preference, and full component color coverage — zero hardcoded oklch, zero dark-only status colors, both production builds passing.**

## What Happened

The web workspace shipped with a hardcoded dark-only theme. Users in light-mode environments had no option. M005 added a complete light theme in two slices that split cleanly at the mechanism/integration boundary.

**S01 (Theme Foundation)** built the entire theme mechanism. The identical `:root`/`.dark` dark-mode blocks in `globals.css` were replaced with a proper light/dark split — 38 monochrome zero-chroma oklch base tokens with inverted lightness for light mode (background 0.98, foreground 0.15), plus 5 custom semantic tokens (`--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`) with lower lightness in light mode for contrast. All 11 hardcoded oklch values in `.markdown-body` and `.file-viewer-code` were converted to `var(--*)` references, plus a new `--code-line-number` token was introduced. ThemeProvider was wired in `layout.tsx` with `attribute="class"`, `defaultTheme="system"`, and `suppressHydrationWarning` on `<html>` to prevent flash of wrong theme. A NavRail toggle button was added in the sidebar footer (between Settings and LogOut) cycling system → light → dark with Monitor/Sun/Moon icons, guarded by mounted state to avoid hydration mismatch. The hardcoded white-only logo was fixed with paired `<img>` elements using `dark:hidden`/`hidden dark:block` classes.

**S02 (Component Color Audit)** was mechanical follow-through. ~137 dark-mode-optimized Tailwind status colors (`text-amber-300` at ~1.7:1 contrast on white, `text-emerald-400`, `text-red-400`, `text-blue-400`) across 18 component files were converted to light/dark pairs using the pattern `text-COLOR-600 dark:text-COLOR-400`. The work covered the 4 highest-impact files first (command-surface, visualizer, diagnostics, remaining-command-panels at ~94 instances), then the remaining 14 files (~43 instances), including 2 files not in the original plan (`app-shell.tsx`, `step-provider.tsx`). A stray closing brace in `step-optional.tsx` from mechanical edits was caught and fixed during the final build verification.

## Cross-Slice Verification

Each success criterion from the roadmap was independently verified:

1. **OS light preference → first load shows light theme without flash** — `suppressHydrationWarning` on `<html>`, `defaultTheme="system"` in ThemeProvider, and next-themes' blocking script confirmed wired. S01 browser verification confirmed no FOIT. ✅

2. **NavRail toggle cycles system → light → dark with immediate update** — Toggle implementation in `sidebar.tsx` confirmed: `useTheme()` with mounted guard, Monitor/Sun/Moon icons from lucide-react, cycling logic via order array. S01 browser verification confirmed all surfaces update immediately. ✅

3. **Theme persists across reloads via localStorage** — next-themes handles persistence automatically with `attribute="class"`. S01 confirmed `localStorage.getItem('theme')` returns the selected mode. ✅

4. **`npm run build` and `npm run build:web-host` succeed with zero errors** — Both builds pass with exit 0 at milestone close. ✅

5. **No hardcoded oklch outside `:root`/`.dark` CSS variable definitions** — `rg "oklch" web/app/globals.css | grep -v "^.*--" | grep -v "^.*\/\*" | grep -v "^\s*$"` returns empty. ✅

6. **No dark-mode-optimized text color utilities without `dark:` variant pair** — `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:" | wc -l` returns 0. ✅

**Definition of Done:**

- Both slices S01 and S02 are complete with summaries ✅
- ThemeProvider wired, toggle renders in NavRail, light/dark CSS variable sets exist ✅
- Every major surface renders correctly in both themes (verified by S01 and S02 visual spot-checks of dashboard, terminal, roadmap, files, activity, visualizer, diagnostics, command surfaces, onboarding, settings) ✅
- OS light preference → first load shows light theme without flash ✅
- NavRail toggle cycles system → light → dark with immediate visible effect ✅
- `npm run build` and `npm run build:web-host` both succeed ✅
- No raw oklch outside scoped CSS variable definitions ✅
- No dark-only text color utilities without `dark:` variant pairs ✅

## Requirement Changes

- R113: active → validated — S01 delivered ThemeProvider, NavRail toggle (system→light→dark), FOIT prevention, CSS variable light/dark split with 38+5 tokens, oklch conversion. S02 converted ~137 hardcoded dark-mode-only status colors to light/dark pairs across 18 component files. Both production builds pass. Grep invariant confirms zero unmatched instances. Visual verification confirms correct rendering in both themes across all major surfaces.

## Forward Intelligence

### What the next milestone should know
- The theme system is complete and stable. All colors flow through CSS variables in `globals.css` (`:root` for light, `.dark` for dark). Component-level status colors use Tailwind `dark:` variant pairs. No custom theme logic exists outside next-themes.
- The grep-based invariant (`rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"`) is the standing safety net. Any new component adding these color utilities without a `dark:` pair will break light mode readability.
- The `next-themes` mounted guard pattern is required for any component calling `useTheme()` — documented in KNOWLEDGE.md. Forgetting it produces hydration mismatch warnings.
- Theme-dependent static assets use paired `dark:hidden`/`hidden dark:block` Tailwind classes — not JS-based src switching. This is zero-cost and hydration-safe.

### What's fragile
- **Light-mode custom token contrast** — The `--success` (0.45), `--warning` (0.55), `--info` (0.45) lightness values were chosen for white-background contrast but haven't been stress-tested on every surface that composites them over non-white backgrounds. Subtle contrast degradation is possible on layered surfaces.
- **Grep invariant scope** — The color audit covers only `text-{emerald,amber,red,blue}-{300,400}`. Other Tailwind color utilities (e.g., `text-gray-400`, `text-yellow-500`) are not audited. New colors introduced by future features may need their own light-mode treatment.
- **Mechanical edits in class strings** — S02's bulk sed transformations produced duplicate `dark:` entries in 4 files and a stray brace in one. When doing bulk class string transformations, build verification after each batch is essential.

### Authoritative diagnostics
- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — the definitive status color regression check
- `rg "oklch" web/app/globals.css | grep -v "^.*--"` — catches hardcoded oklch escaping the variable system
- `npm run build` + `npm run build:web-host` — catches CSS parse errors and syntax regressions from class edits
- `localStorage.getItem('theme')` in browser console — confirms persisted preference
- `document.documentElement.classList.contains('dark')` — confirms active theme class

### What assumptions changed
- **Plan assumed 16 files with ~129 status color instances** — actual count was 18 files with ~137 instances. `app-shell.tsx` and `step-provider.tsx` were missed in the original research scan.
- **Plan assumed the logo was fine** — the white-only logo was invisible on light backgrounds and required a theme-aware fix using paired Tailwind dark: variant images.
- **Plan assumed no new CSS tokens needed** — `--code-line-number` had to be introduced because no existing semantic token matched the file viewer line number color.

## Files Created/Modified

- `web/app/globals.css` — Light/dark CSS variable split for 38 base tokens + 5 custom tokens; all hardcoded oklch converted to var() references; new --code-line-number token
- `web/app/layout.tsx` — ThemeProvider wrapper with class-based theming, suppressHydrationWarning on `<html>`
- `web/components/gsd/sidebar.tsx` — Theme toggle button with useTheme, Monitor/Sun/Moon icons, mounted guard; status icon color conversions
- `web/components/gsd/app-shell.tsx` — Theme-aware logo switching with paired dark: variant images; amber-300 color conversion
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
- `web/components/gsd/roadmap.tsx` — 2 milestone status conversions
- `web/components/gsd/status-bar.tsx` — 2 amber-300 conversions
- `web/components/gsd/shell-terminal.tsx` — 1 hover:text-red-400 conversion
- `web/components/gsd/scope-badge.tsx` — 1 amber badge conversion
- `web/components/gsd/file-content-viewer.tsx` — 1 blue link conversion
- `web/components/gsd/onboarding/step-provider.tsx` — 1 emerald-400/80 conversion
