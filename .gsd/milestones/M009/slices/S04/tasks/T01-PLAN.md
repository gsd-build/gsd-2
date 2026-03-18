---
estimated_steps: 5
estimated_files: 1
---

# T01: Wire font size and dual shiki themes into View tab

**Slice:** S04 — Final Polish & Verification
**Milestone:** M009

## Description

The View tab in `FileContentViewer` has two gaps: it ignores the editor font size preference (only the CodeMirror Edit tab uses it), and it only loads the `github-dark-default` shiki theme (so light mode renders dark-styled code). This task fixes both by importing `useEditorFontSize` and `useTheme` into the component, loading both shiki themes, threading the resolved theme name through `CodeViewer` and `MarkdownViewer`, and applying font size to all View tab content containers.

**Relevant skill:** `frontend-design` (for component wiring and React hook integration)

## Steps

1. **Import hooks.** At the top of `file-content-viewer.tsx`, add:
   - `import { useEditorFontSize } from "@/lib/use-editor-font-size"`
   - `import { useTheme } from "next-themes"`

2. **Load both shiki themes.** In the `getHighlighter()` singleton (around line 110), change `themes: ["github-dark-default"]` to `themes: ["github-dark-default", "github-light-default"]`.

3. **Add theme prop to CodeViewer.** Change the `CodeViewer` function signature to accept a `theme` prop (string). Replace the hardcoded `theme: "github-dark-default"` in the `codeToHtml()` call (line 154) with the prop value. Add `theme` to the `useEffect` dependency array.

4. **Add theme prop to MarkdownViewer.** Same change — accept a `theme` prop, replace the hardcoded `theme: "github-dark-default"` in the markdown code block renderer (line 251), and add `theme` to the `useEffect` dependency array.

5. **Wire hooks in FileContentViewer and ReadOnlyContent.** In the exported `FileContentViewer` component:
   - Call `const [fontSize] = useEditorFontSize()` and `const { resolvedTheme } = useTheme()`.
   - Compute `const shikiTheme = resolvedTheme === "light" ? "github-light-default" : "github-dark-default"`.
   - Pass `shikiTheme` and `fontSize` through to `ReadOnlyContent` as props.
   - In `ReadOnlyContent`, forward `theme` to `CodeViewer` and `MarkdownViewer`.
   - Apply `fontSize` via inline `style={{ fontSize: `${fontSize}px` }}` on the View tab `TabsContent` container div, the read-only fallback wrapper div, AND on the Edit tab `TabsContent` (so both tabs respect the preference). Also apply to `ReadOnlyContent`'s wrapper elements.

**Key constraints:**
- `useTheme()` returns `resolvedTheme` as `undefined` on first render (hydration). Default to `"dark"` when undefined to match current behavior.
- `CodeViewer` and `MarkdownViewer` are not exported — they are internal functions. Changing their signatures is safe.
- The `getHighlighter()` singleton is module-level. Loading both themes in `createHighlighter()` is a one-time cost.
- `MarkdownViewer`'s `useEffect` already has `[content, filepath]` as deps — adding `theme` makes it re-run on theme toggle, which is the desired behavior (code blocks re-highlight with the new theme).

## Must-Haves

- [ ] `getHighlighter()` loads both `github-dark-default` and `github-light-default`
- [ ] `CodeViewer` uses the resolved theme (not hardcoded dark)
- [ ] `MarkdownViewer` uses the resolved theme for fenced code blocks
- [ ] `MarkdownViewer` re-highlights on theme change (theme in useEffect deps)
- [ ] Font size from `useEditorFontSize()` applied to View tab content containers
- [ ] Font size applied to the read-only fallback path (when `canEdit` is false)
- [ ] `resolvedTheme` defaults to `"dark"` when undefined (hydration safety)
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg "github-light-default" web/components/gsd/file-content-viewer.tsx` returns at least one match
- `rg "useEditorFontSize" web/components/gsd/file-content-viewer.tsx` returns at least one match
- `rg "useTheme" web/components/gsd/file-content-viewer.tsx` returns at least one match
- `rg "resolvedTheme" web/components/gsd/file-content-viewer.tsx` returns at least one match

## Inputs

- `web/components/gsd/file-content-viewer.tsx` — current file with hardcoded `github-dark-default` and no font size support in View tab
- `web/lib/use-editor-font-size.ts` — existing hook, returns `[fontSize, setFontSize]`
- `web/app/globals.css` — design token reference (`:root` has light values, `.dark` has dark values)

## Expected Output

- `web/components/gsd/file-content-viewer.tsx` — modified: dual shiki themes loaded, theme prop threaded through viewers, font size applied to View tab containers, resolvedTheme used for theme selection

## Observability Impact

- **New runtime signal:** The resolved shiki theme name (`"github-dark-default"` or `"github-light-default"`) is now a React prop passed through the component tree. Inspect via React DevTools on `CodeViewer` and `MarkdownViewer` components.
- **Font size observability:** The View tab containers now have an inline `fontSize` style. Inspect with browser DevTools on the `TabsContent` elements or the read-only fallback wrapper. The value tracks `localStorage.getItem('gsd-editor-font-size')`.
- **Failure visibility:** If shiki fails to load both themes, the singleton promise resets and retries on next access. The UI degrades to `PlainViewer` (plain text with line numbers) — no crash, no blank screen. A future agent can verify this by checking whether highlighted HTML is present in the DOM (`div.file-viewer-code` contains `<span>` elements with `style` attributes from shiki).
- **Theme toggle verification:** After toggling themes, `CodeViewer` and `MarkdownViewer` re-render because `theme` is in their `useEffect` dependency arrays. The DOM content of `.file-viewer-code` divs changes — inspectable via `browser_diff` or `browser_get_page_source`.
