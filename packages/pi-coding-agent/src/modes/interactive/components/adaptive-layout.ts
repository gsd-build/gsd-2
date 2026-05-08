// GSD2 - Adaptive terminal mode dashboard for the interactive TUI

import { style, truncateToWidth, visibleWidth, type Component } from "@gsd/pi-tui";
import type { TuiAdaptiveMode, TuiMode } from "../tui-mode.js";
import { resolveTuiMode } from "../tui-mode.js";
import { theme, type ThemeColor } from "../theme/theme.js";

export interface AdaptiveLayoutState {
	override: TuiAdaptiveMode;
	activeToolCount: number;
	gsdPhase?: string;
	lastError?: string;
	sessionName?: string;
	cwd: string;
}

export class AdaptiveLayoutComponent implements Component {
	constructor(private readonly getState: () => AdaptiveLayoutState) {}

	invalidate(): void {}

	render(width: number): string[] {
		const state = this.getState();
		const mode = resolveTuiMode({
			terminalWidth: width,
			override: state.override,
			activeToolCount: state.activeToolCount,
			gsdPhase: state.gsdPhase,
			hasBlockingError: !!state.lastError,
		});

		if (state.override === "auto" && mode === "chat" && !state.gsdPhase && !state.lastError && state.activeToolCount === 0) {
			return [];
		}

		if (mode === "compact" || width < 72) return this.renderCompact(width, mode, state);
		if (mode === "debug") return this.renderDebug(width, state);
		if (mode === "validation") return this.renderValidation(width, state);
		if (mode === "workflow") return this.renderWorkflow(width, state);
		return this.renderChat(width, state);
	}

	private renderWorkflow(width: number, state: AdaptiveLayoutState): string[] {
		if (width < 112) return this.renderCompact(width, "workflow", state);

		const leftWidth = Math.max(44, Math.floor(width * 0.56));
		const rightWidth = Math.max(32, width - leftWidth - 2);
		const phase = state.gsdPhase ?? "Ready";
		const left = this.frame(
			[
				this.metric("Active", phase, "modeWorkflow"),
				this.metric("Tools", state.activeToolCount > 0 ? `${state.activeToolCount} running` : "idle", "toolRunning"),
				this.metric("Mode", state.override === "auto" ? "auto workflow" : state.override, "modeWorkflow"),
			],
			leftWidth,
			"GSD Command Center",
			"workflow",
			"modeWorkflow",
		);
		const right = this.frame(
			[
				`Session ${state.sessionName ?? "current"}`,
				`Path ${this.basename(state.cwd)}`,
				`Next ${state.activeToolCount > 0 ? "watch tool output" : "continue from prompt"}`,
			],
			rightWidth,
			"signals",
			"inspector",
			"surfaceAccent",
		);
		return this.columns(left, right, leftWidth);
	}

	private renderValidation(width: number, state: AdaptiveLayoutState): string[] {
		const phase = state.gsdPhase ?? "Validation pending";
		return this.frame(
			[
				this.metric("Focus", phase, "modeValidation"),
				this.metric("Checks", state.activeToolCount > 0 ? `${state.activeToolCount} active` : "waiting", "toolRunning"),
				this.metric("Timeline", state.lastError ? "blocked" : "ready for completion evidence", state.lastError ? "toolError" : "toolSuccess"),
			],
			width,
			"validation",
			state.override === "auto" ? "auto" : state.override,
			"modeValidation",
		);
	}

	private renderDebug(width: number, state: AdaptiveLayoutState): string[] {
		const error = state.lastError ?? "Blocking error detected";
		return this.frame(
			[
				this.metric("Failure", truncateToWidth(error, Math.max(20, width - 20), ""), "toolError"),
				this.metric("Tools", state.activeToolCount > 0 ? `${state.activeToolCount} still running` : "none running", "toolRunning"),
				this.metric("Next", "inspect the failed output, then retry the smallest step", "modeDebug"),
			],
			width,
			"blocking failure",
			"debug",
			"modeDebug",
		);
	}

	private renderChat(width: number, state: AdaptiveLayoutState): string[] {
		return this.frame(
			[
				this.metric("Mode", state.override === "auto" ? "auto chat" : state.override, "surfaceAccent"),
				this.metric("Tools", state.activeToolCount > 0 ? `${state.activeToolCount} active` : "compact rows", "toolMuted"),
			],
			width,
			"chat",
			state.sessionName ?? "conversation",
			"surfaceAccent",
		);
	}

	private renderCompact(width: number, mode: TuiMode, state: AdaptiveLayoutState): string[] {
		const phase = state.lastError ?? state.gsdPhase ?? (state.activeToolCount > 0 ? `${state.activeToolCount} tools` : "ready");
		const line = `${theme.fg("modeCompact", "GSD compact")} ${theme.fg("surfaceMuted", `${mode} · ${phase}`)}`;
		return style()
			.border("minimal")
			.borderColor((text) => theme.fg("surfaceBorder", text))
			.bodyGutter(" ")
			.render([line], width);
	}

	private frame(lines: string[], width: number, title: string, rightTitle: string, accent: ThemeColor): string[] {
		return style()
			.border("rule")
			.density("compact")
			.toneColor((text) => theme.fg("surfaceMuted", text))
			.borderColor((text) => theme.fg("surfaceBorder", text))
			.title(theme.fg("surfaceTitle", title))
			.rightTitle(theme.fg(accent, rightTitle))
			.bodyGutter(theme.fg(accent, "│ "))
			.render(lines, width);
	}

	private metric(label: string, value: string, color: ThemeColor): string {
		return `${theme.fg("surfaceMuted", `${label.padEnd(8)} `)}${theme.fg(color, value)}`;
	}

	private columns(left: string[], right: string[], leftWidth: number): string[] {
		const rows = Math.max(left.length, right.length);
		const output: string[] = [];
		for (let i = 0; i < rows; i++) {
			const leftLine = left[i] ?? "";
			const rightLine = right[i] ?? "";
			const gap = " ".repeat(Math.max(2, leftWidth - visibleWidth(leftLine) + 2));
			output.push(`${leftLine}${gap}${rightLine}`);
		}
		return output;
	}

	private basename(cwd: string): string {
		const trimmed = cwd.replace(/\/+$/, "");
		const slash = trimmed.lastIndexOf("/");
		return slash === -1 ? trimmed : trimmed.slice(slash + 1);
	}
}
