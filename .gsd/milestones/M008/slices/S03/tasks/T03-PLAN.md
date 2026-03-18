---
estimated_steps: 4
estimated_files: 18
---

# T03: Migrate remaining 18 files and verify full build

**Slice:** S03 — Theme Defaults & Light Mode Color Audit
**Milestone:** M008

## Description

Complete the color audit by migrating all remaining 18 component files from raw Tailwind accent colors to semantic CSS tokens, then run the full-repo grep verification and production build to close out R115. These files have 1–18 instances each — much smaller than the T02 batch.

## Steps

1. **Migrate the medium-count files (5-18 instances each):**
   - `web/components/gsd/chat-mode.tsx` (~18 instances) — `red-*` → `destructive`, `blue-*` → `info`, `green-*` → `success`, `amber-*` → `warning`. Watch for the `animate-ping` pattern with `bg-*-500/20`.
   - `web/components/gsd/projects-view.tsx` (~17 instances) — `emerald-*` → `success`, `sky-*` → `info`, `amber-*` → `warning`, `orange-*` → `warning`, `red-*` → `destructive`
   - `web/components/gsd/update-banner.tsx` (~9 instances) — `emerald-*` → `success`, `orange-*` → `warning`
   - `web/components/gsd/onboarding/step-optional.tsx` (~9 instances) — `emerald-*` → `success`
   - `web/components/gsd/onboarding/step-authenticate.tsx` (~8 instances) — `emerald-*` → `success`
   - `web/components/gsd/onboarding/step-ready.tsx` (~7 instances) — `emerald-*` → `success`
   - `web/components/gsd/scope-badge.tsx` (~6 instances) — `amber-*` → `warning`, `sky-*` → `info`

2. **Migrate the small-count files (1-4 instances each):**
   - `web/components/ui/toast.tsx` (~4 instances) — `red-*` → `destructive`. This is a shadcn component with `group-[.destructive]` prefix pattern — migrate the raw color classes within that pattern.
   - `web/components/gsd/app-shell.tsx` (~4 instances) — `amber-*` → `warning`
   - `web/components/gsd/activity-view.tsx` (~4 instances) — `blue-*` → `info`, `emerald-*` → `success`, `red-*` → `destructive`, `amber-*` → `warning`
   - `web/components/gsd/shell-terminal.tsx` (~3 instances) — `emerald-*` → `success`, `red-*` → `destructive`
   - `web/components/gsd/onboarding/step-dev-root.tsx` (~3 instances) — `red-*` → `destructive`
   - `web/components/gsd/status-bar.tsx` (~2 instances) — `amber-*` → `warning`
   - `web/components/gsd/sidebar.tsx` (~2 instances) — `emerald-*` → `success`, `amber-*` → `warning`
   - `web/components/gsd/roadmap.tsx` (~2 instances) — `emerald-*` → `success`, `amber-*` → `warning`
   - `web/components/gsd/terminal.tsx` (~1 instance) — `amber-*` → `warning`
   - `web/components/gsd/onboarding/step-provider.tsx` (~1 instance) — `emerald-*` → `success`
   - `web/components/gsd/file-content-viewer.tsx` (~1 instance) — `blue-*` → `info`

3. **Full-repo grep verification:** Run `rg "emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]" web/components/ -g "*.tsx" -g "*.ts"` — must return zero hits. If any remain, fix them.

4. **Production build:** Run `npm run build:web-host` — must exit 0. This confirms all semantic token classes (`text-success`, `bg-warning/15`, `border-destructive/20`, etc.) resolve correctly in Tailwind v4's CSS-first config via the `@theme inline` registration in `globals.css`.

## Must-Haves

- [ ] All 18 remaining files have zero raw Tailwind accent colors
- [ ] Full-repo grep scan returns zero hits
- [ ] `npm run build:web-host` exits 0

## Verification

- `rg "emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]" web/components/ -g "*.tsx" -g "*.ts" | wc -l` returns `0`
- `npm run build:web-host` exits 0

## Inputs

- T02 completed — the 6 largest files are already migrated
- Same substitution rules as T02: `emerald-*`/`green-*` → `success`, `amber-*`/`orange-*` → `warning`, `red-*` → `destructive`, `sky-*`/`blue-*` → `info`. All shade levels map to the same token. Preserve opacity modifiers. Include hover/group-hover/focus variants.
- `web/app/globals.css` already defines the semantic tokens — no changes needed

## Observability Impact

- **Grep scan signal:** `rg "emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]" web/components/ -g "*.tsx" -g "*.ts" | wc -l` — returns `0` when all migrations are complete. Any non-zero count identifies files that still need migration.
- **Build signal:** `npm run build:web-host` exit code — `0` confirms all semantic token references resolve. Non-zero exit with stderr naming an unknown utility class means a token is referenced but not defined in `globals.css`.
- **Runtime failure mode:** If a semantic token class (e.g., `bg-success`) is used but not registered in `@theme inline`, the element renders with no color (transparent). Visible as missing background/text color in the UI. DevTools → computed styles shows no value for the expected property.

## Expected Output

- All 18 files modified with semantic token classes replacing raw Tailwind accent colors
- `rg` scan confirming zero remaining raw accent color instances
- `npm run build:web-host` passing, confirming all token references resolve
