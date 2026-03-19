/**
 * GSD Health Widget — always-on ambient health signal rendered belowEditor.
 *
 * Shows a compact 1-2 line summary: progress score, budget, provider key
 * status, and doctor/environment issue count. Refreshes every 60 seconds.
 * Quiet when everything is healthy; turns amber/red when issues arise.
 *
 * Widget key: "gsd-health", placement: "belowEditor"
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { runProviderChecks, summariseProviderIssues } from "./doctor-providers.js";
import { runEnvironmentChecks } from "./doctor-environment.js";
import { existsSync } from "node:fs";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import { loadLedgerFromDisk, getProjectTotals } from "./metrics.js";
import { projectRoot } from "./commands.js";
import { gsdRoot } from "./paths.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HealthWidgetData {
  hasProject: boolean;
  budgetCeiling: number | undefined;
  budgetSpent: number;
  providerIssue: string | null;      // compact summary from summariseProviderIssues()
  environmentErrorCount: number;
  environmentWarningCount: number;
  lastRefreshed: number;
}

// ── Data loader ────────────────────────────────────────────────────────────────

function loadHealthWidgetData(basePath: string): HealthWidgetData {
  let hasProject = false;
  let budgetCeiling: number | undefined;
  let budgetSpent = 0;
  let providerIssue: string | null = null;
  let environmentErrorCount = 0;
  let environmentWarningCount = 0;

  try {
    const prefs = loadEffectiveGSDPreferences();
    budgetCeiling = prefs?.preferences?.budget_ceiling;

    hasProject = existsSync(gsdRoot(basePath));

    const ledger = loadLedgerFromDisk(basePath);
    if (ledger) {
      const totals = getProjectTotals(ledger.units ?? []);
      budgetSpent = totals.cost;
    }
  } catch { /* non-fatal */ }

  try {
    const providerResults = runProviderChecks();
    providerIssue = summariseProviderIssues(providerResults);
  } catch { /* non-fatal */ }

  try {
    const envResults = runEnvironmentChecks(basePath);
    for (const r of envResults) {
      if (r.status === "error") environmentErrorCount++;
      else if (r.status === "warning") environmentWarningCount++;
    }
  } catch { /* non-fatal */ }

  return {
    hasProject,
    budgetCeiling,
    budgetSpent,
    providerIssue,
    environmentErrorCount,
    environmentWarningCount,
    lastRefreshed: Date.now(),
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function formatCost(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `${(n * 100).toFixed(1)}¢`;
}

/**
 * Build compact health lines for the widget.
 * Returns a string array suitable for setWidget().
 */
export function buildHealthLines(data: HealthWidgetData): string[] {
  if (!data.hasProject) {
    return ["  GSD  No project loaded — run /gsd to start"];
  }

  const parts: string[] = [];

  // System status signal
  const totalIssues = data.environmentErrorCount + data.environmentWarningCount + (data.providerIssue ? 1 : 0);
  if (totalIssues === 0) {
    parts.push("● System OK");
  } else if (data.environmentErrorCount > 0 || data.providerIssue?.includes("✗")) {
    parts.push(`✗ ${totalIssues} issue${totalIssues > 1 ? "s" : ""}`);
  } else {
    parts.push(`⚠ ${totalIssues} warning${totalIssues > 1 ? "s" : ""}`);
  }

  // Budget
  if (data.budgetCeiling !== undefined && data.budgetCeiling > 0) {
    const pct = Math.min(100, (data.budgetSpent / data.budgetCeiling) * 100);
    parts.push(`Budget: ${formatCost(data.budgetSpent)}/${formatCost(data.budgetCeiling)} (${pct.toFixed(0)}%)`);
  } else if (data.budgetSpent > 0) {
    parts.push(`Spent: ${formatCost(data.budgetSpent)}`);
  }

  // Provider issue (if any)
  if (data.providerIssue) {
    parts.push(data.providerIssue);
  }

  // Environment issues
  if (data.environmentErrorCount > 0) {
    parts.push(`Env: ${data.environmentErrorCount} error${data.environmentErrorCount > 1 ? "s" : ""}`);
  } else if (data.environmentWarningCount > 0) {
    parts.push(`Env: ${data.environmentWarningCount} warning${data.environmentWarningCount > 1 ? "s" : ""}`);
  }

  return [`  ${parts.join("  │  ")}`];
}

// ── Widget init ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Initialize the always-on gsd-health widget (belowEditor).
 * Call once from the extension entry point after context is available.
 */
export function initHealthWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const basePath = projectRoot();

  // String-array fallback — used in RPC mode (factory is a no-op there)
  const initialData = loadHealthWidgetData(basePath);
  ctx.ui.setWidget("gsd-health", buildHealthLines(initialData), { placement: "belowEditor" });

  // Factory-based widget for TUI mode — replaces the string-array above
  ctx.ui.setWidget("gsd-health", (_tui, _theme) => {
    let data = initialData;
    let cachedLines: string[] | undefined;

    const refreshTimer = setInterval(() => {
      try {
        data = loadHealthWidgetData(basePath);
        cachedLines = undefined;
        _tui.requestRender();
      } catch { /* non-fatal */ }
    }, REFRESH_INTERVAL_MS);

    return {
      render(_width: number): string[] {
        if (!cachedLines) cachedLines = buildHealthLines(data);
        return cachedLines;
      },
      invalidate(): void { cachedLines = undefined; },
      dispose(): void {
        clearInterval(refreshTimer);
      },
    };
  }, { placement: "belowEditor" });
}
