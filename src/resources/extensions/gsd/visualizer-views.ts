// View renderers for the GSD workflow visualizer overlay.

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@gsd/pi-tui";
import type { VisualizerData, VisualizerMilestone } from "./visualizer-data.js";
import { formatCost, formatTokenCount } from "./metrics.js";

// ─── Local Helpers ───────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function padRight(content: string, width: number): string {
  const vis = visibleWidth(content);
  return content + " ".repeat(Math.max(0, width - vis));
}

function joinColumns(left: string, right: string, width: number): string {
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);
  if (leftW + rightW + 2 > width) {
    return truncateToWidth(`${left}  ${right}`, width);
  }
  return left + " ".repeat(width - leftW - rightW) + right;
}

// ─── Progress View ───────────────────────────────────────────────────────────

export function renderProgressView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];

  for (const ms of data.milestones) {
    // Milestone header line
    const statusGlyph =
      ms.status === "complete"
        ? th.fg("success", "✓")
        : ms.status === "active"
          ? th.fg("accent", "▸")
          : th.fg("dim", "○");
    const statusLabel =
      ms.status === "complete"
        ? th.fg("success", "complete")
        : ms.status === "active"
          ? th.fg("accent", "active")
          : th.fg("dim", "pending");
    const msLeft = `${ms.id}: ${ms.title}`;
    const msRight = `${statusGlyph} ${statusLabel}`;
    lines.push(joinColumns(msLeft, msRight, width));

    if (ms.slices.length === 0 && ms.dependsOn.length > 0) {
      lines.push(th.fg("dim", `  (depends on ${ms.dependsOn.join(", ")})`));
      continue;
    }

    if (ms.status === "pending" && ms.dependsOn.length > 0) {
      lines.push(th.fg("dim", `  (depends on ${ms.dependsOn.join(", ")})`));
      continue;
    }

    for (const sl of ms.slices) {
      // Slice line
      const slGlyph = sl.done
        ? th.fg("success", "✓")
        : sl.active
          ? th.fg("accent", "▸")
          : th.fg("dim", "○");
      const riskColor =
        sl.risk === "high"
          ? "warning"
          : sl.risk === "medium"
            ? "text"
            : "dim";
      const riskBadge = th.fg(riskColor, sl.risk);
      const slLeft = `  ${slGlyph} ${sl.id}: ${sl.title}`;
      lines.push(joinColumns(slLeft, riskBadge, width));

      // Show tasks for active slice
      if (sl.active && sl.tasks.length > 0) {
        for (const task of sl.tasks) {
          const tGlyph = task.done
            ? th.fg("success", "✓")
            : task.active
              ? th.fg("accent", "▸")
              : th.fg("dim", "○");
          lines.push(`      ${tGlyph} ${task.id}: ${task.title}`);
        }
      }
    }
  }

  return lines;
}

// ─── Dependencies View ───────────────────────────────────────────────────────

export function renderDepsView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];

  // Milestone Dependencies
  lines.push(th.fg("accent", th.bold("Milestone Dependencies")));
  lines.push("");

  const msDeps = data.milestones.filter((ms) => ms.dependsOn.length > 0);
  if (msDeps.length === 0) {
    lines.push(th.fg("dim", "  No milestone dependencies."));
  } else {
    for (const ms of msDeps) {
      for (const dep of ms.dependsOn) {
        lines.push(
          `  ${th.fg("text", dep)} ${th.fg("accent", "──►")} ${th.fg("text", ms.id)}`,
        );
      }
    }
  }

  lines.push("");

  // Slice Dependencies (active milestone)
  lines.push(th.fg("accent", th.bold("Slice Dependencies (active milestone)")));
  lines.push("");

  const activeMs = data.milestones.find((ms) => ms.status === "active");
  if (!activeMs) {
    lines.push(th.fg("dim", "  No active milestone."));
  } else {
    const slDeps = activeMs.slices.filter((sl) => sl.depends.length > 0);
    if (slDeps.length === 0) {
      lines.push(th.fg("dim", "  No slice dependencies."));
    } else {
      for (const sl of slDeps) {
        for (const dep of sl.depends) {
          lines.push(
            `  ${th.fg("text", dep)} ${th.fg("accent", "──►")} ${th.fg("text", sl.id)}`,
          );
        }
      }
    }
  }

  return lines;
}

// ─── Metrics View ────────────────────────────────────────────────────────────

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
        th.fg("accent", "█".repeat(fillLen)) +
        th.fg("dim", "░".repeat(barWidth - fillLen));
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
        th.fg("accent", "█".repeat(fillLen)) +
        th.fg("dim", "░".repeat(barWidth - fillLen));
      const label = padRight(model.model, 20);
      const costStr = formatCost(model.cost);
      const pctStr = `${pct.toFixed(1)}%`;
      lines.push(`  ${label} ${bar} ${costStr} ${pctStr}`);
    }
  }

  return lines;
}

// ─── Timeline View ──────────────────────────────────────────────────────────

export function renderTimelineView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];

  if (data.units.length === 0) {
    lines.push(th.fg("dim", "No execution history."));
    return lines;
  }

  // Show up to 20 most recent (units are sorted by startedAt asc, show most recent)
  const recent = data.units.slice(-20).reverse();

  const maxDuration = Math.max(
    ...recent.map((u) => u.finishedAt - u.startedAt),
  );
  const timeBarWidth = Math.max(4, Math.min(12, width - 60));

  for (const unit of recent) {
    const dt = new Date(unit.startedAt);
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;

    const duration = unit.finishedAt - unit.startedAt;
    const glyph =
      unit.finishedAt > 0
        ? th.fg("success", "✓")
        : th.fg("accent", "▸");

    const typeLabel = padRight(unit.type, 16);
    const idLabel = padRight(unit.id, 14);

    const fillLen =
      maxDuration > 0
        ? Math.round((duration / maxDuration) * timeBarWidth)
        : 0;
    const bar =
      th.fg("accent", "█".repeat(fillLen)) +
      th.fg("dim", "░".repeat(timeBarWidth - fillLen));

    const durStr = formatDuration(duration);
    const costStr = formatCost(unit.cost);

    const line = `  ${time}  ${glyph} ${typeLabel} ${idLabel} ${bar}  ${durStr}  ${costStr}`;
    lines.push(truncateToWidth(line, width));
  }

  return lines;
}
