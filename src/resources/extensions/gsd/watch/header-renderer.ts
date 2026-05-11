// Project/App: GSD-2
// File Purpose: Watch-mode terminal header and splash renderer for GSD project status.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { visibleWidth, truncateToWidth } from "@gsd/pi-tui";
import { loadEffectiveGSDPreferences } from "../preferences.js";
import { gsdHome } from "../gsd-home.js";
import { splashPalette } from "./splash-palette.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const GSD_LOGO: readonly string[] = [
  "   ██████╗ ███████╗██████╗ ",
  "  ██╔════╝ ██╔════╝██╔══██╗",
  "  ██║  ███╗███████╗██║  ██║",
  "  ██║   ██║╚════██║██║  ██║",
  "  ╚██████╔╝███████║██████╔╝",
  "   ╚═════╝ ╚══════╝╚═════╝ ",
];

/** Label column width for Model/Provider/Directory/Branch rows. */
const LABEL_COL_WIDTH = 10;

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";

function rgb(hex: string): string {
  const cleaned = hex.replace("#", "");
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

const colors = {
  accent: rgb(splashPalette.accent),
  border: rgb(splashPalette.border),
  muted: rgb(splashPalette.muted),
  dim: rgb(splashPalette.dim),
  text: rgb(splashPalette.text),
  success: rgb(splashPalette.success),
};

function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${ANSI_RESET}`;
}

function bold(text: string): string {
  return `${ANSI_BOLD}${text}${ANSI_RESET}`;
}

function padVisible(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width), "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function rightAlign(left: string, right: string, width: number): string {
  if (!right) return truncateToWidth(left, width, "");
  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return truncateToWidth(left + " ".repeat(gap) + right, width, "");
}

function frameLine(content: string, width: number): string {
  if (width < 3) return truncateToWidth(content, Math.max(0, width), "");
  const innerWidth = Math.max(0, width - 2);
  return `${color("│", colors.border)}${padVisible(content, innerWidth)}${color("│", colors.border)}`;
}

// ─── Data Readers ─────────────────────────────────────────────────────────────

/**
 * Read the configured execution model from GSD preferences.
 * Falls back through execution -> planning -> research -> first found.
 * Returns "default" if nothing is configured.
 */
export function readModelFromPreferences(): string {
  try {
    const prefs = loadEffectiveGSDPreferences();
    if (!prefs?.preferences.models) return "default";
    const m = prefs.preferences.models as Record<string, unknown>;
    // Try common phases in priority order
    for (const phase of ["execution", "planning", "research", "discuss", "subagent"]) {
      const val = m[phase];
      if (typeof val === "string") return val;
      if (val && typeof val === "object" && "model" in val) {
        const model = (val as { model: string }).model;
        if (typeof model === "string") return model;
      }
    }
  } catch {
    // Non-fatal
  }
  return "default";
}

/**
 * Derive provider name from model ID prefix.
 */
export function deriveProvider(modelId: string): string {
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt") || modelId.startsWith("o1") || modelId.startsWith("o3")) return "openai";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("deepseek")) return "deepseek";
  if (modelId === "default") return "anthropic";
  return "unknown";
}

/**
 * Shorten a directory path by replacing the home directory with ~.
 */
export function shortenPath(fullPath: string): string {
  const home = homedir();
  if (fullPath.startsWith(home)) {
    return "~" + fullPath.slice(home.length);
  }
  return fullPath;
}

/**
 * Read the current git branch name. Returns "unknown" on failure.
 */
export function readGitBranch(projectRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 2000,
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Read MCP server names from .mcp.json, .gsd/mcp.json, and the global
 * ~/.gsd/mcp.json (or $GSD_HOME/mcp.json).
 * Returns array of server name strings.
 */
export function readMcpServerNames(projectRoot: string): string[] {
  const configPaths = [
    join(projectRoot, ".mcp.json"),
    join(projectRoot, ".gsd", "mcp.json"),
    join(gsdHome(), "mcp.json"),
  ];
  const names: string[] = [];
  const seen = new Set<string>();

  for (const configPath of configPaths) {
    try {
      if (!existsSync(configPath)) continue;
      const raw = readFileSync(configPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = (data.mcpServers ?? data.servers) as
        | Record<string, unknown>
        | undefined;
      if (!mcpServers || typeof mcpServers !== "object") continue;
      for (const name of Object.keys(mcpServers)) {
        if (!seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return names;
}

// ─── Header Layout ────────────────────────────────────────────────────────────

export interface HeaderData {
  model: string;
  provider: string;
  directory: string;
  branch: string;
  mcpServers: string[];
}

/**
 * Gather all header data from filesystem and preferences.
 */
export function gatherHeaderData(projectRoot: string): HeaderData {
  const model = readModelFromPreferences();
  const provider = deriveProvider(model);
  const directory = shortenPath(projectRoot);
  const branch = readGitBranch(projectRoot);
  const mcpServers = readMcpServerNames(projectRoot);

  return { model, provider, directory, branch, mcpServers };
}

/**
 * Build an info panel line: "Label     value" with proper padding.
 * Returns empty string if value is empty.
 */
function formatInfoLine(label: string, value: string, availableWidth: number): string {
  const labelText = bold(color(label, colors.text));
  const padding = " ".repeat(Math.max(1, LABEL_COL_WIDTH - label.length));
  const maxValueWidth = Math.max(1, availableWidth - LABEL_COL_WIDTH);
  const truncValue = truncateToWidth(value, maxValueWidth, "…");
  return labelText + padding + color(truncValue, colors.muted);
}

/**
 * Format MCP server names as a dot-separated row with checkmarks.
 * e.g. "Brave ✓  ·  Answers ✓  ·  Context7 ✓"
 */
export function formatMcpRow(servers: string[], width: number): string {
  if (servers.length === 0) return "";

  // Capitalize first letter of each server name
  const items = servers.map(s => {
    const cap = s.charAt(0).toUpperCase() + s.slice(1);
    return `${color(cap, colors.accent)} ${color("✓", colors.success)}`;
  });

  const full = items.join("  ·  ");
  if (visibleWidth(full) <= width) return full;

  // Truncate if too wide
  return truncateToWidth(full, width, "…");
}

/**
 * Render the full header as an array of terminal-safe strings.
 *
 * Layout: compact GSD mark on the left with a command-center status panel on
 * the right. This keeps the splash visual while making the actionable command
 * and workspace state easier to scan.
 */
export function renderHeaderLines(data: HeaderData, width: number): string[] {
  if (width < 40) return renderStackedHeader(data, width);
  const outerWidth = width;
  const innerWidth = Math.max(0, outerWidth - 2);
  const logoLines = GSD_LOGO;
  const logoWidth = Math.max(...logoLines.map((line) => visibleWidth(line)));
  const gap = ` ${color("│", colors.dim)} `;
  const panelWidth = innerWidth - logoWidth - visibleWidth(gap);

  if (panelWidth < 44) {
    return renderStackedHeader(data, width);
  }

  const mcpRow = formatMcpRow(data.mcpServers, Math.max(1, panelWidth - 9)) || color("none configured", colors.dim);
  const panelLines = [
    rightAlign(
      `${color("GSD", colors.accent)} ${bold(color("Project Console", colors.text))}`,
      color("idle", colors.muted),
      panelWidth,
    ),
    rightAlign(
      `${color("Project", colors.muted)} ${color(data.directory, colors.text)}`,
      `${color("Command", colors.muted)} ${color("/gsd start", colors.accent)}`,
      panelWidth,
    ),
    rightAlign(
      `${color("Branch", colors.muted)} ${color(data.branch, colors.text)}`,
      `${color("Mode", colors.muted)} ${color("manual", colors.text)}`,
      panelWidth,
    ),
    rightAlign(
      `${color("MCP", colors.muted)} ${mcpRow}`,
      `${color("Model", colors.muted)} ${color(data.model, colors.text)}`,
      panelWidth,
    ),
    rightAlign(
      `${color("Provider", colors.muted)} ${color(data.provider, colors.text)}`,
      `${color("Workspace", colors.muted)} ${color(data.directory, colors.text)}`,
      panelWidth,
    ),
    rightAlign(
      color("/gsd to begin", colors.accent),
      `${color("/gsd templates", colors.muted)}  ${color("/gsd help", colors.muted)}`,
      panelWidth,
    ),
  ];

  const lines = [
    color("╭" + "─".repeat(Math.max(0, outerWidth - 2)) + "╮", colors.border),
  ];
  for (let i = 0; i < logoLines.length; i++) {
    const logo = padVisible(color(logoLines[i], colors.border), logoWidth);
    lines.push(frameLine(`${logo}${gap}${panelLines[i] ?? ""}`, outerWidth));
  }
  lines.push(color("╰" + "─".repeat(Math.max(0, outerWidth - 2)) + "╯", colors.border));
  return lines;
}

/**
 * Fallback stacked layout for narrow terminals (< 20 cols for info panel).
 */
function renderStackedHeader(data: HeaderData, width: number): string[] {
  const outerWidth = Math.max(0, width);
  if (outerWidth < 3) {
    return [color(truncateToWidth("GSD", outerWidth, ""), colors.accent)];
  }
  const lines: string[] = [color("╭" + "─".repeat(Math.max(0, outerWidth - 2)) + "╮", colors.border)];

  // Title
  lines.push(frameLine(`${color("GSD", colors.accent)} ${bold(color("Project Console", colors.text))}`, outerWidth));

  // Info
  lines.push(frameLine(formatInfoLine("Project", data.directory, outerWidth - 2), outerWidth));
  lines.push(frameLine(formatInfoLine("Command", "/gsd start", outerWidth - 2), outerWidth));
  lines.push(frameLine(formatInfoLine("Branch", data.branch, outerWidth - 2), outerWidth));
  lines.push(frameLine(formatInfoLine("Model", data.model, outerWidth - 2), outerWidth));

  // MCP
  const mcpRow = formatMcpRow(data.mcpServers, Math.max(1, outerWidth - 7));
  if (mcpRow) lines.push(frameLine(`${color("MCP", colors.muted)} ${mcpRow}`, outerWidth));
  lines.push(frameLine(`${color("/gsd to begin", colors.accent)}  ${color("/gsd help", colors.muted)}`, outerWidth));
  lines.push(color("╰" + "─".repeat(Math.max(0, outerWidth - 2)) + "╯", colors.border));

  return lines;
}
