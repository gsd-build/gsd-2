---
estimated_steps: 5
estimated_files: 2
---

# T01: Create browser-safe types and extend command surface state contract

**Slice:** S07 — Remaining Command Surfaces
**Milestone:** M003

## Description

Foundation task: define browser-safe TypeScript interfaces mirroring upstream data shapes for 7 data-bearing surfaces (history, inspect, hooks, export, undo, cleanup, steer), and extend the command surface state contract with phase-tracked state slices so store actions and panel components have typed targets. This follows the exact same pattern established by `diagnostics-types.ts` (S04) and `settings-types.ts` (S06).

## Steps

1. **Create `web/lib/remaining-command-types.ts`** with browser-safe interfaces. Do NOT import from upstream modules — define standalone types that mirror the upstream shapes. Include these interfaces:

   ```
   // ─── History (mirrors metrics.ts) ───
   HistoryTokenCounts { input, output, cacheRead, cacheWrite, total }
   HistoryUnitMetrics { type, id, model, startedAt, finishedAt, tokens: HistoryTokenCounts, cost, toolCalls, assistantMessages, userMessages, tier?, modelDowngraded?, skills? }
   HistoryPhaseAggregate { phase, units, tokens: HistoryTokenCounts, cost, duration }
   HistorySliceAggregate { sliceId, units, tokens: HistoryTokenCounts, cost, duration }
   HistoryModelAggregate { model, units, tokens: HistoryTokenCounts, cost, contextWindowTokens? }
   HistoryProjectTotals { units, tokens: HistoryTokenCounts, cost, duration, toolCalls, assistantMessages, userMessages, totalTruncationSections, continueHereFiredCount }
   HistoryData { units: HistoryUnitMetrics[], totals: HistoryProjectTotals, byPhase: HistoryPhaseAggregate[], bySlice: HistorySliceAggregate[], byModel: HistoryModelAggregate[] }

   // ─── Inspect (mirrors commands.ts InspectData) ───
   InspectData { schemaVersion: number | null, counts: { decisions, requirements, artifacts }, recentDecisions: Array<{ id, decision, choice }>, recentRequirements: Array<{ id, status, description }> }

   // ─── Hooks (mirrors types.ts HookStatusEntry) ───
   HookStatusEntry { name, type: "post"|"pre", enabled, targets: string[], activeCycles: Record<string, number> }
   HooksData { entries: HookStatusEntry[], formattedStatus: string }

   // ─── Export ───
   ExportResult { content: string, format: "markdown"|"json", filename: string }

   // ─── Undo ───
   UndoInfo { lastUnitType: string | null, lastUnitId: string | null, lastUnitKey: string | null, completedCount: number, commits: string[] }
   UndoResult { success: boolean, message: string }

   // ─── Cleanup ───
   CleanupBranch { name: string, merged: boolean }
   CleanupSnapshot { ref: string, date: string }
   CleanupData { branches: CleanupBranch[], snapshots: CleanupSnapshot[] }
   CleanupResult { deletedBranches: number, prunedSnapshots: number, message: string }

   // ─── Steer ───
   SteerData { overridesContent: string | null }
   ```

2. **Add `CommandSurfaceRemainingState` to `web/lib/command-surface-contract.ts`:**
   - Import new types from `./remaining-command-types.ts`
   - Define the state interface grouping phase-tracked slices:
     ```ts
     export interface CommandSurfaceRemainingState {
       history: CommandSurfaceDiagnosticsPhaseState<HistoryData>
       inspect: CommandSurfaceDiagnosticsPhaseState<InspectData>
       hooks: CommandSurfaceDiagnosticsPhaseState<HooksData>
       exportData: CommandSurfaceDiagnosticsPhaseState<ExportResult>
       undo: CommandSurfaceDiagnosticsPhaseState<UndoInfo>
       cleanup: CommandSurfaceDiagnosticsPhaseState<CleanupData>
       steer: CommandSurfaceDiagnosticsPhaseState<SteerData>
     }
     ```
   - Add `createInitialRemainingState()` factory using `createInitialDiagnosticsPhaseState<T>()` for each field
   - Add `remainingCommands: CommandSurfaceRemainingState` to the `CommandSurfaceUIState` interface (same level as `diagnostics`, `knowledgeCaptures`, `settingsData`)
   - Wire the initial factory into `createDefaultCommandSurfaceUIState()` and `resetCommandSurface()` returns

3. **Verify:** Run `npm run build` — it must succeed with all new types resolved.

## Must-Haves

- [ ] `remaining-command-types.ts` exists with all 7 groups of browser-safe interfaces (no upstream imports)
- [ ] `CommandSurfaceRemainingState` interface exists in `command-surface-contract.ts`
- [ ] `createInitialRemainingState()` factory function is exported
- [ ] `remainingCommands` field is present in `CommandSurfaceUIState` and initialized in both default and reset factories
- [ ] `npm run build` succeeds

## Verification

- `npm run build` — exit 0 (TypeScript compilation)
- `rg "CommandSurfaceRemainingState" web/lib/command-surface-contract.ts` — returns matches

## Inputs

- `web/lib/diagnostics-types.ts` — pattern reference for browser-safe type files (mirrors upstream without imports)
- `web/lib/settings-types.ts` — pattern reference for browser-safe type files
- `web/lib/command-surface-contract.ts` — the file to extend (already has `CommandSurfaceDiagnosticsPhaseState<T>`, `createInitialDiagnosticsPhaseState<T>()`, and the `CommandSurfaceUIState` interface with `diagnostics`, `knowledgeCaptures`, `settingsData` fields)
- Upstream type shapes (executor should reference these exact definitions):
  - `src/resources/extensions/gsd/metrics.ts` — `UnitMetrics`, `TokenCounts`, `PhaseAggregate`, `SliceAggregate`, `ModelAggregate`, `ProjectTotals`
  - `src/resources/extensions/gsd/types.ts` — `HookStatusEntry` (name, type, enabled, targets, activeCycles)
  - `src/resources/extensions/gsd/commands.ts` — `InspectData` (schemaVersion, counts, recentDecisions, recentRequirements)

## Expected Output

- `web/lib/remaining-command-types.ts` — ~120 lines of browser-safe TypeScript interfaces
- `web/lib/command-surface-contract.ts` — extended with `CommandSurfaceRemainingState`, factory function, and wired into `CommandSurfaceUIState`
