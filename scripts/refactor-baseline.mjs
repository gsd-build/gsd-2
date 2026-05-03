#!/usr/bin/env node
// Project/App: GSD-2
// File Purpose: Read-only baseline metrics harness for the long-running refactor program.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");

const DEFAULT_PROMPT_DIRS = [
  "src/resources/extensions/gsd/prompts",
];

const DEFAULT_CONTEXT_FILES = [
  "CONTRIBUTING.md",
  "VISION.md",
  "README.md",
  "docs/user-docs/auto-mode.md",
  "docs/dev/pi-context-optimization-opportunities.md",
  "docs/dev/2026-05-03-long-running-refactor-plan-of-plans.md",
];

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "dist-test",
  "node_modules",
  "target",
]);

export const BASELINE_SCHEMA_VERSION = 1;

export const BASELINE_REQUIRED_METRICS = [
  "prompt.fileCount",
  "prompt.totalChars",
  "prompt.totalBytes",
  "prompt.totalLines",
  "context.fileCount",
  "context.totalChars",
  "context.totalBytes",
  "context.totalLines",
  "distTest.exists",
  "distTest.fileCount",
  "distTest.bytes",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: DEFAULT_ROOT,
    json: false,
    commands: [],
    compare: null,
    output: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      options.root = resolve(argv[++i] ?? ".");
    } else if (arg.startsWith("--root=")) {
      options.root = resolve(arg.slice("--root=".length));
    } else if (arg === "--command") {
      options.commands.push(parseCommandSpec(argv[++i] ?? ""));
    } else if (arg.startsWith("--command=")) {
      options.commands.push(parseCommandSpec(arg.slice("--command=".length)));
    } else if (arg === "--compare") {
      options.compare = resolve(argv[++i] ?? "");
    } else if (arg.startsWith("--compare=")) {
      options.compare = resolve(arg.slice("--compare=".length));
    } else if (arg === "--output") {
      options.output = resolve(argv[++i] ?? "");
    } else if (arg.startsWith("--output=")) {
      options.output = resolve(arg.slice("--output=".length));
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function parseCommandSpec(spec) {
  const splitAt = spec.indexOf("=");
  if (splitAt <= 0 || splitAt === spec.length - 1) {
    throw new Error("Command specs must use label=command");
  }
  return {
    label: spec.slice(0, splitAt),
    command: spec.slice(splitAt + 1),
  };
}

export async function collectBaseline(root, commandSpecs = []) {
  const startedAt = new Date().toISOString();
  const [
    promptMetrics,
    contextMetrics,
    distTestMetrics,
    workspaceMetrics,
  ] = await Promise.all([
    collectPromptMetrics(root),
    collectContextMetrics(root),
    collectDirectoryMetrics(join(root, "dist-test")),
    collectWorkspaceMetrics(root),
  ]);

  const commandTimings = [];
  for (const spec of commandSpecs) {
    commandTimings.push(await timeCommand(root, spec));
  }

  const report = {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    generatedAt: startedAt,
    root,
    schema: {
      requiredMetrics: BASELINE_REQUIRED_METRICS,
    },
    prompt: promptMetrics,
    context: contextMetrics,
    distTest: distTestMetrics,
    workspace: workspaceMetrics,
    commands: commandTimings,
    startup: {
      timingEnv: "GSD_STARTUP_TIMING=1",
      note: "Run a command spec such as --command startup='GSD_STARTUP_TIMING=1 node dist/loader.js --version' after build output exists.",
    },
  };

  return {
    ...report,
    metrics: buildMetricIndex(report),
  };
}

export async function collectPromptMetrics(root) {
  const files = [];
  for (const dir of DEFAULT_PROMPT_DIRS) {
    files.push(...await collectFiles(join(root, dir), file => file.endsWith(".md")));
  }

  const entries = [];
  for (const file of files.sort()) {
    const content = await readFile(file, "utf8");
    entries.push(fileTextMetric(root, file, content));
  }

  return {
    directories: DEFAULT_PROMPT_DIRS,
    fileCount: entries.length,
    totalChars: sum(entries, "chars"),
    totalBytes: sum(entries, "bytes"),
    totalLines: sum(entries, "lines"),
    largestFiles: entries
      .slice()
      .sort((a, b) => b.chars - a.chars)
      .slice(0, 10),
    files: entries,
  };
}

export async function collectContextMetrics(root) {
  const files = [];
  for (const rel of DEFAULT_CONTEXT_FILES) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const content = await readFile(abs, "utf8");
    files.push(fileTextMetric(root, abs, content));
  }

  return {
    fileCount: files.length,
    totalChars: sum(files, "chars"),
    totalBytes: sum(files, "bytes"),
    totalLines: sum(files, "lines"),
    files,
  };
}

