/**
 * Pure GSD health widget logic.
 *
 * Separates project-state detection and line rendering from the widget's
 * runtime integrations so the regressions can be tested directly.
 */

import { existsSync } from "node:fs";
import { detectProjectState } from "./detection.js";
import { gsdRoot } from "./paths.js";

export type HealthWidgetProjectState = "none" | "initialized" | "active";

export interface HealthWidgetData {
  projectState: HealthWidgetProjectState;
  budgetCeiling: number | undefined;
  budgetSpent: number;
  providerIssue: string | null;
  environmentErrorCount: number;
  environmentWarningCount: number;
  lastRefreshed: number;
}

export function detectHealthWidgetProjectState(basePath: string): HealthWidgetProjectState {
  if (!existsSync(gsdRoot(basePath))) return "none";

  const { state } = detectProjectState(basePath);
  return state === "v2-gsd" ? "active" : "initialized";
}

function formatCost(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `${(n * 100).toFixed(1)}¢`;
}

/**
 * Build compact health lines for the widget.
 * Returns a string array suitable for setWidget().
 */
export function buildHealthLines(data: HealthWidgetData): string[] {
  if (data.projectState === "none") {
    return ["  GSD  No project loaded — run /gsd to start"];
  }

  if (data.projectState === "initialized") {
    return ["  GSD  Project initialized — run /gsd to continue setup"];
  }

  const parts: string[] = [];

  const totalIssues = data.environmentErrorCount + data.environmentWarningCount + (data.providerIssue ? 1 : 0);
  if (totalIssues === 0) {
    parts.push("● System OK");
  } else if (data.environmentErrorCount > 0 || data.providerIssue?.includes("✗")) {
    parts.push(`✗ ${totalIssues} issue${totalIssues > 1 ? "s" : ""}`);
  } else {
    parts.push(`⚠ ${totalIssues} warning${totalIssues > 1 ? "s" : ""}`);
  }

  if (data.budgetCeiling !== undefined && data.budgetCeiling > 0) {
    const pct = Math.min(100, (data.budgetSpent / data.budgetCeiling) * 100);
    parts.push(`Budget: ${formatCost(data.budgetSpent)}/${formatCost(data.budgetCeiling)} (${pct.toFixed(0)}%)`);
  } else if (data.budgetSpent > 0) {
    parts.push(`Spent: ${formatCost(data.budgetSpent)}`);
  }

  if (data.providerIssue) {
    parts.push(data.providerIssue);
  }

  if (data.environmentErrorCount > 0) {
    parts.push(`Env: ${data.environmentErrorCount} error${data.environmentErrorCount > 1 ? "s" : ""}`);
  } else if (data.environmentWarningCount > 0) {
    parts.push(`Env: ${data.environmentWarningCount} warning${data.environmentWarningCount > 1 ? "s" : ""}`);
  }

  return [`  ${parts.join("  │  ")}`];
}
