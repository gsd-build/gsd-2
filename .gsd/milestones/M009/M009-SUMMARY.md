---
id: M009
provides:
  - POST /api/files endpoint with path validation via resolveSecurePath, traversal rejection, content size limits, and structured error responses
  - CodeEditor component wrapping @uiw/react-codemirror with custom dark/light oklch themes, 30+ language mappings, and dynamic import (SSR-safe)
  - View/Edit tab split in FileContentViewer — View tab preserves shiki (code) and react-markdown (markdown) rendering unchanged; Edit tab uses CodeMirror 6
  - Dirty state tracking with explicit Save button that POSTs to /api/files and re-fetches content on success
  - useEditorFontSize hook with localStorage persistence, cross-tab sync, and EditorSizePanel settings component
  - Font size applied to View tab (shiki), Edit tab (CodeMirror), and read-only fallback via inline style
  - Dual shiki themes (github-dark-default + github-light-default) with theme selection via next-themes resolvedTheme
  - Light-mode CSS token migration — 8 hardcoded oklch values in .file-viewer-code and .markdown-body replaced with var() design token references
key_decisions:
  - D087: CodeMirror 6 via @uiw/react-codemirror — lighter than Monaco (~200KB vs ~2MB), createTheme accepts oklch token values directly
  - D088: Shiki for View tab, CodeMirror for Edit tab — two renderers, two tabs; View tab guaranteed identical to pre-M009
  - D089: Explicit Save button only — no auto-save; file writes go directly to filesystem
  - D090: Editor first (M009), then upstream merge (M010), then CI/CD + PWA (M011)
patterns_established:
  - POST handler reuses resolveSecurePath/getRootForMode/resolveProjectCwd from GET — single security surface, no new validation primitives
  - CodeMirror wrapped via next/dynamic ssr:false with Loader2 spinner fallback — no initial bundle bloat
  - Static module-level theme objects (never recreated on render) for dark/light CodeMirror themes
  - useEditorFontSize clones useTerminalFontSize pattern — localStorage + CustomEvent + storage event for cross-tab sync
  - Conditional tab rendering — canEdit flag gates View/Edit tabs vs read-only mode based on prop presence (backward compatible)
  - Dual shiki theme loading in highlighter singleton; theme selected via resolved next-themes value
  - Design token var() references for theme-aware CSS; deliberate fixed colors (checkbox green) preserved as-is
observability_surfaces:
  - POST /api/files returns structured { error } JSON with 400/404/413/500 status codes
  - localStorage key gsd-editor-font-size inspectable via devtools
  - CustomEvent editor-font-size-changed on window for same-tab sync
  - Save button disabled state indicates no dirty content or save in progress
  - Save error displayed as inline text-destructive span near Save button
  - Radix data-state="active" on TabsTrigger shows active tab
  - Shiki failure degrades to PlainViewer (no crash, no blank screen)
requirement_outcomes:
  - id: R121
    from_status: active
    to_status: validated
    proof: useEditorFontSize hook in web/lib/use-editor-font-size.ts (localStorage gsd-editor-font-size, default 14, range 8-24). EditorSizePanel in settings-panels.tsx. Font size applied via inline style to View tab TabsContent, Edit tab TabsContent, and read-only fallback wrapper in file-content-viewer.tsx. Browser-verified in production build.
  - id: R122
    from_status: active
    to_status: validated
    proof: CodeEditor component in web/components/gsd/code-editor.tsx wraps @uiw/react-codemirror with custom dark/light themes via createTheme using oklch values. CM_LANG_MAP maps 30+ shiki language names. Dynamic import via next/dynamic ssr:false. npm run build:web-host exits 0. Browser-verified — Edit tab loads CodeMirror with syntax highlighting.
  - id: R123
    from_status: active
    to_status: validated
    proof: ReadOnlyContent in file-content-viewer.tsx branches on isMarkdown() — View tab renders react-markdown for .md files, shiki for code files. Edit tab uses CodeMirror for both via CM_LANG_MAP. Dual shiki themes (dark+light) wired via useTheme. Light-mode CSS tokens migrated. Browser-verified.
  - id: R124
    from_status: active
    to_status: validated
    proof: POST handler at line 167 of web/app/api/files/route.ts. Accepts { path, content, root }, validates with resolveSecurePath (same as GET), checks parent directory, enforces 512KB size limit. Returns structured JSON errors with 400/404/413/500 status codes. Traversal and absolute path attempts rejected with 400. npm run build:web-host exits 0.
