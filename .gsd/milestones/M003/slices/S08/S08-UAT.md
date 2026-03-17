# S08: TUI-to-web 1:1 parity audit and gap closure — UAT

**Milestone:** M003
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S08 is a parity audit slice — the primary deliverable is a structured document proving every TUI feature was compared against its web equivalent, plus aligned test assertions. No new runtime surfaces were built; verification is compile-time + test-time.

## Preconditions

- Repository is at the M003/S08 merge point (all S01–S07 work integrated)
- Node.js and npm are available
- No server needs to be running — all verification is offline

## Smoke Test

Run `npx tsx --test src/tests/web-command-parity-contract.test.ts` and confirm 118/118 pass with 0 failures.

## Test Cases

### 1. Parity audit document completeness

1. Open `.gsd/milestones/M003/slices/S08/S08-PARITY-AUDIT.md`
2. Verify Section 1 (Command Dispatch Matrix) has exactly 30 rows — one per `/gsd` subcommand
3. Verify all 30 subcommands from `registerGSDCommand` in `src/resources/extensions/gsd/commands.ts` are represented
4. Verify each row has: subcommand name, TUI handler, web dispatch type, web target, parity status
5. **Expected:** All 30 subcommands listed with complete row data, no "TBD" or placeholder entries

### 2. Gap disposition completeness

1. In S08-PARITY-AUDIT.md, navigate to Section 6 (Gap Summary)
2. Count the total number of gaps listed
3. Verify each gap has a disposition: "Fixed in S08", "Intentional scope boundary", or "Deferred"
4. Verify no gaps have "Unknown" or "TBD" disposition
5. **Expected:** 12 gaps total — 9 intentional scope boundaries, 3 deferred, 0 unknown

### 3. Parity contract test suite — full green

1. Run: `npx tsx --test src/tests/web-command-parity-contract.test.ts`
2. **Expected:** 118/118 pass, 0 fail, 0 skip

### 4. Visualize dispatch kind — view-navigate

1. In `src/tests/web-command-parity-contract.test.ts`, search for `visualize` in `EXPECTED_GSD_OUTCOMES`
2. Verify it maps to `"view-navigate"` (not `"surface"`)
3. Search for the dedicated view-navigate test block
4. **Expected:** Dedicated test "/gsd visualize dispatches as view-navigate to the visualizer view" exists and asserts `kind: "view-navigate"` and `view: "visualize"`

### 5. No stub surfaces remain

1. Run: `rg "This surface will be implemented" web/components/gsd/command-surface.tsx`
2. Run: `rg "Unknown GSD surface" web/components/gsd/command-surface.tsx`
3. **Expected:** Zero matches for stub/placeholder text — all 20 dispatched surfaces have real panel components

### 6. Both builds succeed

1. Run: `npm run build`
2. Run: `npm run build:web-host`
3. **Expected:** Both exit 0 with no errors

### 7. Dashboard overlay comparison in audit

1. In S08-PARITY-AUDIT.md, navigate to Section 3 (Dashboard Overlay Comparison)
2. Verify it covers key dashboard features: milestone/phase, progress counts, unit list, auto-mode status
3. Verify gaps are listed with dispositions (pending captures badge, worktree name)
4. **Expected:** At least 10 dashboard features compared, gaps identified and classified

### 8. Visualizer tab parity

1. In S08-PARITY-AUDIT.md, navigate to Section 4 (Visualizer Tab Comparison)
2. Verify all 7 tabs are listed: Progress, Deps, Metrics, Timeline, Agent, Changes, Export
3. **Expected:** All 7 tabs at "Full" parity status

## Edge Cases

### Surface count guard consistency

1. In `web-command-parity-contract.test.ts`, find the surface count assertion in the "every GSD surface dispatches through the contract wiring end-to-end" test
2. Verify it expects 19 surfaces (not 20)
3. Verify the size-30 assertion for `EXPECTED_GSD_OUTCOMES` is present
4. **Expected:** 19 surfaces + 1 view-navigate = 20 non-passthrough outcomes. Size-30 guard catches new subcommands.

### Interactive flow gap documentation

1. In S08-PARITY-AUDIT.md Section 5, verify interactive flows are documented
2. Check that prefs wizard, import-claude, doctor heal/audit, config key wizard are listed
3. **Expected:** Each interactive flow has a description of what the TUI does and why the web equivalent is intentionally scope-bounded

## Failure Signals

- `web-command-parity-contract.test.ts` has fewer than 118 passing tests — dispatch expectations are stale
- `S08-PARITY-AUDIT.md` is missing or has fewer than 30 subcommands — audit is incomplete
- `rg "This surface will be implemented"` returns matches — stub surfaces weren't replaced
- Either build fails — code changes introduced regressions
- Any gap in the audit has "Unknown" or no disposition — audit classification is incomplete

## Requirements Proved By This UAT

- R109 — Systematic comparison of every TUI feature against the web UI, with gaps closed or classified

## Not Proven By This UAT

- R110 — Full test suite pass (`test:unit`, `test:integration`) — this is S09's scope
- Live runtime behavior of individual panels — surfaces were built in S03–S07 and verified there; this UAT verifies the meta-audit, not each panel's runtime behavior
- Human judgment on whether the 9 intentional scope boundaries are acceptable — that's a product decision

## Notes for Tester

- The parity audit document is ~29KB — it's comprehensive but structured. Focus on Section 1 (dispatch matrix) and Section 6 (gap summary) for the quickest validation.
- The 9 "intentional scope boundary" gaps are all multi-step interactive wizards that work via bridge passthrough — the TUI functionality is accessible in web mode, just not via a browser-native UI. This is a deliberate architectural choice, not a missing feature.
- The 3 "deferred" gaps are minor UI polish items (badge, label, panel richness) — they don't affect functionality.
