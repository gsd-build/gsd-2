// Project/App: GSD-2
// File Purpose: Runs representative checks and produces Phase 8 legacy cleanup telemetry evidence.

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  LEGACY_COUNTERS,
  evaluateLegacyCleanupGate,
  readTelemetryReport,
  renderLegacyCleanupGateSummary,
} from "./legacy-cleanup-gate.mjs";

export const DEFAULT_EVIDENCE_COMMANDS = [["npm", "run", "baseline:refactor:gate"]];

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const opts = {
    file: env.GSD_LEGACY_TELEMETRY_FILE ?? "",
    json: false,
    commands: [],
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
    if (arg === "--command") {
      const value = argv[i + 1];
      if (!value) throw new Error("--command requires a JSON string array");
      opts.commands.push(parseCommandSpec(value));
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!opts.file.trim()) {
    throw new Error("No telemetry file provided. Pass --file or set GSD_LEGACY_TELEMETRY_FILE.");
  }
  return {
    ...opts,
    commands: opts.commands.length > 0 ? opts.commands : DEFAULT_EVIDENCE_COMMANDS,
  };
}

export function parseCommandSpec(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("--command must be a JSON string array, for example [\"npm\",\"run\",\"baseline:refactor:gate\"]");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== "string" || !part.trim())) {
    throw new Error("--command must be a non-empty JSON string array");
  }
  return parsed;
}

export async function ensureTelemetryReport(file) {
  try {
    return await readTelemetryReport(file);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const report = {
    ts: new Date().toISOString(),
    counters: Object.fromEntries(LEGACY_COUNTERS.map((counter) => [counter, 0])),
  };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  return report;
}

export async function runEvidenceCommand(command, env) {
  const child = spawn(command[0], command.slice(1), {
    env,
    stdio: "inherit",
  });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (status !== 0) {
    throw new Error(`Evidence command failed (${status}): ${command.join(" ")}`);
  }
}

export async function collectLegacyCleanupEvidence(opts) {
  const env = {
    ...process.env,
    GSD_LEGACY_TELEMETRY_FILE: opts.file,
  };

  for (const command of opts.commands) {
    await runEvidenceCommand(command, env);
  }

  const report = await ensureTelemetryReport(opts.file);
  return evaluateLegacyCleanupGate(report);
}

async function main() {
  try {
    const opts = parseArgs();
    const result = await collectLegacyCleanupEvidence(opts);
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
