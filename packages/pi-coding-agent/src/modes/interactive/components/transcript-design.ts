// Project/App: GSD-2
// File Purpose: Shared recommended transcript rendering primitives for assistant, tool, command, footer, and auto-mode TUI surfaces.

import { truncateToWidth, visibleWidth } from "@gsd/pi-tui";
import { theme, type ThemeBg, type ThemeColor } from "../theme/theme.js";
import { alignRight, padRight, roundedPanel } from "./tui-style-kit.js";

export type StatusTone = "running" | "success" | "error" | "warning" | "muted";

export function chatMessageWidth(width: number): number {
	return Math.max(24, Math.min(width, Math.floor(width * 0.72)));
}

function trimOuterBlankLines(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start].trim().length === 0) start++;
	while (end > start && lines[end - 1].trim().length === 0) end--;
	return lines.slice(start, end);
}

function toneColor(tone: StatusTone): ThemeColor {
	switch (tone) {
		case "running": return "toolRunning";
		case "success": return "border";
		case "error": return "toolError";
		case "warning": return "warning";
		case "muted":
		default: return "toolMuted";
	}
}

export function rightAlign(left: string, right: string, width: number): string {
	return alignRight(left, right, width);
}

export function renderAssistantRail(
	lines: string[],
	width: number,
	opts: { label: string; meta?: string; railColor?: ThemeColor } = { label: "GSD" },
): string[] {
	const outerWidth = Math.max(20, width);
	const indent = "  ";
	const rail = theme.fg(opts.railColor ?? "borderAccent", "┃");
	const blockWidth = Math.max(1, outerWidth - visibleWidth(indent));
	const contentWidth = Math.max(1, blockWidth - 2);
	const header = opts.meta
		? `${theme.fg("borderAccent", theme.bold(opts.label))} ${theme.fg("dim", opts.meta)}`
		: theme.fg("borderAccent", theme.bold(opts.label));
	const source = lines.length > 0 ? lines : [""];
	const row = (line: string) => `${indent}${theme.bg("customMessageBg", padRight(`${rail} ${line}`, blockWidth))}`;
	return [
		row(""),
		row(truncateToWidth(header, contentWidth, "")),
		...source.map((line) => row(truncateToWidth(line, contentWidth, ""))),
		row(""),
	];
}

export function renderUserRail(
	lines: string[],
	width: number,
	opts: { label: string; meta?: string },
): string[] {
	const outerWidth = Math.max(20, width);
	const maxMessageWidth = chatMessageWidth(outerWidth);
	const rawBodyLines = trimOuterBlankLines(lines).length > 0 ? trimOuterBlankLines(lines) : [""];
	const rail = theme.fg("border", "┃");
	const contentWidth = Math.max(1, Math.min(maxMessageWidth, outerWidth - 2));
	const header = opts.meta
		? `${theme.fg("border", theme.bold(opts.label))} ${theme.fg("dim", opts.meta)}`
		: theme.fg("border", theme.bold(opts.label));
	const bodyLines = rawBodyLines.map((line) =>
		theme.fg("userMessageText", truncateToWidth(line.trimEnd(), contentWidth, ""))
	);
	const row = (line: string) => theme.bg("userMessageBg", padRight(`${rail} ${line}`, outerWidth));
	return [
		row(""),
		row(truncateToWidth(header, contentWidth, "")),
		...bodyLines.map((line) => row(truncateToWidth(line, contentWidth, ""))),
		row(""),
	];
}

function cardRow(line: string, contentWidth: number, paddingX: number, border: (text: string) => string): string {
	const padded = " ".repeat(paddingX) + padRight(line, contentWidth) + " ".repeat(paddingX);
	return `${border("│")}${padded}${border("│")}`;
}

