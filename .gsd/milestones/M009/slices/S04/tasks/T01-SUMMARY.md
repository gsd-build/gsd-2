---
id: T01
parent: S04
milestone: M009
provides:
  - Dual shiki theme support (dark + light) in FileContentViewer
  - Editor font size applied to View tab and read-only fallback
  - Theme-reactive code highlighting in CodeViewer and MarkdownViewer
key_files:
  - web/components/gsd/file-content-viewer.tsx
key_decisions:
  - Default to "dark" shiki theme when resolvedTheme is undefined (hydration safety)
patterns_established:
  - Thread resolved theme as prop through internal viewer components rather than calling useTheme in each
observability_surfaces:
  - React DevTools: theme prop on CodeViewer/MarkdownViewer shows resolved shiki theme name
  - Browser DevTools: inline fontSize style on TabsContent and read-only wrapper divs
  - Shiki failure degrades to PlainViewer (no crash, no blank screen)
duration: 12m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Wire font size and dual shiki themes into View tab

**Wired useEditorFontSize and useTheme into FileContentViewer — View tab now uses resolved shiki theme and respects editor font size preference**

## What Happened

Added `useEditorFontSize` and `useTheme` (from next-themes) imports to `file-content-viewer.tsx`. The shiki singleton now loads both `github-dark-default` and `github-light-default` themes. `CodeViewer` and `MarkdownViewer` accept a `theme` prop instead of hardcoding `"github-dark-default"`. The `MarkdownViewer` useEffect dependency array includes `theme` so code blocks re-highlight on theme toggle. `FileContentViewer` computes the shiki theme from `resolvedTheme` (defaulting to dark when undefined for hydration safety), then passes it through `ReadOnlyContent` to both viewers. Font size from `useEditorFontSize()` is applied as inline style on the View tab `TabsContent`, the Edit tab `TabsContent`, and the read-only fallback wrapper.

## Verification

- `npm run build:web-host` exits 0 (only pre-existing `@gsd/native` warning)
- `rg "github-light-default"` finds 2 matches (themes array + theme selection)
- `rg "useEditorFontSize"` finds 2 matches (import + usage)
- `rg "useTheme"` finds 2 matches (import + usage)
- `rg "resolvedTheme"` finds 2 matches (destructuring + theme computation)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` | 0 | ✅ pass | 12.0s |
| 2 | `rg "github-light-default" web/components/gsd/file-content-viewer.tsx` | 0 | ✅ pass | <1s |
| 3 | `rg "useEditorFontSize" web/components/gsd/file-content-viewer.tsx` | 0 | ✅ pass | <1s |
| 4 | `rg "useTheme" web/components/gsd/file-content-viewer.tsx` | 0 | ✅ pass | <1s |
| 5 | `rg "resolvedTheme" web/components/gsd/file-content-viewer.tsx` | 0 | ✅ pass | <1s |

## Diagnostics

- **Theme resolution:** Inspect `resolvedTheme` via React DevTools on `FileContentViewer`. The computed `shikiTheme` prop is visible on `CodeViewer` and `MarkdownViewer`.
- **Font size:** Inline `fontSize` style on `TabsContent[value="view"]`, `TabsContent[value="edit"]`, and the read-only fallback div. Tracks `localStorage.getItem('gsd-editor-font-size')`.
- **Shiki failure:** If `getHighlighter()` fails, the singleton resets and retries. Components degrade to `PlainViewer` (plain text + line numbers).

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/file-content-viewer.tsx` — Added dual shiki theme loading, theme prop threading through CodeViewer/MarkdownViewer/ReadOnlyContent, useEditorFontSize + useTheme hooks in FileContentViewer, font size applied to all content containers
- `.gsd/milestones/M009/slices/S04/S04-PLAN.md` — Added Observability / Diagnostics section, diagnostic verification step, marked T01 done
- `.gsd/milestones/M009/slices/S04/tasks/T01-PLAN.md` — Added Observability Impact section
- `.gsd/STATE.md` — Updated next action to T02
