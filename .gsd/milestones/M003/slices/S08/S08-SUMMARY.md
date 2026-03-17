---
id: S08
parent: M003
milestone: M003
provides:
  - Complete TUI-to-web parity audit document (S08-PARITY-AUDIT.md) covering all 30 /gsd subcommands
  - 12-gap inventory with dispositions (9 intentional scope boundaries, 3 deferred, 0 unknown)
  - Corrected parity contract test suite (118/118 pass) with view-navigate modeled as first-class dispatch kind
requires:
  - slice: S03
    provides: Visualizer page with 7 tabbed sections and /api/visualizer route
  - slice: S04
    provides: Forensics, doctor, skill-health panels with API routes
  - slice: S05
    provides: Knowledge/captures page with API routes
  - slice: S06
    provides: Extended settings surface with model routing, budget, and preferences panels
  - slice: S07
    provides: All 10 remaining command surfaces with real panels
affects:
  - S09
key_files:
  - .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md
  - src/tests/web-command-parity-contract.test.ts
key_decisions:
  - All 12 parity gaps classified with dispositions — no unresolved entries
  - view-navigate dispatch kind modeled as first-class in test contract alongside surface/prompt/local
patterns_established:
  - Parity audit structured as dispatch matrix + surface detail + overlay comparison + interactive flow gaps + gap summary
  - Test contracts should model all dispatch kinds explicitly (surface, prompt, local, view-navigate) with kind-specific assertions
observability_surfaces:
  - S08-PARITY-AUDIT.md — primary inspection surface for TUI-to-web feature parity questions
  - npx tsx --test src/tests/web-command-parity-contract.test.ts — 118/118 assertions encode dispatch expectations
drill_down_paths:
  - .gsd/milestones/M003/slices/S08/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S08/tasks/T02-SUMMARY.md
duration: 20m
verification_result: passed
completed_at: 2026-03-16
---

# S08: TUI-to-web 1:1 parity audit and gap closure

**Systematic parity audit across all 30 `/gsd` subcommands, dashboard overlay, and 7 visualizer tabs — 12 gaps identified and classified, test contract aligned to 118/118 green, both builds passing.**

## What Happened

This slice performed the final-assembly verification for M003's web parity work. Two tasks executed in sequence:

**T01** built the comprehensive parity audit document (`S08-PARITY-AUDIT.md`) by reading all TUI source files (commands.ts, dashboard-overlay.ts, visualizer-overlay.ts, visualizer-views.ts) and all web equivalents (dispatch, panels, views, API routes). The audit produced 7 sections: a command dispatch matrix for all 30 subcommands, per-surface comparison tables for 20 surface commands, dashboard overlay comparison (11 features), visualizer tab comparison (7 tabs at full parity), interactive flow gap analysis (8 flows), gap summary with dispositions, and an overall parity conclusion.

The audit found 12 gaps total:
- **9 intentional scope boundaries** — interactive wizards (prefs setup wizard, import-claude, config key wizard), TUI-specific patterns (doctor audit/heal modes, skill-health filters/detail drill-down), and capture-with-args/knowledge-with-args inline write support. These require multi-step interactive UI that would be a new feature, not a parity gap.
- **3 deferred** — pending captures badge in dashboard, worktree name display in dashboard, and status panel showing full dashboard overlay richness. These are minor data-visibility items.
- **0 unknown/unclassified** — every gap has a disposition.

**T02** fixed 4 pre-existing test failures in `web-command-parity-contract.test.ts`. The `/gsd visualize` subcommand dispatches as `view-navigate` (a full app-shell view, per D053) but the test expected `surface`. Changes: added `view-navigate` to the type annotation, updated the dispatch expectation, adjusted the surface count from 20 to 19, added a `view-navigate` case in the exhaustive iteration test, and added a dedicated test for the visualize dispatch. Result: 118/118 tests pass.

## Verification

- ✅ `test -f .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — file exists (29KB, 7 sections)
- ✅ `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118/118 pass, 0 failures
- ✅ `npm run build` — exit 0
- ✅ `npm run build:web-host` — exit 0
- ✅ `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches (no stub surfaces)

## Requirements Advanced

- R109 — Validated. Complete parity audit document covers all 30 subcommands, dashboard overlay, visualizer tabs, and interactive flows. 12 gaps all classified with dispositions.

## Requirements Validated

- R109 — S08-PARITY-AUDIT.md proves systematic comparison was done. 118/118 parity contract tests encode dispatch expectations. Zero stub surfaces remain.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

T02 added a `view-navigate` case in the exhaustive iteration test (not explicitly in the plan) — this was necessary because the iteration test asserts kind-specific properties, so it needed a parallel assertion for view-navigate outcomes to verify `outcome.view`.

## Known Limitations

- 9 interactive TUI flows (prefs wizard, import-claude, config key wizard, doctor heal/audit modes, skill-health filters/detail, capture-with-args, knowledge-with-args) are intentionally scope-bounded — they work via bridge passthrough but don't have browser-native multi-step interactive equivalents.
- 3 minor data-visibility items deferred: pending captures badge, worktree name in dashboard, status panel richness.
- The parity audit is a point-in-time document — new TUI features added after this audit would need re-auditing.

## Follow-ups

- S09 test suite hardening is the next and final slice — consumes this fully-audited codebase.

## Files Created/Modified

- `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — complete parity audit document (29KB, 7 sections, 30 subcommands)
- `src/tests/web-command-parity-contract.test.ts` — fixed visualize dispatch expectations, added view-navigate type and dedicated test
- `.gsd/milestones/M003/slices/S08/S08-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M003/slices/S08/tasks/T01-PLAN.md` — added Observability Impact section
- `.gsd/milestones/M003/slices/S08/tasks/T02-PLAN.md` — added Observability Impact section

## Forward Intelligence

### What the next slice should know
- The parity audit is complete and all gaps are classified. S09 can focus purely on test suite hardening without worrying about missing features.
- The test contract at `web-command-parity-contract.test.ts` is at 118/118 and encodes the authoritative dispatch behavior for all 30 subcommands. Any test failures in S09 should be investigated as real regressions, not false positives.
- Both builds (`npm run build`, `npm run build:web-host`) are green as of this slice.

### What's fragile
- `EXPECTED_GSD_OUTCOMES` Map in the parity contract test must stay in sync with any new subcommands added to the GSD extension. The size-30 guard assertion will catch additions but not removals.
- `EXPECTED_BUILTIN_OUTCOMES` must track upstream's `BUILTIN_SLASH_COMMANDS` — currently at 21 entries. The size assertion catches drift.

### Authoritative diagnostics
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118/118 pass confirms dispatch parity holds
- `S08-PARITY-AUDIT.md` Section 6 — gap inventory with dispositions is the authoritative record of what's intentionally missing

### What assumptions changed
- Assumed 20 surface dispatches, but D053 correctly makes visualize a view-navigate (19 surface + 1 view-navigate) — test contract now models this explicitly
