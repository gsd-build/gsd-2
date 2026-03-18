---
estimated_steps: 6
estimated_files: 0
---

# T03: End-to-end browser verification of all editor features

**Slice:** S04 — Final Polish & Verification
**Milestone:** M009

## Description

This is the final acceptance gate for M009. All editor features must be exercised in a running browser to confirm the full stack works: component rendering, API calls, theme switching, font size persistence, and save round-trips for both code and markdown files. No code changes expected — only verification and minor fixes if issues are found.

**Relevant skill:** `frontend-design` (for visual verification of theme alignment)

**Important knowledge from KNOWLEDGE.md:**
```
## Always test web in production
npm run build:web-host >/dev/null && npm run gsd:web:stop:all >/dev/null 2>&1 || true && npm run gsd:web
```

## Steps

1. **Start the app in production mode.** Run: `npm run build:web-host >/dev/null && npm run gsd:web:stop:all >/dev/null 2>&1 || true && npm run gsd:web`. Wait for the server to be ready. Navigate to the app in browser.

2. **Verify code file View/Edit round-trip.** Navigate to the Files panel. Select a `.ts` file. Confirm the View tab shows syntax-highlighted code. Switch to Edit tab — confirm CodeMirror editor loads. Type a small change. Click Save. Switch back to View tab. Confirm the View tab reflects the saved change. Use `browser_assert` to verify.

3. **Verify markdown file View/Edit round-trip.** Select a `.md` file. Confirm View tab shows rendered markdown (headings, lists, etc.). Switch to Edit tab — confirm raw markdown in CodeMirror. Make a small change. Save. Switch to View. Confirm the rendered markdown reflects the change. Use `browser_assert`.

4. **Verify font size applies to both tabs.** Open settings (gsd-prefs). Find the Editor Size panel. Click a different preset (e.g. 16). Go back to the file viewer. Check that the View tab content text size visually changed. Switch to Edit tab — confirm CodeMirror text size also changed. Take screenshots for visual comparison.

5. **Verify dark/light theme toggle.** Toggle the theme from dark to light (or vice versa). Verify:
   - View tab (code): shiki re-renders with the appropriate theme (light code on light background, dark code on dark background)
   - View tab (markdown): text colors are readable, borders visible, blockquotes styled correctly
   - Edit tab: CodeMirror theme switches (this already works from S02)
   - No console errors related to theme switching

6. **Final build verification.** Run `npm run build:web-host` one last time to confirm the full build still passes after all S04 changes.

## Must-Haves

- [ ] Code file: View → Edit → Save → View round-trip works
- [ ] Markdown file: View → Edit → Save → View round-trip works  
- [ ] Font size preference applies to View tab content
- [ ] Font size preference applies to Edit tab content
- [ ] Dark mode renders correctly in both View and Edit tabs
- [ ] Light mode renders correctly in both View and Edit tabs
- [ ] No console errors related to editor features
- [ ] `npm run build:web-host` exits 0

## Verification

- Browser assertions pass for all six checks above
- Screenshots captured for dark/light mode comparison
- `npm run build:web-host` exits 0
- No JavaScript errors in browser console related to shiki, CodeMirror, or file operations

## Inputs

- Running app from `npm run gsd:web` (production build)
- T01 changes: dual shiki themes + font size in View tab
- T02 changes: light-mode CSS variants for file viewer and markdown

## Observability Impact

- **Signals changed:** None — this task is verification-only, no runtime signals are added or modified.
- **How to inspect:** Exercise the browser flow described in Steps 1-5. Check `browser_get_console_logs` for JS errors. Check `localStorage.getItem('gsd-editor-font-size')` for font persistence. Use DevTools Computed tab on `.file-viewer-code` / `.markdown-body` elements to verify CSS token resolution.
- **Failure state visible as:** Shiki load failure → `PlainViewer` renders (no syntax highlighting). Theme mismatch → dark code on light background or vice versa. Font size not applied → content stays at default 14px regardless of preference. Save failure → `saveError` text in the editor panel. Build failure → `npm run build:web-host` non-zero exit.

## Expected Output

- All browser assertions pass
- If any issues found: targeted fixes applied and re-verified
- M009 milestone definition of done confirmed met
