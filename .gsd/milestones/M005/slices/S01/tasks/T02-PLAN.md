---
estimated_steps: 5
estimated_files: 3
---

# T02: Wire ThemeProvider and Add NavRail Toggle

**Slice:** S01 — Theme Foundation and NavRail Toggle
**Milestone:** M005

## Description

Import the existing `ThemeProvider` into the root layout, add `suppressHydrationWarning` to `<html>`, and build a theme toggle button in the NavRail sidebar footer that cycles through system → light → dark with Monitor/Sun/Moon icons.

## Steps

1. Read `web/components/theme-provider.tsx` to confirm its props and export shape
2. Edit `web/app/layout.tsx`: import `ThemeProvider`, add `suppressHydrationWarning` to `<html>`, wrap children with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
3. Read `web/components/gsd/sidebar.tsx` to find the footer section layout (Git, Settings, LogOut buttons)
4. Add a theme toggle button between Settings and LogOut in the sidebar footer. Import `useTheme` from `next-themes` and `Monitor`, `Sun`, `Moon` icons from `lucide-react`. The button cycles: system → light → dark → system. Show the icon matching the current resolved theme. Add a tooltip showing current mode name.
5. Verify `npm run build` passes and grep checks confirm wiring

## Must-Haves

- [ ] `ThemeProvider` wraps app in `layout.tsx` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`
- [ ] `suppressHydrationWarning` on `<html>` element
- [ ] Theme toggle button in NavRail footer with Monitor/Sun/Moon icons
- [ ] Toggle cycles system → light → dark → system
- [ ] `npm run build` passes

## Verification

- `npm run build` exits 0
- `rg "ThemeProvider" web/app/layout.tsx` — confirms import and usage
- `rg "suppressHydrationWarning" web/app/layout.tsx` — confirms attribute
- `rg "useTheme" web/components/gsd/sidebar.tsx` — confirms toggle is wired
- Theme toggle renders in sidebar footer

## Observability Impact

- **Theme class on `<html>`:** `document.documentElement.classList.contains('dark')` returns `true` in dark mode, `false` in light/system-light. This is the ground-truth signal for which theme is active.
- **ThemeProvider state:** `next-themes` stores the user's choice in `localStorage` under key `theme`. Values: `"system"`, `"light"`, `"dark"`. Absence means first visit (defaults to system).
- **FOIT prevention:** `suppressHydrationWarning` on `<html>` prevents React hydration mismatch warnings caused by next-themes injecting the `dark` class before hydration. Without it, console shows hydration errors on every page load.
- **Toggle button state:** The NavRail theme button's `title` attribute shows the current mode name ("System", "Light", "Dark") — inspectable via accessibility tree or DevTools hover.
- **Failure signals:** If ThemeProvider is missing, `useTheme()` returns `undefined` theme and the toggle button has no effect. If `suppressHydrationWarning` is missing, hydration mismatch warnings appear in console.

## Inputs

- `web/components/theme-provider.tsx` — existing ThemeProvider wrapper (read to confirm API)
- `web/app/layout.tsx` — root layout to modify
- `web/components/gsd/sidebar.tsx` — NavRail with footer section
- T01 completed CSS variables — light/dark split must be in place for visual verification

## Expected Output

- `web/app/layout.tsx` — ThemeProvider wired, suppressHydrationWarning added
- `web/components/gsd/sidebar.tsx` — theme toggle button added to footer
