# S03: Fixture Harness — Research

## Summary

The Goal of S03 is the Fixture Harness, which provides "pluggable" environment state (or "fixtures") that GSD can run against to measure deterministic performance. Research indicates this is the logical conclusion to M007: telemetry (S01) and aggregation (S02) are useless without stable, reproducible scenarios to measure.

The implementation relies on `experiment-runner.ts` (which already exists but is currently underspecified for fixture *loading*) and requires a new module for environment restoration. The current `experiment-runner.ts` handles scoring and iteration but does not manage the "before-state" of a test execution. We need a way to snapshot/restore the workspace state, likely building on `auto-worktree.ts` (the worktree manager).

## Recommendation

The Fixture Harness needs a 3-part design:
1. **Fixture Store**: A directory (`.gsd/tests/fixtures/`) containing saved workspace states + manifest.
2. **Environment Restorer**: A module (likely `experiment-runner.ts` enhancement or new `fixture-loader.ts`) that uses `git-worktree` to swap the workspace to a specific fixture state before a run.
3. **Fixture Execution**: Integration into the `auto-dispatch` loop so `gsd auto --fixture <id>` automatically triggers the restore process *before* starting the dispatch units.

This leverages M003/M007-aos64t work on worktree management and avoids re-initializing projects by hand.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/experiment-runner.ts` — The current runner. Needs to be extended to trigger state restoration.
- `src/resources/extensions/gsd/auto-worktree.ts` — Can be adapted to provide snapshot/restore functionality for fixtures.
- `src/resources/extensions/gsd/tests/fixtures/` (existing) — Use these as the source of truth for the 3 concept fixtures.

### Build Order

1. **Fixture Registry**: Define a standard schema for fixture manifests (already glimpsed in existing `FIXTURE-MANIFEST.json` files).
2. **Restore Logic**: Implement `restoreFixture(id: string)` which uses existing worktree mechanics to switch the repository to the fixture state.
3. **Dispatch Integration**: Modify entry point or `auto.ts` to support optional fixture injection.
4. **Execution Validation**: Verify that "high unknowns" fixture produces metrics that correlate with its expected claim mix.

### Verification Approach

- **Consistency**: Run the `high-unknown` fixture three times. Verify metrics (tokens, fact-checks) are identical across runs.
- **State Integrity**: Verify the workspace state matches the fixture state *after* restoration (e.g., check file existence/hash against manifest).

## Constraints

- **Worktree Dependency**: Fixtures must use git-worktree snapshots, not manual file copying (performance requirement).
- **Telemetry Coupling**: The experiment must write metrics to `.gsd/activity/` so the S02 metrics observer can consume them without specialized fixture-mode code.

## Common Pitfalls

- **State Drift**: If the fixture runner doesn't clean up the worktree after use, concurrent runs will collide. Use the worktree manager's built-in cleanup logic.
- **Fixture Stale-ness**: If the fixture files themselves are updated but the repository isn't, the test runs on old code. Fixtures should store git commit SHAs, not just file snapshots.

## Sources

- [GSD Experiment Runner — Fidelity Scoring and Bounded Iteration Protocol](src/resources/extensions/gsd/experiment-runner.ts)
- [Telemetry Standards](https://github.com/bitflight-devops/stateless-agent-methodology/blob/main/research/arl/telemetry-standards.md) (source: Telemetry Standards)
