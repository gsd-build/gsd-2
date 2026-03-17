# S02: Component Color Audit and Visual Verification — UAT

**Milestone:** M005
**Written:** 2026-03-17

## UAT Type

- UAT mode: mixed (artifact-driven grep checks + live-runtime visual verification)
- Why this mode is sufficient: The color audit is mechanically verifiable via grep (every status color instance must have a dark: pair), but contrast/readability in both themes requires visual confirmation on actual rendered surfaces.

## Preconditions

- S01 complete: ThemeProvider wired, NavRail toggle functional, CSS variable light/dark split in globals.css
- `npm run build` and `npm run build:web-host` both pass
- Dev server running (`npm run dev` or equivalent) accessible in a browser

## Smoke Test

1. Open the app in a browser
2. Click the theme toggle in the NavRail footer to switch to light mode
3. Navigate to Dashboard — status badges (active/validated/deferred) should show colored text readable against the white background
4. Switch back to dark mode — same badges should remain readable on dark background

## Test Cases

### 1. Status bar amber text in light mode (worst-case contrast)

1. Switch to light theme via NavRail toggle
2. Observe the status bar at the bottom of the workspace
3. **Expected:** Amber status text uses `text-amber-600` (readable on white/light gray). No invisible or washed-out amber text.

### 2. Command surface recovery section colors

1. Switch to light theme
2. Open the command surface (type `/gsd doctor` or trigger recovery)
3. Observe severity badges and status indicators
4. **Expected:** Red error text uses `text-red-600`, amber warning text uses `text-amber-600`, green success text uses `text-emerald-600` — all clearly readable on light backgrounds.

### 3. Diagnostics panels severity colors

1. Switch to light theme
2. Open `/gsd forensics`, `/gsd doctor`, and `/gsd skill-health` panels
3. Observe severity badges, anomaly labels, and pass/fail indicators
4. **Expected:** All status colors (red, amber, emerald, blue) are readable. No invisible text on light backgrounds.

### 4. Onboarding step status indicators

1. Switch to light theme
2. Navigate to onboarding steps (step-authenticate, step-ready, step-optional)
3. Observe emerald check marks, status badges, completion indicators
4. **Expected:** Emerald success indicators use `text-emerald-600` — clearly visible on white/light backgrounds.

### 5. Dark mode preserved rendering

1. Switch to dark theme via NavRail toggle
2. Navigate through Dashboard, Roadmap, Visualizer, Activity Log, Settings
3. **Expected:** All status colors render as before (emerald-400, amber-400, red-400, blue-400) — no visual regression from adding the light-mode classes.

### 6. System theme mode follows OS preference

1. Set OS to light mode
2. Use NavRail toggle to select "system" mode (monitor icon)
3. **Expected:** App renders in light theme with correct status colors
4. Change OS to dark mode
5. **Expected:** App switches to dark theme with correct status colors

### 7. Visualizer tab chart colors

1. Switch to light theme
2. Open the Visualizer view (`/gsd visualize`)
3. Observe chart labels, tab indicators, and status text
4. **Expected:** All colored text elements are readable against light backgrounds.

### 8. Roadmap milestone status icons

1. Switch to light theme
2. Open the Roadmap view
3. Observe milestone and slice status indicators (complete/active/pending)
4. **Expected:** Emerald (complete) and amber (active) status colors readable on light background.

### 9. Settings panel badges

1. Switch to light theme
2. Open settings (`/gsd prefs` or `/gsd config`)
3. Observe model routing badges ("Active", "Thinking"), budget indicators
4. **Expected:** Status badges readable — emerald/amber/red text visible on light backgrounds.

### 10. Activity view log entry icons

1. Switch to light theme
2. Open Activity view
3. Observe activity log entry icons (blue info, emerald success, red error, amber warning)
4. **Expected:** All four status icon colors readable on light backgrounds.

## Edge Cases

### Hover state colors

1. Switch to light theme
2. In shell terminal, hover over a red-highlighted element (e.g., error dismiss button)
3. **Expected:** Hover state uses `hover:text-red-600` (light) — visible color change on hover.

### Fractional opacity text

1. Switch to light theme
2. Navigate to onboarding step-optional (emerald-300/80 opacity badges)
3. **Expected:** Emerald badges with 80% opacity still readable — `text-emerald-600/80` provides sufficient contrast on light backgrounds.

### Theme toggle persistence

1. Switch to light theme
2. Reload the page
3. **Expected:** Light theme persists (no flash of dark theme on reload)
4. Close and reopen the browser tab
5. **Expected:** Light theme still active from localStorage

## Failure Signals

- Any status text invisible or barely readable against the background in either theme
- Amber text on status bar washed out in light mode (was the highest-risk surface at ~1.7:1 contrast before fix)
- Dark mode regression — status colors lost or duplicated classes causing visual glitches
- Build failures from malformed class strings
- `rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` returns any output

## Requirements Proved By This UAT

- R113 — Complete theme lifecycle: light/dark CSS variable split, system-aware default, manual toggle, persistence, and readable status colors in both themes across all major surfaces.

## Not Proven By This UAT

- Comprehensive accessibility contrast ratio testing (WCAG AA compliance) — visual spot-check confirms readability but does not measure exact contrast ratios
- Every possible UI state combination (error states, empty states, loading states with status colors)
- Colors outside the audited set (`text-gray-*`, `text-yellow-*`, etc.) that might have light-mode contrast issues

## Notes for Tester

- The highest-risk surface is the **status bar amber text** — this was `text-amber-300` on white (~1.7:1 contrast) before the fix. Verify it's readable in light mode first.
- The **grep check** (`rg "text-(emerald|amber|red|blue)-(300|400)" web/components/gsd/ -g "*.tsx" | grep -v "dark:"` returning 0) is the machine-verifiable gate. If it passes, the mechanical conversion is complete.
- Some diagnostics panels (forensics, doctor, skill-health) may show "no data" if there's no active project state — the test is about color rendering, not data presence.
- The `dark:group-hover:text-emerald-400` and `dark:hover:text-red-400` modifier-prefixed patterns are correctly paired — they show up in per-color greps but are false positives. The authoritative check is `grep -v "dark:"` on the full pattern.
