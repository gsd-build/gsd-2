import { resolveManifest } from "../unit-context-manifest.js";
import { getRequiredWorkflowToolsForAutoUnit } from "../workflow-mcp.js";
import type { UnitToolContract } from "./contracts.js";

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

  const requiredWorkflowTools = getRequiredWorkflowToolsForAutoUnit(unitType);
  const toolsPolicy = manifest?.tools ?? null;
  // Unknown manifests are soft-allowed, but they may still write source files.
  // Keep worktree-root validation on for fallback contracts.
  const sourceWrites = manifest ? derivesSourceWrites(unitType, toolsPolicy?.mode ?? null) : true;

  const contract: UnitToolContract = {
    unitType,
    unitId,
    requiredWorkflowTools,
    toolsPolicy,
    sourceWrites,
    preconditions: [...input.preconditions],
    warnings,
  };

  return {
    allow: true,
    contract,
  };
}
