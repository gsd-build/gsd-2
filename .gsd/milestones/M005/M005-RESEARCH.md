# M005: Light Theme with System-Aware Toggle — Research

**Date:** 2026-03-17

## Summary

M005 is a contained UI theming milestone with well-understood boundaries. The CSS variable architecture is already in place — all 56 shadcn/ui components and 23 GSD components use CSS variables through Tailwind. The `ThemeProvider` wrapper exists but isn't wired in. The `@custom-variant dark (&:is(.dark *))` Tailwind v4 mechanism is already configured. The work is: (1) write light-mode CSS variable values, (2) wire the existing ThemeProvider, (3) add a toggle, and (4) fix ~15 hardcoded oklch values in globals.css plus ~200 hardcoded Tailwind color utilities in GSD components that won't survive the theme switch.

The primary risk isn't the CSS variable system — that will work as designed. The risk is the ~129 hardcoded Tailwind status color utilities (`text-emerald-400`, `text-amber-400`, `text-red-400`, `text-blue-400`, `text-amber-300`) scattered across 16 GSD component files. These are dark-mode-optimized colors (light on dark). On a light background, `text-amber-300` is nearly invisible and `text-amber-400` is barely readable. This is the largest body of work and the integration risk.

## Recommendation

Two slices. **S01: Theme foundation + toggle** — CSS variable light values, ThemeProvider wiring, `suppressHydrationWarning`, hardcoded oklch conversion in globals.css, and the NavRail toggle button. This is the proof that the mechanism works end-to-end and can be verified with a build + toggle test. **S02: Component color audit + visual verification** — systematic fix of hardcoded Tailwind status colors across all 16 affected GSD components, visual verification of all major surfaces in both themes, and final build confirmation. S02 depends on S01.

The hardcoded component colors should use `dark:` variant pairs (e.g., `text-emerald-600 dark:text-emerald-400`) rather than converting to CSS variables. This keeps changes mechanical and local while preserving the existing Tailwind color palette. Converting ~200 instances to CSS variables would require defining 8+ new tokens, updating all components, and touching the same lines again if anyone wants to adjust individual surfaces later. The `dark:` pair approach is the standard Tailwind pattern and matches what the shadcn/ui components already do.

## Implementation Landscape

### Key Files

- `web/app/globals.css` (278 lines) — Primary work site. Currently: `:root` has dark values, `.dark` has identical dark values (copy-paste), `@theme inline` maps vars to Tailwind tokens, hardcoded oklch in `.file-viewer-code` and `.markdown-body` sections (~15 raw oklch values). Needs: light values in `:root`, dark values stay in `.dark`, hardcoded oklch converted to CSS variable references or scoped under `.dark`/`:root` selectors. Custom tokens `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground` need light-mode values.
- `web/app/layout.tsx` — Root layout. Needs: `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>` wrapper and `suppressHydrationWarning` on `<html>`.
- `web/components/theme-provider.tsx` — Already exists, wraps `next-themes`. Just needs importing into layout.tsx.
- `web/components/gsd/sidebar.tsx` — NavRail component. Footer section (Git → Settings → LogOut). Theme toggle button goes between Settings and LogOut.
- `web/components/ui/sonner.tsx` — Already imports `useTheme` from `next-themes` and passes theme to Sonner. Will work automatically once ThemeProvider is wired.
- `web/components/ui/chart.tsx` — Already has `THEMES = { light: '', dark: '.dark' }`. Will work automatically.
- `web/styles/globals.css` (125 lines) — Unused alternate CSS file from initial shadcn setup. Has proper light `:root` / dark `.dark` structure with shadcn defaults. **Not imported anywhere** — `web/app/layout.tsx` imports `./globals.css`. Could serve as reference for light theme values but its values are the colorful shadcn defaults, not the monochrome IDE aesthetic this project uses.

### Component Files with Hardcoded Status Colors (S02 scope)

