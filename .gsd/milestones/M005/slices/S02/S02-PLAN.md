# S02: Component Color Audit and Visual Verification

**Goal:** Fix all hardcoded dark-mode-optimized Tailwind status colors across 16 GSD component files with `dark:` variant pairs, and visually verify every major surface renders correctly in both themes.
**Demo:** Status badges, progress indicators, and diagnostic labels across all GSD surfaces show correct contrast in both light and dark themes; `text-amber-300` on the status bar is readable in light mode; both `npm run build` and `npm run build:web-host` pass.

## Must-Haves

- All `text-emerald-400` → `text-emerald-600 dark:text-emerald-400`
- All `text-amber-400` → `text-amber-600 dark:text-amber-400`
- All `text-amber-300` → `text-amber-600 dark:text-amber-300`
- All `text-red-400` → `text-red-600 dark:text-red-400`
- All `text-blue-400` → `text-blue-600 dark:text-blue-400`
- Translucent backgrounds (`bg-*-500/10`, `border-*-500/20`) left unchanged (work on both themes)
- `npm run build` and `npm run build:web-host` both pass
- Visual verification of all major surfaces in both themes

## Verification

- `rg "text-emerald-400" web/components/gsd/ -g "*.tsx" | grep -v "dark:text-emerald-400"` — returns empty (every instance has a dark: pair)
- `rg "text-amber-400" web/components/gsd/ -g "*.tsx" | grep -v "dark:text-amber-400"` — returns empty
- `rg "text-amber-300" web/components/gsd/ -g "*.tsx" | grep -v "dark:text-amber-300"` — returns empty
- `rg "text-red-400" web/components/gsd/ -g "*.tsx" | grep -v "dark:text-red-400"` — returns empty
- `rg "text-blue-400" web/components/gsd/ -g "*.tsx" | grep -v "dark:text-blue-400"` — returns empty
- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:" | wc -l` — returns 0 (no unmatched instances across entire directory)
- `npm run build` exits 0
- `npm run build:web-host` exits 0
- **Failure-path diagnostic:** `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — any non-empty output is a missed conversion with exact file:line. This is the primary machine-inspectable failure surface for color audit regressions.

## Tasks

- [x] **T01: Fix hardcoded status colors in high-impact components** `est:45m`
  - Why: The four highest-impact files (command-surface, visualizer-view, diagnostics-panels, remaining-command-panels) contain ~94 of the ~129 hardcoded status color references. Fixing these covers the majority of the visual breakage.
  - Files: `web/components/gsd/command-surface.tsx`, `web/components/gsd/visualizer-view.tsx`, `web/components/gsd/diagnostics-panels.tsx`, `web/components/gsd/remaining-command-panels.tsx`
  - Do: For each file, find all `text-emerald-400`, `text-amber-400`, `text-amber-300`, `text-red-400`, `text-blue-400` instances and add the corresponding light-mode class before the dark variant. Pattern: `text-emerald-400` becomes `text-emerald-600 dark:text-emerald-400`. Leave translucent bg/border classes unchanged. Work mechanically — the mapping is 1:1 from the research color table.
  - Verify: Grep each file for solo `text-*-400`/`text-*-300` status colors — all should have `dark:` pairs. `npm run build` passes.
  - Done when: All four files have zero unmatched dark-mode-only status color utilities.

- [x] **T02: Fix hardcoded status colors in remaining components** `est:30m`
  - Why: The remaining 12 files have ~35 hardcoded references. Completing these achieves full coverage.
  - Files: `web/components/gsd/knowledge-captures-panel.tsx`, `web/components/gsd/settings-panels.tsx`, `web/components/gsd/onboarding/step-authenticate.tsx`, `web/components/gsd/activity-view.tsx`, `web/components/gsd/onboarding/step-ready.tsx`, `web/components/gsd/onboarding/step-optional.tsx`, `web/components/gsd/sidebar.tsx`, `web/components/gsd/roadmap.tsx`, `web/components/gsd/status-bar.tsx`, `web/components/gsd/shell-terminal.tsx`, `web/components/gsd/scope-badge.tsx`, `web/components/gsd/file-content-viewer.tsx`
  - Do: Same mechanical pattern as T01. Pay special attention to `status-bar.tsx` (`text-amber-300` is worst-case contrast) and `sidebar.tsx` (already has dark: support in some places — verify no duplicates).
  - Verify: Full grep check across all `web/components/gsd/` — zero solo `text-*-400`/`text-*-300` status colors without `dark:` pairs. `npm run build` passes.
  - Done when: Zero unmatched dark-mode-only status color utilities across the entire `web/components/gsd/` directory.

- [x] **T03: Final build verification and visual spot-check** `est:20m`
  - Why: Both builds must pass, and the highest-risk surfaces need visual confirmation.
  - Files: none (verification-only task)
  - Do: Run `npm run build` and `npm run build:web-host`. Start dev server and visually verify the highest-risk surfaces in both themes: status-bar (amber text), command-surface recovery section (amber/red), diagnostics panels (severity colors), onboarding steps (status indicators), visualizer tabs (chart colors), roadmap (milestone statuses).
  - Verify: Both builds exit 0. Visual confirmation of correct rendering in both themes.
  - Done when: Both builds pass and visual spot-check confirms no readability issues in either theme.

## Observability / Diagnostics

- **Inspection surface:** After completion, `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` should return empty — any output reveals a missed instance.
- **Failure visibility:** A missed color conversion is visible in light mode as low-contrast or invisible text against the white background. Visual spot-check of status badges, diagnostic panels, and the status bar in light mode is the primary failure detection surface.
- **Build validation:** `npm run build` and `npm run build:web-host` catch any syntax errors introduced by class string edits.
- **Failure-path check:** After all tasks complete, run `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — any non-empty output is a missed conversion. Each line in output names the exact file:line to fix.
- **Redaction constraints:** None — this slice touches only CSS class strings, no secrets or user data.

## Files Likely Touched

- `web/components/gsd/command-surface.tsx`
- `web/components/gsd/visualizer-view.tsx`
- `web/components/gsd/diagnostics-panels.tsx`
- `web/components/gsd/remaining-command-panels.tsx`
- `web/components/gsd/knowledge-captures-panel.tsx`
- `web/components/gsd/settings-panels.tsx`
- `web/components/gsd/onboarding/step-authenticate.tsx`
- `web/components/gsd/activity-view.tsx`
- `web/components/gsd/onboarding/step-ready.tsx`
- `web/components/gsd/onboarding/step-optional.tsx`
- `web/components/gsd/sidebar.tsx`
- `web/components/gsd/roadmap.tsx`
- `web/components/gsd/status-bar.tsx`
- `web/components/gsd/shell-terminal.tsx`
- `web/components/gsd/scope-badge.tsx`
- `web/components/gsd/file-content-viewer.tsx`