export function renderTranscriptCard(
	lines: string[],
	width: number,
	opts: {
		title: string;
		right?: string;
		tone: StatusTone;
		footerLeft?: string;
		footerRight?: string;
	},
): string[] {
	const outerWidth = Math.max(20, width);
	const innerWidth = Math.max(1, outerWidth - 2);
	const paddingX = 2;
	const contentWidth = Math.max(1, innerWidth - paddingX * 2);
	const borderColor = toneColor(opts.tone);
	const border = (text: string) => theme.fg(borderColor, text);
	const title = theme.fg("borderAccent", opts.title);
	const right = opts.right ? theme.fg(toneColor(opts.tone), opts.right) : "";
	const header = rightAlign(title, right, contentWidth);
	const body = lines.map((line) => padRight(line, contentWidth));
	const footer =
		opts.footerLeft || opts.footerRight
			? [rightAlign(theme.fg("dim", opts.footerLeft ?? ""), theme.fg("dim", opts.footerRight ?? ""), contentWidth)]
			: [];
	return [
		border("╭" + "─".repeat(outerWidth - 2) + "╮"),
		cardRow(header, contentWidth, paddingX, border),
		...body.map((line) => cardRow(line, contentWidth, paddingX, border)),
		...footer.map((line) => cardRow(line, contentWidth, paddingX, border)),
		border("╰" + "─".repeat(outerWidth - 2) + "╯"),
	];
}

export function renderToolLineCard(
	title: string,
	target: string | undefined,
	width: number,
	opts: { status: string; tone: StatusTone; hidden?: boolean; titlePrefix?: string; bg?: ThemeBg },
): string[] {
	const outerWidth = Math.max(20, width);
	const innerWidth = Math.max(1, outerWidth - 2);
	const paddingX = 2;
	const contentWidth = Math.max(1, innerWidth - paddingX * 2);
	const borderColor = toneColor(opts.tone);
	const border = (text: string) => theme.fg(borderColor, text);
	const titleText = `${opts.titlePrefix ?? ""}${theme.fg("borderAccent", title)}`;
	const targetText = target ? ` ${theme.fg("text", target)}` : "";
	const left = `${titleText}${targetText}`;
	const statusText = opts.hidden
		? `${opts.status} · output hidden · ctrl+o expand`
		: opts.status;
	const right = theme.fg(opts.tone === "success" ? "success" : borderColor, statusText);
	const line = rightAlign(left, right, contentWidth);
	const row = cardRow(line, contentWidth, paddingX, border);
	return [
		border("╭" + "─".repeat(outerWidth - 2) + "╮"),
		opts.bg ? theme.bg(opts.bg, row) : row,
		border("╰" + "─".repeat(outerWidth - 2) + "╯"),
	];
}

export function renderCommandCard(
	command: string,
	width: number,
	opts: { status: string; tone: StatusTone; progress?: string },
): string[] {
	const outerWidth = Math.max(20, width);
	const innerWidth = Math.max(1, outerWidth - 2);
	const paddingX = 2;
	const contentWidth = Math.max(1, innerWidth - paddingX * 2);
	const borderColor = toneColor(opts.tone);
	const left = `${theme.fg("accent", "$")} ${theme.fg("text", command)}`;
	const statusText = opts.progress
		? `${opts.progress} ${opts.status}`
		: `${opts.status} · output hidden · ctrl+o expand`;
	const right = theme.fg(opts.tone === "success" ? "success" : borderColor, statusText);
	const line = rightAlign(left, right, contentWidth);
	const border = (text: string) => theme.fg(borderColor, text);
	return [
		border("╭" + "─".repeat(outerWidth - 2) + "╮"),
		cardRow(line, contentWidth, paddingX, border),
		border("╰" + "─".repeat(outerWidth - 2) + "╯"),
	];
}

export function renderProgressBar(done: number, total: number, width: number, tone: StatusTone = "success"): string {
	const clampedWidth = Math.max(0, width);
	const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
	const filled = Math.round(pct * clampedWidth);
	return (
		theme.fg(toneColor(tone), "█".repeat(filled)) +
		theme.fg("dim", "░".repeat(clampedWidth - filled))
	);
}

export function renderFooterStrip(leftSegments: string[], right: string, width: number): string[] {
	const outerWidth = Math.max(20, width);
	const innerWidth = Math.max(1, outerWidth - 2);
	const sep = theme.fg("dim", "  │  ");
	const rightStyled = theme.fg("dim", right);
	const rightWidth = visibleWidth(rightStyled);
	const leftBudget = right ? Math.max(1, innerWidth - rightWidth - 3) : innerWidth;
	const left = truncateToWidth(leftSegments.filter(Boolean).join(sep), leftBudget, "");
	const content = rightAlign(left, rightStyled, innerWidth);
	return roundedPanel([content], outerWidth);
}
