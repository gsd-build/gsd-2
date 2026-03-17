---
id: T01
parent: S08
milestone: M003
provides:
  - Complete TUI-to-web parity audit document (S08-PARITY-AUDIT.md)
  - Feature matrix covering all 30 /gsd subcommands
  - Gap inventory with dispositions for every identified parity difference
key_files:
  - .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md
key_decisions:
  - All 12 gaps classified — 9 intentional scope boundaries, 3 deferred
  - No gaps represent missing core functionality
patterns_established:
  - Parity audit structured as dispatch matrix + surface detail + overlay comparison + interactive flow gaps + gap summary
observability_surfaces:
  - S08-PARITY-AUDIT.md serves as the inspection surface for future parity questions
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Produce the TUI-to-web parity audit document

**Built complete parity audit document covering all 30 `/gsd` subcommands, dashboard overlay, 7 visualizer tabs, and interactive flows — 12 gaps identified and classified with zero unresolved entries.**

## What Happened

Read all TUI source files (`commands.ts`, `dashboard-overlay.ts`, `visualizer-overlay.ts`, `visualizer-views.ts`) and all web source files (`browser-slash-command-dispatch.ts`, `command-surface.tsx`, all panel components, `visualizer-view.tsx`) to build a systematic comparison.

Produced `S08-PARITY-AUDIT.md` with 7 sections:
1. **Command dispatch matrix** — all 30 subcommands with dispatch type (19 surface, 1 view-navigate, 9 passthrough, 1 local) and parity status
2. **Surface command detail** — 20 surface commands with per-aspect TUI vs web comparison tables
3. **Dashboard overlay comparison** — 11 features compared (2 gaps: pending captures badge, worktree name)
4. **Visualizer tab comparison** — all 7 tabs at full content parity
5. **Interactive flow gaps** — 8 flows documented (prefs wizard, import-claude, doctor heal/audit, skill-health filters/detail, capture-with-args, knowledge-with-args, config key wizard)
6. **Gap summary** — 12 gaps total with dispositions: 9 intentional scope boundaries, 3 deferred, 0 unknown
7. **Conclusion** — overall parity assessment confirming strong coverage

Also fixed pre-flight observability gaps: added `## Observability / Diagnostics` to S08-PLAN.md and `## Observability Impact` to T01-PLAN.md.

## Verification

- `test -f .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — PASS (file exists)
- Section 1 dispatch matrix: 30 rows confirmed (all subcommands from `registerGSDCommand`)
- Sections for dashboard (§3), visualizer (§4), interactive flows (§5) — all present
- Gap disposition check: only match for "Unknown/TBD" is the summary row showing count = 0
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches (PASS)

### Slice-level verification (partial — T01 of 2):
- ✅ `test -f .gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — file exists
- ⏳ `npx tsx --test src/tests/web-command-parity-contract.test.ts` — not yet run (T02 fixes test assertions)
- ⏳ `npm run build` — not yet run (T02 scope)
- ⏳ `npm run build:web-host` — not yet run (T02 scope)
- ✅ `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches

## Diagnostics

Read `S08-PARITY-AUDIT.md` to inspect parity status. Key sections:
- Section 1 for dispatch routing of any subcommand
- Section 6 for gap inventory and dispositions
- Section 7 for overall assessment

## Deviations

None.

## Known Issues

- 4 test failures in `web-command-parity-contract.test.ts` for `/gsd visualize` — these exist pre-T01 and will be fixed in T02 by updating test assertions to expect `view-navigate` instead of `surface`.

## Files Created/Modified

- `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md` — complete parity audit document (29KB)
- `.gsd/milestones/M003/slices/S08/S08-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M003/slices/S08/tasks/T01-PLAN.md` — added Observability Impact section
