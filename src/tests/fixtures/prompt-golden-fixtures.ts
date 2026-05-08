// Project/App: GSD-2
// File Purpose: Shared prompt fixture definitions for Phase 0 characterization and Phase 2 reduction targets.

export const promptGoldenUnits = [
  {
    unitType: "plan-slice",
    phase2StartChars: 19259,
    requiredMarkers: [
      "UNIT: Plan Slice S01",
      "Inlined Context",
      "gsd_plan_slice",
      "Baseline Slice",
    ],
  },
  {
    unitType: "execute-task",
    phase2StartChars: 13576,
    requiredMarkers: [
      "UNIT: Execute Task T01",
      "Inlined Task Plan",
      "Background process rule",
      "Verification Evidence",
      "blocker_discovered",
      "gsd_task_complete",
      "Implement baseline harness",
    ],
  },
  {
    unitType: "complete-slice",
    phase2StartChars: 12412,
    requiredMarkers: [
      "UNIT: Complete Slice S01",
      "Inlined Context",
      "gsd_slice_complete",
      "Slice Summary",
    ],
  },
] as const;

export type PromptGoldenUnitType = typeof promptGoldenUnits[number]["unitType"];
