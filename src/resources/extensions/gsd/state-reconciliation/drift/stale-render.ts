// Project/App: GSD-2
// File Purpose: ADR-017 stale-render drift handler. Relocated from
// markdown-renderer.ts as part of issue #5702. detectStaleRenders stays in
// markdown-renderer.ts (it's a useful diagnostic primitive on its own); only
// the detect+repair composition moves here. The previous repairStaleRenders
// had zero callers in production code — wiring it through
// reconcileBeforeDispatch closes that gap.

import {
  detectStaleRenders,
  renderPlanCheckboxes,
  renderRoadmapCheckboxes,
  renderSliceSummary,
  renderTaskSummary,
} from "../../markdown-renderer.js";
import type { GSDState } from "../../types.js";
import { logWarning } from "../../workflow-logger.js";
import type { DriftContext, DriftHandler, DriftRecord } from "../types.js";

type StaleRenderDrift = Extract<DriftRecord, { kind: "stale-render" }>;

// ─── Core (basePath-only — usable by both drift API and legacy wrapper) ──────

function detectStaleRenderDriftFromBasePath(basePath: string): StaleRenderDrift[] {
  const entries = detectStaleRenders(basePath);
  if (entries.length === 0) return [];

  // detectStaleRenders may emit multiple entries for the same path (one per
  // mismatched checkbox). Dedupe by path; the repair re-renders the whole
  // file in a single call. Prefer a reason the repair dispatcher can handle.
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const currentReason = seen.get(entry.path);
    if (
      currentReason === undefined ||
      (!isRepairableStaleRenderReason(currentReason) && isRepairableStaleRenderReason(entry.reason))
    ) {
      seen.set(entry.path, entry.reason);
    }
  }

  return Array.from(seen.entries()).map(([renderPath, reason]) => ({
    kind: "stale-render" as const,
    renderPath,
    reason,
  }));
}

function isRepairableStaleRenderReason(reason: string): boolean {
  return (
    reason.includes("in roadmap") ||
    reason.includes("in plan") ||
    (reason.includes("SUMMARY.md missing") && /^T\d+/.test(reason)) ||
    (reason.includes("SUMMARY.md missing") && /^S\d+/.test(reason)) ||
    reason.includes("UAT.md missing")
  );
}

async function repairStaleRenderFromBasePath(
  record: StaleRenderDrift,
  basePath: string,
): Promise<void> {
  const normPath = record.renderPath.replace(/\\/g, "/");
  const reason = record.reason;

  if (reason.includes("in roadmap")) {
    const milestoneMatch = normPath.match(/milestones\/([^/]+)\//);
    if (!milestoneMatch) {
      throw new Error(
        `stale-render drift: roadmap path missing milestone segment: ${record.renderPath}`,
      );
    }
    await renderRoadmapCheckboxes(basePath, milestoneMatch[1]);
    return;
  }

  if (reason.includes("in plan")) {
    const pathMatch = normPath.match(/milestones\/([^/]+)\/slices\/([^/]+)\//);
    if (!pathMatch) {
      throw new Error(
        `stale-render drift: plan path missing milestone/slice segments: ${record.renderPath}`,
      );
    }
    await renderPlanCheckboxes(basePath, pathMatch[1], pathMatch[2]);
    return;
  }

  if (reason.includes("SUMMARY.md missing") && /^T\d+/.test(reason)) {
    const pathMatch = normPath.match(
      /milestones\/([^/]+)\/slices\/([^/]+)\/tasks\//,
    );
    const taskMatch = reason.match(/^(T\d+)/);
    if (!pathMatch || !taskMatch) {
      throw new Error(
        `stale-render drift: task summary path/reason malformed: ${record.renderPath} reason=${reason}`,
      );
    }
    await renderTaskSummary(basePath, pathMatch[1], pathMatch[2], taskMatch[1]);
    return;
  }

  if (reason.includes("SUMMARY.md missing") && /^S\d+/.test(reason)) {
    const pathMatch = normPath.match(/milestones\/([^/]+)\/slices\/([^/]+)\//);
    if (!pathMatch) {
      throw new Error(
        `stale-render drift: slice summary path missing milestone/slice segments: ${record.renderPath}`,
      );
    }
    await renderSliceSummary(basePath, pathMatch[1], pathMatch[2]);
    return;
  }

  if (reason.includes("UAT.md missing")) {
    const pathMatch = normPath.match(/milestones\/([^/]+)\/slices\/([^/]+)\//);
    if (!pathMatch) {
      throw new Error(
        `stale-render drift: UAT path missing milestone/slice segments: ${record.renderPath}`,
      );
    }
    // renderSliceSummary handles both SUMMARY and UAT.
    await renderSliceSummary(basePath, pathMatch[1], pathMatch[2]);
    return;
  }

  throw new Error(
    `stale-render drift: detector emitted unknown reason "${reason}" for ${record.renderPath}`,
  );
}

// ─── Drift Handler API ───────────────────────────────────────────────────────

export function detectStaleRenderDrift(
  _state: GSDState,
  ctx: DriftContext,
): StaleRenderDrift[] {
  return detectStaleRenderDriftFromBasePath(ctx.basePath);
}

export async function repairStaleRender(
  record: StaleRenderDrift,
  ctx: DriftContext,
): Promise<void> {
  await repairStaleRenderFromBasePath(record, ctx.basePath);
}

export const staleRenderHandler: DriftHandler<StaleRenderDrift> = {
  kind: "stale-render",
  detect: detectStaleRenderDrift,
  repair: repairStaleRender,
};

// ─── Legacy entry point ──────────────────────────────────────────────────────

/**
 * Legacy bulk entry preserved for existing tests
 * (tests/markdown-renderer.test.ts, tests/integration/integration-proof.test.ts).
 * New code prefers the drift handler via `reconcileBeforeDispatch`. Matches the
 * pre-ADR-017 behavior: silent per-entry error handling, returns the count of
 * successful repairs.
 */
export async function repairStaleRenders(basePath: string): Promise<number> {
  const drifts = detectStaleRenderDriftFromBasePath(basePath);
  if (drifts.length === 0) return 0;

  let repaired = 0;
  for (const drift of drifts) {
    try {
      await repairStaleRenderFromBasePath(drift, basePath);
      repaired++;
    } catch (err) {
      logWarning(
        "renderer",
        `repair failed for ${drift.renderPath}: ${(err as Error).message}`,
      );
    }
  }

  if (repaired > 0) {
    process.stderr.write(
      `markdown-renderer: repaired ${repaired} stale render(s)\n`,
    );
  }

  return repaired;
}
