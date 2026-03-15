---
estimated_steps: 3
estimated_files: 2
---

# T02: Wire Dashboard and DualTerminal views to real store data

**Slice:** S04 — Current-project state surfaces
**Milestone:** M001

## Description

Dashboard and DualTerminal are the two remaining views with fully hardcoded content. Dashboard has metric cards, current-slice tasks, model usage, and recent activity — all fake. DualTerminal has a simulated auto-mode terminal with fake phase cycling and cost ticking, plus a fake command terminal. This task replaces all of it with real store data. The DualTerminal right pane becomes the S03 Terminal component instead of a redundant mock command interface.

## Steps

1. Rewrite `dashboard.tsx` to consume `useGSDWorkspaceState()`. Replace: metric cards with `boot.auto` data (elapsed via `formatDuration`, cost via `formatCost`, tokens via `formatTokens`), progress derived from current-slice task completion. Current-slice section from `getCurrentSlice(workspace)?.tasks` with real task status using shared helpers. Recent activity from the last 6 `terminalLines`. Header scope label from `getCurrentScopeLabel(workspace)` and branch from `getCurrentBranch(workspace)`. Model/session info from `getModelLabel(bridge)`. Handle auto-inactive state (zeros/empty are correct, not broken). Remove the `currentSliceTasks`, `recentActivity`, and `modelUsage` hardcoded arrays. Preserve the visual card/grid/table layout per D002.
2. Rewrite `dual-terminal.tsx`. Left pane (`AutoTerminal`): read `boot.auto` for phase, progress, cost, tokens, elapsed — no `useState` or `setInterval` simulation. Read `terminalLines` for log output instead of hardcoded extension warnings. Remove the GSD logo rendering (that belongs to the real terminal boot). Right pane: import and render the S03 `Terminal` component instead of the local `CommandTerminal`. Remove the `AutoModeState` interface, the simulated phase-cycling interval, and the fake `CommandTerminal` component entirely. Keep the split-pane drag divider.
3. Verify: `npm run build:web-host` compiles. Grep for removed mock constants confirms they're gone.

## Must-Haves

- [ ] Dashboard metric cards show real elapsed/cost/tokens from `boot.auto` using store formatters
- [ ] Dashboard current-slice section shows real tasks from workspace index
- [ ] Dashboard recent activity shows real terminal lines from store
- [ ] DualTerminal left pane shows real auto-mode state without simulated intervals
- [ ] DualTerminal right pane uses the S03 Terminal component
- [ ] All mock arrays and simulation code removed from both files
- [ ] Both views handle empty/inactive state without looking broken

## Verification

- `npm run build:web-host` compiles with zero errors
- `grep -rn 'const recentActivity\|const currentSliceTasks\|const modelUsage\|AutoModeState.*idle.*working\|setInterval' web/components/gsd/dashboard.tsx web/components/gsd/dual-terminal.tsx` returns empty

## Inputs

- `web/lib/gsd-workspace-store.tsx` — `formatDuration`, `formatCost`, `formatTokens`, `getCurrentScopeLabel`, `getCurrentBranch`, `getCurrentSlice`, `getModelLabel`, `getSessionLabelFromBridge`
- `web/lib/workspace-status.ts` — shared status helpers from T01
- `web/components/gsd/terminal.tsx` — S03 Terminal component to embed in DualTerminal right pane
- T01 output: shared status helpers are importable from `workspace-status.ts`

## Expected Output

- `web/components/gsd/dashboard.tsx` — rewired to store data, all mock arrays removed
- `web/components/gsd/dual-terminal.tsx` — left pane on real auto state, right pane delegates to Terminal, all simulation code removed

## Observability Impact

- **Dashboard metric cards** reflect real `boot.auto` values — a future agent can verify by comparing what's rendered to `curl /api/boot | jq '.auto'`
- **Dashboard current-slice tasks** derive from `getCurrentSlice(workspace)?.tasks` — empty state renders cleanly when no active slice exists
- **Dashboard recent activity** shows real `terminalLines` (last 6) — same data source as the Terminal and Activity views, so consistency is auditable
- **DualTerminal left pane** reads `boot.auto` directly — no simulated intervals, so what's shown matches the server's auto-mode state exactly
- **DualTerminal right pane** delegates to the S03 Terminal component — full live bridge interaction is available without duplication
- **Failure visibility**: both views render gracefully when `boot` is null (loading), when auto is inactive (zeros/empty), or when no active slice exists (empty task list)
