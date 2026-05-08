// Project/App: GSD-2
// File Purpose: Canonical process recommendations for routing work by task size.

export type ProcessTaskSize =
  | "hotfix"
  | "bugfix"
  | "small-feature"
  | "large-feature"
  | "architecture-change";

export interface ProcessTaskPath {
  taskSize: ProcessTaskSize;
  label: string;
  templateId: string;
  command: string;
  phases: string[];
  guidance: string;
}

const TASK_PATHS: Record<ProcessTaskSize, ProcessTaskPath> = {
  hotfix: {
    taskSize: "hotfix",
    label: "Hotfix",
    templateId: "hotfix",
    command: "/gsd start hotfix <description>",
    phases: ["fix", "ship"],
    guidance: "Use for urgent production fixes that need minimal ceremony and fast verification.",
  },
  bugfix: {
    taskSize: "bugfix",
    label: "Bugfix",
    templateId: "bugfix",
    command: "/gsd start bugfix <description> --issue <ref>",
    phases: ["triage", "fix", "verify", "ship"],
    guidance: "Use for reproducible defects where a linked issue and regression test are expected.",
  },
  "small-feature": {
    taskSize: "small-feature",
    label: "Small Feature",
    templateId: "small-feature",
    command: "/gsd start small-feature <description>",
    phases: ["scope", "plan", "implement", "verify"],
    guidance: "Use for contained feature work that does not need the full milestone machinery.",
  },
  "large-feature": {
    taskSize: "large-feature",
    label: "Large Feature",
    templateId: "full-project",
    command: "/gsd discuss <description>, then /gsd auto",
    phases: ["discuss", "plan", "execute", "verify"],
    guidance: "Use for multi-slice work that should run through the DB-backed milestone flow.",
  },
  "architecture-change": {
    taskSize: "architecture-change",
    label: "Architecture Change",
    templateId: "refactor",
    command: "/gsd start refactor <description>",
    phases: ["inventory", "plan", "migrate", "verify"],
    guidance: "Use for structural changes that require inventory, compatibility notes, and staged verification.",
  },
};

export function recommendProcessPath(taskSize: ProcessTaskSize): ProcessTaskPath {
  return TASK_PATHS[taskSize];
}

export function listRecommendedProcessPaths(): ProcessTaskPath[] {
  return [
    TASK_PATHS.hotfix,
    TASK_PATHS.bugfix,
    TASK_PATHS["small-feature"],
    TASK_PATHS["large-feature"],
    TASK_PATHS["architecture-change"],
  ];
}

export function formatRecommendedProcessPaths(): string {
  return listRecommendedProcessPaths()
    .map((path) => `  ${path.taskSize.padEnd(19)} ${path.command}`)
    .join("\n");
}
