// Data loader for workflow visualizer overlay — aggregates state + metrics.

import { deriveState } from './state.js';
import { parseRoadmap, parsePlan, loadFile } from './files.js';
import { findMilestoneIds } from './guided-flow.js';
import { resolveMilestoneFile, resolveSliceFile } from './paths.js';
import {
  getLedger,
  getProjectTotals,
  aggregateByPhase,
  aggregateBySlice,
  aggregateByModel,
  loadLedgerFromDisk,
} from './metrics.js';

import type { Phase } from './types.js';
import type {
  ProjectTotals,
  PhaseAggregate,
  SliceAggregate,
  ModelAggregate,
  UnitMetrics,
} from './metrics.js';

// ─── Visualizer Types ─────────────────────────────────────────────────────────

export interface VisualizerMilestone {
  id: string;
  title: string;
  status: 'complete' | 'active' | 'pending';
  dependsOn: string[];
  slices: VisualizerSlice[];
}

export interface VisualizerSlice {
  id: string;
  title: string;
  done: boolean;
  active: boolean;
  risk: string;
  depends: string[];
  tasks: VisualizerTask[];
}

export interface VisualizerTask {
  id: string;
  title: string;
  done: boolean;
  active: boolean;
}

export interface VisualizerData {
  milestones: VisualizerMilestone[];
  phase: Phase;
  totals: ProjectTotals | null;
  byPhase: PhaseAggregate[];
  bySlice: SliceAggregate[];
  byModel: ModelAggregate[];
  units: UnitMetrics[];
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loadVisualizerData(basePath: string): Promise<VisualizerData> {
  const state = await deriveState(basePath);
  const milestoneIds = findMilestoneIds(basePath);

  const milestones: VisualizerMilestone[] = [];

  for (const mid of milestoneIds) {
    const entry = state.registry.find(r => r.id === mid);
    const status = entry?.status ?? 'pending';
    const dependsOn = entry?.dependsOn ?? [];

    const slices: VisualizerSlice[] = [];

    const roadmapFile = resolveMilestoneFile(basePath, mid, 'ROADMAP');
    const roadmapContent = roadmapFile ? await loadFile(roadmapFile) : null;

    if (roadmapContent) {
      const roadmap = parseRoadmap(roadmapContent);

      for (const s of roadmap.slices) {
        const isActiveSlice =
          state.activeMilestone?.id === mid &&
          state.activeSlice?.id === s.id;

        const tasks: VisualizerTask[] = [];

        if (isActiveSlice) {
          const planFile = resolveSliceFile(basePath, mid, s.id, 'PLAN');
          const planContent = planFile ? await loadFile(planFile) : null;

          if (planContent) {
            const plan = parsePlan(planContent);
            for (const t of plan.tasks) {
              tasks.push({
                id: t.id,
                title: t.title,
                done: t.done,
                active: state.activeTask?.id === t.id,
              });
            }
          }
        }

        slices.push({
          id: s.id,
          title: s.title,
          done: s.done,
          active: isActiveSlice,
          risk: s.risk,
          depends: s.depends,
          tasks,
        });
      }
    }

    milestones.push({
      id: mid,
      title: entry?.title ?? mid,
      status,
      dependsOn,
      slices,
    });
  }

  // Metrics
  let totals: ProjectTotals | null = null;
  let byPhase: PhaseAggregate[] = [];
  let bySlice: SliceAggregate[] = [];
  let byModel: ModelAggregate[] = [];
  let units: UnitMetrics[] = [];

  const ledger = getLedger() ?? loadLedgerFromDisk(basePath);

  if (ledger && ledger.units.length > 0) {
    units = [...ledger.units].sort((a, b) => a.startedAt - b.startedAt);
    totals = getProjectTotals(units);
    byPhase = aggregateByPhase(units);
    bySlice = aggregateBySlice(units);
    byModel = aggregateByModel(units);
  }

  return {
    milestones,
    phase: state.phase,
    totals,
    byPhase,
    bySlice,
    byModel,
    units,
  };
}