Files sorted by impact (count of hardcoded color references):
1. `web/components/gsd/command-surface.tsx` — 34+ refs (emerald, amber, red)
2. `web/components/gsd/visualizer-view.tsx` — 29 refs
3. `web/components/gsd/diagnostics-panels.tsx` — 17+ refs
4. `web/components/gsd/remaining-command-panels.tsx` — 14+ refs
5. `web/components/gsd/knowledge-captures-panel.tsx` — 11+ refs
6. `web/components/gsd/settings-panels.tsx` — 10+ refs
7. `web/components/gsd/onboarding/step-authenticate.tsx` — 4+ refs
8. `web/components/gsd/activity-view.tsx` — 4 refs
9. `web/components/gsd/onboarding/step-ready.tsx` — 4 refs
10. `web/components/gsd/onboarding/step-optional.tsx` — 4 refs
11. `web/components/gsd/sidebar.tsx` — 2 refs
12. `web/components/gsd/roadmap.tsx` — 2 refs
13. `web/components/gsd/status-bar.tsx` — 2 refs (`text-amber-300`, worst offender for light mode)
14. `web/components/gsd/shell-terminal.tsx` — 2 refs
15. `web/components/gsd/scope-badge.tsx` — 1 ref
16. `web/components/gsd/file-content-viewer.tsx` — 1 ref (`text-blue-400`)

### Color Mapping for dark: Pairs

The standard pattern: use a darker shade for light mode, lighter shade for dark mode.

| Dark mode class | Light mode pair | Semantic purpose |
|----------------|-----------------|------------------|
| `text-emerald-400` | `text-emerald-600 dark:text-emerald-400` | Success/done status |
| `text-amber-400` | `text-amber-600 dark:text-amber-400` | Warning/in-progress |
| `text-amber-300` | `text-amber-600 dark:text-amber-300` | Warning (lighter variant) |
| `text-red-400` | `text-red-600 dark:text-red-400` | Error/destructive |
| `text-blue-400` | `text-blue-600 dark:text-blue-400` | Info/link |
| `bg-emerald-500/N` | No change needed | Already translucent, works on both |
| `border-emerald-500/N` | No change needed | Already translucent, works on both |
| `bg-amber-500/N` | No change needed | Already translucent, works on both |
| `border-red-500/N` | No change needed | Already translucent, works on both |

Key insight: The `text-*-400` classes are the problem. The `bg-*-500/10` and `border-*-500/20` opacity patterns are translucent enough to work on both light and dark backgrounds.

### Build Order

1. **S01: Theme foundation + toggle** (proves mechanism)
   - Write light `:root` CSS variable values (monochrome, zero-chroma)
   - Keep dark values in `.dark` (current values, already correct)
   - Add light-mode values for `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`
   - Convert hardcoded oklch in `.file-viewer-code` and `.markdown-body` to CSS variable references or `.dark`-scoped selectors
   - Wire ThemeProvider into layout.tsx
   - Add `suppressHydrationWarning` to `<html>`
   - Add theme toggle button to NavRail sidebar footer
   - Verify: `npm run build` passes, toggle works, OS preference detected

2. **S02: Component color audit + visual verification** (proves integration)
   - Fix all hardcoded Tailwind status color utilities with `dark:` pairs
   - Visual verification of all major surfaces (dashboard, terminal, roadmap, files, activity, visualizer, diagnostics, command surfaces, onboarding, focused panel, markdown/code viewers)
   - Verify: `npm run build` and `npm run build:web-host` both pass, no existing tests break

### Verification Approach

- `npm run build` — Next.js production build
- `npm run build:web-host` — Packaged standalone host build
- Theme toggle test: cycle through system → light → dark, verify each renders correctly
- FOIT test: set OS to light, clear localStorage, reload — should render light without flash
- `rg "oklch" web/app/globals.css` — confirm no raw oklch outside `:root`/`.dark` variable definitions and scoped sections
- `rg "text-emerald-400|text-amber-400|text-red-400|text-blue-400|text-amber-300" web/components/gsd/ -g "*.tsx"` — confirm all have corresponding `dark:` variants
- Visual spot-check of highest-risk surfaces: status-bar (amber-300 text), command-surface recovery section (amber/red), diagnostics panels, onboarding steps

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Theme state management + persistence | `next-themes` (already a dependency, v0.4.6) | Handles localStorage, system preference detection, class toggling, FOIT prevention |
| Theme provider wrapper | `web/components/theme-provider.tsx` (already exists) | Just import and wire it |
| Dark mode CSS variant | `@custom-variant dark (&:is(.dark *))` (already configured) | Tailwind v4 dark mode mechanism already in place |
| Icons for toggle | `lucide-react` (already a dependency) | Sun, Moon, Monitor icons available |

