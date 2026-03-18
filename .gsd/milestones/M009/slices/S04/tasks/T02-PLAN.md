---
estimated_steps: 3
estimated_files: 1
---

# T02: Add light-mode CSS variants for file viewer and markdown styles

**Slice:** S04 — Final Polish & Verification
**Milestone:** M009

## Description

The `.file-viewer-code` and `.markdown-body` styles in `globals.css` use hardcoded oklch values that only look correct on dark backgrounds. In light mode, text is near-white on a white background — unreadable. This task replaces those hardcoded values with CSS custom properties from the existing design token system, which already has correct values for both `:root` (light) and `.dark` themes.

**Relevant skill:** `frontend-design` (CSS design token work)

## Steps

1. **Replace `.file-viewer-code` hardcoded values.** In `globals.css`, find the `.file-viewer-code` section (starts around line 150):
   - `.file-viewer-code code .line:hover` — change `background: oklch(0.15 0 0)` to `background: var(--accent)`. The `--accent` token is `oklch(0.9 0 0)` in light / `oklch(0.2 0 0)` in dark — perfect for hover highlighting.
   - `.file-viewer-code code .line::before` — change `color: oklch(0.35 0 0)` to `color: var(--code-line-number)`. The `--code-line-number` token is `oklch(0.55 0 0)` in light / `oklch(0.35 0 0)` in dark — already defined for this purpose.

2. **Replace `.markdown-body` hardcoded values.** Find the `.markdown-body` section (starts around line 185):
   - `.markdown-body` — change `color: oklch(0.85 0 0)` to `color: var(--foreground)`. Light: `oklch(0.15 0 0)`, dark: `oklch(0.9 0 0)`.
   - `.markdown-body h1`, `.markdown-body h2` — change `border-bottom: 1px solid oklch(0.22 0 0)` to `border-bottom: 1px solid var(--border)`. Light: `oklch(0.85 0 0)`, dark: `oklch(0.22 0 0)`.
   - `.markdown-body blockquote` — change `border-left: 3px solid oklch(0.3 0 0)` to `border-left: 3px solid var(--border)` and `color: oklch(0.6 0 0)` to `color: var(--muted-foreground)`. Light: `oklch(0.45 0 0)`, dark: `oklch(0.55 0 0)` — close enough to the original intent.
   - `.markdown-body hr` — change `border-top: 1px solid oklch(0.22 0 0)` to `border-top: 1px solid var(--border)`.
   - `.markdown-body strong` — change `color: oklch(0.92 0 0)` to `color: var(--foreground)`. Strong text should be readable in both modes.
   - `.markdown-body del` — change `color: oklch(0.5 0 0)` to `color: var(--muted-foreground)`.

3. **Verify no stray hardcoded oklch remains in file-viewer/markdown sections.** Run `rg "oklch" web/app/globals.css` and confirm that no hardcoded oklch values remain in the `.file-viewer-code` or `.markdown-body` blocks. Note: the `.markdown-body input[type="checkbox"]` accent-color uses `oklch(0.65 0.15 145)` which is a deliberate green accent — this one is fine to keep as-is since it's the same hue in both themes.

**Key constraints:**
- Only modify `.file-viewer-code` and `.markdown-body` rules — do not touch `:root`, `.dark`, or any other sections.
- The checkbox `accent-color: oklch(0.65 0.15 145)` is intentionally a fixed green. Leave it.
- Do NOT add new custom properties to `:root`/`.dark` — use only existing tokens.

## Must-Haves

- [ ] `.file-viewer-code .line:hover` uses `var(--accent)` instead of hardcoded oklch
- [ ] `.file-viewer-code .line::before` uses `var(--code-line-number)` instead of hardcoded oklch
- [ ] `.markdown-body` color uses `var(--foreground)` instead of hardcoded oklch
- [ ] `.markdown-body` heading borders use `var(--border)` instead of hardcoded oklch
- [ ] `.markdown-body blockquote` border and color use token references
- [ ] `.markdown-body hr` uses `var(--border)`
- [ ] `.markdown-body strong` uses `var(--foreground)`
- [ ] `.markdown-body del` uses `var(--muted-foreground)`
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg "oklch" web/app/globals.css` — no hardcoded oklch values in `.file-viewer-code` section (except possibly the fallback markdown pre block `bg-[#0d1117]` which is in the component JSX, not CSS)
- `rg "oklch" web/app/globals.css` — the only oklch in `.markdown-body` is the checkbox accent-color
- `rg "var(--" web/app/globals.css` — new references to `--foreground`, `--border`, `--muted-foreground`, `--accent`, `--code-line-number` appear in the file-viewer/markdown sections

## Inputs

- `web/app/globals.css` — current file with hardcoded dark-only oklch values in file viewer CSS
- `:root` / `.dark` token blocks in same file — reference for which tokens map to which values

## Observability Impact

- **Inspection surface:** Browser DevTools → Elements → Computed tab on any `.file-viewer-code .line` or `.markdown-body` element. In light mode, computed `color` and `border-color` values should resolve to the `:root` token values; in dark mode, to `.dark` token values.
- **Failure visibility:** If a `var()` reference points to an undefined token, the browser falls back to `initial` — text becomes invisible or borders disappear. This is immediately visible in both modes.
- **Verification signal:** `rg "oklch" web/app/globals.css` should show zero hits in `.file-viewer-code` and only the checkbox accent-color hit in `.markdown-body`.

## Expected Output

- `web/app/globals.css` — modified: `.file-viewer-code` and `.markdown-body` sections use CSS custom properties that work in both light and dark themes
