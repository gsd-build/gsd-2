// GSD Visualizer - Timeline and Gantt view renderers

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth } from "@gsd/pi-tui";
import type { VisualizerData } from "./visualizer-data.js";
import { formatCost, classifyUnitPhase } from "./metrics.js";
import { formatDuration, padRight, STATUS_GLYPH, STATUS_COLOR } from "../shared/mod.js";
import { shortenModel } from "./visualizer-formatters.js";

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

  // Gantt mode for wide terminals, list mode for narrow
  if (width >= 90) {
    return renderGanttView(data, th, width);
  }

  return renderTimelineList(data, th, width);
}

export function renderTimelineList(data: VisualizerData, th: Theme, width: number): string[] {
  const lines: string[] = [];

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
    const unitStatus = unit.finishedAt > 0 ? "done" : "active";
    const glyph = th.fg(STATUS_COLOR[unitStatus], STATUS_GLYPH[unitStatus]);

    const typeLabel = padRight(unit.type, 16);
    const idLabel = padRight(unit.id, 14);

    const fillLen =
      maxDuration > 0
        ? Math.round((duration / maxDuration) * timeBarWidth)
        : 0;
    const bar =
      th.fg("accent", "\u2588".repeat(fillLen)) +
      th.fg("dim", "\u2591".repeat(timeBarWidth - fillLen));

    const durStr = formatDuration(duration);
    const costStr = formatCost(unit.cost);

    // Tier and model info
    const tierLabel = unit.tier ? th.fg("dim", `[${unit.tier}]`) : "";
    const modelLabel = th.fg("dim", shortenModel(unit.model));
    const tierModelPart = [tierLabel, modelLabel].filter(Boolean).join(" ");

    const line = `  ${time}  ${glyph} ${typeLabel} ${tierModelPart} ${idLabel} ${bar}  ${durStr}  ${costStr}`;
    lines.push(truncateToWidth(line, width));
  }

  return lines;
}

export function renderGanttView(data: VisualizerData, th: Theme, width: number): string[] {
  const lines: string[] = [];
  const recent = data.units.slice(-20);
  if (recent.length === 0) return lines;

  const finishedUnits = recent.filter(u => u.finishedAt > 0);
  if (finishedUnits.length === 0) return renderTimelineList(data, th, width);

  const minStart = Math.min(...recent.map(u => u.startedAt));
  const maxEnd = Math.max(...recent.map(u => u.finishedAt > 0 ? u.finishedAt : Date.now()));
  const totalSpan = maxEnd - minStart;
  if (totalSpan <= 0) return renderTimelineList(data, th, width);

  const gutterWidth = 20;
  const barArea = Math.max(10, width - gutterWidth - 25);

  // Time axis labels
  const startLabel = formatTimeLabel(minStart);
  const endLabel = formatTimeLabel(maxEnd);
  lines.push(
    `${" ".repeat(gutterWidth)} ${th.fg("dim", startLabel)}` +
    `${" ".repeat(Math.max(1, barArea - startLabel.length - endLabel.length))}` +
    `${th.fg("dim", endLabel)}`,
  );

  // Phase tracking for separators
  let lastPhase = "";

  for (const unit of recent) {
    const phase = classifyUnitPhase(unit.type);
    if (phase !== lastPhase && lastPhase !== "") {
      lines.push(th.fg("dim", "  " + "\u2500".repeat(width - 4)));
    }
    lastPhase = phase;

    const end = unit.finishedAt > 0 ? unit.finishedAt : Date.now();
    const startPos = Math.round(((unit.startedAt - minStart) / totalSpan) * barArea);
    const endPos = Math.round(((end - minStart) / totalSpan) * barArea);
    const barLen = Math.max(1, endPos - startPos);

    const phaseColor =
      phase === "research" ? "dim" :
      phase === "planning" ? "accent" :
      phase === "execution" ? "success" :
      "warning";

    const barStr =
      " ".repeat(startPos) +
      th.fg(phaseColor, "\u2588".repeat(barLen)) +
      " ".repeat(Math.max(0, barArea - startPos - barLen));

    const tierTag = unit.tier ? `[${unit.tier[0]}]` : "";
    const gutter = padRight(
      truncateToWidth(`${unit.type.slice(0, 8)} ${unit.id}${tierTag}`, gutterWidth - 1),
      gutterWidth,
    );

    const duration = end - unit.startedAt;
    const durStr = formatDuration(duration);
    const costStr = formatCost(unit.cost);

    lines.push(truncateToWidth(`${gutter}${barStr} ${durStr} ${costStr}`, width));
  }

  return lines;
}

function formatTimeLabel(ts: number): string {
  const dt = new Date(ts);
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}
