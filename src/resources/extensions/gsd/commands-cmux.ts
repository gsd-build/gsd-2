import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearCmuxSidebar, CmuxClient, detectCmuxEnvironment, resolveCmuxConfig } from "../cmux/index.js";
import { saveFile } from "./files.js";
import {
  getProjectGSDPreferencesPath,
  loadEffectiveGSDPreferences,
  loadProjectGSDPreferences,
} from "./preferences.js";
import { ensurePreferencesFile, serializePreferencesToFrontmatter } from "./commands-prefs-wizard.js";

function extractBodyAfterFrontmatter(content: string): string | null {
  const start = content.startsWith("---\n") ? 4 : content.startsWith("---\r\n") ? 5 : -1;
  if (start === -1) return null;
  const closingIdx = content.indexOf("\n---", start);
  if (closingIdx === -1) return null;
  const after = content.slice(closingIdx + 4);
  return after.trim() ? after : null;
}

async function writeProjectCmuxPreferences(
  ctx: ExtensionCommandContext,
  updater: (prefs: Record<string, unknown>) => void,
): Promise<void> {
  const path = getProjectGSDPreferencesPath();
  await ensurePreferencesFile(path, ctx, "project");

  const existing = loadProjectGSDPreferences();
  const prefs: Record<string, unknown> = existing?.preferences ? { ...existing.preferences } : { version: 1 };
  updater(prefs);
  prefs.version = prefs.version || 1;

  const frontmatter = serializePreferencesToFrontmatter(prefs);
  let body = "\n# GSD Skill Preferences\n\nSee `~/.gsd/agent/extensions/gsd/docs/preferences-reference.md` for full field documentation and examples.\n";
  if (existsSync(path)) {
    const preserved = extractBodyAfterFrontmatter(readFileSync(path, "utf-8"));
    if (preserved) body = preserved;
  }

  await saveFile(path, `---\n${frontmatter}---${body}`);
  await ctx.waitForIdle();
  await ctx.reload();
}

function formatCmuxStatus(): string {
  const loaded = loadEffectiveGSDPreferences();
  const detected = detectCmuxEnvironment();
  const resolved = resolveCmuxConfig(loaded?.preferences);
  const client = new CmuxClient(resolved);
  const capabilities = client.getCapabilities() as Record<string, unknown> | null;
  const identity = client.identify() as Record<string, unknown> | null;

  const accessMode = typeof capabilities?.access_mode === "string"
    ? capabilities.access_mode
    : "unknown";
  const methods = Array.isArray(capabilities?.methods) ? capabilities.methods.length : 0;
  const version = typeof capabilities?.version === "number" ? capabilities.version : "unknown";

  const focused = identity && typeof identity.focused === "object" && identity.focused !== null
    ? identity.focused as Record<string, unknown>
    : null;
  const focusedSurface = typeof focused?.surface_ref === "string" ? focused.surface_ref : null;
  const focusedType = typeof focused?.surface_type === "string" ? focused.surface_type : null;

  return [
    "cmux status",
    "",
    `Detected:       ${detected.available ? "yes" : "no"}`,
    `Enabled:        ${resolved.enabled ? "yes" : "no"}`,
    `CLI available:  ${detected.cliAvailable ? "yes" : "no"}`,
    `Socket:         ${detected.socketPath}`,
    `Workspace:      ${detected.workspaceId ?? "(none)"}`,
    `Surface:        ${detected.surfaceId ?? "(none)"}`,
    "",
    "Features:",
    `  notifications ${resolved.notifications ? "on" : "off"}`,
    `  sidebar       ${resolved.sidebar ? "on" : "off"}`,
    `  splits        ${resolved.splits ? "on" : "off"}`,
    `  browser       ${resolved.browser ? "on" : "off"}`,
    "",
    "Server:",
    `  access:   ${accessMode}`,
    `  protocol: ${typeof capabilities?.protocol === "string" ? capabilities.protocol : "unknown"}`,
    `  version:  ${version}`,
    `  methods:  ${methods}`,
    ...(focusedSurface ? [`  focused:  ${focusedSurface} (${focusedType ?? "?"})`] : []),
  ].join("\n");
}

function ensureCmuxAvailableForEnable(ctx: ExtensionCommandContext): boolean {
  const detected = detectCmuxEnvironment();
  if (detected.available) return true;
  ctx.ui.notify(
    "cmux not detected. Install it from https://cmux.com and run gsd inside a cmux terminal.",
    "warning",
  );
  return false;
}

function resolveCmuxClient(): CmuxClient {
  return CmuxClient.fromPreferences(loadEffectiveGSDPreferences()?.preferences);
}

