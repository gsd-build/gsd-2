---
phase: 05-dead-code-cleanup
plan: 03
type: execute
wave: 2
depends_on:
  - 5-01
  - 5-02
files_modified:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/auto-post-unit.ts
  - src/resources/extensions/gsd/auto/phases.ts
  - src/resources/extensions/gsd/auto/session.ts
  - src/resources/extensions/gsd/session-status-io.ts
  - src/resources/extensions/gsd/auto-start.ts
autonomous: true
requirements:
  - CLN-01
  - CLN-04
  - CLN-05

must_haves:
  truths:
    - "Net line deletion across the milestone is at least 4,000 lines with all tests passing"
    - "No TypeScript compilation errors after all plans complete"
    - "All tests in the gsd extension pass"
    - "completedUnits field does not exist in any state/session interface"
  artifacts:
    - path: "src/resources/extensions/gsd/auto.ts"
      provides: "Auto-mode without completedUnits state field"
    - path: "src/resources/extensions/gsd/auto/session.ts"
      provides: "Session type without completedUnits"
  key_links:
    - from: "src/resources/extensions/gsd/auto.ts"
      to: "src/resources/extensions/gsd/auto/session.ts"
      via: "state type no longer has completedUnits field"
      pattern: "no completedUnits"
---

<objective>
Final cleanup sweep: remove the completedUnits state field from session/state types, clean up any remaining dead imports or references missed by Plans 01-02, verify net line deletion target, and run full test suite.

Purpose: Plans 01 and 02 remove the usage sites. This plan removes the type declarations and any residual references, then verifies the milestone success criteria (4,000+ net line deletion, all tests passing).
Output: Clean codebase with no dead code remnants, verified line deletion count.
</objective>

<execution_context>
@/Users/jeremymcspadden/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jeremymcspadden/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-dead-code-cleanup/5-CONTEXT.md
@.planning/phases/05-dead-code-cleanup/5-01-SUMMARY.md
@.planning/phases/05-dead-code-cleanup/5-02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove completedUnits from state types and clean up residual references</name>
  <files>
    src/resources/extensions/gsd/auto.ts
    src/resources/extensions/gsd/auto-post-unit.ts
    src/resources/extensions/gsd/auto/phases.ts
    src/resources/extensions/gsd/auto/session.ts
    src/resources/extensions/gsd/session-status-io.ts
    src/resources/extensions/gsd/auto-start.ts
    src/resources/extensions/gsd/dashboard-overlay.ts
    src/resources/extensions/gsd/visualizer-data.ts
    src/resources/extensions/gsd/auto-dashboard.ts
    src/resources/extensions/gsd/session-lock.ts
    src/resources/extensions/gsd/parallel-merge.ts
    src/resources/extensions/gsd/parallel-orchestrator.ts
    src/resources/extensions/gsd/crash-recovery.ts
    src/resources/extensions/gsd/commands/handlers/parallel.ts
    src/resources/extensions/gsd/commands/context.ts
  </files>
  <read_first>
    src/resources/extensions/gsd/auto/session.ts
    src/resources/extensions/gsd/auto.ts
    src/resources/extensions/gsd/auto-post-unit.ts
    src/resources/extensions/gsd/auto/phases.ts
    src/resources/extensions/gsd/session-status-io.ts
    src/resources/extensions/gsd/auto-start.ts
    src/resources/extensions/gsd/auto/loop-deps.ts
    src/resources/extensions/gsd/dashboard-overlay.ts
    src/resources/extensions/gsd/visualizer-data.ts
    src/resources/extensions/gsd/auto-dashboard.ts
    src/resources/extensions/gsd/session-lock.ts
    src/resources/extensions/gsd/parallel-merge.ts
    src/resources/extensions/gsd/parallel-orchestrator.ts
    src/resources/extensions/gsd/crash-recovery.ts
    src/resources/extensions/gsd/commands/handlers/parallel.ts
    src/resources/extensions/gsd/commands/context.ts
  </read_first>
  <action>
**Find the completedUnits type declaration.** It is likely in `auto/session.ts` or `auto.ts` — search for `completedUnits` in interface/type definitions. Remove the field from the interface.

**For every file in the `files_modified` list of Plans 01 and 02 that references `completedUnits`:**
The grep showed 38 files reference `completedUnits`. Plans 01-02 handled the main usage sites. This task cleans up:

1. **State/session type declarations** — Remove `completedUnits: ...` field from the `AutoState` or `AutoSession` interface (likely in `auto/session.ts` or `auto.ts`)
2. **State initialization** — Remove `completedUnits: []` from any state initialization object
3. **Dashboard/visualizer** — `dashboard-overlay.ts`, `visualizer-data.ts`, `auto-dashboard.ts`, `visualizer-views.ts` likely read `s.completedUnits.length` for display. Remove those reads or replace with engine query count.
4. **Session serialization** — `session-status-io.ts`, `session-lock.ts` may serialize completedUnits. Remove from serialization.
5. **Parallel orchestration** — `parallel-merge.ts`, `parallel-orchestrator.ts`, `crash-recovery.ts`, `commands/handlers/parallel.ts`, `commands/context.ts` may reference completedUnits in worker state. Remove.
6. **auto-start.ts** — May initialize completedUnits. Remove.
7. **auto/loop-deps.ts** — If `completedUnits` appears in the deps type, remove it.
8. **lastStateRebuildAt** — If `s.lastStateRebuildAt` was only used by the STATE.md rebuild block removed in Plan 01, remove the field from the state type and initialization.

