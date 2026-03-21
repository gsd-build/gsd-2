// GSD Visualizer - Metrics view renderer

import type { Theme } from "@gsd/pi-coding-agent";
import type { VisualizerData } from "./visualizer-data.js";
import { formatCost, formatTokenCount } from "./metrics.js";
import { padRight, sparkline } from "../shared/mod.js";

export function renderMetricsView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];

  if (data.totals === null) {
    lines.push(th.fg("dim", "No metrics data available."));
    return lines;
  }

  const totals = data.totals;

  // Summary line
  lines.push(
    th.fg("accent", th.bold("Summary")),
  );
  lines.push(
    `  Cost: ${th.fg("text", formatCost(totals.cost))}  ` +
    `Tokens: ${th.fg("text", formatTokenCount(totals.tokens.total))}  ` +
    `Units: ${th.fg("text", String(totals.units))}`,
  );
  lines.push(
    `  Tools: ${th.fg("text", String(totals.toolCalls))}  ` +
    `Messages: ${th.fg("text", String(totals.assistantMessages))} sent / ${th.fg("text", String(totals.userMessages))} received`,
  );
  lines.push("");

  const barWidth = Math.max(10, width - 40);

  // By Phase
  if (data.byPhase.length > 0) {
    lines.push(th.fg("accent", th.bold("By Phase")));
    lines.push("");

    const maxPhaseCost = Math.max(...data.byPhase.map((p) => p.cost));

    for (const phase of data.byPhase) {
      const pct = totals.cost > 0 ? (phase.cost / totals.cost) * 100 : 0;
      const fillLen =
        maxPhaseCost > 0
          ? Math.round((phase.cost / maxPhaseCost) * barWidth)
          : 0;
      const bar =
        th.fg("accent", "\u2588".repeat(fillLen)) +
        th.fg("dim", "\u2591".repeat(barWidth - fillLen));
      const label = padRight(phase.phase, 14);
      const costStr = formatCost(phase.cost);
      const pctStr = `${pct.toFixed(1)}%`;
      const tokenStr = formatTokenCount(phase.tokens.total);
      lines.push(`  ${label} ${bar} ${costStr} ${pctStr} ${tokenStr}`);
    }

    lines.push("");
  }

  // By Model
  if (data.byModel.length > 0) {
    lines.push(th.fg("accent", th.bold("By Model")));
    lines.push("");

    const maxModelCost = Math.max(...data.byModel.map((m) => m.cost));

    for (const model of data.byModel) {
      const pct = totals.cost > 0 ? (model.cost / totals.cost) * 100 : 0;
      const fillLen =
        maxModelCost > 0
          ? Math.round((model.cost / maxModelCost) * barWidth)
          : 0;
      const bar =
        th.fg("accent", "\u2588".repeat(fillLen)) +
        th.fg("dim", "\u2591".repeat(barWidth - fillLen));
      const label = padRight(model.model, 20);
      const costStr = formatCost(model.cost);
      const pctStr = `${pct.toFixed(1)}%`;
      lines.push(`  ${label} ${bar} ${costStr} ${pctStr}`);
    }

    lines.push("");
  }

  // By Tier
  if (data.byTier.length > 0) {
    lines.push(th.fg("accent", th.bold("By Tier")));
    lines.push("");

    const maxTierCost = Math.max(...data.byTier.map((t) => t.cost));

    for (const tier of data.byTier) {
      const pct = totals.cost > 0 ? (tier.cost / totals.cost) * 100 : 0;
      const fillLen =
        maxTierCost > 0
          ? Math.round((tier.cost / maxTierCost) * barWidth)
          : 0;
      const bar =
        th.fg("accent", "\u2588".repeat(fillLen)) +
        th.fg("dim", "\u2591".repeat(barWidth - fillLen));
      const label = padRight(tier.tier, 12);
      const costStr = formatCost(tier.cost);
      const pctStr = `${pct.toFixed(1)}%`;
      const unitsStr = `${tier.units} units`;
      lines.push(`  ${label} ${bar} ${costStr} ${pctStr} ${unitsStr}`);
    }

    if (data.tierSavingsLine) {
      lines.push(`  ${th.fg("success", data.tierSavingsLine)}`);
    }

    lines.push("");
  }

  // Cost Projections
  lines.push(...renderCostProjections(data, th, width));

  return lines;
}

export function renderCostProjections(data: VisualizerData, th: Theme, _width: number): string[] {
  const lines: string[] = [];

  if (!data.totals || data.bySlice.length === 0) return lines;

  lines.push(th.fg("accent", th.bold("Projections")));
  lines.push("");

  // Average cost per slice
  const sliceLevelEntries = data.bySlice.filter(s => s.sliceId.includes("/"));
  if (sliceLevelEntries.length < 2) {
    lines.push(th.fg("dim", "  Insufficient data for projections (need 2+ completed slices)."));
    return lines;
  }

  const totalSliceCost = sliceLevelEntries.reduce((sum, s) => sum + s.cost, 0);
  const avgCostPerSlice = totalSliceCost / sliceLevelEntries.length;
  const projectedRemaining = avgCostPerSlice * data.remainingSliceCount;

  lines.push(`  Avg cost/slice: ${th.fg("text", formatCost(avgCostPerSlice))}`);
  lines.push(
    `  Projected remaining: ${th.fg("text", formatCost(projectedRemaining))} ` +
    `(${formatCost(avgCostPerSlice)}/slice \u00d7 ${data.remainingSliceCount} remaining)`,
  );

  // Burn rate
  if (data.totals.duration > 0) {
    const costPerHour = data.totals.cost / (data.totals.duration / 3_600_000);
    lines.push(`  Burn rate: ${th.fg("text", formatCost(costPerHour) + "/hr")}`);
  }

  // Sparkline of per-slice costs
  const sliceCosts = sliceLevelEntries.map(s => s.cost);
  if (sliceCosts.length > 0) {
    const spark = sparkline(sliceCosts);
    lines.push(`  Cost trend: ${spark}`);
  }

  // Budget warning: projected total > 2x current spend
  const projectedTotal = data.totals.cost + projectedRemaining;
  if (projectedTotal > 2 * data.totals.cost && data.remainingSliceCount > 0) {
    lines.push(th.fg("warning", `  \u26a0 Projected total ${formatCost(projectedTotal)} exceeds 2\u00d7 current spend`));
  }

  return lines;
}
