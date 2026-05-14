/**
 * MCP Status — `/gsd mcp` command handler.
 *
 * Shows configured MCP servers, their connection status, and available tools.
 *
 * Subcommands:
 *   /gsd mcp             — Overview of all servers (alias: /gsd mcp status)
 *   /gsd mcp status      — Same as bare /gsd mcp
 *   /gsd mcp check <srv> — Detailed status for a specific server
 *   /gsd mcp init [dir]  — Write project-local GSD workflow MCP config
 *   /gsd mcp trust <srv> — Mark a stdio MCP server as trusted (writes "trust": true)
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ensureProjectWorkflowMcpConfig } from "./mcp-project-config.js";
import { gsdHome } from "./gsd-home.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface McpServerStatus {
  name: string;
  transport: "stdio" | "http" | "unknown";
  connected: boolean;
  toolCount: number;
  error: string | undefined;
}

export interface McpServerDetail extends McpServerStatus {
  tools: string[];
}

export function formatMcpInitResult(
  status: "created" | "updated" | "unchanged",
  configPath: string,
  targetPath: string,
): string {
  const summary =
    status === "created"
      ? "Created project MCP config."
      : status === "updated"
        ? "Updated project MCP config."
        : "Project MCP config is already up to date.";

  return [
    summary,
    "",
    `Project: ${targetPath}`,
    `Config:   ${configPath}`,
    "",
    "Claude Code can now load the GSD workflow MCP server from this folder.",
  ].join("\n");
}

// ─── Config reader (standalone — does not import mcp-client internals) ──────

interface McpServerRawConfig {
  name: string;
  transport: "stdio" | "http" | "unknown";
  command?: string;
  args?: string[];
  url?: string;
}

function readMcpConfigs(): McpServerRawConfig[] {
  const servers: McpServerRawConfig[] = [];
  const seen = new Set<string>();
  const configPaths = [
    join(process.cwd(), ".mcp.json"),
    join(process.cwd(), ".gsd", "mcp.json"),
    join(gsdHome(), "mcp.json"),
  ];

  for (const configPath of configPaths) {
    try {
      if (!existsSync(configPath)) continue;
      const raw = readFileSync(configPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = (data.mcpServers ?? data.servers) as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!mcpServers || typeof mcpServers !== "object") continue;

      for (const [name, config] of Object.entries(mcpServers)) {
        if (seen.has(name)) continue;
        seen.add(name);

        const hasCommand = typeof config.command === "string";
        const hasUrl = typeof config.url === "string";
        const transport: McpServerRawConfig["transport"] = hasCommand
          ? "stdio"
          : hasUrl
            ? "http"
            : "unknown";

        servers.push({
          name,
          transport,
          ...(hasCommand && {
            command: config.command as string,
            args: Array.isArray(config.args) ? (config.args as string[]) : undefined,
          }),
          ...(hasUrl && { url: config.url as string }),
        });
      }
    } catch {
      // Non-fatal — config file may not exist or be malformed
    }
  }

  return servers;
}

// ─── Trust writer (exported for testing) ────────────────────────────────────

/**
 * Write `"trust": true` into a server's entry in its config file. Read-mutate-write,
 * preserving the file's existing top-level key (`mcpServers` vs `servers`) and all
 * other content. Idempotent: an already-trusted server is a no-op.
 */
