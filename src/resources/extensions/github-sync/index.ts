/**
 * GitHub Sync extension for GSD.
 *
 * Opt-in extension that syncs GSD lifecycle events to GitHub:
 * milestones → GH Milestones + tracking issues, slices → draft PRs,
 * tasks → sub-issues with auto-close on commit.
 *
 * Integration happens via a single dynamic import in auto-post-unit.ts.
 * This index registers a `/github-sync` command for manual bootstrap
 * and status display.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { bootstrapSync } from "./sync.js";
import { loadSyncMapping } from "./mapping.js";
import { ghIsAvailable } from "./cli.js";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("github-sync", {
    description: "Bootstrap GitHub sync or show sync status",
    handler: async (args: string, ctx) => {
      const subcommand = args.trim().toLowerCase();

      if (subcommand === "status") {
        await showStatus(ctx);
        return;
      }

      if (subcommand === "bootstrap" || subcommand === "") {
        await runBootstrap(ctx);
        return;
      }

      ctx.ui.notify(
        "Usage: /github-sync [bootstrap|status]",
        "info",
      );
    },
  });
}

async function showStatus(ctx: import("@gsd/pi-coding-agent").ExtensionCommandContext) {
  if (!ghIsAvailable()) {
    ctx.ui.notify("GitHub sync: `gh` CLI not installed or not authenticated.", "warning");
    return;
  }

  const mapping = loadSyncMapping(ctx.cwd);
  if (!mapping) {
    ctx.ui.notify("GitHub sync: No sync mapping found. Run `/github-sync bootstrap` to initialize.", "info");
    return;
  }

  const milestoneCount = Object.keys(mapping.milestones).length;
  const sliceCount = Object.keys(mapping.slices).length;
  const taskCount = Object.keys(mapping.tasks).length;
  const openMilestones = Object.values(mapping.milestones).filter(m => m.state === "open").length;
  const openSlices = Object.values(mapping.slices).filter(s => s.state === "open").length;
  const openTasks = Object.values(mapping.tasks).filter(t => t.state === "open").length;

  ctx.ui.notify(
    [
      `GitHub sync: repo=${mapping.repo}`,
      `  Milestones: ${milestoneCount} (${openMilestones} open)`,
      `  Slices: ${sliceCount} (${openSlices} open)`,
      `  Tasks: ${taskCount} (${openTasks} open)`,
    ].join("\n"),
    "info",
  );
}

async function runBootstrap(ctx: import("@gsd/pi-coding-agent").ExtensionCommandContext) {
  if (!ghIsAvailable()) {
    ctx.ui.notify("GitHub sync: `gh` CLI not installed or not authenticated.", "warning");
    return;
  }

  ctx.ui.notify("GitHub sync: bootstrapping...", "info");

  try {
    const counts = await bootstrapSync(ctx.cwd);
    if (counts.milestones === 0 && counts.slices === 0 && counts.tasks === 0) {
      ctx.ui.notify("GitHub sync: everything already synced (or no milestones found).", "info");
    } else {
      ctx.ui.notify(
        `GitHub sync: created ${counts.milestones} milestone(s), ${counts.slices} slice(s), ${counts.tasks} task(s).`,
        "info",
      );
    }
  } catch (err) {
    ctx.ui.notify(`GitHub sync bootstrap failed: ${err}`, "error");
  }
}
