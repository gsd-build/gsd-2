// GSD-2 — ADR-005 Phase 3b: surface ProviderSwitchReport from pi-ai.
//
// pi-ai builds a ProviderSwitchReport on every cross-provider transform but
// only logs it to stderr when GSD_VERBOSE=1. This module installs a
// single-subscriber observer that surfaces non-empty reports through GSD's
// three usual telemetry surfaces:
//
//   1. UOK audit event (category model-policy, type provider-switch) — only
//      when an auto trace is active.
//   2. Persistent notification (.gsd/notifications.jsonl, severity warning) —
//      whenever the GSD basePath is known, so users see the loss in the
//      dashboard / status surface without GSD_VERBOSE.
//   3. In-memory counter, exposed via getProviderSwitchStats() so any
//      caller (dashboard, doctor, tests) can read the rollup.

import { setProviderSwitchObserver, type ProviderSwitchReport } from "@gsd/pi-ai";

import { autoSession } from "./auto-runtime-state.js";
import { appendNotification } from "./notification-store.js";
import { buildAuditEnvelope, emitUokAuditEvent } from "./uok/audit.js";

/** Rollup of cross-provider context transformations, grouped by trace. */
export interface ProviderSwitchStats {
  /** Total non-empty reports observed since process start (or last reset). */
  totalSwitches: number;
  /** Sum of every counted transformation across all reports. */
  totals: {
    thinkingBlocksDropped: number;
    thinkingBlocksDowngraded: number;
    toolCallIdsRemapped: number;
    syntheticToolResultsInserted: number;
    thoughtSignaturesDropped: number;
  };
  /** Per-trace breakdown. Key "interactive" covers reports outside auto-mode. */
  byTrace: Record<string, TraceSwitchStats>;
  /** The most recent non-empty report, if any. */
  lastReport: ProviderSwitchReport | null;
  /** ISO timestamp of the most recent non-empty report, if any. */
  lastAt: string | null;
}

export interface TraceSwitchStats {
  switches: number;
  lastReport: ProviderSwitchReport;
  lastAt: string;
}

const INTERACTIVE_TRACE_KEY = "interactive";

interface MutableTraceStats {
  switches: number;
  lastReport: ProviderSwitchReport;
  lastAt: string;
}

let installed = false;
let totalSwitches = 0;
const totals = {
  thinkingBlocksDropped: 0,
  thinkingBlocksDowngraded: 0,
  toolCallIdsRemapped: 0,
  syntheticToolResultsInserted: 0,
  thoughtSignaturesDropped: 0,
};
const byTrace = new Map<string, MutableTraceStats>();
let lastReport: ProviderSwitchReport | null = null;
let lastAt: string | null = null;

/** Format a one-line summary suitable for a notification message. */
function summarize(report: ProviderSwitchReport): string {
  const parts: string[] = [];
  if (report.thinkingBlocksDropped > 0) parts.push(`${report.thinkingBlocksDropped} thinking dropped`);
  if (report.thinkingBlocksDowngraded > 0) parts.push(`${report.thinkingBlocksDowngraded} thinking downgraded`);
  if (report.toolCallIdsRemapped > 0) parts.push(`${report.toolCallIdsRemapped} tool ids remapped`);
  if (report.syntheticToolResultsInserted > 0) parts.push(`${report.syntheticToolResultsInserted} synthetic tool results`);
  if (report.thoughtSignaturesDropped > 0) parts.push(`${report.thoughtSignaturesDropped} thought signatures dropped`);
  return `Provider switch ${report.fromApi} → ${report.toApi}: ${parts.join(", ")}`;
}

function recordReport(report: ProviderSwitchReport): void {
  const now = new Date().toISOString();
  totalSwitches += 1;
  totals.thinkingBlocksDropped += report.thinkingBlocksDropped;
  totals.thinkingBlocksDowngraded += report.thinkingBlocksDowngraded;
  totals.toolCallIdsRemapped += report.toolCallIdsRemapped;
  totals.syntheticToolResultsInserted += report.syntheticToolResultsInserted;
  totals.thoughtSignaturesDropped += report.thoughtSignaturesDropped;
  lastReport = report;
  lastAt = now;

  const traceKey = autoSession.currentTraceId ?? INTERACTIVE_TRACE_KEY;
  const existing = byTrace.get(traceKey);
  if (existing) {
    existing.switches += 1;
    existing.lastReport = report;
    existing.lastAt = now;
  } else {
    byTrace.set(traceKey, { switches: 1, lastReport: report, lastAt: now });
  }
}

function emitAudit(report: ProviderSwitchReport): void {
  const traceId = autoSession.currentTraceId;
  const basePath = autoSession.basePath;
  if (!traceId || !basePath) return;
  try {
    emitUokAuditEvent(
      basePath,
      buildAuditEnvelope({
        traceId,
        category: "model-policy",
        type: "provider-switch",
        payload: {
          fromApi: report.fromApi,
          toApi: report.toApi,
          thinkingBlocksDropped: report.thinkingBlocksDropped,
          thinkingBlocksDowngraded: report.thinkingBlocksDowngraded,
          toolCallIdsRemapped: report.toolCallIdsRemapped,
          syntheticToolResultsInserted: report.syntheticToolResultsInserted,
          thoughtSignaturesDropped: report.thoughtSignaturesDropped,
        },
      }),
    );
  } catch {
    // Audit emission is best-effort. Counter + notification still fire.
  }
}

function emitNotification(report: ProviderSwitchReport): void {
  try {
    appendNotification(summarize(report), "warning", "workflow-logger");
  } catch {
    // Notification persistence is best-effort.
  }
}

function handleReport(report: ProviderSwitchReport): void {
  recordReport(report);
  emitAudit(report);
  emitNotification(report);
}

/**
 * Install the pi-ai observer. Idempotent — calling more than once is a no-op
 * after the first install.
 */
export function installProviderSwitchObserver(): void {
  if (installed) return;
  setProviderSwitchObserver(handleReport);
  installed = true;
}

/** Uninstall the observer. Intended for tests. */
export function uninstallProviderSwitchObserver(): void {
  setProviderSwitchObserver(undefined);
  installed = false;
}

/** Read-only snapshot of the in-memory rollup. */
export function getProviderSwitchStats(): ProviderSwitchStats {
  const trace: Record<string, TraceSwitchStats> = {};
  for (const [key, value] of byTrace) {
    trace[key] = { switches: value.switches, lastReport: { ...value.lastReport }, lastAt: value.lastAt };
  }
  return {
    totalSwitches,
    totals: { ...totals },
    byTrace: trace,
    lastReport: lastReport ? { ...lastReport } : null,
    lastAt,
  };
}

/** Reset the in-memory rollup. Intended for tests. */
export function _resetProviderSwitchStats(): void {
  totalSwitches = 0;
  totals.thinkingBlocksDropped = 0;
  totals.thinkingBlocksDowngraded = 0;
  totals.toolCallIdsRemapped = 0;
  totals.syntheticToolResultsInserted = 0;
  totals.thoughtSignaturesDropped = 0;
  byTrace.clear();
  lastReport = null;
  lastAt = null;
}