duration: 91m
verification_result: passed
completed_at: 2026-03-18
---

# M009: Editor & File Viewer Upgrade

**Full code editing via CodeMirror 6 with View/Edit tab split, file write API with path security, dual shiki themes, and configurable editor font size — transforming the read-only file viewer into a self-sufficient browser code editor.**

## What Happened

Three slices (S01, S02, S04 — S03 merged into S02) built a complete editing layer on top of the existing read-only file viewer without changing the View tab's appearance.

**S01** added the write API and font size preference. The POST handler on `/api/files` reuses the existing `resolveSecurePath()` function from the GET handler — a single security surface validates both reads and writes. Path traversal, absolute paths, missing parent directories, and oversized content are all rejected with structured JSON errors and appropriate HTTP status codes. The `useEditorFontSize()` hook clones the proven `useTerminalFontSize` pattern from M008 (localStorage + CustomEvent + cross-tab sync). `EditorSizePanel` was added to the settings surface with preset buttons and a live preview.

**S02** built the CodeMirror editor and wired it into the file viewer. The `CodeEditor` component wraps `@uiw/react-codemirror` with two static theme objects built from the existing oklch design tokens (monochrome: zero-chroma, luminance-only). A `CM_LANG_MAP` maps 30+ shiki language names to CodeMirror equivalents. The component is loaded via `next/dynamic` with `ssr: false` to avoid bloating the initial bundle. `FileContentViewer` was refactored to accept optional `root`, `path`, and `onSave` props — when all three are present, it renders View/Edit tabs with a Save button; when absent, it renders the original read-only view (backward compatible). The Save button activates only when content is dirty, POSTs to `/api/files`, and triggers a content re-fetch on success. `files-view.tsx` was updated to pass the required props through.

**S04** closed the remaining gaps. Dual shiki themes (`github-dark-default` + `github-light-default`) were loaded into the highlighter singleton, with theme selection driven by the resolved next-themes value. The editor font size was wired into the View tab and read-only fallback (previously only the Edit tab consumed it). Eight hardcoded oklch values in `.file-viewer-code` and `.markdown-body` CSS were replaced with `var()` references to existing design tokens, making light mode correct without adding new custom properties. End-to-end browser verification confirmed View tab syntax highlighting, Edit tab CodeMirror loading, and tab switching with zero console errors.

One deviation: S01 task summaries described completed work, but the actual code was never committed to the worktree. S02's closer agent built all deliverables from scratch. Several pre-existing missing web dependencies (`react-markdown`, `remark-gfm`, `shiki`, `yaml`, `chalk`) were also fixed during S02 to achieve a clean build.

## Cross-Slice Verification

| Success Criterion | Evidence |
|---|---|
| Any file shows View and Edit tabs | `TabsTrigger` for "view" and "edit" in `file-content-viewer.tsx`; `canEdit` flag gates tab rendering based on `root`/`path`/`onSave` props from `files-view.tsx` |
| View tab renders identically to current | `ReadOnlyContent` uses `CodeViewer` (shiki) and `MarkdownViewer` (react-markdown) — same components as pre-M009, now with dual theme support |
| Edit tab uses CodeMirror 6 with matching theme | `code-editor.tsx` uses `@uiw/react-codemirror` with `createTheme` from oklch values; browser-verified in S04/T03 |
| Save button writes via POST /api/files | POST handler at line 167 of `route.ts` uses `resolveSecurePath()` + `writeFileSync`; `handleSave` in `files-view.tsx` POSTs and re-fetches |
| Save → View reflects updated content | `handleSave` calls `handleSelectFile(selectedPath)` after successful POST, updating the `content` prop and resetting dirty state |
| Editor font size configurable and persistent | `useEditorFontSize()` persists to `gsd-editor-font-size` localStorage key; `EditorSizePanel` in settings; `fontSizeStyle` applied to View tab, Edit tab, and read-only fallback |
| `npm run build:web-host` exits 0 | Build completed successfully — staged to `dist/web/standalone` |

## Requirement Changes