## Constraints

- **Monochrome aesthetic**: Light theme values must use zero chroma (`oklch(L 0 0)`) for all base tokens to match the dark theme's pure-gray aesthetic. Only `--success`, `--warning`, `--info`, and `--destructive` carry chroma.
- **No new dependencies**: `next-themes` and `lucide-react` are already available. No additional packages needed.
- **CSS variable architecture is the truth**: All Tailwind tokens flow through `@theme inline` which reads from CSS variables. Changing `:root` values changes every component simultaneously.
- **`web/styles/globals.css` is dead code**: It's never imported. Can reference it for structural patterns but its colorful shadcn default values are wrong for this project's monochrome aesthetic.
- **ThemeProvider is a client component**: It's already marked `'use client'`. Wrapping children in layout.tsx works because Next.js allows client component boundaries that render server component children.

## Common Pitfalls

- **FOIT without `suppressHydrationWarning`**: `next-themes` injects a blocking `<script>` to read localStorage before paint. Without `suppressHydrationWarning` on `<html>`, React 19 hydration mismatches on the `class` attribute will cause warnings or errors. This is a one-line fix but easy to forget.
- **Forgetting custom tokens in `.dark`**: The dark section must include `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground` — these are currently only in `:root` and will be inherited. When `:root` gets light values, `.dark` must explicitly set the dark values for these tokens.
- **`text-amber-300` on white**: This is the worst-case accessibility problem. Amber-300 is `#fcd34d` — contrast ratio against white is ~1.7:1, far below WCAG AA minimum of 4.5:1. The status-bar and command-surface both use this class. Must be caught in S02.
- **Translucent backgrounds need no change**: `bg-emerald-500/10` (green at 10% opacity) works on both light and dark because it's barely visible either way. Don't waste effort converting these.
- **The `@theme inline` block maps vars once**: Changing the CSS variable values in `:root` vs `.dark` automatically propagates to all Tailwind usage. No changes needed in the `@theme inline` block.

## Open Risks

- **Sonner toast theme**: `sonner.tsx` already reads `useTheme()` and passes it to `<Sonner theme={...}>`. However, it uses `--popover`, `--popover-foreground`, and `--border` CSS variables for styling. These will update automatically, but the Sonner component's own internal dark/light styles may conflict. Low risk — test after wiring.
- **Chart dark mode**: `chart.tsx` has `THEMES = { light: '', dark: '.dark' }` for Recharts. This will work correctly with `next-themes` class-based toggling, but chart colors currently use `--chart-1` through `--chart-5` which are monochrome grays. On a light background, light gray chart elements may be hard to see. Worth visual verification in S02.
- **Shiki syntax highlighting**: The context explicitly marks "theme-aware syntax highlighting in code blocks" as out of scope. The `.file-viewer-code` CSS section can have scoped light/dark styles for the line-hover and line-number colors, but the actual syntax tokens from Shiki will remain on the dark color scheme. This is acceptable per scope definition.
- **Test stability**: Existing tests should not be affected since they test behavior, not appearance. However, any test that asserts on specific CSS class presence (unlikely but possible) could break if S02 adds `dark:` prefixed classes.

## Sources

- `next-themes` behavior: Already used in the codebase (`web/components/theme-provider.tsx`, `web/components/ui/sonner.tsx`). Known pattern — `attribute="class"` adds/removes `.dark` class on `<html>`, `defaultTheme="system"` reads `prefers-color-scheme`, localStorage persistence is automatic.
- Tailwind v4 dark mode: Already configured in `web/app/globals.css` via `@custom-variant dark (&:is(.dark *))`. Compatible with `next-themes` class-based approach.
