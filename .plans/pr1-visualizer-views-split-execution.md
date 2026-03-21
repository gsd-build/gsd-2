# PR #1 Execution Plan: Split `visualizer-views.ts`

## Scope
Pure refactor split of:
- `src/resources/extensions/gsd/visualizer-views.ts` (1229 lines)

Goal:
- Move each view renderer into focused modules
- Keep behavior unchanged
- Keep existing import surface stable via barrel exports

Non-goals:
- No UI/format changes
- No new abstractions
- No data-shape changes

## Target File Layout
Under `src/resources/extensions/gsd/` add:

- `visualizer-formatters.ts`
- `visualizer-progress-view.ts`
- `visualizer-deps-view.ts`
- `visualizer-metrics-view.ts`
- `visualizer-timeline-view.ts`
- `visualizer-agent-view.ts`
- `visualizer-changelog-view.ts`
- `visualizer-export-view.ts`
- `visualizer-knowledge-view.ts`
- `visualizer-captures-view.ts`
- `visualizer-health-view.ts`

And revise:
- `visualizer-views.ts` to a barrel re-export + shared type exports only

## Symbol Move Map
Move exactly these symbols.

### `visualizer-formatters.ts`
- `formatCompletionDate`
- `sliceLabel`
- `findVerification`
- `shortenModel`

### `visualizer-progress-view.ts`
- `ProgressFilter`
- `renderProgressView`
- `renderFeatureStats`
- `renderDiscussionStatus`
- `renderRiskHeatmap`

### `visualizer-deps-view.ts`
- `renderDepsView`
- `renderDataFlow`
- `renderCriticalPath`

### `visualizer-metrics-view.ts`
- `renderMetricsView`
- `renderCostProjections`

### `visualizer-timeline-view.ts`
- `renderTimelineView`
- `renderTimelineList`
- `renderGanttView`

### `visualizer-agent-view.ts`
- `renderAgentView`

### `visualizer-changelog-view.ts`
- `renderChangelogView`

### `visualizer-export-view.ts`
- `renderExportView`

### `visualizer-knowledge-view.ts`
- `renderKnowledgeView`

### `visualizer-captures-view.ts`
- `renderCapturesView`

### `visualizer-health-view.ts`
- `renderHealthView`

## Dependency Rules
- Keep imports local to each module.
- `visualizer-views.ts` re-exports public functions/types.
- Avoid circular imports.
- Shared helper usage only through `visualizer-formatters.ts`.

## Commit Plan
Use small commits in this order.

1. `refactor(visualizer): extract shared formatters`
- Add `visualizer-formatters.ts`
- Update `visualizer-views.ts` to import helpers from new module
- No behavior changes

2. `refactor(visualizer): extract progress and dependency views`
- Add `visualizer-progress-view.ts`
- Add `visualizer-deps-view.ts`
- Wire imports/exports

3. `refactor(visualizer): extract metrics and timeline views`
- Add `visualizer-metrics-view.ts`
- Add `visualizer-timeline-view.ts`
- Wire imports/exports

4. `refactor(visualizer): extract agent and changelog views`
- Add `visualizer-agent-view.ts`
- Add `visualizer-changelog-view.ts`
- Wire imports/exports

5. `refactor(visualizer): extract export, knowledge, captures, health views`
- Add 4 remaining modules
- Wire imports/exports

6. `refactor(visualizer): convert visualizer-views.ts to barrel`
- Keep exported API names unchanged
- Remove in-file implementations

## Verification Checklist (required before push)
Run in repo root:

```bash
npm run typecheck:extensions
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts src/resources/extensions/gsd/tests/*.test.mjs
```

If full suite is slow, at minimum run tests touching visualizer code (discover with `rg -n "visualizer-views|render.*View" src/resources/extensions/gsd/tests`).

Also verify:
- `rg -n "from \"\.\/visualizer-views\.js\"" src/resources/extensions/gsd` still resolves unchanged consumer imports
- `git diff` contains no string/content changes in rendered labels except whitespace-only movement

## PR Description Template
- This PR splits `visualizer-views.ts` into focused modules.
- No behavior changes; all existing exported symbols are preserved through `visualizer-views.ts` barrel exports.
- Includes a symbol move map and test/typecheck output.

## Rollback Plan
If any regression appears:
- Revert only the latest extraction commit (commit-by-commit rollback)
- Keep prior extraction commits if verified clean
- Do not bundle fixes with rollback; open a follow-up fix PR
