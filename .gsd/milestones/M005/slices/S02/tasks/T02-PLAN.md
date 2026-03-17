---
estimated_steps: 4
estimated_files: 12
---

# T02: Fix Hardcoded Status Colors in Remaining Components

**Slice:** S02 — Component Color Audit and Visual Verification
**Milestone:** M005

## Description

The remaining 12 GSD component files have ~35 hardcoded dark-mode-optimized status color references. Apply the same mechanical `dark:` pair transformation. Special attention to `status-bar.tsx` (worst-case `text-amber-300` contrast) and `sidebar.tsx` (may already have some dark: variants).

## Steps

1. Process the medium-impact files (11+ refs each): `knowledge-captures-panel.tsx`, `settings-panels.tsx`
2. Process the low-impact files (2-4 refs each): `step-authenticate.tsx`, `activity-view.tsx`, `step-ready.tsx`, `step-optional.tsx`, `sidebar.tsx`, `roadmap.tsx`, `status-bar.tsx`, `shell-terminal.tsx`
3. Process the single-ref files: `scope-badge.tsx`, `file-content-viewer.tsx`
4. Run full directory grep to confirm complete coverage: `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` returns empty

## Must-Haves

- [ ] Zero solo dark-mode-only status colors across all `web/components/gsd/` .tsx files
- [ ] No duplicate dark: variants where sidebar.tsx may already have them
- [ ] `npm run build` passes

## Verification

- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — empty output
- `npm run build` exits 0

## Inputs

- T01 complete (high-impact files already fixed)
- S01 complete (theme mechanism in place)

## Observability Impact

- **Inspection command:** `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — empty output means complete coverage.
- **Failure signal:** Any solo dark-mode-only status color renders as low-contrast or invisible text on white backgrounds in light mode. Status bar amber text is the worst-case surface.
- **Build signal:** `npm run build` catches any syntax errors from class string edits.

## Expected Output

- 14 files modified with dark: variant pairs for all status color utilities (12 planned + app-shell.tsx and step-provider.tsx discovered in grep)
