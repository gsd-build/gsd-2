/**
 * Slash command registry with prefix filtering.
 *
 * Three sources:
 * 1. GSD workflow commands (/gsd:*)
 * 2. Native Claude Code commands (/help, /clear, etc.)
 * 3. User custom commands from ~/.claude/commands/ and .claude/commands/
 *
 * Pure data module -- no server imports. Used by ChatInput for autocomplete.
 */

export interface SlashCommand {
  command: string;
  description: string;
  args: string;
  source: "gsd" | "claude" | "custom";
}

export const GSD_COMMANDS: SlashCommand[] = [
  { command: "/gsd:new-project", description: "Full initialization", args: "[--auto]", source: "gsd" },
  { command: "/gsd:discuss-phase", description: "Capture decisions before planning", args: "[N] [--auto]", source: "gsd" },
  { command: "/gsd:plan-phase", description: "Research + plan + verify", args: "[N] [--auto]", source: "gsd" },
  { command: "/gsd:execute-phase", description: "Execute all plans in waves", args: "<N>", source: "gsd" },
  { command: "/gsd:verify-work", description: "Manual acceptance testing", args: "[N]", source: "gsd" },
  { command: "/gsd:progress", description: "Where am I? What's next?", args: "", source: "gsd" },
  { command: "/gsd:help", description: "Show all commands", args: "", source: "gsd" },
  { command: "/gsd:quick", description: "Ad-hoc task with guarantees", args: "[--full] [--discuss]", source: "gsd" },
  { command: "/gsd:pause-work", description: "Create handoff", args: "", source: "gsd" },
  { command: "/gsd:resume-work", description: "Restore session", args: "", source: "gsd" },
  { command: "/gsd:settings", description: "Configure workflow", args: "", source: "gsd" },
  { command: "/gsd:debug", description: "Systematic debugging", args: "[desc]", source: "gsd" },
  { command: "/gsd:health", description: "Validate .planning/ integrity", args: "[--repair]", source: "gsd" },
  { command: "/gsd:add-phase", description: "Append phase to roadmap", args: "", source: "gsd" },
  { command: "/gsd:insert-phase", description: "Insert urgent work", args: "[N]", source: "gsd" },
  { command: "/gsd:complete-milestone", description: "Archive milestone, tag release", args: "", source: "gsd" },
  { command: "/gsd:new-milestone", description: "Start next version", args: "[name]", source: "gsd" },
  { command: "/gsd:map-codebase", description: "Analyze existing codebase", args: "", source: "gsd" },
  { command: "/gsd:audit-milestone", description: "Verify milestone done criteria", args: "", source: "gsd" },
  { command: "/gsd:add-todo", description: "Capture idea for later", args: "[desc]", source: "gsd" },
  { command: "/gsd:check-todos", description: "List pending todos", args: "", source: "gsd" },
  { command: "/gsd:update", description: "Update GSD", args: "", source: "gsd" },
];

export const CLAUDE_CODE_COMMANDS: SlashCommand[] = [
  { command: "/help", description: "Show available commands", args: "", source: "claude" },
  { command: "/clear", description: "Clear conversation history", args: "", source: "claude" },
  { command: "/compact", description: "Compact conversation to save context", args: "[instructions]", source: "claude" },
  { command: "/model", description: "Switch or display current model", args: "[model-name]", source: "claude" },
  { command: "/cost", description: "Show token usage and cost", args: "", source: "claude" },
  { command: "/login", description: "Log in to your account", args: "", source: "claude" },
  { command: "/logout", description: "Log out of your account", args: "", source: "claude" },
  { command: "/doctor", description: "Check Claude Code health", args: "", source: "claude" },
  { command: "/permissions", description: "View or modify permissions", args: "", source: "claude" },
  { command: "/memory", description: "Edit CLAUDE.md memory files", args: "", source: "claude" },
  { command: "/review", description: "Review a pull request", args: "[pr-url]", source: "claude" },
  { command: "/terminal-setup", description: "Install terminal integration", args: "", source: "claude" },
  { command: "/bug", description: "Report a bug", args: "", source: "claude" },
  { command: "/status", description: "Show status of current session", args: "", source: "claude" },
  { command: "/config", description: "View or modify configuration", args: "[key] [value]", source: "claude" },
  { command: "/listen", description: "Listen for terminal commands", args: "", source: "claude" },
  { command: "/mcp", description: "Manage MCP servers", args: "[subcommand]", source: "claude" },
  { command: "/vim", description: "Enter vim mode", args: "", source: "claude" },
  { command: "/init", description: "Initialize CLAUDE.md in project", args: "", source: "claude" },
  { command: "/pr-comments", description: "View PR comments", args: "", source: "claude" },
  { command: "/add-dir", description: "Add directory to context", args: "<path>", source: "claude" },
  { command: "/release-notes", description: "Generate release notes", args: "", source: "claude" },
];

/** Mutable store for dynamically discovered custom commands. */
let customCommands: SlashCommand[] = [];

/**
 * Set custom commands discovered from ~/.claude/commands/ and .claude/commands/.
 * Called from server-side discovery, passed to client via initial state or API.
 */
export function setCustomCommands(commands: SlashCommand[]): void {
  customCommands = commands;
}

/**
 * Get all registered custom commands.
 */
export function getCustomCommands(): SlashCommand[] {
  return customCommands;
}

/**
 * Get all available slash commands from all three sources.
 */
export function getAllCommands(): SlashCommand[] {
  return [...GSD_COMMANDS, ...CLAUDE_CODE_COMMANDS, ...customCommands];
}

// Legacy type alias for backward compat
export type GsdCommand = SlashCommand;

/**
 * Filter commands by prefix across all sources (GSD, Claude Code, custom).
 * Returns all commands if input is just "/".
 * Returns empty array if input doesn't start with "/".
 */
export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const all = getAllCommands();
  if (input === "/") return all;
  return all.filter((c) => c.command.startsWith(input));
}
