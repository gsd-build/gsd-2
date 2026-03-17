# M005: Light Theme with System-Aware Toggle

**Vision:** Users can work in a light or dark monochrome web workspace that matches their OS preference, toggles manually, and remembers their choice.

## Success Criteria

- With OS set to light mode and no stored preference, `gsd --web` renders the light theme on first load without a flash of the dark theme
- Clicking the NavRail toggle cycles through system → light → dark, and every surface updates immediately
- The chosen theme persists across browser reloads and new sessions via localStorage
- Both `npm run build` and `npm run build:web-host` succeed with zero errors
- No hardcoded oklch values exist outside `:root`/`.dark` CSS variable definitions in `globals.css`
- No dark-mode-optimized text color utilities (`text-amber-300`, `text-emerald-400`, `text-red-400`, `text-blue-400`) appear without a corresponding `dark:` variant pair

## Key Risks / Unknowns

- **Hardcoded oklch values in globals.css** — ~15 raw oklch values in `.markdown-body` and `.file-viewer-code` sections sit outside the CSS variable system and will render wrong in light mode
- **~129 hardcoded Tailwind status colors across 16 GSD components** — dark-mode-optimized `text-*-400` / `text-*-300` colors will be invisible or barely readable on light backgrounds (`text-amber-300` on white has ~1.7:1 contrast ratio)

## Proof Strategy

- Hardcoded oklch in globals.css → retire in S01 by converting all raw oklch to CSS variable references or scoped `.dark`/`:root` selectors, verified by `rg "oklch" web/app/globals.css` showing zero unsupervised values
- Hardcoded Tailwind status colors → retire in S02 by adding `dark:` pairs to all affected components, verified by grep confirming every `text-*-400`/`text-*-300` status utility has a `dark:` companion

## Verification Classes

- Contract verification: `npm run build`, `npm run build:web-host`, grep-based invariant checks for hardcoded colors and oklch values
- Integration verification: visual browser verification of major surfaces in both themes
- Operational verification: theme persistence via localStorage, OS preference detection in system mode, no FOIT on first load
- UAT / human verification: visual spot-check of highest-risk surfaces (status-bar amber text, command-surface recovery, diagnostics panels, onboarding steps)

## Milestone Definition of Done

This milestone is complete only when all are true:

- Both slices (S01 foundation, S02 component integration) are complete
- ThemeProvider is wired, toggle renders in NavRail, and light/dark CSS variable sets exist
- Every major surface (dashboard, terminal, roadmap, files, activity, visualizer, diagnostics, command surfaces, onboarding, focused panel, markdown/code viewers) renders correctly in both themes
- OS light preference → first load shows light theme without flash
- NavRail toggle cycles system → light → dark with immediate visible effect across all panels
- `npm run build` and `npm run build:web-host` both succeed
- No raw oklch outside scoped CSS variable definitions, no dark-only text color utilities without `dark:` variant pairs

## Requirement Coverage

- Introduces: R113 (light/dark theme with system-aware toggle, manual cycling, persistence)
- No Active requirements from prior milestones remain unmapped — all 24 are validated, 3 are deferred, 3 are out-of-scope

## Slices

- [x] **S01: Theme foundation and NavRail toggle** `risk:medium` `depends:[]`
  > After this: toggling the NavRail button cycles system → light → dark; base surfaces (dashboard, sidebar, terminal, roadmap) render correctly in both themes; `npm run build` passes; no FOIT on first load
- [x] **S02: Component color audit and visual verification** `risk:low` `depends:[S01]`
  > After this: all 16 GSD component files use `dark:` variant pairs for status colors; every major surface is visually correct in both themes; both `npm run build` and `npm run build:web-host` pass

## Boundary Map

### S01 → S02

Produces:
- Light `:root` CSS variable values (monochrome, zero-chroma `oklch(L 0 0)`) in `web/app/globals.css`
- Dark `.dark` CSS variable values in `web/app/globals.css` (current dark values preserved)
- Light and dark values for custom tokens: `--success`, `--warning`, `--info`, `--terminal`, `--terminal-foreground`
- All hardcoded oklch in `.markdown-body` and `.file-viewer-code` converted to CSS variable references or scoped selectors
- Working `ThemeProvider` in `web/app/layout.tsx` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`
- `suppressHydrationWarning` on `<html>` element
- Theme toggle button in NavRail sidebar footer (sun/moon/monitor icons, cycles system → light → dark)
- `npm run build` passing

Consumes:
- nothing (first slice)

### S02 (terminal)

Produces:
- All `text-emerald-400`, `text-amber-400`, `text-amber-300`, `text-red-400`, `text-blue-400` instances across 16 GSD component files updated with `dark:` variant pairs (e.g. `text-emerald-600 dark:text-emerald-400`)
- Visual verification of all major surfaces in both themes
- Both `npm run build` and `npm run build:web-host` passing

Consumes:
- S01's working theme toggle and CSS variable light/dark split
