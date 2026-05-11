// Project/App: GSD-2
// File Purpose: Shared terminal rendering helpers for GSD extension TUI surfaces.

import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@gsd/pi-tui";

export interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

export function safeLine(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  return truncateToWidth(text, width, ellipsis);
}

export function padRightVisible(text: string, width: number): string {
  if (width <= 0) return "";
  const truncated = safeLine(text, width);
  const pad = Math.max(0, width - visibleWidth(truncated));
  return truncated + " ".repeat(pad);
}

export function rightAlign(left: string, right: string, width: number): string {
  if (width <= 0) return "";
  if (!right) return safeLine(left, width);
  if (!left) return safeLine(" ".repeat(Math.max(0, width - visibleWidth(right))) + right, width);
  const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
  return safeLine(left + " ".repeat(gap) + right, width);
}

export function wrapVisibleText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  return wrapTextWithAnsi(text, width).map((line) =>
    visibleWidth(line) > width ? truncateToWidth(line, width, "…") : line,
  );
}

export function renderBar(theme: ThemeLike, width: number, color = "muted"): string {
  return safeLine(theme.fg(color, "─".repeat(Math.max(0, width))), width, "");
}

export function renderKeyHints(theme: ThemeLike, hints: string[], width: number): string {
  return safeLine(theme.fg("dim", hints.filter(Boolean).join("  │  ")), width);
}

export function renderProgressBar(
  theme: ThemeLike,
  done: number,
  total: number,
  width: number,
  options: {
    filledColor?: string;
    emptyColor?: string;
    filledChar?: string;
    emptyChar?: string;
  } = {},
): string {
  const barWidth = Math.max(0, width);
  const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const filled = Math.round(pct * barWidth);
  const filledChar = options.filledChar ?? "█";
  const emptyChar = options.emptyChar ?? "░";
  return (
    theme.fg(options.filledColor ?? "success", filledChar.repeat(filled)) +
    theme.fg(options.emptyColor ?? "dim", emptyChar.repeat(barWidth - filled))
  );
}

export function statusGlyph(
  theme: ThemeLike,
  level: "active" | "idle" | "warning" | "error" | "success",
): string {
  switch (level) {
    case "active": return theme.fg("success", "●");
    case "success": return theme.fg("success", "✓");
    case "warning": return theme.fg("warning", "!");
    case "error": return theme.fg("error", "x");
    case "idle":
    default: return theme.fg("dim", "○");
  }
}

export function renderFrame(
  theme: ThemeLike,
  inner: string[],
  width: number,
  options: { borderColor?: string; paddingX?: number } = {},
): string[] {
  if (width < 4) return inner.map((line) => safeLine(line, width));

  const borderColor = options.borderColor ?? "borderAccent";
  const paddingX = Math.max(0, options.paddingX ?? 1);
  const contentWidth = Math.max(0, width - 2 - paddingX * 2);
  const border = (text: string) => theme.fg(borderColor, text);
  const pad = " ".repeat(paddingX);

  const lines = [border("╭" + "─".repeat(width - 2) + "╮")];
  for (const line of inner) {
    lines.push(
      border("│") +
      pad +
      padRightVisible(line, contentWidth) +
      pad +
      border("│"),
    );
  }
  lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
  return lines.map((line) => safeLine(line, width, ""));
}
