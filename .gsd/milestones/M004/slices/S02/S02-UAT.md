# S02: Web Mode Documentation — UAT

**Milestone:** M004
**Written:** 2026-03-17

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This slice produces only documentation files — no runtime code, no UI, no services. Every claim is mechanically verifiable by checking file existence, content matching, and cross-reference resolution against the codebase.

## Preconditions

- Working tree checked out at the M004 branch with S02 changes applied
- The `web/` directory, `src/web-mode.ts`, `src/cli-web-branch.ts`, `web/components/gsd/app-shell.tsx`, and `web/lib/browser-slash-command-dispatch.ts` exist in the codebase (post-M003 state)

## Smoke Test

```bash
test -f docs/web-mode.md && rg -c "web mode\|--web" docs/web-mode.md | head -1
```
Expected: file exists and returns a count > 0.

## Test Cases

### 1. Web mode guide exists with all 7 sections

1. Open `docs/web-mode.md`
2. Check for section headings: Overview, Getting Started, Browser Onboarding, Workspace, Browser Commands, Architecture, Configuration & Troubleshooting
3. **Expected:** All 7 section headings present; file is ≥150 lines (`wc -l docs/web-mode.md`)

### 2. Cross-reference coverage across 8 files

1. Run: `rg -i "web mode|--web|gsd --web" docs/ README.md | cut -d: -f1 | sort -u`
2. **Expected:** Output lists exactly 8 files: `README.md`, `docs/README.md`, `docs/architecture.md`, `docs/commands.md`, `docs/configuration.md`, `docs/getting-started.md`, `docs/troubleshooting.md`, `docs/web-mode.md`

### 3. README documentation index includes web mode

1. Open `README.md`
2. Find the documentation index section (list of `[Title](./docs/...)` links)
3. **Expected:** `[Web Mode](./docs/web-mode.md)` appears in the list, positioned after Getting Started

### 4. README command table includes gsd --web

1. In `README.md`, find the command table
2. **Expected:** A row containing `gsd --web [path]` exists with a description

### 5. docs/README.md user docs table includes web mode

1. Open `docs/README.md`
2. Find the User Documentation table
3. **Expected:** A row with `[Web Mode](./web-mode.md)` and description "Browser-first workspace — launch, UI, commands, and architecture"

### 6. View names match source

1. Run: `rg "KNOWN_VIEWS" web/components/gsd/app-shell.tsx`
2. Extract the 6 view names from the Set literal
3. Check `docs/web-mode.md` Workspace section for each name
4. **Expected:** All 6 match: dashboard, power, roadmap, files, activity, visualize

### 7. CLI flags match source

1. Run: `rg "web start\|web stop\|--web" src/cli-web-branch.ts`
2. Check `docs/web-mode.md` Getting Started section and `docs/commands.md`
3. **Expected:** `gsd --web [path]`, `gsd web start [path]`, `gsd web stop [path]` all present in both docs and source

### 8. Environment variables match source

1. Run: `rg "GSD_WEB_" src/web-mode.ts`
2. Extract env var names from the spawn env block
3. Check `docs/web-mode.md` Configuration section and `docs/configuration.md`
4. **Expected:** All 6 match: GSD_WEB_HOST, GSD_WEB_PORT, GSD_WEB_PROJECT_CWD, GSD_WEB_PROJECT_SESSIONS_DIR, GSD_WEB_PACKAGE_ROOT, GSD_WEB_HOST_KIND

### 9. Command classification matches source

1. Run: `node -e "..." or manually count entries in `web/lib/browser-slash-command-dispatch.ts` for SURFACE_COMMANDS, GSD_SURFACE_SUBCOMMANDS, GSD_PASSTHROUGH_SUBCOMMANDS
2. Check `docs/web-mode.md` Browser Commands section
3. **Expected:** 20 surface subcommands, 9 passthrough subcommands, 1 help — totaling 30

### 10. API route count matches source

1. Run: `ls -d web/app/api/*/ | wc -l`
2. Check `docs/web-mode.md` Architecture section
3. **Expected:** 23 API route directories documented

### 11. All cross-reference links resolve

1. Run:
```bash
for src in docs/web-mode.md docs/README.md docs/getting-started.md docs/architecture.md docs/commands.md docs/configuration.md docs/troubleshooting.md; do
  for link in $(rg -oP '\]\(\./([^)#]+)' "$src" 2>/dev/null | sed 's/.*\.\///'); do
    target="docs/$link"
    test -f "$target" || echo "BROKEN in $src: $link"
  done
done
for link in $(rg -oP '\]\(\./([^)#]+)' README.md 2>/dev/null | sed 's/.*\.\///'); do
  test -f "$link" -o -d "$link" || echo "BROKEN in README.md: $link"
done
```
2. **Expected:** No output (zero broken links)

### 12. Architecture docs have host/bridge/store section

1. Open `docs/architecture.md`
2. Search for "Web Mode" section heading
3. **Expected:** Section describes parent launcher → standalone host → bridge singleton → workspace store pattern

### 13. Troubleshooting docs have web-specific section

1. Open `docs/troubleshooting.md`
2. Search for "Web Mode" section
3. **Expected:** Section covers port conflicts, bridge disconnects, build failures, stale PID files

## Edge Cases

### Anchor-only cross-references

1. Check `docs/web-mode.md` for any internal anchor links (e.g., `[text](#section-name)`)
2. **Expected:** Each anchor resolves to a heading in the same file

### docs/ directory link in README

1. In README.md, find `[docs/](./docs/)` link
2. **Expected:** `docs/` directory exists (this is a directory link, not a file link)

## Failure Signals

- `rg -i "web mode|--web|gsd --web"` returns fewer than 8 files — missing cross-references
- `test -f docs/web-mode.md` fails — guide not created
- Any view name, CLI flag, or env var in docs doesn't match the corresponding source file — documentation-codebase mismatch
- Cross-reference link check produces "BROKEN" output — dead links in docs
- Command classification counts don't sum to 30 — dispatch documentation is wrong

## Requirements Proved By This UAT

- R111 — Full coverage: dedicated guide exists, README updated, docs index updated, 5 existing docs cross-reference web mode, all references verified against source

## Not Proven By This UAT

- R112 (CI web-build job) — covered by S01, not this slice
- Runtime behavior of web mode — this UAT verifies documentation accuracy, not that `gsd --web` actually works
- Whether documentation is understandable to a new user — only mechanical accuracy is tested

## Notes for Tester

- All test cases can be run as bash commands — no browser or running server needed.
- The `dist/web/standalone/server.js` path in docs/web-mode.md only exists after `npm run build:web-host` — this is correctly documented as a resolution candidate with fallback. Do not flag it as broken.
- Command classification (20/9/1) should be checked against `browser-slash-command-dispatch.ts` Map/Set sizes, not by counting individual entries (some entries span multiple lines).
