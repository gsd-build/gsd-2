// GSD Visualizer - Dependencies view renderer

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth } from "@gsd/pi-tui";
import type { VisualizerData } from "./visualizer-data.js";

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
          `  ${th.fg("text", dep)} ${th.fg("accent", "\u2500\u2500\u25ba")} ${th.fg("text", ms.id)}`,
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
            `  ${th.fg("text", dep)} ${th.fg("accent", "\u2500\u2500\u25ba")} ${th.fg("text", sl.id)}`,
          );
        }
      }
    }
  }

  lines.push("");

  // Critical Path section
  lines.push(...renderCriticalPath(data, th, width));

  // Data Flow section from slice verifications
  lines.push("");
  lines.push(...renderDataFlow(data, th));

  return lines;
}

export function renderDataFlow(data: VisualizerData, th: Theme): string[] {
  const lines: string[] = [];
  const versWithProvides = data.sliceVerifications.filter(v => v.provides.length > 0);
  const versWithRequires = data.sliceVerifications.filter(v => v.requires.length > 0);

  if (versWithProvides.length === 0 && versWithRequires.length === 0) return lines;

  lines.push(th.fg("accent", th.bold("Data Flow")));
  lines.push("");

  for (const v of versWithProvides) {
    for (const artifact of v.provides) {
      lines.push(`  ${th.fg("text", v.sliceId)} ${th.fg("accent", "\u2500\u2500\u25ba")} ${th.fg("dim", `[${artifact}]`)}`);
    }
  }

  for (const v of versWithRequires) {
    for (const req of v.requires) {
      lines.push(`  ${th.fg("dim", `[${req.provides}]`)} ${th.fg("accent", "\u25c4\u2500\u2500")} ${th.fg("text", req.slice)}`);
    }
  }

  return lines;
}

export function renderCriticalPath(data: VisualizerData, th: Theme, _width: number): string[] {
  const lines: string[] = [];
  const cp = data.criticalPath;

  lines.push(th.fg("accent", th.bold("Critical Path")));
  lines.push("");

  if (cp.milestonePath.length === 0) {
    lines.push(th.fg("dim", "  No critical path data."));
    return lines;
  }

  // Milestone chain
  const chain = cp.milestonePath.map(id => {
    const badge = th.fg("error", "[CRITICAL]");
    return `${id} ${badge}`;
  }).join(` ${th.fg("accent", "\u2500\u2500\u25ba")} `);
  lines.push(`  ${chain}`);
  lines.push("");

  // Non-critical milestones with slack
  for (const ms of data.milestones) {
    if (cp.milestonePath.includes(ms.id)) continue;
    const slack = cp.milestoneSlack.get(ms.id) ?? 0;
    lines.push(th.fg("dim", `  ${ms.id} (slack: ${slack})`));
  }

  // Slice-level critical path
  if (cp.slicePath.length > 0) {
    lines.push("");
    lines.push(th.fg("accent", th.bold("Slice Critical Path")));
    lines.push("");

    const sliceChain = cp.slicePath.join(` ${th.fg("accent", "\u2500\u2500\u25ba")} `);
    lines.push(`  ${sliceChain}`);

    // Bottleneck warnings
    const activeMs = data.milestones.find(m => m.status === "active");
    if (activeMs) {
      for (const sid of cp.slicePath) {
        const sl = activeMs.slices.find(s => s.id === sid);
        if (sl && !sl.done && !sl.active) {
          lines.push(th.fg("warning", `  \u26a0 ${sid}: critical but not yet started`));
        }
      }
    }
  }

  return lines;
}
