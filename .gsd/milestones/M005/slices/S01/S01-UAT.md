# S01: Theme Foundation and NavRail Toggle — UAT

**Milestone:** M005
**Written:** 2026-03-17

## UAT Type

- UAT mode: mixed (artifact-driven verification + live-runtime browser checks)
- Why this mode is sufficient: The theme system requires both static verification (CSS variables, build success, grep invariants) and live browser verification (visual theme switching, FOIT prevention, localStorage persistence).

## Preconditions

- Working directory is the M004 worktree or main repo with S01 changes applied
- `npm run build` passes (confirms no CSS parse errors or missing imports)
- Dev server running: `cd web && npm run dev` (or equivalent)
- Browser open to the running dev server (default: http://localhost:3000)

## Smoke Test

Click the theme toggle button in the NavRail footer (between Settings and LogOut). The entire page should visibly change between light and dark appearances. If the toggle is missing or clicking does nothing, S01 is broken.

## Test Cases

### 1. Light-mode CSS variables resolve correctly

1. Open browser DevTools → Console
2. Run: `document.documentElement.classList.remove('dark')`
3. Run: `getComputedStyle(document.documentElement).getPropertyValue('--background')`
4. **Expected:** Returns a high-lightness value (oklch with L ≈ 0.98), not the dark value (L ≈ 0.09)
5. Run: `getComputedStyle(document.documentElement).getPropertyValue('--foreground')`
6. **Expected:** Returns a low-lightness value (L ≈ 0.15), not the dark value (L ≈ 0.9)

### 2. Dark-mode CSS variables resolve correctly

1. Open browser DevTools → Console
2. Run: `document.documentElement.classList.add('dark')`
3. Run: `getComputedStyle(document.documentElement).getPropertyValue('--background')`
4. **Expected:** Returns a low-lightness value (L ≈ 0.09)
5. Run: `getComputedStyle(document.documentElement).getPropertyValue('--foreground')`
6. **Expected:** Returns a high-lightness value (L ≈ 0.9)

### 3. NavRail toggle cycles through all three modes

1. Locate the theme toggle button in the NavRail footer (between Settings and LogOut icons)
2. Hover over the button — note the tooltip text
3. Click once — observe the tooltip and icon change
4. Click again — observe the tooltip and icon change
5. Click a third time — observe it returns to the initial state
6. **Expected:** The toggle cycles system (Monitor icon, "System" tooltip) → light (Sun icon, "Light" tooltip) → dark (Moon icon, "Dark" tooltip) → system, and the page appearance changes on each click

### 4. Theme persists across browser reload

1. Click the toggle to set the theme to "Light"
2. Confirm the page shows light appearance
3. Open DevTools Console, run: `localStorage.getItem('theme')`
4. **Expected:** Returns `"light"`
5. Hard-reload the page (Cmd+Shift+R / Ctrl+Shift+R)
6. **Expected:** Page loads in light mode without any flash of dark mode
7. Check toggle tooltip — should show "Light"

### 5. System mode follows OS preference

1. Click the toggle until it shows "System" (Monitor icon)
2. Open OS system settings and change appearance to Light mode
3. **Expected:** Browser page switches to light appearance (may require OS settings to take effect)
4. Change OS appearance to Dark mode
5. **Expected:** Browser page switches to dark appearance

### 6. No FOIT on first load with system preference

1. Clear localStorage: DevTools Console → `localStorage.removeItem('theme')`
2. Set OS to Light mode
3. Hard-reload with "Disable cache" checked in DevTools Network tab
4. **Expected:** Page renders in light mode from the first paint — no flash of dark theme or unstyled content
5. Repeat with OS set to Dark mode
6. **Expected:** Page renders in dark mode from the first paint

### 7. Logo switches between themes

1. Set theme to Light
2. Look at the GSD logo in the sidebar header
3. **Expected:** Logo is black/dark colored (visible on light background)
4. Set theme to Dark
5. **Expected:** Logo is white/light colored (visible on dark background)
6. In DevTools Elements, find the header `<img>` tags — one should be hidden per theme

### 8. No raw oklch outside CSS variable definitions

1. In terminal, run: `rg "oklch" web/app/globals.css | grep -v "^.*--" | grep -v "^.*\/\*" | grep -v "^\s*$"`
2. **Expected:** No output (empty result)

### 9. Build passes clean

1. Run: `npm run build`
2. **Expected:** Exits with code 0, no errors

## Edge Cases

### Theme toggle on SSR (initial server render)

1. View page source (Ctrl+U) before any client JS executes
2. Look at the theme toggle button area
3. **Expected:** A neutral icon (Monitor) is rendered as the SSR fallback — not Sun or Moon, which would cause a hydration mismatch if the resolved theme differs

### Custom semantic tokens in light mode

1. Set theme to Light
2. Navigate to any surface showing success/warning/info colored text (dashboard status, terminal output)
3. **Expected:** Colored text (green for success, amber for warning, blue for info) is readable on the light background — not invisible or washed out
4. Switch to Dark
5. **Expected:** Same colored text is readable on the dark background

### File viewer line numbers in both themes

1. Navigate to the Files view and open a code file
2. Set theme to Light
3. **Expected:** Line numbers are visible (medium gray on light background)
4. Set theme to Dark
5. **Expected:** Line numbers are visible (medium gray on dark background)

## Failure Signals

- Theme toggle button missing from NavRail footer → T02 sidebar changes not applied
- Clicking toggle does nothing → ThemeProvider not wired or useTheme not connected
- Page flashes wrong theme on reload → `suppressHydrationWarning` missing or ThemeProvider `defaultTheme` wrong
- Black/invisible text on light background → CSS variable light values missing or too similar to background
- Logo invisible on one theme → `app-shell.tsx` logo fix not applied
- `npm run build` fails → CSS parse error in globals.css or missing import
- Console shows "Hydration mismatch" warning → mounted guard missing in sidebar toggle
- `localStorage.getItem('theme')` returns null after setting → next-themes not persisting (ThemeProvider props wrong)

## Requirements Proved By This UAT

- R113 (partial) — Theme mechanism is wired: CSS variable light/dark split, ThemeProvider with system detection, NavRail toggle cycling, FOIT prevention, and localStorage persistence all verified. Full R113 validation requires S02 completion (component-level color audit).

## Not Proven By This UAT

- Component-level status color readability across all 16 files (S02 scope)
- `npm run build:web-host` (tested during execution but not part of this UAT — the packaged host adds complexity beyond theme verification)
- Visual correctness of every major surface in both themes (S02's visual verification scope)

## Notes for Tester

- The ~129 hardcoded Tailwind status colors (e.g., `text-amber-300`, `text-emerald-400`) will look wrong in light mode — this is expected and is S02's job to fix. Focus testing on base surfaces (backgrounds, borders, primary text) not status-colored text.
- The custom semantic tokens (`--success`, `--warning`, `--info`) have been tuned for contrast but may need adjustment after visual testing. Report specific surfaces where they look wrong.
- If testing on a system where OS preference detection doesn't work (some Linux DEs), skip test case 5 and test case 6 and verify the explicit light/dark toggle works instead.
