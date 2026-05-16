import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

/**
 * True only when prompts can reach a human operator.
 *
 * `ctx.hasUI` only means a UI implementation is bound. In RPC/headless modes,
 * prompts are auto-answered and should not be treated as interactive.
 */
export function isInteractiveUIContext(ctx: ExtensionCommandContext): boolean {
	if (!ctx.hasUI) return false;

	const uiMode = (ctx.ui as { mode?: string } | undefined)?.mode;
	if (uiMode === "rpc" || uiMode === "headless") return false;

	if ((ctx as { headless?: boolean }).headless === true) return false;

	return true;
}
