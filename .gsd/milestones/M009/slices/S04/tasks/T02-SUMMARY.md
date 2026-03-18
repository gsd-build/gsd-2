---
id: T02
parent: S04
milestone: M009
provides:
  - Light-mode-safe CSS for file-viewer-code and markdown-body sections
  - All hardcoded oklch values replaced with design token var() references
key_files:
  - web/app/globals.css
key_decisions:
  - Use existing design tokens only — no new custom properties added to :root/.dark
patterns_established:
  - Replace hardcoded oklch with var(--token) for theme-aware styles; keep deliberate fixed colors (checkbox green) as-is
observability_surfaces:
  - Browser DevTools computed styles on .file-viewer-code and .markdown-body elements show resolved token values per theme
duration: 8m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Add light-mode CSS variants for file viewer and markdown styles

**Replaced 8 hardcoded dark-only oklch values in .file-viewer-code and .markdown-body with design token var() references for correct light/dark theme rendering.**

## What Happened

The `.file-viewer-code` and `.markdown-body` sections in `globals.css` used hardcoded oklch values tuned for dark backgrounds — near-white text on white was unreadable in light mode. Replaced all 8 hardcoded values with CSS custom property references to the existing design token system:

- `.file-viewer-code .line:hover` background → `var(--accent)` (light: `oklch(0.9)`, dark: `oklch(0.2)`)
- `.file-viewer-code .line::before` color → `var(--code-line-number)` (light: `oklch(0.55)`, dark: `oklch(0.35)`)
- `.markdown-body` color → `var(--foreground)`
- `.markdown-body h1, h2` border → `var(--border)`
- `.markdown-body blockquote` border → `var(--border)`, color → `var(--muted-foreground)`
- `.markdown-body hr` border → `var(--border)`
- `.markdown-body strong` color → `var(--foreground)`
- `.markdown-body del` color → `var(--muted-foreground)`

The checkbox `accent-color: oklch(0.65 0.15 145)` was intentionally preserved — it's a fixed green that works in both themes.

## Verification

- `npm run build:web-host` → exit 0 (compiled in 7.9s, staged successfully)
- `rg oklch` in `.file-viewer-code` section → 0 hits (was 2)
- `rg oklch` in `.markdown-body` section → 1 hit (checkbox accent-color only, intentional)
- All expected `var()` references confirmed present: `--accent`, `--code-line-number`, `--foreground` (×2), `--border` (×4), `--muted-foreground` (×2)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` | 0 | ✅ pass | 13.1s |
| 2 | `grep oklch` in .file-viewer-code section | 0 | ✅ pass (0 hits) | <1s |
| 3 | `grep oklch` in .markdown-body section | 0 | ✅ pass (1 hit: checkbox only) | <1s |
| 4 | `rg var(--accent)` in globals.css | 0 | ✅ pass | <1s |
| 5 | `rg var(--code-line-number)` in globals.css | 0 | ✅ pass | <1s |
| 6 | `rg var(--foreground)` in file-viewer/markdown | 0 | ✅ pass (2 hits) | <1s |
| 7 | `rg var(--border)` in file-viewer/markdown | 0 | ✅ pass (4 hits) | <1s |
| 8 | `rg var(--muted-foreground)` in file-viewer/markdown | 0 | ✅ pass (2 hits) | <1s |

## Diagnostics

- **Inspection:** Browser DevTools → select any `.file-viewer-code .line` or `.markdown-body` element → Computed tab → verify `color`, `background`, `border-*` resolve to the `:root` (light) or `.dark` token values depending on active theme.
- **Failure mode:** If a `var()` reference is undefined, the property falls back to `initial` — text becomes invisible or borders disappear. This is immediately visible on page load.
- **Verification signal:** `grep -c oklch` in the file-viewer/markdown CSS sections should return 0 and 1 (checkbox only) respectively.

## Deviations

- The edit tool matched ambiguous short strings (`color: oklch(...)`) against the `:root`/`.dark` token blocks instead of the target sections on the first attempt. Used `sed` with explicit line numbers for the remaining 5 replacements. Also removed 4 lines of garbage appended to the file end by phantom edit matches.

## Known Issues

None.

## Files Created/Modified

- `web/app/globals.css` — Replaced 8 hardcoded oklch values in `.file-viewer-code` and `.markdown-body` with `var()` token references
