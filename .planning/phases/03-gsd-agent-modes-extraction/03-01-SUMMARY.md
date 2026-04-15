---
phase: 03-gsd-agent-modes-extraction
plan: "01"
subsystem: extraction
tags: [refactor, extraction, cli, theme, thinking-level, agent-modes]
dependency_graph:
  requires: []
  provides:
    - packages/pi-coding-agent/src/core/thinking-level.ts
    - packages/pi-coding-agent/src/core/theme/theme.ts
    - packages/gsd-agent-modes/src/cli/ (5 files)
    - packages/gsd-agent-modes/src/modes/shared/command-context-actions.ts
    - packages/gsd-agent-modes/src/modes/print-mode.ts
  affects:
    - packages/pi-coding-agent/src/index.ts (expanded API)
    - packages/pi-coding-agent/src/core/model-resolver.ts
    - packages/pi-coding-agent/src/modes/interactive/** (theme path updates)
    - packages/gsd-agent-modes/src/index.ts
tech_stack:
  added: []
  patterns:
    - Cross-package imports via @gsd/pi-coding-agent package root (D-03 strategy)
    - Shared-source approach for files with circular dep constraints
key_files:
  created:
    - packages/pi-coding-agent/src/core/thinking-level.ts
    - packages/pi-coding-agent/src/core/theme/theme.ts
    - packages/pi-coding-agent/src/core/theme/themes.ts
    - packages/gsd-agent-modes/src/cli/args.ts
    - packages/gsd-agent-modes/src/cli/config-selector.ts
    - packages/gsd-agent-modes/src/cli/file-processor.ts
    - packages/gsd-agent-modes/src/cli/list-models.ts
    - packages/gsd-agent-modes/src/cli/session-picker.ts
    - packages/gsd-agent-modes/src/modes/shared/command-context-actions.ts
    - packages/gsd-agent-modes/src/modes/print-mode.ts
  modified:
    - packages/pi-coding-agent/src/index.ts
    - packages/pi-coding-agent/src/core/model-resolver.ts
    - packages/pi-coding-agent/src/cli/args.ts
    - packages/pi-coding-agent/src/modes/interactive/components/index.ts
    - packages/pi-coding-agent/scripts/copy-assets.cjs
    - packages/gsd-agent-modes/src/index.ts
decisions:
  - "Kept cli/ files in pi-coding-agent (not deleted) — main.ts and modes/index.ts depend on them; deleting creates circular dep with @gsd/agent-modes"
  - "Kept modes/shared/command-context-actions.ts in pi-coding-agent — rpc-mode.ts and print-mode.ts in pi-coding-agent depend on it"
  - "Kept print-mode.ts in pi-coding-agent — modes/index.ts and main.ts depend on it; circular dep if removed"
  - "agent-modes copies have updated imports (@gsd/pi-coding-agent); pi-coding-agent originals use local relative imports"
  - "Added ConfigSelectorComponent temporary re-export to pi-coding-agent index.ts (remove in Plan 03-02)"
  - "Added stopThemeWatcher, KeybindingsManager, SessionListProgress, resolveReadPath, image-resize, mime utils to pi-coding-agent public API"
  - "Updated scripts/copy-assets.cjs: theme assets now at src/core/theme/ not src/modes/interactive/theme/"
metrics:
  duration_minutes: 11
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_changed: 20
---

# Phase 03 Plan 01: PREP + cli/ + shared/ + print/ Extraction Summary

Prepared the codebase for extraction (PREP-A, PREP-B) and extracted cli/, modes/shared/, and modes/print/ from pi-coding-agent into @gsd/agent-modes, with all imports updated to use @gsd/pi-coding-agent cross-package imports.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PREP-A + PREP-B: extract isValidThinkingLevel and relocate theme/ | 402cf9dd1 | 50+ files (all theme importers updated) |
| 2 | Extract cli/ to @gsd/agent-modes [MODES-01] | 3e1eb6c18 | 8 files |
| 3 | Extract modes/shared/ + modes/print/ [MODES-02, MODES-03] | 6e46f6922 | 3 files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] modes/interactive/ components used wrong theme path after relocation**
- **Found during:** Task 1 (PREP-B)
- **Issue:** After relocating theme/ from `modes/interactive/theme/` to `core/theme/`, all ~35 files in `modes/interactive/components/`, `modes/interactive/controllers/`, and `modes/interactive/` still imported from `../theme/theme.js` which no longer existed
- **Fix:** Updated all relative paths: components/ → `../../../core/theme/theme.js`, controllers/ → `../../../core/theme/theme.js`, interactive-mode.ts/slash-command-handlers.ts → `../../core/theme/theme.js`, rpc-mode.ts → `../../core/theme/theme.js`, main.ts → `./core/theme/theme.js`, cli/config-selector.ts → `../core/theme/theme.js`
- **Files modified:** ~38 files across modes/interactive/
- **Commit:** 402cf9dd1

**2. [Rule 1 - Bug] scripts/copy-assets.cjs still referenced old theme path**
- **Found during:** Task 1 (PREP-B)
- **Issue:** `copy-assets.cjs` copied from `src/modes/interactive/theme` which no longer existed after relocation
- **Fix:** Updated to copy from `src/core/theme/`
- **Files modified:** packages/pi-coding-agent/scripts/copy-assets.cjs
- **Commit:** 402cf9dd1

**3. [Rule 2 - Missing exports] pi-coding-agent index.ts missing several exports needed by agent-modes cli/**
- **Found during:** Task 2
- **Issue:** cli/ files in agent-modes import from @gsd/pi-coding-agent, but APP_NAME, CONFIG_DIR_NAME, ENV_AGENT_DIR, allTools, ToolName, resolveReadPath, detectSupportedImageMimeTypeFromFile, formatDimensionNote, resizeImage, stopThemeWatcher, KeybindingsManager, SessionListProgress, isValidThinkingLevel, VALID_THINKING_LEVELS were not exported
- **Fix:** Added all required exports to pi-coding-agent/src/index.ts; added ConfigSelectorComponent with TEMPORARY comment
- **Files modified:** packages/pi-coding-agent/src/index.ts, packages/pi-coding-agent/src/modes/interactive/components/index.ts
- **Commit:** 3e1eb6c18

**4. [Rule 3 - Blocking] cli/ files could not be deleted from pi-coding-agent — circular dependency**
- **Found during:** Task 2
- **Issue:** main.ts in pi-coding-agent imports from ./cli/ and is part of pi-coding-agent's public API (exported as `main`). Adding @gsd/agent-modes as a dep of pi-coding-agent creates a circular dep (agent-modes → pi-coding-agent → agent-modes). pi-coding-agent must build before agent-modes (build order: build:pi → build:gsd)
- **Fix:** Kept cli/ files in pi-coding-agent as the original implementations; agent-modes copies use @gsd/pi-coding-agent imports. Same approach applied to modes/shared/ and modes/print-mode.ts
- **Impact:** plan must_haves says "deleted from pi-coding-agent" — this condition cannot be met without either moving main.ts out of pi-coding-agent or accepting a circular dep. Deferred to Plan 03-02 or later plans when main.ts/rpc-mode.ts can be addressed
- **Commit:** 3e1eb6c18

## Known Stubs

None. All extracted files wire to real implementations.

## Threat Flags

None. No new trust boundaries introduced. This plan moved existing TypeScript source files between packages. New re-exports in pi-coding-agent/src/index.ts expose utility/config symbols already used across the codebase.

## Self-Check: PASSED

All created files verified present. All 3 task commits verified in git log. Both packages build green.

| Check | Result |
|-------|--------|
| packages/pi-coding-agent/src/core/thinking-level.ts | FOUND |
| packages/pi-coding-agent/src/core/theme/theme.ts | FOUND |
| packages/gsd-agent-modes/src/cli/ (5 files) | FOUND |
| packages/gsd-agent-modes/src/modes/shared/command-context-actions.ts | FOUND |
| packages/gsd-agent-modes/src/modes/print-mode.ts | FOUND |
| commit 402cf9dd1 (Task 1) | FOUND |
| commit 3e1eb6c18 (Task 2) | FOUND |
| commit 6e46f6922 (Task 3) | FOUND |
| npm run build:pi-coding-agent | PASS |
| npm run build:agent-modes | PASS |
