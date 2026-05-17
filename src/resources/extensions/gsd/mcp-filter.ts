import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ClaudeCodeMcpConfig } from "./preferences-types.js";
import { resolveModelMcpConfig } from "./preferences-mcp.js";

interface McpJsonFile {
  mcpServers?: Record<string, unknown>;
}

interface ClaudeSettingsFile {
  mcpServers?: Record<string, unknown>;
}

export function discoverMcpServerNames(projectDir: string): string[] {
  const mcpJsonPath = resolve(projectDir, ".mcp.json");
  const settingsPath = resolve(projectDir, ".claude", "settings.json");

  let mcpJsonServers: string[] = [];
  if (existsSync(mcpJsonPath)) {
    const raw = readFileSync(mcpJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as McpJsonFile;
    mcpJsonServers = Object.keys(parsed.mcpServers ?? {});
  }

  let settingsServers: string[] = [];
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(raw) as ClaudeSettingsFile;
      if (parsed.mcpServers) {
        settingsServers = Object.keys(parsed.mcpServers);
      }
    } catch {
      // settings.json parse errors are silently ignored
    }
  }

  return [...new Set([...mcpJsonServers, ...settingsServers])];
}

export function computeMcpDisallowedTools(
  modelId: string,
  mcpConfig: ClaudeCodeMcpConfig | undefined,
  discoveredServers: string[],
  workflowServerName: string | undefined,
): string[] {
  if (!mcpConfig) return [];

  const entry = resolveModelMcpConfig(modelId, mcpConfig);
  if (!entry) return [];

  const allServers = [...discoveredServers, ...(workflowServerName ? [workflowServerName] : [])];
  const blocked = new Set<string>();

  // Allowlist phase: block every server NOT in the allowlist (except workflowServerName)
  if (entry.allowed_servers !== undefined) {
    const allowSet = new Set(entry.allowed_servers);
    for (const server of allServers) {
      if (server === workflowServerName) continue;
      if (!allowSet.has(server)) {
        blocked.add(server);
      }
    }
  }

  // Blocklist phase: explicitly blocked servers are added
  if (entry.blocked_servers !== undefined) {
    for (const server of entry.blocked_servers) {
      blocked.add(server);
    }
  }

  // gsd-workflow implicit allow: remove unless explicitly in blocked_servers
  if (workflowServerName && !(entry.blocked_servers ?? []).includes(workflowServerName)) {
    blocked.delete(workflowServerName);
  }

  return [...blocked].map((name) => `mcp__${name}__*`);
}
