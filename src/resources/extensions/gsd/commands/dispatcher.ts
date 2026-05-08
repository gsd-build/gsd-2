import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { GSDNoProjectError, withCommandCwd } from "./context.js";
import { handleAutoCommand } from "./handlers/auto.js";
import { handleCoreCommand } from "./handlers/core.js";
import { handleOpsCommand } from "./handlers/ops.js";
import { handleParallelCommand } from "./handlers/parallel.js";
import { handleWorkflowCommand } from "./handlers/workflow.js";

export async function handleGSDCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const trimmed = (typeof args === "string" ? args : "").trim();

  const handlers = [
    () => handleCoreCommand(trimmed, ctx, pi),
    () => handleAutoCommand(trimmed, ctx, pi),
    () => handleParallelCommand(trimmed, ctx, pi),
    () => handleWorkflowCommand(trimmed, ctx, pi),
    () => handleOpsCommand(trimmed, ctx, pi),
  ];

  let handled = false;
  try {
    handled = await withCommandCwd(ctx.cwd, async () => {
      for (const handler of handlers) {
        if (await handler()) {
          return true;
        }
      }
      return false;
    });
  } catch (err) {
    if (err instanceof GSDNoProjectError) {
      ctx.ui.notify(
        `${err.message} \`cd\` into a project directory first.`,
        "warning",
      );
      return;
    }
    throw err;
  }

  if (handled) return;

  if (trimmed.includes(" ")) {
    const { handleDo } = await import("../commands-do.js");
    await handleDo(trimmed, ctx, pi);
    return;
  }

  ctx.ui.notify(`Unknown: /gsd ${trimmed}. Run /gsd help for available commands.`, "warning");
}
