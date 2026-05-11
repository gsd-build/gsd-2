// Project/App: GSD-2
// File Purpose: Lip Gloss-inspired terminal layout primitives for GSD interactive TUI surfaces.

import { truncateToWidth, visibleWidth } from "@gsd/pi-tui";
import { theme, type ThemeColor } from "../theme/theme.js";

export type TuiTone = "default" | "accent" | "success" | "warning" | "error" | "muted";

export type TuiBreakpoint = "compact" | "regular" | "wide";

export function breakpoint(width: number): TuiBreakpoint {
	if (width < 72) return "compact";
	if (width < 112) return "regular";
	return "wide";
}

export function padRight(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width), "");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export function alignRight(left: string, right: string, width: number): string {
	if (width <= 0) return "";
	if (!right) return truncateToWidth(left, width, "");
	const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
	return truncateToWidth(left + " ".repeat(gap) + right, width, "");
}

export function toneColor(tone: TuiTone): ThemeColor {
	switch (tone) {
		case "accent": return "borderAccent";
		case "success": return "success";
		case "warning": return "warning";
		case "error": return "error";
		case "muted": return "borderMuted";
		case "default":
		default: return "border";
	}
}

export function badge(text: string, tone: TuiTone = "default"): string {
	return theme.fg(toneColor(tone), text);
}

export function keyValue(label: string, value: string, valueColor: ThemeColor = "text", labelWidth = 10): string {
	return `${theme.fg("dim", label.padEnd(labelWidth))}${theme.fg(valueColor, value)}`;
}

export function roundedPanel(
	lines: string[],
	width: number,
	opts: {
		tone?: TuiTone;
		title?: string;
		rightTitle?: string;
		paddingX?: number;
	} = {},
): string[] {
	const outerWidth = Math.max(1, width);
	const paddingX = Math.max(0, opts.paddingX ?? 0);
	const borderColor = toneColor(opts.tone ?? "default");
	const border = (text: string) => theme.fg(borderColor, text);
	const title = opts.title ? theme.fg("borderAccent", opts.title) : "";
	const rightTitle = opts.rightTitle ? theme.fg("dim", opts.rightTitle) : "";
	const body = lines.length > 0 ? lines : [""];

	if (outerWidth < 3) {
		return body.map((line) => truncateToWidth(line, outerWidth, ""));
	}

	const innerWidth = Math.max(1, outerWidth - 2);
	const contentWidth = Math.max(1, innerWidth - paddingX * 2);

	const renderedBody = body.map((line) => {
		const padded = " ".repeat(paddingX) + padRight(line, contentWidth) + " ".repeat(paddingX);
		return `${border("│")}${padRight(padded, innerWidth)}${border("│")}`;
	});

	if (!title && !rightTitle) {
		return [
			border("╭" + "─".repeat(outerWidth - 2) + "╮"),
			...renderedBody,
			border("╰" + "─".repeat(outerWidth - 2) + "╯"),
		];
	}

	const header = alignRight(title, rightTitle, innerWidth);
	return [
		border("╭" + "─".repeat(outerWidth - 2) + "╮"),
		`${border("│")}${padRight(header, innerWidth)}${border("│")}`,
		...renderedBody,
		border("╰" + "─".repeat(outerWidth - 2) + "╯"),
	];
}