- R121: active → validated — `useEditorFontSize` hook created with localStorage persistence (default 14, range 8–24). `EditorSizePanel` added to settings. Font size applied via inline style to all three content containers (View tab, Edit tab, read-only fallback) in `file-content-viewer.tsx`. Browser-verified.
- R122: active → validated — `CodeEditor` component wraps `@uiw/react-codemirror` with custom dark/light themes from oklch tokens. 30+ language mappings via `CM_LANG_MAP`. Dynamic import prevents bundle bloat. Browser-verified: Edit tab loads CodeMirror with syntax highlighting.
- R123: active → validated — `ReadOnlyContent` branches on `isMarkdown()` for View tab (react-markdown for .md, shiki for code). CodeMirror handles both in Edit tab. Dual shiki themes wired. Light-mode CSS migrated. S03 was merged into S02 because `ReadOnlyContent` already handled the markdown branch.
- R124: active → validated — POST handler reuses `resolveSecurePath()` from GET handler. Accepts `{ path, content, root }`, validates path security, checks parent directory, enforces size limit. Returns structured JSON errors. Traversal attempts rejected with 400.

## Forward Intelligence

### What the next milestone should know
- `file-content-viewer.tsx` and `globals.css` are the highest-conflict-risk files during the M010 upstream merge. Both were heavily modified in M009 (tab split, dual themes, CSS token migration).
- The `files-view.tsx` `handleSave` callback POSTs to `/api/files?project=...` with `{ path, content, root }` — any upstream changes to the files API shape will need reconciliation.
- CodeMirror packages (`@uiw/react-codemirror`, `@uiw/codemirror-themes`, `@lezer/highlight`, `@uiw/codemirror-extensions-langs`) are new web dependencies added in M009. If upstream adds its own editor in v2.22–v2.28, there may be a dependency conflict.
- Pre-existing build dependencies (`react-markdown`, `remark-gfm`, `shiki`, `yaml`, `chalk`) were missing from `web/package.json` and had to be added in S02. These may have been installed locally but not committed in earlier milestones.

### What's fragile
- `CM_LANG_MAP` is a static mapping — new shiki languages added to the file viewer without updating the map silently fall back to plain text in the editor.
- Shiki highlighter singleton loads both themes eagerly. Adding more themes increases bundle and initialization cost. A persistent wasm/CDN failure degrades all code highlighting to `PlainViewer`.
- The `var()` token migration in `globals.css` relies on token names (`--foreground`, `--border`, etc.) existing in both `:root` and `.dark` scopes. A renamed or removed token causes invisible content.

### Authoritative diagnostics
- `npm run build:web-host` exit 0 is the single gate check — validates all imports, types, and production bundle assembly.
- Browser DevTools computed styles on `.file-viewer-code` and `.markdown-body` elements confirm token resolution per theme.
- `localStorage.getItem('gsd-editor-font-size')` shows the persisted font size.
- Save button `disabled` attribute confirms dirty state detection; inline `text-destructive` span shows save errors.

### What assumptions changed
- S01 task summaries described completed code, but auto-commit only captured the summaries — not the source files. S02's closer rebuilt everything from scratch. Always verify file existence before trusting task summaries.
- S03 (Markdown View/Edit Split) was planned as a separate slice but was unnecessary — S02's `ReadOnlyContent` already branched on `isMarkdown()`, and `CM_LANG_MAP` already included markdown. S03 was merged into S02 during execution.
- Pre-existing build was broken before M009 due to missing web deps. This was masked because previous milestones may have installed them locally without committing to `package.json`.

## Files Created/Modified

- `web/components/gsd/code-editor.tsx` — New: CodeMirror 6 wrapper with dynamic import, custom oklch dark/light themes, 30+ language mappings, configurable font size
- `web/components/gsd/file-content-viewer.tsx` — Refactored: View/Edit tabs via Radix Tabs, CodeEditor integration, dirty state tracking, Save button, dual shiki themes, font size application, backward-compatible read-only mode
- `web/components/gsd/files-view.tsx` — Added: `handleSave` callback (POST + re-fetch), passes `root`/`path`/`onSave` props to FileContentViewer
- `web/app/api/files/route.ts` — Added: POST handler with resolveSecurePath validation, content size limit, structured error responses
- `web/lib/use-editor-font-size.ts` — New: useEditorFontSize hook with localStorage persistence, CustomEvent sync, cross-tab sync
- `web/components/gsd/settings-panels.tsx` — Added: EditorSizePanel with preset buttons and live preview
- `web/components/gsd/command-surface.tsx` — Added: EditorSizePanel import and render in gsd-prefs section
- `web/app/globals.css` — Migrated: 8 hardcoded oklch values in .file-viewer-code and .markdown-body replaced with var() design token references
- `web/package.json` — Added: 4 CodeMirror packages + 5 pre-existing missing deps
