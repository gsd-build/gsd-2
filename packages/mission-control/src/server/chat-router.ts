/**
 * Chat message router.
 * Routes user input: /gsd: prefixed commands are handled locally,
 * everything else is dispatched to Claude Code as a prompt.
 *
 * Pure functions, no side effects, sub-millisecond execution.
 */

export type RouteResult =
  | { type: "command"; command: string; args: string }
  | { type: "prompt"; prompt: string };

const GSD_PREFIX = "/gsd:";

/**
 * Check if input is a GSD slash command.
 * Trims leading whitespace before checking.
 */
export function isGsdCommand(input: string): boolean {
  return input.trimStart().startsWith(GSD_PREFIX);
}

/**
 * Route a message to either a local command handler or Claude Code prompt.
 * For /gsd: commands: extracts command name and remaining args.
 * For everything else: returns as a prompt for Claude Code.
 */
export function routeMessage(input: string): RouteResult {
  const trimmed = input.trimStart();

  if (trimmed.startsWith(GSD_PREFIX)) {
    const afterPrefix = trimmed.slice(GSD_PREFIX.length);
    const spaceIdx = afterPrefix.indexOf(" ");

    if (spaceIdx === -1) {
      return { type: "command", command: afterPrefix, args: "" };
    }

    return {
      type: "command",
      command: afterPrefix.slice(0, spaceIdx),
      args: afterPrefix.slice(spaceIdx + 1).trim(),
    };
  }

  return { type: "prompt", prompt: input };
}
