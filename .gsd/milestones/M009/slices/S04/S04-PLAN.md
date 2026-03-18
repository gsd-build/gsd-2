# S04: Final Polish & Verification

**Goal:** All three research-identified gaps are fixed (font size on View tab, shiki light theme, CSS light-mode variants), and the full editor feature set is verified end-to-end in browser — dark and light modes, code and markdown files, edit→save→view round-trip, font size persistence.
**Demo:** Open a .ts file → View tab shows syntax highlighting in both dark/light modes → Edit tab shows CodeMirror → modify → Save → switch to View → content updated. Same for .md files. Font size change from settings applies to both tabs. Theme toggle renders correct colors everywhere.

## Must-Haves

- `useEditorFontSize()` consumed in `FileContentViewer` and font size applied to View tab content (both code and markdown)
- Shiki loads both `github-dark-default` and `github-light-default` themes; `CodeViewer` and `MarkdownViewer` select the correct theme based on `useTheme()` resolved theme
- `.file-viewer-code` and `.markdown-body` CSS use design token custom properties that work in both light and dark modes
- Edit→Save→View round-trip verified in browser for at least one code file and one markdown file
- Dark/light theme toggle verified visually in browser
- `npm run build:web-host` exits 0

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: yes (visual theme comparison)

## Verification

- `npm run build:web-host` exits 0 after T01 and T02
- Browser: open a .ts file → View tab shows syntax highlighting → toggle dark/light → highlighting theme changes
- Browser: open a .md file → View tab shows rendered markdown → toggle dark/light → text colors correct
- Browser: edit a file in Edit tab → Save → switch to View → content updated
- Browser: change editor font size in settings → View tab text size changes
- Browser assertions: `text_visible` for file content, `selector_visible` for tab triggers, theme-appropriate rendering
- Diagnostic: browser console shows no uncaught errors related to shiki, theme, or font-size hooks (`browser_get_console_logs` filtered for error-level entries)

## Integration Closure

- Upstream surfaces consumed: `file-content-viewer.tsx` (S02), `code-editor.tsx` (S02), `use-editor-font-size.ts` (S01), `globals.css` design tokens, POST `/api/files` (S01)
- New wiring introduced in this slice: `useEditorFontSize` + `useTheme` imports in `file-content-viewer.tsx`, dual shiki theme loading, CSS custom property adoption
- What remains before the milestone is truly usable end-to-end: nothing — this slice closes M009

## Tasks

- [x] **T01: Wire font size and dual shiki themes into View tab** `est:25m`
  - Why: The View tab currently ignores the editor font size preference and only loads the dark shiki theme — meaning light mode shows dark-styled code. This task fixes both gaps in the component layer.
  - Files: `web/components/gsd/file-content-viewer.tsx`
  - Do: (1) Import `useEditorFontSize` and `useTheme`, (2) load both `github-dark-default` and `github-light-default` in `createHighlighter`, (3) pass resolved theme name to `CodeViewer` and `MarkdownViewer` as a prop, (4) apply font size via inline style on the View tab content container and the read-only fallback path, (5) add resolved theme to `MarkdownViewer` useEffect dependency array.
  - Verify: `npm run build:web-host` exits 0; `rg "github-light-default" web/components/gsd/file-content-viewer.tsx` finds the new theme; `rg "useEditorFontSize" web/components/gsd/file-content-viewer.tsx` finds the import.
  - Done when: Build passes, both shiki themes loaded, font size applied to View tab containers, theme prop threaded through CodeViewer and MarkdownViewer.

- [x] **T02: Add light-mode CSS variants for file viewer and markdown styles** `est:15m`
  - Why: `.file-viewer-code` and `.markdown-body` styles use hardcoded dark oklch values that are unreadable in light mode. Replacing them with CSS custom properties from the existing design token system fixes both themes in one pass.
  - Files: `web/app/globals.css`
  - Do: Replace hardcoded oklch values in `.file-viewer-code` and `.markdown-body` with `var(--foreground)`, `var(--border)`, `var(--muted-foreground)`, and `var(--code-line-number)`. For values without exact token matches (line hover bg, blockquote border/color, strong color, del color), use light defaults and add `.dark` scoped overrides.
  - Verify: `npm run build:web-host` exits 0; `rg "oklch" web/app/globals.css` shows no hardcoded oklch values in `.file-viewer-code` or `.markdown-body` sections (values should use `var()` references or be inside `.dark` scopes).
  - Done when: Build passes, all file-viewer and markdown-body CSS properties work correctly in both `:root` (light) and `.dark` themes using the design token system.

- [x] **T03: End-to-end browser verification of all editor features** `est:20m`
  - Why: This is the final acceptance gate for M009. All editor features must be exercised in a running browser to confirm the full stack works — component rendering, API calls, theme switching, font size persistence, and save round-trips.
  - Files: none (verification only)
  - Do: Start the app with `npm run build:web-host && npm run gsd:web`, open the file viewer, verify: (a) View tab renders code with correct syntax highlighting in both dark/light, (b) Edit tab shows CodeMirror, (c) edit→save→view round-trip for a code file, (d) edit→save→view round-trip for a markdown file, (e) font size change applies to both tabs, (f) dark/light theme toggle works across View and Edit tabs.
  - Verify: All browser assertions pass; no console errors related to editor features.
  - Done when: All six verification checks pass in browser. M009 milestone definition of done is met.

## Files Likely Touched

- `web/components/gsd/file-content-viewer.tsx`
- `web/app/globals.css`
## Observability / Diagnostics

- **Shiki failure:** If `getHighlighter()` fails, the singleton resets and retries. Components degrade to `PlainViewer` (plain text + line numbers) — no error propagates to the user.
- **Font size inspection:** `localStorage.getItem('gsd-editor-font-size')` returns the persisted value. The custom event `editor-font-size-changed` fires on every change within the same tab. Cross-tab sync via `storage` events.
- **Theme resolution:** `useTheme().resolvedTheme` is observable in React DevTools. When `undefined` (during hydration), the component defaults to `"dark"` — matching prior behavior. The resolved shiki theme name is passed as a prop through the component tree and visible in DevTools.
- **CSS token adoption:** In light mode, `.file-viewer-code` and `.markdown-body` use `var()` references to design tokens defined in `:root` / `.dark` scopes. Inspect computed styles in browser DevTools to verify token resolution.
- **Failure surfaces:** Shiki load failure → highlighted HTML is `null` → `PlainViewer` renders instead. Save failure → `saveError` state displayed as destructive text. Build failure → `npm run build:web-host` exit code and stderr.
