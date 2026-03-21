// GSD Visualizer - Progress view renderer

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth } from "@gsd/pi-tui";
import type { VisualizerData, VisualizerMilestone } from "./visualizer-data.js";
import { padRight, joinColumns, STATUS_GLYPH, STATUS_COLOR } from "../shared/mod.js";
import { formatCompletionDate, sliceLabel, findVerification } from "./visualizer-formatters.js";

export interface ProgressFilter {
  text: string;
  field: "all" | "status" | "risk" | "keyword";
}

export function renderProgressView(
  data: VisualizerData,
  th: Theme,
  width: number,
  filter?: ProgressFilter,
  collapsed?: Set<string>,
): string[] {
  const lines: string[] = [];

  // Risk Heatmap
  lines.push(...renderRiskHeatmap(data, th, width));
  if (data.milestones.length > 0) lines.push("");

  // Filter indicator
  if (filter && filter.text) {
    lines.push(th.fg("accent", `Filter (${filter.field}): ${filter.text}`));
    lines.push("");
  }

  lines.push(...renderFeatureStats(data, th, width));
  lines.push(...renderDiscussionStatus(data, th, width));

  for (const ms of data.milestones) {
    // Apply filter to milestones
    if (filter && filter.text) {
      const matchesMs = matchesFilter(ms, filter);
      if (!matchesMs) continue;
    }

    // Milestone header line
    const msStatus = ms.status === "complete" ? "done" : ms.status === "active" ? "active" : ms.status === "parked" ? "paused" : "pending";
    const statusGlyph = th.fg(STATUS_COLOR[msStatus], STATUS_GLYPH[msStatus]);
    const statusLabel = th.fg(STATUS_COLOR[msStatus], ms.status);

    const collapseIndicator = collapsed?.has(ms.id) ? "[+] " : "";
    const msLeft = `${collapseIndicator}${ms.id}: ${ms.title}`;
    const msRight = `${statusGlyph} ${statusLabel}`;
    lines.push(joinColumns(msLeft, msRight, width));

    // If collapsed, skip rendering slices/tasks
    if (collapsed?.has(ms.id)) continue;

    if (ms.slices.length === 0 && ms.dependsOn.length > 0) {
      lines.push(th.fg("dim", `  (depends on ${ms.dependsOn.join(", ")})`));
      continue;
    }

    if (ms.status === "pending" && ms.dependsOn.length > 0) {
      lines.push(th.fg("dim", `  (depends on ${ms.dependsOn.join(", ")})`));
      continue;
    }

    for (const sl of ms.slices) {
      // Apply filter to slices
      if (filter && filter.text) {
        if (!matchesSliceFilter(sl, filter)) continue;
      }

      // Slice line
      const slStatus = sl.done ? "done" : sl.active ? "active" : "pending";
      const slGlyph = th.fg(STATUS_COLOR[slStatus], STATUS_GLYPH[slStatus]);
      const riskColor =
        sl.risk === "high"
          ? "warning"
          : sl.risk === "medium"
            ? "text"
            : "dim";
      const riskBadge = th.fg(riskColor, sl.risk);

      // Verification badge
      const ver = findVerification(data, ms.id, sl.id);
      let verBadge = "";
      if (ver) {
        if (ver.verificationResult === "passed") {
          verBadge = " " + th.fg("success", "\u2713");
        } else if (ver.verificationResult === "failed") {
          verBadge = " " + th.fg("error", "\u2717");
        } else if (ver.verificationResult === "untested" || ver.verificationResult === "") {
          verBadge = " " + th.fg("dim", "?");
        }
        if (ver.blockerDiscovered) {
          verBadge += " " + th.fg("warning", "\u26a0");
        }
      }

      const slLeft = `  ${slGlyph} ${sl.id}: ${sl.title}${verBadge}`;
      lines.push(joinColumns(slLeft, riskBadge, width));

      // Show tasks for active slice
      if (sl.active && sl.tasks.length > 0) {
        for (const task of sl.tasks) {
          const tStatus = task.done ? "done" : task.active ? "active" : "pending";
          const tGlyph = th.fg(STATUS_COLOR[tStatus], STATUS_GLYPH[tStatus]);
          const estimateStr = task.estimate ? th.fg("dim", ` (${task.estimate})`) : "";
          lines.push(`      ${tGlyph} ${task.id}: ${task.title}${estimateStr}`);
        }
      }
    }
  }

  return lines;
}

