// Project/App: GSD-2
// File Purpose: Checks persisted Phase 8 legacy telemetry before cleanup deletions.

import { readFile } from "node:fs/promises";

export const LEGACY_COUNTERS = [
  "legacy.markdownFallbackUsed",
  "legacy.workflowEngineUsed",
  "legacy.uokFallbackUsed",
  "legacy.mcpAliasUsed",
  "legacy.componentFormatUsed",
  "legacy.providerDefaultUsed",
];

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const opts = {
    file: env.GSD_LEGACY_TELEMETRY_FILE ?? "",
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--file") {
      const value = argv[i + 1];
      if (!value) throw new Error("--file requires a path");
      opts.file = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("--file=")) {
      opts.file = arg.slice("--file=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!opts.file.trim()) {
    throw new Error("No telemetry file provided. Pass --file or set GSD_LEGACY_TELEMETRY_FILE.");
  }
  return opts;
}

export async function readTelemetryReport(file) {
  const raw = await readFile(file, "utf-8");
  const parsed = JSON.parse(raw);
  const counters = parsed?.counters;
  if (!counters || typeof counters !== "object") {
    throw new Error("Telemetry report is missing counters");
  }
  return {
    ts: typeof parsed.ts === "string" ? parsed.ts : "",
    counters,
  };
}

export function evaluateLegacyCleanupGate(report) {
  const counters = {};
  const nonZero = [];
  const missing = [];

  for (const counter of LEGACY_COUNTERS) {
    const value = report.counters[counter];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      counters[counter] = 0;
      missing.push(counter);
      continue;
    }
    counters[counter] = value;
    if (value !== 0) nonZero.push({ counter, value });
  }

  return {
    ok: missing.length === 0 && nonZero.length === 0,
    ts: report.ts,
    counters,
    missing,
    nonZero,
  };
}

export function renderLegacyCleanupGateSummary(result) {
  const lines = [
    "GSD-2 Legacy Cleanup Gate",
    `Snapshot: ${result.ts || "unknown"}`,
    `Status: ${result.ok ? "PASS" : "BLOCK"}`,
    "",
    "Counters:",
  ];

  for (const counter of LEGACY_COUNTERS) {
    lines.push(`- ${counter}: ${result.counters[counter] ?? 0}`);
  }

  if (result.missing.length > 0) {
    lines.push("", "Missing counters:");
    for (const counter of result.missing) lines.push(`- ${counter}`);
  }

  if (result.nonZero.length > 0) {
    lines.push("", "Cleanup blockers:");
    for (const entry of result.nonZero) lines.push(`- ${entry.counter}: ${entry.value}`);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  try {
    const opts = parseArgs();
    const report = await readTelemetryReport(opts.file);
    const result = evaluateLegacyCleanupGate(report);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(renderLegacyCleanupGateSummary(result));
    }
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
