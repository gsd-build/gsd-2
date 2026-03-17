---
estimated_steps: 3
estimated_files: 0
---

# T03: Final Build Verification and Visual Spot-Check

**Slice:** S02 — Component Color Audit and Visual Verification
**Milestone:** M005

## Description

Run both production builds and visually verify the highest-risk surfaces in both themes. This is the final verification task that confirms the milestone's acceptance criteria.

## Steps

1. Run `npm run build` — confirm exits 0
2. Run `npm run build:web-host` — confirm exits 0
3. Start dev server, toggle between light and dark themes, and visually spot-check: status-bar (amber text legibility), command-surface recovery section (amber/red status colors), diagnostics panels (severity color badges), onboarding steps (status indicators), visualizer tabs (chart elements), roadmap (milestone status colors)

## Must-Haves

- [ ] `npm run build` exits 0
- [ ] `npm run build:web-host` exits 0
- [ ] Visual confirmation that highest-risk surfaces render correctly in both themes

## Verification

- Both builds exit 0
- Visual spot-check of status-bar, command-surface, diagnostics, onboarding, visualizer, roadmap in both themes

## Inputs

- T01 and T02 complete (all component colors fixed)
- S01 complete (theme mechanism working)

## Observability Impact

- **Build signals:** `npm run build` and `npm run build:web-host` exit codes are the primary machine-inspectable signals. Non-zero exit reveals syntax errors from class string edits.
- **Grep diagnostic:** `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` — any output means a missed conversion survived into verification. Each line names file:line.
- **Visual failure surface:** In light mode, missed conversions appear as invisible or barely-visible text on white backgrounds. Status bar amber text and diagnostic severity badges are highest-risk.
- **Future inspection:** Re-run the grep diagnostic after any component edit that touches status colors. Both build commands serve as regression gates in CI.

## Expected Output

- Passing builds confirming no regressions
- Visual confirmation of correct rendering in both themes
