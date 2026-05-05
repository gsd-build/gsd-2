import { existsSync } from "node:fs";

import { autoHealSketchFlags, isDbAvailable, refreshOpenDatabaseFromDisk } from "../gsd-db.js";
import { repairStaleRenders } from "../markdown-renderer.js";
import { resolveSliceFile } from "../paths.js";
import type { GSDState } from "../types.js";
import {
  type StateReconciliationAdapter,
  type StateReconciliationBlocker,
  type StateReconciliationRepair,
  type StateReconciliationResult,
} from "./contracts.js";

export interface StateReconciliationDeps {
  invalidateAllCaches: () => void;
  deriveState: (basePath: string) => Promise<GSDState>;
  refreshOpenDatabaseFromDisk: () => boolean;
  isDbAvailable: () => boolean;
  autoHealSketchFlags: (milestoneId: string, hasPlanFile: (sliceId: string) => boolean) => number;
  resolveSlicePlanFile: (basePath: string, milestoneId: string, sliceId: string) => string | null;
  existsSync: (path: string) => boolean;
  repairDbProjections?: (basePath: string) => Promise<number> | number;
}

function buildDeriveFailureResult(
  reason: string,
  repairs: readonly StateReconciliationRepair[],
): StateReconciliationResult {
  const blocker: StateReconciliationBlocker = {
    kind: "state-derive-failed",
    reason,
    fatal: true,
  };
  return {
    allow: false,
    reason,
    repairs,
    blockers: [blocker],
  };
}

function stateBlockersFrom(stateSnapshot: GSDState): StateReconciliationBlocker[] {
  return stateSnapshot.blockers.map((blocker) => {
    const isDbUnavailable = /DB unavailable/i.test(blocker);
    return {
      kind: isDbUnavailable ? "db-unavailable" : "state-derived-blocker",
      reason: blocker,
      fatal: isDbUnavailable,
    };
  });
}

async function repairDbProjections(
  deps: StateReconciliationDeps,
  basePath: string,
): Promise<StateReconciliationRepair> {
  if (!deps.isDbAvailable()) {
    return {
      kind: "db-projection-repair",
      status: "skipped",
      reason: "DB unavailable",
      dbAffecting: false,
    };
  }
  if (!deps.repairDbProjections) {
    return {
      kind: "db-projection-repair",
      status: "skipped",
      reason: "projection repair seam is not configured",
      dbAffecting: false,
    };
  }

  try {
    const count = await deps.repairDbProjections(basePath);
    return {
      kind: "db-projection-repair",
      status: count > 0 ? "applied" : "skipped",
      reason: count > 0
        ? `repaired ${count} stale DB projection${count === 1 ? "" : "s"}`
        : "no stale DB projections detected",
      dbAffecting: false,
    };
  } catch (error) {
    return {
      kind: "db-projection-repair",
      status: "failed",
      reason: `projection repair failed: ${error instanceof Error ? error.message : String(error)}`,
      dbAffecting: false,
    };
  }
}

export function createStateReconciliationAdapter(
  deps: StateReconciliationDeps,
): StateReconciliationAdapter {
  return {
    async reconcileBeforeDispatch(input): Promise<StateReconciliationResult> {
      const basePath = input.basePath ?? "";
      const stateBasePath = input.stateBasePath ?? basePath;
      const projectionBasePath = input.projectionBasePath ?? stateBasePath;
      const repairs: StateReconciliationRepair[] = [];

      deps.invalidateAllCaches();

      if (deps.isDbAvailable()) {
        let refreshed = false;
        try {
          refreshed = deps.refreshOpenDatabaseFromDisk();
        } catch (error) {
          repairs.push({
            kind: "db-refresh",
            status: "failed",
            reason: `refresh failed: ${error instanceof Error ? error.message : String(error)}`,
            dbAffecting: false,
          });
        }
        if (!repairs.some((repair) => repair.kind === "db-refresh")) {
          repairs.push({
            kind: "db-refresh",
            status: refreshed ? "applied" : "skipped",
            reason: refreshed
              ? "refreshed open file-backed database"
              : "refresh helper returned false (non-fatal)",
            dbAffecting: false,
          });
        }
      }

      let stateSnapshot: GSDState;
      try {
        stateSnapshot = await deps.deriveState(stateBasePath);
      } catch (error) {
        return buildDeriveFailureResult(
          `state derivation failed for ${stateBasePath}: ${error instanceof Error ? error.message : String(error)}`,
          repairs,
        );
      }

      let repairedSketch = false;
      if (deps.isDbAvailable() && stateSnapshot.activeMilestone?.id) {
        const milestoneId = stateSnapshot.activeMilestone.id;
        const repairedCount = deps.autoHealSketchFlags(milestoneId, (sliceId) => {
          const planPath = deps.resolveSlicePlanFile(stateBasePath, milestoneId, sliceId);
          return Boolean(planPath && deps.existsSync(planPath));
        });
        repairs.push({
          kind: "stale-sketch-flag",
          status: repairedCount > 0 ? "applied" : "skipped",
          reason: repairedCount > 0
            ? `repaired ${repairedCount} stale sketch flag${repairedCount === 1 ? "" : "s"} for ${milestoneId}`
            : `no stale sketch flags detected for ${milestoneId}`,
          dbAffecting: repairedCount > 0,
        });
        repairedSketch = repairedCount > 0;
      } else {
        repairs.push({
          kind: "stale-sketch-flag",
          status: "skipped",
          reason: "no active milestone or DB unavailable",
          dbAffecting: false,
        });
      }

      repairs.push(await repairDbProjections(deps, projectionBasePath));

      if (repairedSketch) {
        deps.invalidateAllCaches();
        try {
          stateSnapshot = await deps.deriveState(stateBasePath);
        } catch (error) {
          return buildDeriveFailureResult(
            `state re-derivation failed for ${stateBasePath}: ${error instanceof Error ? error.message : String(error)}`,
            repairs,
          );
        }
      }

      const blockers = stateBlockersFrom(stateSnapshot);
      const fatalBlocker = blockers.find((blocker) => blocker.fatal);
      if (fatalBlocker) {
        return {
          allow: false,
          reason: fatalBlocker.reason,
          stateSnapshot,
          repairs,
          blockers,
        };
      }

      return {
        allow: true,
        stateSnapshot,
        repairs,
        blockers,
      };
    },
  };
}

export function createDefaultStateReconciliationAdapter(
  deriveStateFn: (basePath: string) => Promise<GSDState>,
  invalidateAllCachesFn: () => void,
): StateReconciliationAdapter {
  return createStateReconciliationAdapter({
    deriveState: deriveStateFn,
    invalidateAllCaches: invalidateAllCachesFn,
    refreshOpenDatabaseFromDisk,
    isDbAvailable,
    autoHealSketchFlags,
    resolveSlicePlanFile: (basePath, milestoneId, sliceId) =>
      resolveSliceFile(basePath, milestoneId, sliceId, "PLAN"),
    existsSync,
    repairDbProjections: repairStaleRenders,
  });
}