export function trustMcpServer(
  configPath: string,
  serverName: string,
): { message: string; level: "info" | "warning" | "error" } {
  if (!existsSync(configPath)) {
    return { message: `Config file not found: ${configPath}`, level: "error" };
  }
  const raw = readFileSync(configPath, "utf-8");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return {
      message: `Failed to parse ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      level: "error",
    };
  }
  // Config files may use either `mcpServers` or `servers` — preserve the file's key.
  const key = data.mcpServers ? "mcpServers" : data.servers ? "servers" : "mcpServers";
  const servers = (data[key] ?? {}) as Record<string, Record<string, unknown>>;
  const entry = servers[serverName];
  if (!entry || typeof entry !== "object") {
    return { message: `Server "${serverName}" not found in ${configPath}.`, level: "warning" };
  }
  // The trust flag is only consulted for stdio servers — HTTP servers are never
  // gated — so refuse to write a meaningless flag onto a non-stdio entry. The
  // raw config entry has no `transport` field; a stdio server has a `command`.
  if (typeof entry.command !== "string") {
    return {
      message: `MCP server "${serverName}" uses non-stdio transport; trust can only be set for stdio servers.`,
      level: "warning",
    };
  }
  if (entry.trust === true) {
    return {
      message: `MCP server "${serverName}" is already trusted in ${configPath}.`,
      level: "info",
    };
  }
  entry.trust = true;
  data[key] = servers;
  writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return {
    message:
      `Trusted MCP server "${serverName}" — wrote "trust": true to ${configPath}.\n` +
      `Takes effect on the next GSD session (or run mcp_servers with refresh).`,
    level: "info",
  };
}

// ─── Formatters (exported for testing) ──────────────────────────────────────

export function formatMcpStatusReport(servers: McpServerStatus[]): string {
  if (servers.length === 0) {
    return [
      "No MCP servers configured.",
      "",
      "Add servers to .mcp.json, .gsd/mcp.json, or $GSD_HOME/mcp.json (default: ~/.gsd/mcp.json) to enable MCP integrations.",
      "Tip: run /gsd mcp init . to write the local GSD workflow MCP config.",
      "See: https://modelcontextprotocol.io/quickstart",
    ].join("\n");
  }

  const lines: string[] = [`MCP Server Status — ${servers.length} server(s)\n`];

  for (const s of servers) {
    const icon = s.error ? "✗" : s.connected ? "✓" : "○";
    const status = s.error
      ? `error: ${s.error}`
      : s.connected
        ? `connected — ${s.toolCount} tools`
        : "disconnected";
    lines.push(`  ${icon} ${s.name} (${s.transport}) — ${status}`);
  }

  lines.push("");
  lines.push("Use /gsd mcp check <server> for details on a specific server.");
  lines.push("Use mcp_discover to connect and list tools for a server.");

  return lines.join("\n");
}

export function formatMcpServerDetail(server: McpServerDetail): string {
  const lines: string[] = [`MCP Server: ${server.name}\n`];

  lines.push(`  Transport: ${server.transport}`);

  if (server.error) {
    lines.push(`  Status:    error`);
    lines.push(`  Error:     ${server.error}`);
  } else if (server.connected) {
    lines.push(`  Status:    connected`);
    lines.push(`  Tools:     ${server.toolCount}`);
    if (server.tools.length > 0) {
      lines.push("");
      lines.push("  Available tools:");
      for (const tool of server.tools) {
        lines.push(`    - ${tool}`);
      }
    }
  } else {
    lines.push(`  Status:    disconnected`);
    lines.push("");
    lines.push(`  Run mcp_discover("${server.name}") to connect and list tools.`);
  }

  return lines.join("\n");
}

// ─── Command handler ────────────────────────────────────────────────────────

/**
 * Handle `/gsd mcp [status|check <server>]`.
 */
export async function handleMcpStatus(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const trimmed = args.trim();
  const lowered = trimmed.toLowerCase();
  const configs = readMcpConfigs();

  // /gsd mcp init [dir]
  if (!lowered || lowered === "status") {
    // handled below
  } else if (lowered === "init" || lowered.startsWith("init ")) {
    const rawPath = trimmed.slice("init".length).trim();
    const targetPath = resolve(rawPath || ".");
    try {
      const result = ensureProjectWorkflowMcpConfig(targetPath);
      ctx.ui.notify(formatMcpInitResult(result.status, result.configPath, targetPath), "info");
    } catch (err) {
      ctx.ui.notify(
        `Failed to prepare MCP config for ${targetPath}: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
    return;
  }

  // /gsd mcp check <server>
  if (lowered.startsWith("check ")) {
    const serverName = trimmed.slice("check ".length).trim();
    const config = configs.find((c) => c.name === serverName);
    if (!config) {
      const available = configs.map((c) => c.name).join(", ") || "(none)";
      ctx.ui.notify(
        `Unknown MCP server: "${serverName}"\n\nAvailable: ${available}`,
        "warning",
      );
      return;
    }

    // Try to get connection/tool info from the mcp-client module if available
    let connected = false;
    let toolNames: string[] = [];
    let error: string | undefined;
    try {
      const mcpClient = await import("../mcp-client/index.js");
      // Access the module's connection state if exported; fall back gracefully
      const mod = mcpClient as Record<string, unknown>;
      if (typeof mod.getConnectionStatus === "function") {
        const status = (mod.getConnectionStatus as (name: string) => { connected: boolean; tools: string[]; error?: string })(serverName);
        connected = status.connected;
        toolNames = status.tools;
        error = status.error;
      }
    } catch {
      // mcp-client may not expose status helpers — that's fine
    }

    ctx.ui.notify(
      formatMcpServerDetail({
        name: config.name,
        transport: config.transport,
        connected,
        toolCount: toolNames.length,
        tools: toolNames,
        error,
      }),
      "info",
    );
    return;
  }

  // /gsd mcp trust <server>
  if (lowered.startsWith("trust ")) {
    const serverName = trimmed.slice("trust ".length).trim();
    if (!serverName) {
      ctx.ui.notify("Usage: /gsd mcp trust <server>", "warning");
      return;
    }
    try {
      const mcpClient = await import("../mcp-client/index.js");
      const mod = mcpClient as Record<string, unknown>;
      const readConfigs = mod.readConfigs as
        | (() => Array<{ name: string; sourcePath: string; transport: string; trust?: boolean }>)
        | undefined;
      if (typeof readConfigs !== "function") {
        ctx.ui.notify("MCP client module is unavailable; cannot resolve server config.", "error");
        return;
      }
      const all = readConfigs();
      const server = all.find(
        (s) => s.name === serverName || s.name.toLowerCase() === serverName.toLowerCase(),
      );
      if (!server) {
        const available = all.map((s) => s.name).join(", ") || "(none)";
        ctx.ui.notify(`Unknown MCP server: "${serverName}"\n\nAvailable: ${available}`, "warning");
        return;
      }
      const result = trustMcpServer(server.sourcePath, server.name);
      ctx.ui.notify(result.message, result.level);
    } catch (err) {
      ctx.ui.notify(
        `Failed to trust MCP server "${serverName}": ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
    return;
  }

  // /gsd mcp or /gsd mcp status
  if (!lowered || lowered === "status") {
    // Build status for each server
    const statuses: McpServerStatus[] = [];

    for (const config of configs) {
      let connected = false;
      let toolCount = 0;
      let error: string | undefined;

      try {
        const mcpClient = await import("../mcp-client/index.js");
        const mod = mcpClient as Record<string, unknown>;
        if (typeof mod.getConnectionStatus === "function") {
          const status = (mod.getConnectionStatus as (name: string) => { connected: boolean; tools: string[]; error?: string })(config.name);
          connected = status.connected;
          toolCount = status.tools.length;
          error = status.error;
        }
      } catch {
        // Fall back to unknown state
      }

      statuses.push({
        name: config.name,
        transport: config.transport,
        connected,
        toolCount,
        error,
      });
    }

    ctx.ui.notify(formatMcpStatusReport(statuses), "info");
    return;
  }

  // Unknown subcommand
  ctx.ui.notify(
    "Usage: /gsd mcp [status|check <server>|init [dir]|trust <server>]\n\n" +
    "  status           Show all MCP server statuses (default)\n" +
    "  check <server>   Detailed status for a specific server\n" +
    "  init [dir]       Write .mcp.json for the local GSD workflow MCP server\n" +
    "  trust <server>   Mark a stdio MCP server as trusted (writes \"trust\": true)",
    "warning",
  );
}
