---
id: T03
parent: S03
milestone: M008
provides:
  - All 24 component files migrated from raw Tailwind accent colors to semantic design tokens (R115 complete)
  - Full-repo grep scan returns zero raw accent color hits
  - Production build passes with all semantic token references resolving
key_files:
  - web/components/gsd/chat-mode.tsx
  - web/components/gsd/projects-view.tsx
  - web/components/gsd/update-banner.tsx
  - web/components/gsd/onboarding/step-optional.tsx
  - web/components/gsd/onboarding/step-authenticate.tsx
  - web/components/gsd/onboarding/step-ready.tsx
  - web/components/gsd/scope-badge.tsx
  - web/components/ui/toast.tsx
  - web/components/gsd/app-shell.tsx
  - web/components/gsd/activity-view.tsx
  - web/components/gsd/shell-terminal.tsx
  - web/components/gsd/onboarding/step-dev-root.tsx
  - web/components/gsd/status-bar.tsx
  - web/components/gsd/sidebar.tsx
  - web/components/gsd/roadmap.tsx
  - web/components/gsd/terminal.tsx
  - web/components/gsd/onboarding/step-provider.tsx
  - web/components/gsd/file-content-viewer.tsx
key_decisions:
  - none
patterns_established:
  - "Same mechanical sed substitution as T02: emerald-*/green-* → success, amber-*/orange-* → warning, red-* → destructive, sky-*/blue-* → info. All shade levels collapse to one token. Opacity modifiers preserved."
observability_surfaces:
  - "rg 'emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]' web/components/ -g '*.tsx' -g '*.ts' | wc -l → 0 confirms no regressions"
  - "npm run build:web-host exit 0 confirms all semantic tokens resolve in Tailwind v4"
duration: 5m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Migrate remaining 18 files and verify full build

**Replaced ~60 raw Tailwind accent color classes with semantic design tokens across 18 remaining component files; full-repo grep returns zero hits and production build passes.**

## What Happened

Applied a single sed pass across all 18 files using the same substitution rules established in T02: `emerald-*`/`green-*` → `success`, `amber-*`/`orange-*` → `warning`, `red-*` → `destructive`, `sky-*`/`blue-*` → `info`. All shade levels (300/400/500/600) map to the same semantic token. Opacity modifiers (e.g., `/20`, `/80`) were preserved as-is.

Spot-checked `chat-mode.tsx` (largest file, 12 replacements) and `toast.tsx` (shadcn component with `group-[.destructive]` prefix pattern) to confirm correct substitution. Both looked correct with proper token usage.

## Verification

- `rg "emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]" web/components/ -g "*.tsx" -g "*.ts" | wc -l` → `0` ✅
- `npm run build:web-host` → exit 0, compiled successfully in 16.7s ✅
- `grep -c 'defaultTheme="dark"' web/app/layout.tsx` → `1` ✅ (slice-level check, from T01)
- All 3 slice-level verification checks pass — S03 is complete.

## Diagnostics

- Run `rg "emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]" web/components/ -g "*.tsx" -g "*.ts"` to check for regressions after future edits.
- If a semantic token class fails to resolve, `npm run build:web-host` stderr names the offending utility.
- Visual color discrepancies after migration point to token definitions in `globals.css`, not component code.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/chat-mode.tsx` — migrated ~12 raw accent color instances to semantic tokens
- `web/components/gsd/projects-view.tsx` — migrated ~10 raw accent color instances to semantic tokens
- `web/components/gsd/update-banner.tsx` — migrated ~5 raw accent color instances to semantic tokens
- `web/components/gsd/onboarding/step-optional.tsx` — migrated ~6 raw accent color instances to semantic tokens
- `web/components/gsd/onboarding/step-authenticate.tsx` — migrated ~6 raw accent color instances to semantic tokens
- `web/components/gsd/onboarding/step-ready.tsx` — migrated ~6 raw accent color instances to semantic tokens
- `web/components/gsd/scope-badge.tsx` — migrated ~4 raw accent color instances to semantic tokens
- `web/components/ui/toast.tsx` — migrated ~3 raw accent color instances within group-[.destructive] pattern
- `web/components/gsd/app-shell.tsx` — migrated ~3 raw accent color instances to semantic tokens
- `web/components/gsd/activity-view.tsx` — migrated ~4 raw accent color instances to semantic tokens
- `web/components/gsd/shell-terminal.tsx` — migrated ~3 raw accent color instances to semantic tokens
- `web/components/gsd/onboarding/step-dev-root.tsx` — migrated ~3 raw accent color instances to semantic tokens
- `web/components/gsd/status-bar.tsx` — migrated ~2 raw accent color instances to semantic tokens
- `web/components/gsd/sidebar.tsx` — migrated ~2 raw accent color instances to semantic tokens
- `web/components/gsd/roadmap.tsx` — migrated ~2 raw accent color instances to semantic tokens
- `web/components/gsd/terminal.tsx` — migrated ~1 raw accent color instance to semantic token
- `web/components/gsd/onboarding/step-provider.tsx` — migrated ~1 raw accent color instance to semantic token
- `web/components/gsd/file-content-viewer.tsx` — migrated ~1 raw accent color instance to semantic token
