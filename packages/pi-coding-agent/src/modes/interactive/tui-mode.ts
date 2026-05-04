// GSD2 - Adaptive mode selection for the interactive terminal UI

export type TuiMode = "chat" | "workflow" | "validation" | "debug" | "compact";
export type TuiAdaptiveMode = "auto" | TuiMode;

export interface TuiModeContext {
	terminalWidth: number;
	override?: TuiAdaptiveMode;
	gsdPhase?: string;
	activeToolCount?: number;
	hasBlockingError?: boolean;
}

export function resolveTuiMode(context: TuiModeContext): TuiMode {
	if (context.override && context.override !== "auto") return context.override;
	if (context.terminalWidth < 72) return "compact";
	if (context.hasBlockingError) return "debug";

	const phase = context.gsdPhase?.toLowerCase() ?? "";
	if (phase.includes("validat") || phase.includes("complete") || phase.includes("review")) {
		return "validation";
	}

	if ((context.activeToolCount ?? 0) > 0 || phase.length > 0) {
		return "workflow";
	}

	return "chat";
}
