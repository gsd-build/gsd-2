import type { ExtensionContext } from "@gsd/pi-coding-agent";

/** True only when a human-interactive UI is available. */
export function isInteractiveUIContext(ctx: ExtensionContext): boolean {
	if (!ctx.hasUI) return false;

	const ui = ctx.ui as { mode?: string };
	if (ui.mode === "rpc" || ui.mode === "headless") return false;

	const withHeadless = ctx as ExtensionContext & { headless?: boolean };
	if (withHeadless.headless === true) return false;

	return true;
}
