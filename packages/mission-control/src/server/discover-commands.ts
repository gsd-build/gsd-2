/**
 * Discover user custom slash commands from filesystem.
 *
 * Scans two directories:
 * - ~/.claude/commands/ (user-global custom commands)
 * - .claude/commands/ (project-local custom commands)
 *
 * Each .md file becomes a command: filename minus .md is the command name.
 * E.g., ~/.claude/commands/deploy.md -> /deploy
 */
import { readdir } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import { homedir } from "node:os";
import type { SlashCommand } from "../lib/slash-commands";

/**
 * Scan a directory for .md files and return them as SlashCommand entries.
 * Returns empty array if directory doesn't exist.
 */
async function scanCommandDir(dir: string): Promise<SlashCommand[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && extname(e.name) === ".md")
      .map((e) => {
        const name = basename(e.name, ".md");
        return {
          command: `/${name}`,
          description: `Custom command (${dir.includes(".claude/commands") ? "project" : "user"})`,
          args: "",
          source: "custom" as const,
        };
      });
  } catch {
    // Directory doesn't exist or not readable -- that's fine
    return [];
  }
}

/**
 * Discover all user custom commands from both global and project directories.
 * @param repoRoot - Project root for .claude/commands/ lookup
 */
export async function discoverCustomCommands(repoRoot: string): Promise<SlashCommand[]> {
  const globalDir = resolve(homedir(), ".claude", "commands");
  const projectDir = resolve(repoRoot, ".claude", "commands");

  const [globalCmds, projectCmds] = await Promise.all([
    scanCommandDir(globalDir),
    scanCommandDir(projectDir),
  ]);

  // Deduplicate: project commands override global with same name
  const seen = new Set<string>();
  const result: SlashCommand[] = [];

  for (const cmd of projectCmds) {
    seen.add(cmd.command);
    result.push({ ...cmd, description: "Custom command (project)" });
  }

  for (const cmd of globalCmds) {
    if (!seen.has(cmd.command)) {
      result.push({ ...cmd, description: "Custom command (user)" });
    }
  }

  return result;
}
