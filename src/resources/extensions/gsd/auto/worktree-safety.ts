import { existsSync } from "node:fs";
import { join } from "node:path";

import { classifyProject, hasProjectFileInAncestor } from "../detection.js";
import type { UnitToolContract } from "./contracts.js";

export interface PrepareUnitRootInput {
  basePath: string;
  unitType: string;
  unitId: string;
  contract?: UnitToolContract;
  existsSync?: (path: string) => boolean;
}

export interface PrepareUnitRootResult {
  allow: boolean;
  reason?: string;
  warnings: readonly string[];
}

function shouldValidateWorktreeRoot(unitType: string, contract?: UnitToolContract): boolean {
  if (contract?.sourceWrites) return true;
  return unitType === "execute-task" || unitType === "execute-task-simple" || unitType === "reactive-execute";
}

export async function prepareUnitRoot(input: PrepareUnitRootInput): Promise<PrepareUnitRootResult> {
  const { basePath, unitType, unitId, contract } = input;
  const fileExists = input.existsSync ?? existsSync;

  if (!shouldValidateWorktreeRoot(unitType, contract)) {
    return { allow: true, warnings: [] };
  }

  if (!basePath || !basePath.trim()) {
    return {
      allow: false,
      reason: `Worktree safety failed for ${unitType} ${unitId}: empty base path`,
      warnings: [],
    };
  }

  const gitMarker = join(basePath, ".git");
  if (!fileExists(gitMarker)) {
    return {
      allow: false,
      reason: `Worktree health check failed: ${basePath} has no .git - refusing to dispatch ${unitType} ${unitId}`,
      warnings: [],
    };
  }

  const classification = classifyProject(basePath);
  if (classification.kind === "invalid-repo") {
    return {
      allow: true,
      warnings: [
        `${basePath} project classification could not confirm .git; proceeding as greenfield because worktree health reported .git present.`,
      ],
    };
  }

  if (classification.kind === "greenfield" && !hasProjectFileInAncestor(basePath, fileExists)) {
    return {
      allow: true,
      warnings: [`${basePath} has no recognized project files; proceeding as greenfield project.`],
    };
  }

  if (classification.kind === "untyped-existing") {
    return {
      allow: true,
      warnings: [`${basePath} has existing project content but no recognized tooling markers; using generic file-level workflow guidance.`],
    };
  }

  return { allow: true, warnings: [] };
}
