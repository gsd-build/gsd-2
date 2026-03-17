---
id: T02
parent: S01
milestone: M005
provides:
  - ThemeProvider wrapping app with class-based theming (system/light/dark)
  - suppressHydrationWarning on <html> preventing FOIT
  - NavRail theme toggle button cycling system → light → dark
  - Theme-aware logo switching (black on light, white on dark)
key_files:
  - web/app/layout.tsx
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/app-shell.tsx
key_decisions:
  - Used Tailwind dark: variant for logo switching instead of JS useTheme — zero JS cost, works with class-based theme, no hydration flash
  - Theme toggle uses mounted guard to prevent hydration mismatch on icon render — shows Monitor icon as SSR fallback
  - Toggle placed between Settings and LogOut in NavRail footer for discoverability without disrupting primary nav flow
patterns_established:
  - Theme-dependent assets use paired dark:/hidden classes (e.g. dark:hidden + hidden dark:block) instead of JS-driven src switching
  - Client components using useTheme must guard with mounted state to avoid hydration mismatches
observability_surfaces:
  - localStorage key "theme" shows user's selected mode (system/light/dark)
  - document.documentElement.classList.contains('dark') returns active class state
  - data-testid="sidebar-theme-toggle" title attribute shows current mode name
  - Hydration mismatch warnings in console indicate missing suppressHydrationWarning
duration: 15m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Wire ThemeProvider and Add NavRail Toggle

**Wired ThemeProvider in root layout with FOIT prevention and added a system/light/dark toggle in the NavRail footer; fixed logo to switch between black and white variants per theme.**

## What Happened

1. Imported `ThemeProvider` from `@/components/theme-provider` into `web/app/layout.tsx` and wrapped `{children}` + `<Toaster>` with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`.
2. Added `suppressHydrationWarning` to `<html lang="en">` to prevent React hydration mismatch from next-themes' class injection script.
3. In `web/components/gsd/sidebar.tsx`, imported `useTheme` from `next-themes` and `Monitor`, `Sun`, `Moon` from `lucide-react`. Added a theme toggle button between Settings and LogOut in the NavRail footer. The button cycles system → light → dark → system. Icon and tooltip reflect the current theme selection. A mounted guard prevents SSR/client mismatch.
4. Fixed the GSD logo in `web/components/gsd/app-shell.tsx` — it was hardcoded to `logo-white.svg` (invisible on light backgrounds). Replaced with paired `<img>` elements using Tailwind `dark:hidden` / `hidden dark:block` to show `logo-black.svg` in light mode and `logo-white.svg` in dark mode.

## Verification

- `npm run build` exits 0 — ✅
- `rg "ThemeProvider" web/app/layout.tsx` — shows import and `<ThemeProvider>` wrapper ✅
- `rg "suppressHydrationWarning" web/app/layout.tsx` — confirms attribute on `<html>` ✅
- `rg "useTheme" web/components/gsd/sidebar.tsx` — confirms import and usage ✅
- Browser: cycled theme toggle three times (system → light → dark → system), confirmed `localStorage.getItem('theme')` transitions correctly and `document.documentElement.classList.contains('dark')` toggles ✅
- Browser: logo renders as black SVG on light background, white SVG on dark background ✅
- Slice-level checks:
  - `rg "oklch" ... | grep -v "^.*--"` — no raw oklch outside var defs ✅
  - `rg "ThemeProvider" web/app/layout.tsx` — ✅
  - `rg "suppressHydrationWarning" web/app/layout.tsx` — ✅
  - `rg "theme" web/components/gsd/sidebar.tsx` — ✅
  - Visual toggle through all three modes — ✅
  - CSS variable diagnostic (`getComputedStyle` returns light value without `.dark` class) — ✅

## Diagnostics

- **Theme state:** `localStorage.getItem('theme')` → `"system"`, `"light"`, or `"dark"`. Absence means first visit.
- **Active class:** `document.documentElement.classList.contains('dark')` → true/false confirms which CSS scope is active.
- **Toggle button:** `document.querySelector('[data-testid="sidebar-theme-toggle"]').title` → shows "System", "Light", or "Dark".
- **FOIT check:** Hard-reload with cache disabled — page should never flash wrong theme colors during hydration.
- **Logo check:** In DevTools, inspect header `<img>` elements — one should have `display:none` (the hidden variant) depending on active theme.

## Deviations

- **Logo fix added:** The task plan didn't mention the logo, but user reported it was invisible in light mode. Fixed by adding theme-aware logo switching with Tailwind dark: variant classes. This is a direct consequence of enabling light mode — the logo was hardcoded for dark-only.

## Known Issues

None.

## Files Created/Modified

- `web/app/layout.tsx` — Added ThemeProvider wrapper and suppressHydrationWarning
- `web/components/gsd/sidebar.tsx` — Added theme toggle button with useTheme, Monitor/Sun/Moon icons
- `web/components/gsd/app-shell.tsx` — Fixed logo to switch between black/white SVG per theme
- `.gsd/milestones/M005/slices/S01/tasks/T02-PLAN.md` — Added Observability Impact section
