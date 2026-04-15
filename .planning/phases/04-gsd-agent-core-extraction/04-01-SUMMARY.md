---
phase: 04-gsd-agent-core-extraction
plan: "01"
subsystem: gsd-agent-core
tags: [extraction, refactor, module-split]
dependency_graph:
  requires: []
  provides:
    - packages/gsd-agent-core/src/blob-store.ts
    - packages/gsd-agent-core/src/artifact-manager.ts
    - packages/gsd-agent-core/src/contextual-tips.ts
    - packages/gsd-agent-core/src/image-overflow-recovery.ts
    - packages/gsd-agent-core/src/fallback-resolver.ts
    - packages/gsd-agent-core/src/export-html/
  affects:
    - packages/pi-coding-agent/src/index.ts
    - packages/gsd-agent-core/package.json
tech_stack:
  added: []
  patterns:
    - package-import-surgery (relative → @gsd/pi-coding-agent)
key_files:
  created:
    - packages/gsd-agent-core/src/blob-store.ts
    - packages/gsd-agent-core/src/artifact-manager.ts
    - packages/gsd-agent-core/src/contextual-tips.ts
    - packages/gsd-agent-core/src/image-overflow-recovery.ts
    - packages/gsd-agent-core/src/fallback-resolver.ts
    - packages/gsd-agent-core/src/export-html/ansi-to-html.ts
    - packages/gsd-agent-core/src/export-html/tool-renderer.ts
    - packages/gsd-agent-core/src/export-html/index.ts
    - packages/gsd-agent-core/src/export-html/template.css
    - packages/gsd-agent-core/src/export-html/template.html
    - packages/gsd-agent-core/src/export-html/template.js
    - packages/gsd-agent-core/src/export-html/vendor/highlight.min.js
    - packages/gsd-agent-core/src/export-html/vendor/marked.min.js
  modified:
    - packages/gsd-agent-core/package.json
    - packages/pi-coding-agent/src/index.ts
  deleted:
    - packages/pi-coding-agent/src/core/blob-store.ts
    - packages/pi-coding-agent/src/core/artifact-manager.ts
    - packages/pi-coding-agent/src/core/contextual-tips.ts
    - packages/pi-coding-agent/src/core/image-overflow-recovery.ts
    - packages/pi-coding-agent/src/core/fallback-resolver.ts
    - packages/pi-coding-agent/src/core/export-html/ (entire directory)
decisions:
  - "Verbatim copy for 4 leaf files (blob-store, artifact-manager, contextual-tips, image-overflow-recovery) — no import surgery needed"
  - "fallback-resolver.ts: 3 relative imports changed to @gsd/pi-coding-agent package imports"
  - "export-html/index.ts: 5 relative imports (config, theme, session) changed to @gsd/pi-coding-agent"
  - "export-html/tool-renderer.ts: 2 relative imports (Theme, ToolDefinition) changed to @gsd/pi-coding-agent"
  - "artifact-manager.ts import kept as node:fs (not bare fs) for consistency"
  - "Added UsageLimitErrorType, FallbackChainEntry, getResolvedThemeColors, getThemeExportColors to pi-coding-agent/src/index.ts re-exports — required for fallback-resolver and export-html to compile"
metrics:
  duration: "6 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  tasks_total: 3
  files_created: 13
  files_modified: 2
  files_deleted: 9
---

# Phase 04 Plan 01: Pre-move Setup and CORE-01 Leaf File Extraction Summary

CORE-01 leaf file extraction complete: 5 standalone source files + export-html/ directory (8 files) moved from pi-coding-agent/src/core/ to gsd-agent-core/src/, with import surgery converting relative paths to @gsd/pi-coding-agent package imports.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Pre-move setup — add pi-tui dependency and config re-exports | 5fb422fe6 | packages/gsd-agent-core/package.json, packages/pi-coding-agent/src/index.ts |
| 2 | Extract CORE-01 leaf files — blob-store, artifact-manager, contextual-tips, image-overflow-recovery, fallback-resolver | ab96c1268 | 5 new files in gsd-agent-core/src/, 5 originals deleted from pi-coding-agent/src/core/ |
| 3 | Extract CORE-01 export-html/ directory | d59b4fee6 | 8 new files in gsd-agent-core/src/export-html/, original directory deleted |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing re-exports] Added 4 missing exports to pi-coding-agent/src/index.ts**
- **Found during:** Task 1 (Step 3 verification)
- **Issue:** `UsageLimitErrorType`, `FallbackChainEntry`, `getResolvedThemeColors`, `getThemeExportColors` were not exported from the package index but are required by the moved files
- **Fix:** Added all 4 to their respective export groups in pi-coding-agent/src/index.ts
- **Files modified:** packages/pi-coding-agent/src/index.ts
- **Commit:** 5fb422fe6

## Build Gate Results

| After Task | tsc Errors | Status |
|------------|-----------|--------|
| Baseline | 3 (RpcClient TS2305 x2, TS7006 x1) | PASS |
| Task 1 | 3 | PASS — no regression |
| Task 2 | 3 | PASS — no regression |
| Task 3 | 3 | PASS — no regression |

## Known Stubs

None — all extracted files contain complete implementations.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced. File movement is entirely filesystem-internal.

## Self-Check: PASSED

Files verified present:
- packages/gsd-agent-core/src/blob-store.ts: FOUND
- packages/gsd-agent-core/src/artifact-manager.ts: FOUND
- packages/gsd-agent-core/src/contextual-tips.ts: FOUND
- packages/gsd-agent-core/src/image-overflow-recovery.ts: FOUND
- packages/gsd-agent-core/src/fallback-resolver.ts: FOUND
- packages/gsd-agent-core/src/export-html/index.ts: FOUND
- packages/gsd-agent-core/src/export-html/vendor/highlight.min.js: FOUND

Originals confirmed absent:
- packages/pi-coding-agent/src/core/blob-store.ts: NOT FOUND (correct)
- packages/pi-coding-agent/src/core/fallback-resolver.ts: NOT FOUND (correct)
- packages/pi-coding-agent/src/core/export-html/: NOT FOUND (correct)

Commits verified:
- 5fb422fe6: FOUND
- ab96c1268: FOUND
- d59b4fee6: FOUND