export async function collectWorkspaceMetrics(root) {
  const trackedAreas = [
    "src",
    "packages",
    "web",
    "scripts",
    "docs",
    "vscode-extension",
    "studio",
  ];
  const areas = [];
  for (const area of trackedAreas) {
    const abs = join(root, area);
    const metrics = await collectDirectoryMetrics(abs);
    areas.push({ area, ...metrics });
  }
  return { areas };
}

export async function collectDirectoryMetrics(dir) {
  if (!existsSync(dir)) {
    return {
      exists: false,
      fileCount: 0,
      bytes: 0,
    };
  }
  const files = await collectFiles(dir, () => true);
  let bytes = 0;
  for (const file of files) {
    bytes += (await stat(file)).size;
  }
  return {
    exists: true,
    fileCount: files.length,
    bytes,
  };
}

export async function collectFiles(dir, predicate) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(abs, predicate));
    } else if (entry.isFile() && predicate(abs)) {
      files.push(abs);
    }
  }
  return files;
}

export function fileTextMetric(root, file, content) {
  return {
    path: normalizePath(relative(root, file)),
    chars: content.length,
    bytes: Buffer.byteLength(content, "utf8"),
    lines: content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

export function sum(entries, key) {
  return entries.reduce((total, entry) => total + Number(entry[key] ?? 0), 0);
}

export function normalizePath(path) {
  return path.split("\\").join("/");
}

export function buildMetricIndex(report) {
  const metrics = {
    "prompt.fileCount": report.prompt.fileCount,
    "prompt.totalChars": report.prompt.totalChars,
    "prompt.totalBytes": report.prompt.totalBytes,
    "prompt.totalLines": report.prompt.totalLines,
    "context.fileCount": report.context.fileCount,
    "context.totalChars": report.context.totalChars,
    "context.totalBytes": report.context.totalBytes,
    "context.totalLines": report.context.totalLines,
    "distTest.exists": report.distTest.exists ? 1 : 0,
    "distTest.fileCount": report.distTest.fileCount,
    "distTest.bytes": report.distTest.bytes,
  };

  for (const area of report.workspace.areas) {
    const prefix = `workspace.${area.area}`;
    metrics[`${prefix}.exists`] = area.exists ? 1 : 0;
    metrics[`${prefix}.fileCount`] = area.fileCount;
    metrics[`${prefix}.bytes`] = area.bytes;
  }

  for (const command of report.commands) {
    const prefix = `command.${metricSafeLabel(command.label)}`;
    metrics[`${prefix}.wallMs`] = command.wallMs;
    metrics[`${prefix}.exitCode`] = command.exitCode;
    metrics[`${prefix}.stdoutBytes`] = command.stdoutBytes;
    metrics[`${prefix}.stderrBytes`] = command.stderrBytes;
  }

  return metrics;
}

export function compareReports(previous, current) {
  const previousMetrics = previous.metrics ?? buildMetricIndex(previous);
  const currentMetrics = current.metrics ?? buildMetricIndex(current);
  const metricNames = Array.from(new Set([
    ...Object.keys(previousMetrics),
    ...Object.keys(currentMetrics),
  ])).sort();

  const deltas = {};
  for (const metric of metricNames) {
    const before = numberOrNull(previousMetrics[metric]);
    const after = numberOrNull(currentMetrics[metric]);
    if (before === null && after === null) continue;
    const delta = before === null || after === null ? null : after - before;
    deltas[metric] = {
      before,
      after,
      delta,
      deltaPercent: before === null || after === null || before === 0
        ? null
        : Number(((delta / before) * 100).toFixed(2)),
    };
  }

  return {
    previousGeneratedAt: previous.generatedAt ?? null,
    currentGeneratedAt: current.generatedAt ?? null,
    metricCount: Object.keys(deltas).length,
    deltas,
  };
}

export async function loadBaselineReport(path) {
  const raw = await readFile(path, "utf8");
  const report = JSON.parse(raw);
  if (!report || typeof report !== "object") {
    throw new Error(`Baseline report at ${path} is not an object`);
  }
  if (!report.prompt || !report.context || !report.distTest || !report.workspace) {
    throw new Error(`Baseline report at ${path} is missing required sections`);
  }
  return report;
}

export async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function metricSafeLabel(label) {
  return label
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "command";
}

export async function timeCommand(root, spec) {
  const startedAt = Date.now();
  const child = spawn(spec.command, {
    cwd: root,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stdoutBytes = 0;
  let stderrBytes = 0;
  child.stdout.on("data", chunk => {
    stdoutBytes += chunk.length;
  });
  child.stderr.on("data", chunk => {
    stderrBytes += chunk.length;
  });

  const exitCode = await new Promise((resolveExit) => {
    child.on("close", resolveExit);
    child.on("error", () => resolveExit(1));
  });

  return {
    label: spec.label,
    command: spec.command,
    wallMs: Date.now() - startedAt,
    exitCode,
    stdoutBytes,
    stderrBytes,
  };
}

export function renderSummary(report) {
  const lines = [
    "GSD-2 Refactor Baseline",
    `Generated: ${report.generatedAt}`,
    `Root: ${report.root}`,
    `Schema version: ${report.schemaVersion}`,
    "",
    "Prompt metrics",
    `- files: ${report.prompt.fileCount}`,
    `- chars: ${report.prompt.totalChars}`,
    `- bytes: ${report.prompt.totalBytes}`,
    `- lines: ${report.prompt.totalLines}`,
    "",
    "Context metrics",
    `- files: ${report.context.fileCount}`,
    `- chars: ${report.context.totalChars}`,
    `- bytes: ${report.context.totalBytes}`,
    "",
    "dist-test metrics",
    `- exists: ${report.distTest.exists}`,
    `- files: ${report.distTest.fileCount}`,
    `- bytes: ${report.distTest.bytes}`,
  ];

  if (report.commands.length > 0) {
    lines.push("", "Command timings");
    for (const command of report.commands) {
      lines.push(`- ${command.label}: ${command.wallMs}ms exit=${command.exitCode}`);
    }
  }

  if (report.comparison) {
    lines.push("", "Baseline comparison");
    for (const metric of BASELINE_REQUIRED_METRICS) {
      const delta = report.comparison.deltas[metric];
      if (!delta) continue;
      lines.push(`- ${metric}: ${delta.before} -> ${delta.after} (${formatDelta(delta.delta)}, ${formatDeltaPercent(delta.deltaPercent)})`);
    }
  }

  lines.push("", "Largest prompt files");
  for (const file of report.prompt.largestFiles.slice(0, 5)) {
    lines.push(`- ${file.path}: ${file.chars} chars`);
  }

  return `${lines.join("\n")}\n`;
}

export function formatDelta(delta) {
  if (delta === null) return "n/a";
  return delta >= 0 ? `+${delta}` : String(delta);
}

export function formatDeltaPercent(deltaPercent) {
  if (deltaPercent === null) return "n/a";
  return deltaPercent >= 0 ? `+${deltaPercent}%` : `${deltaPercent}%`;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/refactor-baseline.mjs [--json] [--root DIR] [--command label=command] [--compare FILE] [--output FILE]\n\n`);
  process.stdout.write(`Examples:\n`);
  process.stdout.write(`  npm run baseline:refactor -- --json\n`);
  process.stdout.write(`  npm run baseline:refactor -- --command test-compile='npm run test:compile'\n`);
  process.stdout.write(`  npm run baseline:refactor -- --json --output /tmp/baseline.json\n`);
  process.stdout.write(`  npm run baseline:refactor -- --compare /tmp/baseline.json\n`);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const report = await collectBaseline(options.root, options.commands);
  if (options.compare) {
    report.comparison = compareReports(await loadBaselineReport(options.compare), report);
  }
  if (options.output) {
    await writeJsonFile(options.output, report);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderSummary(report));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