export function renderFeatureStats(data: VisualizerData, th: Theme, width: number): string[] {
  const stats = data.stats;
  const lines: string[] = [];
  lines.push(th.fg("accent", th.bold("Feature Snapshot")));
  lines.push("");

  const missingLabel = `Missing slices: ${th.fg("warning", String(stats.missingCount))}`;
  lines.push(truncateToWidth(`  ${missingLabel}`, width));
  if (stats.missingSlices.length > 0) {
    for (const slice of stats.missingSlices) {
      const row = `    ${th.fg("dim", sliceLabel(slice))} ${slice.title}`;
      lines.push(truncateToWidth(row, width));
    }
    const remaining = stats.missingCount - stats.missingSlices.length;
    if (remaining > 0) {
      lines.push(truncateToWidth(`    ... and ${remaining} more`, width));
    }
  }

  lines.push("");
  const updatedLabel = `Updated (last 7 days): ${th.fg("accent", String(stats.updatedCount))}`;
  lines.push(truncateToWidth(`  ${updatedLabel}`, width));
  if (stats.updatedSlices.length > 0) {
    for (const slice of stats.updatedSlices) {
      const when = formatCompletionDate(slice.completedAt);
      const row = `    ${th.fg("text", sliceLabel(slice))} ${th.fg("dim", when)} ${slice.title}`;
      lines.push(truncateToWidth(row, width));
    }
  }

  lines.push("");
  lines.push(truncateToWidth(`  Recent completions: ${th.fg("success", String(stats.recentEntries.length))}`, width));
  for (const entry of stats.recentEntries) {
    const when = formatCompletionDate(entry.completedAt);
    const row = `    ${th.fg("text", entry.sliceId)} — ${entry.oneLiner || entry.title} ${th.fg("dim", when)}`;
    lines.push(truncateToWidth(row, width));
  }

  lines.push("");
  return lines;
}

export function renderDiscussionStatus(data: VisualizerData, th: Theme, width: number): string[] {
  const states = data.discussion;
  if (states.length === 0) return [];

  const counts = {
    discussed: 0,
    draft: 0,
    undiscussed: 0,
  };
  for (const state of states) counts[state.state]++;

  const lines: string[] = [];
  lines.push(th.fg("accent", th.bold("Discussion Status")));
  lines.push("");
  const summary = `  Discussed: ${th.fg("success", String(counts.discussed))}  Draft: ${th.fg("warning", String(counts.draft))}  Pending: ${th.fg("dim", String(counts.undiscussed))}`;
  lines.push(truncateToWidth(summary, width));
  lines.push("");

  for (const state of states) {
    const badge =
      state.state === "discussed"
        ? th.fg("success", "Discussed")
        : state.state === "draft"
          ? th.fg("warning", "Draft")
          : th.fg("dim", "Pending");
    const when = state.lastUpdated ? ` ${th.fg("dim", formatCompletionDate(state.lastUpdated))}` : "";
    const row = `    ${th.fg("text", state.milestoneId)} ${badge} ${state.title}${when}`;
    lines.push(truncateToWidth(row, width));
  }

  lines.push("");
  return lines;
}

export function renderRiskHeatmap(data: VisualizerData, th: Theme, width: number): string[] {
  const allSlices = data.milestones.flatMap(m => m.slices);
  if (allSlices.length === 0) return [];

  const lines: string[] = [];
  lines.push(th.fg("accent", th.bold("Risk Heatmap")));
  lines.push("");

  for (const ms of data.milestones) {
    if (ms.slices.length === 0) continue;
    const blocks = ms.slices.map(s => {
      const color = s.risk === "high" ? "error" : s.risk === "medium" ? "warning" : "success";
      return th.fg(color, "\u2588\u2588");
    });
    const row = `  ${padRight(ms.id, 6)} ${blocks.join(" ")}`;
    lines.push(truncateToWidth(row, width));
  }

  lines.push("");
  lines.push(
    `  ${th.fg("success", "\u2588\u2588")} low  ${th.fg("warning", "\u2588\u2588")} med  ${th.fg("error", "\u2588\u2588")} high`,
  );

  // Summary counts
  let low = 0, med = 0, high = 0;
  let highNotStarted = 0;
  for (const sl of allSlices) {
    if (sl.risk === "high") {
      high++;
      if (!sl.done && !sl.active) highNotStarted++;
    } else if (sl.risk === "medium") {
      med++;
    } else {
      low++;
    }
  }

  let summary = `  Risk: ${low} low, ${med} med, ${high} high`;
  if (highNotStarted > 0) {
    summary += ` | ${th.fg("error", `${highNotStarted} high-risk not started`)}`;
  }
  lines.push(summary);

  return lines;
}

function matchesFilter(ms: VisualizerMilestone, filter: ProgressFilter): boolean {
  const text = filter.text.toLowerCase();
  if (filter.field === "status") {
    return ms.status.includes(text);
  }
  if (filter.field === "risk") {
    return ms.slices.some(s => s.risk.toLowerCase().includes(text));
  }
  // "all" or "keyword"
  if (ms.id.toLowerCase().includes(text)) return true;
  if (ms.title.toLowerCase().includes(text)) return true;
  if (ms.status.includes(text)) return true;
  return ms.slices.some(s => matchesSliceFilter(s, filter));
}

function matchesSliceFilter(sl: { id: string; title: string; risk: string }, filter: ProgressFilter): boolean {
  const text = filter.text.toLowerCase();
  if (filter.field === "status") return true; // slices don't have named status
  if (filter.field === "risk") return sl.risk.toLowerCase().includes(text);
  return sl.id.toLowerCase().includes(text) ||
    sl.title.toLowerCase().includes(text) ||
    sl.risk.toLowerCase().includes(text);
}
