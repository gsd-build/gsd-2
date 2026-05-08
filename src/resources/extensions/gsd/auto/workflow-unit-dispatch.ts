// Project/App: GSD-2
// File Purpose: Unit dispatch contract adapter for auto-mode loop.

import type { SidecarItem } from "./session.js";
import type {
  IterationContext,
  IterationData,
  LoopState,
  PhaseResult,
} from "./types.js";
import { ExecutionGraphScheduler } from "../uok/execution-graph.js";
import type { UokGraphNode } from "../uok/contracts.js";
import { runUnitPhase } from "./phases.js";
import { decideDispatchNodeKind } from "./workflow-kernel.js";

export type DispatchContract = "legacy-direct" | "uok-scheduler";

export type UnitPhaseResult = PhaseResult<{
  unitStartedAt?: number;
  requestDispatchedAt?: number;
}>;

export interface UnitDispatchScheduler {
  registerHandler(
    kind: UokGraphNode["kind"],
    handler: (node: UokGraphNode) => Promise<void>,
  ): void;
  run(nodes: UokGraphNode[], options: { parallel: false; maxWorkers: 1 }): Promise<unknown>;
}

export interface RunUnitPhaseViaContractDeps {
  runUnitPhase: (
    ic: IterationContext,
    iterData: IterationData,
    loopState: LoopState,
    sidecarItem?: SidecarItem,
  ) => Promise<UnitPhaseResult>;
  createScheduler: () => UnitDispatchScheduler;
}

export async function runUnitPhaseViaContract(
  dispatchContract: DispatchContract,
  ic: IterationContext,
  iterData: IterationData,
  loopState: LoopState,
  sidecarItem: SidecarItem | undefined,
  deps: RunUnitPhaseViaContractDeps,
): Promise<UnitPhaseResult> {
  if (dispatchContract === "legacy-direct") {
    return deps.runUnitPhase(ic, iterData, loopState, sidecarItem);
  }

  const scheduler = deps.createScheduler();
  let outcome: UnitPhaseResult | null = null;
  const executeNode = async (): Promise<void> => {
    outcome = await deps.runUnitPhase(ic, iterData, loopState, sidecarItem);
  };
  const kinds: UokGraphNode["kind"][] = [
    "unit",
    "hook",
    "subagent",
    "team-worker",
    "verification",
    "reprocess",
  ];
  for (const kind of kinds) scheduler.registerHandler(kind, executeNode);

  const nodeId = `dispatch:${ic.iteration}:${iterData.unitType}:${iterData.unitId}`;
  await scheduler.run([
    {
      id: nodeId,
      kind: decideDispatchNodeKind(iterData.unitType, sidecarItem?.kind),
      dependsOn: [],
      metadata: {
        unitType: iterData.unitType,
        unitId: iterData.unitId,
      },
    },
  ], { parallel: false, maxWorkers: 1 });

  return outcome ?? { action: "break", reason: "scheduler-dispatch-missing-result" };
}

export function createExecutionGraphUnitDispatchDeps(): RunUnitPhaseViaContractDeps {
  return {
    runUnitPhase: async (...args) => runUnitPhase(...args),
    createScheduler: () => new ExecutionGraphScheduler(),
  };
}
