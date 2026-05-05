import { resolveManifest } from "../unit-context-manifest.js";
import type { UnitToolContract } from "./contracts.js";

const REQUIRED_WORKFLOW_TOOLS_BY_UNIT: Readonly<Record<string, readonly string[]>> = {
  "complete-milestone": ["gsd_milestone_status", "gsd_complete_milestone"],
  "complete-slice": ["gsd_slice_complete"],
  "discuss-milestone": ["gsd_summary_save", "gsd_plan_milestone"],
  "discuss-project": ["ask_user_questions", "gsd_summary_save"],
  "discuss-requirements": ["ask_user_questions", "gsd_requirement_save", "gsd_summary_save"],
  "execute-task": ["gsd_task_complete"],
  "execute-task-simple": ["gsd_task_complete"],
  "gate-evaluate": ["gsd_save_gate_result"],
  "plan-milestone": ["gsd_plan_milestone"],
  "plan-slice": ["gsd_plan_slice"],
  "reactive-execute": ["gsd_task_complete"],
  "reassess-roadmap": ["gsd_milestone_status", "gsd_reassess_roadmap"],
  "replan-slice": ["gsd_replan_slice"],
  "research-decision": ["ask_user_questions"],
  "research-milestone": ["gsd_summary_save"],
  "research-slice": ["gsd_summary_save"],
  "run-uat": ["gsd_summary_save"],
  "validate-milestone": ["gsd_milestone_status", "gsd_validate_milestone"],
};

function deriveRequiredWorkflowTools(unitType: string): readonly string[] {
  return REQUIRED_WORKFLOW_TOOLS_BY_UNIT[unitType] ?? [];
}

function derivesSourceWrites(unitType: string, toolsMode: string | null): boolean {
  if (toolsMode === "all") return true;
  return unitType === "execute-task" || unitType === "execute-task-simple" || unitType === "reactive-execute";
}

export async function compileUnitToolContract(input: {
  unitType: string;
  unitId: string;
  preconditions: readonly string[];
}): Promise<{
  allow: boolean;
  reason?: string;
  contract?: UnitToolContract;
}> {
  const unitType = input.unitType.trim();
  const unitId = input.unitId.trim();
  if (!unitType || !unitId) {
    return {
      allow: false,
      reason: "tool contract invalid: missing unitType or unitId",
    };
  }

  const manifest = resolveManifest(unitType);
  const warnings: string[] = [];
  if (!manifest) {
    warnings.push(`Unknown unit type \"${unitType}\" has no manifest; soft-allowing with fallback contract.`);
  }

  const requiredWorkflowTools = deriveRequiredWorkflowTools(unitType);
  const toolsPolicy = manifest?.tools ?? null;

  const contract: UnitToolContract = {
    unitType,
    unitId,
    requiredWorkflowTools,
    toolsPolicy,
    sourceWrites: derivesSourceWrites(unitType, toolsPolicy?.mode ?? null),
    preconditions: [...input.preconditions],
    warnings,
  };

  return {
    allow: true,
    contract,
  };
}
