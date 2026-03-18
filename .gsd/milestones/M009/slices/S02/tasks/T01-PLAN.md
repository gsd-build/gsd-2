---
estimated_steps: 5
estimated_files: 2
---

# T01: Install CodeMirror packages and build CodeEditor component

**Slice:** S02 — CodeMirror Integration & Code Editing
**Milestone:** M009

## Description

Install the 4 CodeMirror npm packages, verify the production build passes, then build a standalone `CodeEditor` React component that wraps `@uiw/react-codemirror` with custom dark/light themes, dynamic language loading, and font size support. This component is self-contained — no existing files are modified. Build verification happens twice: once after package install (catch bundling issues early) and once after the component is written.

**Relevant skills:** `frontend-design` (for component patterns — load if needed for styling guidance).

## Steps

1. **Install packages:** `cd web && npm install @uiw/react-codemirror @uiw/codemirror-themes @lezer/highlight @uiw/codemirror-extensions-langs`

2. **Verify build:** Run `npm run build:web-host` from the repo root. Must exit 0. If it fails, debug and fix before proceeding — CodeMirror packages may have Turbopack/Next.js compatibility issues.

3. **Create `web/components/gsd/code-editor.tsx`:**
   - Use `"use client"` directive
   - Dynamic import: Use `next/dynamic` with `{ ssr: false }` to import `@uiw/react-codemirror`. CodeMirror requires browser DOM APIs and cannot SSR. Show a `<Loader2>` spinner as the loading fallback.
   - **Two static theme objects** (module-level constants, NOT recreated on render):
     - Dark theme via `createTheme` from `@uiw/codemirror-themes`:
       ```
       theme: 'dark'
       settings: {
         background: 'oklch(0.09 0 0)',    // --background
         foreground: 'oklch(0.9 0 0)',      // --foreground
         caret: 'oklch(0.9 0 0)',           // --foreground
         selection: 'oklch(0.2 0 0)',       // --accent
         lineHighlight: 'oklch(0.12 0 0)',  // between bg and muted
         gutterBackground: 'oklch(0.09 0 0)',
         gutterForeground: 'oklch(0.35 0 0)', // --code-line-number
         gutterBorder: 'transparent',
       }
       ```
     - Light theme via `createTheme`:
       ```
       theme: 'light'
       settings: {
         background: 'oklch(0.98 0 0)',
         foreground: 'oklch(0.15 0 0)',
         caret: 'oklch(0.15 0 0)',
         selection: 'oklch(0.9 0 0)',
         lineHighlight: 'oklch(0.96 0 0)',
         gutterBackground: 'oklch(0.98 0 0)',
         gutterForeground: 'oklch(0.55 0 0)',
         gutterBorder: 'transparent',
       }
       ```
     - Both themes get the same `styles` array for syntax highlighting using `tags` from `@lezer/highlight`. Use monochrome luminance variations (the design system is zero-chroma):
       - `t.comment`, `t.lineComment`, `t.blockComment` → muted-foreground luminance
       - `t.keyword`, `t.operator` → foreground with slight brightness offset
       - `t.string`, `t.special(t.string)` → slightly different luminance
       - `t.number`, `t.bool`, `t.null` → slightly different luminance
       - `t.variableName`, `t.definition(t.variableName)` → foreground
       - `t.typeName`, `t.className` → foreground with slight brightness offset
       - `t.bracket` → muted
   - **Language mapping:** Build a `CM_LANG_MAP` that maps file extensions to `loadLanguage()` names from `@uiw/codemirror-extensions-langs`. Most names match directly. Key differences from shiki:
     - `bash`/`sh`/`zsh` → call `loadLanguage('shell')` (not 'bash')
     - `jsonc` → `loadLanguage('json')`
     - `viml`, `dotenv`, `fish`, `ini` → no CM equivalent, return null (plain text editing)
     - `ts`/`tsx`/`js`/`jsx` → use the corresponding `loadLanguage` name (`typescript`, `tsx`, `javascript`, `jsx`)
   - **Component props:** `{ value: string; onChange: (value: string) => void; language: string | null; fontSize: number; className?: string }`
   - **Theme selection:** Use `useTheme()` from `next-themes` → `resolvedTheme`. Select `darkTheme` when `resolvedTheme !== 'light'`, otherwise `lightTheme`.
   - **Language extension:** Call `loadLanguage(mappedName)` and pass the result as an extension. Cache with `useMemo` keyed on the mapped language name. If `loadLanguage` returns null/undefined, pass empty extensions (plain text mode).
   - **Font size:** Apply fontSize via `EditorView.theme({ '&': { fontSize: `${fontSize}px` }, '.cm-gutters': { fontSize: `${fontSize}px` } })` extension. Memoize on fontSize.
   - **Extensions array:** Combine theme + language + fontSize extensions. Memoize to prevent CodeMirror re-initialization on every render.
   - **Export:** Named export `CodeEditor`.

4. **Verify build again:** Run `npm run build:web-host`. Must exit 0.

5. **Verify no type errors:** Run `cd web && npx tsc --noEmit`. Must pass clean or with only pre-existing warnings.

## Must-Haves

- [ ] Four CodeMirror packages installed in `web/package.json`
- [ ] `npm run build:web-host` exits 0 after install
- [ ] `code-editor.tsx` exports `CodeEditor` component with dynamic import (no SSR)
- [ ] Two static theme objects (dark/light) using oklch values from globals.css
- [ ] Language extension loading via `loadLanguage()` with extension-to-CM-name mapping
- [ ] fontSize prop applied to CodeMirror via EditorView.theme extension
- [ ] Theme switches reactively based on `useTheme()` → `resolvedTheme`
- [ ] `npm run build:web-host` exits 0 after component creation

## Verification

- `npm run build:web-host` exits 0 (run twice: after install, after component)
- `cd web && npx tsc --noEmit` passes (no new errors)
- `code-editor.tsx` file exists and exports `CodeEditor`
- No existing files modified (pure additive task)

## Inputs

- `web/app/globals.css` — oklch token values for dark/light themes (already documented in research; hardcode the values, don't read CSS vars at runtime)
- `web/components/gsd/file-content-viewer.tsx` — `EXT_TO_LANG` map for reference on which extensions to support
- S01 delivered `useEditorFontSize()` hook at `web/lib/use-editor-font-size.ts` — the CodeEditor component takes a `fontSize` prop (the hook is called by the parent in T02, not by CodeEditor itself)

## Expected Output

- `web/package.json` — four new dependencies added
- `web/components/gsd/code-editor.tsx` — new file exporting `CodeEditor` component
- Production build passes with CodeMirror packages included

## Observability Impact

- **New inspection surface:** `code-editor.tsx` uses `next/dynamic` with `ssr: false` — if the import fails, the Loader2 spinner stays visible and the browser console logs the error. No silent failure path.
- **Language fallback:** Unsupported languages (viml, dotenv, fish, ini) produce no extension — CodeMirror renders in plain-text mode. The `CM_LANG_MAP` constant documents which extensions map to which CodeMirror language names, making the mapping inspectable.
- **Theme diagnostic:** Two static theme objects are module-level constants. If theme colors appear wrong, inspect `darkTheme` / `lightTheme` constants in `code-editor.tsx` — no runtime CSS variable resolution, values are hardcoded oklch.
- **Build verification:** `npm run build:web-host` catches SSR/bundling issues with CodeMirror. `npx tsc --noEmit` catches type errors. Both should be run after any change to this file.