**Residual sweep:** Run `grep -r "completedUnits\|completed-units\|unit-runtime\|selfHeal\|verifyExpectedArtifact\|oscillat" src/resources/extensions/gsd/ --include="*.ts" --include="*.mjs"` and fix any remaining references:
- If a reference is in a comment, remove the comment
- If a reference is in code, it's a missed site — remove/replace per D-01/D-02/D-03
- If a reference is in a string literal (e.g., log message), update the string

**Also clean up test residuals:** Check the test files listed in the grep output (`tests/doctor-proactive.test.ts`, `tests/stop-auto-remote.test.ts`, `tests/session-lock-regression.test.ts`, `tests/parallel-orchestration.test.ts`, `tests/parallel-worker-monitoring.test.ts`, `tests/parallel-budget-atomicity.test.ts`, `tests/parallel-crash-recovery.test.ts`, `tests/parallel-merge.test.ts`, `tests/headless-query.test.ts`, `tests/export-html-enhancements.test.ts`, `tests/crash-recovery.test.ts`, `tests/auto-lock-creation.test.ts`) for `completedUnits` in mock state objects. Remove the field from those mocks.

**Integration test:** Check `tests/integration/headless-command.ts` line 271 for `completed-units.json` reference and remove it.
  </action>
  <verify>
    <automated>cd /Users/jeremymcspadden/Github/gsd-2/.claude/worktrees/single-writer-state-architecture && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -r "completedUnits" src/resources/extensions/gsd/ --include="*.ts" --include="*.mjs"` returns NO matches
    - `grep -r "completed-units" src/resources/extensions/gsd/ --include="*.ts" --include="*.mjs" --include="*.md"` returns NO matches
    - `grep -r "unit-runtime" src/resources/extensions/gsd/ --include="*.ts" --include="*.mjs"` returns NO matches
    - `grep -r "selfHeal" src/resources/extensions/gsd/ --include="*.ts"` returns NO matches
    - `grep -r "verifyExpectedArtifact\|diagnoseExpectedArtifact\|resolveExpectedArtifactPath" src/resources/extensions/gsd/ --include="*.ts"` returns NO matches
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>completedUnits removed from all state types, initializations, serializations, and display code. No residual references to any removed functionality anywhere in the codebase.</done>
</task>

<task type="auto">
  <name>Task 2: Verify net line deletion and full test suite</name>
  <files></files>
  <read_first>
    .planning/ROADMAP.md
  </read_first>
  <action>
**Line count verification:**
1. Run `git diff --stat main...HEAD` to get overall line changes for the milestone
2. Verify net deletion is at least 4,000 lines (insertions - deletions should show >=4000 net deletions)
3. If below 4,000, check if there are additional dead code blocks that can be safely removed (comments referencing removed functions, unused imports, etc.)

**Full test suite:**
1. Run `npx tsc --noEmit` — must exit 0
2. Run `node --test src/resources/extensions/gsd/tests/*.test.ts` — all tests must pass
3. Run `node --test src/resources/extensions/gsd/tests/*.test.mjs` — all tests must pass
4. Run `npm run build` if available — must exit 0

**Success criteria verification against ROADMAP.md Phase 5:**
1. `grep -r "completed-units\.json" src/resources/extensions/gsd/` — zero matches (SC-1)
2. `grep -r "selfHealRuntimeRecords" src/resources/extensions/gsd/` — zero matches (SC-2)
3. `grep "runGSDDoctor\|rebuildState\|STATE_REBUILD" src/resources/extensions/gsd/auto-post-unit.ts` — zero matches (SC-3)
4. `grep "oscillat\|Rule 3" src/resources/extensions/gsd/auto/detect-stuck.ts` — zero matches (SC-4)
5. Net line deletion >= 4,000 (SC-5)

If any check fails, fix it before marking complete.
  </action>
  <verify>
    <automated>cd /Users/jeremymcspadden/Github/gsd-2/.claude/worktrees/single-writer-state-architecture && npx tsc --noEmit && echo "TSC OK" && node --test src/resources/extensions/gsd/tests/auto-loop.test.ts 2>&1 | tail -3 && node --test src/resources/extensions/gsd/tests/auto-recovery.test.ts 2>&1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - `git diff --stat main...HEAD | tail -1` shows net deletion of at least 4,000 lines
    - All 5 ROADMAP Phase 5 success criteria verified as described in action
    - No test failures in the gsd extension test suite
  </acceptance_criteria>
  <done>All 5 Phase 5 success criteria from ROADMAP.md verified. Net line deletion >= 4,000. All tests pass. TypeScript compiles clean. Phase 5 complete.</done>
</task>

</tasks>

<verification>
- `grep -rE "completedUnits|completed-units|unit-runtime|selfHeal|verifyExpectedArtifact|oscillat" src/resources/extensions/gsd/ --include="*.ts" --include="*.mjs"` returns zero matches
- `npx tsc --noEmit` exits 0
- Full test suite passes
- Net line deletion >= 4,000 lines
- All 5 ROADMAP Phase 5 success criteria met
</verification>

<success_criteria>
Phase 5 milestone complete. All dead code removed. Net 4,000+ line deletion. All tests pass. TypeScript compiles clean. All 5 success criteria from ROADMAP verified.
</success_criteria>

<output>
After completion, create `.planning/phases/05-dead-code-cleanup/5-03-SUMMARY.md`
</output>