export async function handleCmux(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const trimmed = args.trim();

  // ── status ──────────────────────────────────────────────────────────────────
  if (!trimmed || trimmed === "status") {
    ctx.ui.notify(formatCmuxStatus(), "info");
    return;
  }

  // ── on / off ─────────────────────────────────────────────────────────────────
  if (trimmed === "on") {
    if (!ensureCmuxAvailableForEnable(ctx)) return;
    await writeProjectCmuxPreferences(ctx, (prefs) => {
      const existing = (prefs.cmux as Record<string, unknown> | undefined) ?? {};
      prefs.cmux = { ...existing, enabled: true };
    });
    ctx.ui.notify("cmux integration enabled in project preferences.", "info");
    return;
  }

  if (trimmed === "off") {
    const effective = loadEffectiveGSDPreferences()?.preferences;
    await writeProjectCmuxPreferences(ctx, (prefs) => {
      prefs.cmux = { ...((prefs.cmux as Record<string, unknown> | undefined) ?? {}), enabled: false };
    });
    clearCmuxSidebar(effective);
    ctx.ui.notify("cmux integration disabled in project preferences.", "info");
    return;
  }

  // ── feature toggles: <feature> on|off ────────────────────────────────────────
  const parts = trimmed.split(/\s+/);

  if (
    parts.length === 2
    && ["notifications", "sidebar", "splits", "browser"].includes(parts[0])
    && ["on", "off"].includes(parts[1])
  ) {
    const feature = parts[0] as "notifications" | "sidebar" | "splits" | "browser";
    const enabled = parts[1] === "on";
    if (enabled && !ensureCmuxAvailableForEnable(ctx)) return;

    await writeProjectCmuxPreferences(ctx, (prefs) => {
      const next = { ...((prefs.cmux as Record<string, unknown> | undefined) ?? {}) };
      next[feature] = enabled;
      prefs.cmux = next;
    });

    if (!enabled && feature === "sidebar") {
      clearCmuxSidebar(loadEffectiveGSDPreferences()?.preferences);
    }

    ctx.ui.notify(`cmux ${feature} ${enabled ? "enabled" : "disabled"}.`, "info");
    return;
  }

  // ── markdown <path> ─────────────────────────────────────────────────────────
  // Open a file in cmux's live-rendered markdown viewer.
  if (parts[0] === "markdown" && parts.length >= 2) {
    const filePath = resolve(process.cwd(), parts.slice(1).join(" "));
    if (!existsSync(filePath)) {
      ctx.ui.notify(`File not found: ${filePath}`, "warning");
      return;
    }
    const client = resolveCmuxClient();
    if (!client.getConfig().available) {
      ctx.ui.notify("cmux not available in this session.", "warning");
      return;
    }
    const surface = await client.openMarkdown(filePath);
    if (surface) {
      ctx.ui.notify(`Opened ${filePath} in ${surface}.`, "info");
    } else {
      ctx.ui.notify("Failed to open markdown viewer. Is cmux running?", "warning");
    }
    return;
  }

  // ── browser <url> ────────────────────────────────────────────────────────────
  // Open a URL in a cmux browser split. Requires browser feature enabled.
  if (parts[0] === "browser" && parts.length >= 2 && parts[1] !== "on" && parts[1] !== "off") {
    const url = parts.slice(1).join(" ");
    const client = resolveCmuxClient();
    if (!client.getConfig().browser) {
      ctx.ui.notify("cmux browser feature is off. Run /gsd cmux browser on first.", "warning");
      return;
    }
    const surface = await client.openBrowserSplit(url);
    if (surface) {
      ctx.ui.notify(`Opened ${url} in browser ${surface}.`, "info");
    } else {
      ctx.ui.notify("Failed to open browser split. Is cmux running?", "warning");
    }
    return;
  }

  // ── flash ────────────────────────────────────────────────────────────────────
  // Manually trigger the unread-flash indicator on the current surface.
  if (trimmed === "flash") {
    resolveCmuxClient().triggerFlash();
    return;
  }

  // ── read-screen [lines] ──────────────────────────────────────────────────────
  // Read visible terminal text from the current surface (useful for debugging).
  if (parts[0] === "read-screen") {
    const lines = parts[1] ? parseInt(parts[1], 10) : undefined;
    const client = resolveCmuxClient();
    const text = await client.readScreen(undefined, Number.isNaN(lines) ? undefined : lines);
    if (text) {
      ctx.ui.notify(text, "info");
    } else {
      ctx.ui.notify("cmux read-screen: no output or cmux not available.", "warning");
    }
    return;
  }

  ctx.ui.notify(
    [
      "Usage: /gsd cmux <subcommand>",
      "",
      "  status                        Show cmux integration status",
      "  on / off                      Enable or disable cmux integration",
      "  notifications on|off          Toggle notification routing",
      "  sidebar on|off                Toggle sidebar metadata",
      "  splits on|off                 Toggle visible subagent splits",
      "  browser on|off                Toggle browser split feature",
      "  markdown <path>               Open a file in cmux markdown viewer",
      "  browser <url>                 Open a URL in a cmux browser split",
      "  flash                         Trigger unread-flash on current surface",
      "  read-screen [lines]           Read terminal text from current surface",
    ].join("\n"),
    "info",
  );
}
