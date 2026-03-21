import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Key, Text } from "@gsd/pi-tui";

import { GSDDashboardOverlay } from "../dashboard-overlay.js";
import { shortcutDesc } from "../../shared/mod.js";

export const GSD_LOGO_LINES = [
  "   ██████╗ ███████╗██████╗ ",
  "  ██╔════╝ ██╔════╝██╔══██╗",
  "  ██║  ███╗███████╗██║  ██║",
  "  ██║   ██║╚════██║██║  ██║",
  "  ╚██████╔╝███████║██████╔╝",
  "   ╚═════╝ ╚══════╝╚═════╝ ",
];

export function registerShortcuts(pi: ExtensionAPI): void {
  pi.registerShortcut(Key.ctrlAlt("g"), {
    description: shortcutDesc("Open GSD dashboard", "/gsd status"),
    handler: async (ctx) => {
      if (!existsSync(join(process.cwd(), ".gsd"))) {
        ctx.ui.notify("No .gsd/ directory found. Run /gsd to start.", "info");
        return;
      }
      await ctx.ui.custom<void>(
        (tui, theme, _kb, done) => new GSDDashboardOverlay(tui, theme, () => done()),
        {
          overlay: true,
          overlayOptions: {
            width: "90%",
            minWidth: 80,
            maxHeight: "92%",
            anchor: "center",
          },
        },
      );
    },
  });
}

export function maybeRenderGsdHeader(ctx: { ui: any }): void {
  // The right-side PTY-backed `gsd` session should look like the attached
  // bridge terminal, not a fresh standalone TUI with an extra decorative
  // header block. Skip the branded header in web PTY sessions only.
  if (process.env.GSD_WEB_PTY === "1") return;

  try {
    const version = process.env.GSD_VERSION || "0.0.0";
    ctx.ui.setHeader((_ui: unknown, theme: any) => {
      const logoText = GSD_LOGO_LINES.map((line) => theme.fg("accent", line)).join("\n");
      const titleLine = `  ${theme.bold("Get Shit Done")} ${theme.fg("dim", `v${version}`)}`;
      return new Text(`${logoText}\n${titleLine}`, 1, 0);
    });
  } catch {
    // Header rendering is decorative — skip it if the active UI host rejects it.
  }
}

