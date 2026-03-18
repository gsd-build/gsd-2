# S04: Final Polish & Verification — UAT

**Milestone:** M009
**Written:** 2026-03-18

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: This slice modifies visual rendering (shiki themes, CSS tokens, font size) and requires a running browser to verify correct appearance across dark/light modes.

## Preconditions

- `npm run build:web-host` exits 0
- Dev server running: `npm run gsd:web` (or `npm run gsd:web:stop:all && npm run gsd:web`)
- Browser open at `http://localhost:19854` (or the port shown in terminal)
- At least one `.ts` file and one `.md` file exist in the project tree

## Smoke Test

Open the file viewer sidebar, click any `.ts` file. Confirm View and Edit tabs appear, View tab shows syntax-highlighted code with line numbers.

## Test Cases

### 1. View tab syntax highlighting — dark mode

1. Ensure dark mode is active (theme toggle in header or system preference)
2. Open file viewer → navigate to any `.ts` file (e.g., `web/hooks/use-toast.ts`)
3. Confirm View tab is selected by default
4. **Expected:** Code renders with syntax highlighting — keywords in distinct colors, line numbers in gutter, dark background matching the app theme. No flash of unstyled content.

### 2. View tab syntax highlighting — light mode

1. Toggle to light mode via the theme switcher
2. Same file should still be visible in View tab
3. **Expected:** Code renders with light-theme syntax highlighting (`github-light-default`). Background is light, text is dark. Line numbers visible. No dark-on-dark or white-on-white text.

### 3. Edit tab CodeMirror loading

1. Click the "Edit" tab
2. **Expected:** CodeMirror editor loads with syntax highlighting, line numbers, and code folding markers. The editor content matches the View tab content. Cursor is placeable. Theme matches the current dark/light mode.

### 4. Edit → Save → View round-trip (code file)

1. In the Edit tab of a `.ts` file, add a comment line: `// UAT test comment`
2. Click the Save button
3. **Expected:** Save button shows success indication (no error message). Switch to View tab.
4. **Expected:** The View tab now shows the added comment with syntax highlighting.
5. Clean up: Edit tab → remove the comment → Save

### 5. Edit → Save → View round-trip (markdown file)

1. Navigate to a `.md` file (e.g., `README.md` or any markdown file in the tree)
2. Confirm View tab shows rendered markdown (headings, lists, code blocks — not raw text)
3. Switch to Edit tab — raw markdown source visible in CodeMirror
4. Add a line: `<!-- UAT test -->`
5. Save
6. Switch to View tab
7. **Expected:** The HTML comment is not visible (correctly hidden by markdown renderer), but the save succeeded without error.
8. Clean up: Edit tab → remove the comment → Save

### 6. Font size preference applies to View tab

1. Open Settings (Cmd+K → search "settings" or navigate to settings panel)
2. Find "Editor Size" panel
3. Click a different preset size (e.g., 16 if currently 14)
4. Navigate to a file in the file viewer
5. **Expected:** View tab code text renders at the new font size. The change is visually obvious.
6. Switch to Edit tab
7. **Expected:** CodeMirror editor also uses the new font size.
8. Refresh the page
9. Navigate to the same file
10. **Expected:** Font size persists — both tabs still use the size set in step 3.

### 7. Dark/light theme toggle — CSS tokens

1. Open a `.ts` file in View tab
2. Toggle between dark and light mode 2-3 times
3. **Expected:** Each toggle, the code viewer background, text color, line numbers, and hover highlight all switch cleanly. No flash of wrong colors. Line number color is visible (not same as background) in both modes.
4. Open a `.md` file in View tab
5. Toggle dark/light
6. **Expected:** Markdown body text, heading borders, blockquote borders/text, and horizontal rules all render correctly in both modes. Text is readable (not white-on-white or dark-on-dark).

## Edge Cases

### Large file handling

1. Navigate to a large file (>1000 lines if available)
2. **Expected:** View tab renders with line numbers. Edit tab loads CodeMirror without freezing. Scrolling is smooth.

### File with no syntax highlighting

1. Open a file with an unusual extension (e.g., `.env`, `.gitignore`, or a file with no extension)
2. **Expected:** View tab shows plain text with line numbers (PlainViewer fallback). Edit tab loads CodeMirror in plain text mode. No errors.

### Font size boundary values

1. In Editor Size settings, try the smallest preset (11)
2. **Expected:** Text is small but readable, no layout breakage
3. Try the largest preset (16)
4. **Expected:** Text is larger, no overflow or clipping issues

## Failure Signals

- White-on-white or invisible text in light mode → CSS token migration missed a value or token is undefined
- View tab shows unstyled plain text instead of highlighted code → shiki failed to load; check `PlainViewer` fallback and browser console
- Edit tab shows a spinner that never resolves → CodeMirror dynamic import failed; check network tab
- Save button shows error text → POST /api/files returned non-200; check network tab for status/body
- Font size change has no effect → `useEditorFontSize` hook not wired; check inline styles in DevTools
- Theme toggle causes flash of wrong colors → shiki theme not switching; check `theme` prop in React DevTools on `CodeViewer`

## Requirements Proved By This UAT

- R121 — Test cases 6 and 3 prove font size applies to both View and Edit tabs and persists across sessions
- R122 — Test case 3 proves CodeMirror loads with custom theme
- R123 — Test case 5 proves markdown View (rendered) and Edit (raw) tabs work with save round-trip
- R124 — Test cases 4 and 5 prove POST /api/files saves content successfully (security validation was proven in S01)

## Not Proven By This UAT

- Path traversal security on POST /api/files (proven by S01 contract tests, not re-tested here)
- CodeMirror bundle size impact (proven by S02 build size verification)
- Cross-browser rendering differences (tested in Chromium only)
- Mobile/tablet responsive layout of editor tabs

## Notes for Tester

- The theme toggle may require a moment for shiki to re-highlight code blocks — a brief flash is acceptable during toggle.
- The `PlainViewer` fallback (plain text + line numbers, no syntax colors) is intentional degradation when shiki fails, not a bug.
- Markdown files render HTML comments as invisible (expected behavior) — use a visible change like adding a heading for easier verification in test case 5.
- Font size values outside the 8-24 range are clamped by the hook — the settings panel only offers presets within range.
