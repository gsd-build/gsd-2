// Project/App: GSD-2
// File Purpose: Tests for the long-running refactor baseline metrics harness.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const baselineModule = await import("../../scripts/refactor-baseline.mjs");

const {
  BASELINE_REQUIRED_METRICS,
  buildMetricIndex,
  collectBaseline,
  collectContractsMetrics,
  collectDirectoryMetrics,
  collectPromptMetrics,
  collectProcessMetrics,
  collectTestCompileMetrics,
  compareReports,
  formatDelta,
  formatDeltaPercent,
  countMatches,
  countLegacyContractImports,
  hasProcessDocConflict,
  metricSafeLabel,
  numberOrZero,
  parseArgs,
  parseCommandSpec,
  renderSummary,
  writeJsonFile,
} = baselineModule;

test("parseArgs accepts json, root, command, compare, and output options", () => {
  const opts = parseArgs([
    "--json",
    "--root",
    "/tmp/example",
    "--command",
    "noop=node -e 1",
    "--compare",
    "/tmp/before.json",
    "--output",
    "/tmp/after.json",
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.root, "/tmp/example");
  assert.deepEqual(opts.commands, [{ label: "noop", command: "node -e 1" }]);
  assert.equal(opts.compare, "/tmp/before.json");
  assert.equal(opts.output, "/tmp/after.json");
});

test("parseCommandSpec rejects unlabeled commands", () => {
  assert.throws(() => parseCommandSpec("npm test"), /label=command/);
  assert.throws(() => parseCommandSpec("missing="), /label=command/);
});

test("collectPromptMetrics reports prompt file size and hash data", async () => {
  const root = await makeFixtureRoot();
  await writeFile(
    join(root, "src/resources/extensions/gsd/prompts/execute-task.md"),
    "Run the task.\nVerify the result.\n",
  );
  await writeFile(
    join(root, "src/resources/extensions/gsd/prompts/plan-slice.md"),
    "Plan carefully.\n",
  );

  const metrics = await collectPromptMetrics(root);

  assert.equal(metrics.fileCount, 2);
  assert.equal(metrics.totalChars, "Run the task.\nVerify the result.\nPlan carefully.\n".length);
  assert.equal(metrics.largestFiles[0].path, "src/resources/extensions/gsd/prompts/execute-task.md");
  assert.match(metrics.files[0].sha256, /^[a-f0-9]{64}$/);
});

test("collectDirectoryMetrics returns empty data for missing directories", async () => {
  const root = await makeFixtureRoot();
  const metrics = await collectDirectoryMetrics(join(root, "dist-test"));

  assert.deepEqual(metrics, {
    exists: false,
    fileCount: 0,
    bytes: 0,
  });
});

test("collectBaseline returns the phase-zero report shape", async () => {
  const root = await makeFixtureRoot();
  await writeFile(join(root, "CONTRIBUTING.md"), "# Contributing\n");
  await writeFile(join(root, "VISION.md"), "# Vision\n");
  await writeFile(join(root, "src/resources/extensions/gsd/prompts/system.md"), "System prompt\n");
  await writeContractsSurfaceFixtures(root);
  await writeProcessMetricFixtures(root);
  await writeFile(join(root, "src/tests/fixtures/contracts-golden-fixtures.ts"), "export const fixtures = [];\n");
  await mkdir(join(root, "dist-test"), { recursive: true });
  await writeFile(join(root, "dist-test/example.js"), "console.log('ok')\n");
  await writeTestCompileCache(root);

  const report = await collectBaseline(root);

  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.schema.requiredMetrics, BASELINE_REQUIRED_METRICS);
  assert.equal(report.prompt.fileCount, 1);
  assert.equal(report.context.fileCount, 2);
  assert.equal(report.distTest.exists, true);
  assert.equal(report.distTest.fileCount, 2);
  assert.equal(report.testCompile.cacheFileExists, true);
  assert.equal(report.metrics["testCompile.cacheHit"], 1);
  assert.equal(report.contracts.fixtures.total, 1);
  assert.equal(report.metrics["contracts.fixtures.sharedBySurface"], 6);
  assert.equal(report.process.prGeneratorConsumers, 3);
  assert.equal(report.metrics["process.prGeneratorConsumers"], 3);
  assert.equal(report.metrics["process.prBodiesMissingIssue"], 0);
  assert.equal(report.metrics["process.prBodiesMissingTests"], 0);
  assert.equal(report.metrics["process.docsConflictCount"], 0);
  assert.equal(report.metrics["process.shipPathCount"], 3);
  assert.equal(report.metrics["legacy.markdownFallbackUsed"], 0);
  assert.equal(report.metrics["legacy.workflowEngineUsed"], 0);
  assert.equal(report.metrics["legacy.uokFallbackUsed"], 0);
  assert.equal(report.metrics["legacy.mcpAliasUsed"], 0);
  assert.equal(report.metrics["legacy.componentFormatUsed"], 0);
  assert.equal(report.metrics["legacy.providerDefaultUsed"], 0);
  assert.equal(report.commands.length, 0);
  for (const metricName of BASELINE_REQUIRED_METRICS) {
    assert.equal(typeof report.metrics[metricName], "number", `${metricName} should be indexed as a number`);
  }
  assert.equal(report.workspace.areas.some((area: { area: string }) => area.area === "src"), true);
  assert.equal(report.startup.timingEnv, "GSD_STARTUP_TIMING=1");
});

test("buildMetricIndex includes workspace and command metrics", () => {
  const metrics = buildMetricIndex({
    prompt: { fileCount: 1, totalChars: 2, totalBytes: 3, totalLines: 4 },
    context: { fileCount: 5, totalChars: 6, totalBytes: 7, totalLines: 8 },
    distTest: { exists: true, fileCount: 9, bytes: 10 },
    contracts: {
      fixtures: { total: 16, sharedBySurface: 4 },
      surfaceDriftFailures: 1,
      legacyTypeImportsRemaining: 2,
    },
    testCompile: {
      cacheFileExists: true,
      cacheHit: true,
      fileCount: 17,
      bytesCopied: 18,
      inputBytes: 19,
      wallMs: 20,
    },
    process: {
      prGeneratorConsumers: 3,
      prBodiesMissingIssue: 0,
      prBodiesMissingTests: 0,
      docsConflictCount: 0,
      shipPathCount: 3,
    },
    legacy: {
      markdownFallbackUsed: 1,
      workflowEngineUsed: 2,
      uokFallbackUsed: 3,
      mcpAliasUsed: 4,
      componentFormatUsed: 5,
      providerDefaultUsed: 6,
    },
    workspace: {
      areas: [
        { area: "src", exists: true, fileCount: 11, bytes: 12 },
      ],
    },
    commands: [
      { label: "test compile", wallMs: 13, exitCode: 0, stdoutBytes: 14, stderrBytes: 15 },
      { label: "changed-src", wallMs: 21, exitCode: 0, stdoutBytes: 22, stderrBytes: 23 },
      { label: "verify-pr", wallMs: 24, exitCode: 0, stdoutBytes: 25, stderrBytes: 26 },
      { label: "test-compile-cold", wallMs: 27, exitCode: 0, stdoutBytes: 28, stderrBytes: 29 },
    ],
  });

  assert.equal(metrics["distTest.exists"], 1);
  assert.equal(metrics["contracts.fixtures.total"], 16);
  assert.equal(metrics["contracts.surfaceDriftFailures"], 1);
  assert.equal(metrics["workspace.src.fileCount"], 11);
  assert.equal(metrics["testCompile.cacheHit"], 1);
  assert.equal(metrics["testCompile.fileCount"], 17);
  assert.equal(metrics["process.prGeneratorConsumers"], 3);
  assert.equal(metrics["process.shipPathCount"], 3);
  assert.equal(metrics["legacy.markdownFallbackUsed"], 1);
  assert.equal(metrics["legacy.workflowEngineUsed"], 2);
  assert.equal(metrics["legacy.uokFallbackUsed"], 3);
  assert.equal(metrics["legacy.mcpAliasUsed"], 4);
  assert.equal(metrics["legacy.componentFormatUsed"], 5);
  assert.equal(metrics["legacy.providerDefaultUsed"], 6);
  assert.equal(metrics["command.test-compile.wallMs"], 13);
  assert.equal(metrics["verify.changedWallMs"], 21);
  assert.equal(metrics["verify.fullWallMs"], 24);
  assert.equal(metrics["testCompile.warmWallMs"], 13);
  assert.equal(metrics["testCompile.coldWallMs"], 27);
});

test("collectTestCompileMetrics reads stale-aware test compile cache metrics", async () => {
  const root = await makeFixtureRoot();
  await writeTestCompileCache(root);

  const metrics = await collectTestCompileMetrics(root);

  assert.deepEqual(metrics, {
    cacheFileExists: true,
    cacheHit: true,
    fileCount: 42,
    bytesCopied: 0,
    inputBytes: 1234,
    wallMs: 150,
  });
});

test("collectTestCompileMetrics returns defaults when cache file is absent", async () => {
  const root = await makeFixtureRoot();

  const metrics = await collectTestCompileMetrics(root);

  assert.deepEqual(metrics, {
    cacheFileExists: false,
    cacheHit: null,
    fileCount: 0,
    bytesCopied: 0,
    inputBytes: 0,
    wallMs: 0,
  });
});

test("collectContractsMetrics reports fixture coverage and surface drift", async () => {
  const root = await makeFixtureRoot();
  await writeContractsSurfaceFixtures(root);
  await writeFile(
    join(root, "src/tests/fixtures/contracts-golden-fixtures.ts"),
    "export const fixtures = [];\n",
  );

  const metrics = await collectContractsMetrics(root);

  assert.equal(metrics.fixtures.total, 1);
  assert.deepEqual(metrics.fixtures.files, ["src/tests/fixtures/contracts-golden-fixtures.ts"]);
  assert.equal(metrics.fixtures.sharedBySurface, 6);
  assert.equal(metrics.surfaceDriftFailures, 0);
  assert.equal(metrics.legacyTypeImportsRemaining, 0);
});

test("collectProcessMetrics reports Phase 7 process dashboard fields", async () => {
  const root = await makeFixtureRoot();
  await writeProcessMetricFixtures(root);
  await writeFile(
    join(root, "docs/dev/conflict.md"),
    "Markdown files are the authoritative state model.\n",
  );

  const metrics = await collectProcessMetrics(root);

  assert.equal(metrics.prGeneratorConsumers, 3);
  assert.deepEqual(metrics.prGeneratorConsumerFiles, [
    "src/resources/extensions/github-sync/templates.ts",
    "src/resources/extensions/gsd/auto-worktree.ts",
    "src/resources/extensions/gsd/commands-ship.ts",
  ]);
  assert.equal(metrics.prBodiesMissingIssue, 0);
  assert.equal(metrics.prBodiesMissingTests, 0);
  assert.equal(metrics.docsConflictCount, 1);
  assert.deepEqual(metrics.docsConflictFiles, ["docs/dev/conflict.md"]);
  assert.equal(metrics.shipPathCount, 3);
});

test("compareReports computes scalar metric deltas", () => {
  const previous = {
    generatedAt: "2026-05-03T00:00:00.000Z",
    metrics: {
      "prompt.totalChars": 100,
      "distTest.exists": 0,
      "only.before": 5,
    },
  };
  const current = {
    generatedAt: "2026-05-03T01:00:00.000Z",
    metrics: {
      "prompt.totalChars": 80,
      "distTest.exists": 1,
      "only.after": 7,
    },
  };

  const comparison = compareReports(previous, current);

  assert.equal(comparison.metricCount, 4);
  assert.deepEqual(comparison.deltas["prompt.totalChars"], {
    before: 100,
    after: 80,
    delta: -20,
    deltaPercent: -20,
  });
  assert.equal(comparison.deltas["distTest.exists"].delta, 1);
  assert.equal(comparison.deltas["only.before"].after, null);
  assert.equal(comparison.deltas["only.after"].before, null);
});

test("formatDelta helpers render signed and unavailable values", () => {
  assert.equal(formatDelta(5), "+5");
  assert.equal(formatDelta(-2), "-2");
  assert.equal(formatDelta(null), "n/a");
  assert.equal(formatDeltaPercent(12.5), "+12.5%");
  assert.equal(formatDeltaPercent(-1), "-1%");
  assert.equal(formatDeltaPercent(null), "n/a");
});

test("numberOrZero normalizes invalid metric values", () => {
  assert.equal(numberOrZero(5), 5);
  assert.equal(numberOrZero(Number.NaN), 0);
  assert.equal(numberOrZero("5"), 0);
  assert.equal(numberOrZero(undefined), 0);
});

test("metricSafeLabel normalizes arbitrary command labels", () => {
  assert.equal(metricSafeLabel(" test compile "), "test-compile");
  assert.equal(metricSafeLabel("build:core"), "build-core");
  assert.equal(metricSafeLabel(""), "command");
});

test("countMatches counts non-overlapping pattern matches", () => {
  assert.equal(countMatches("one two one", /one/g), 2);
  assert.equal(countMatches("none", /missing/g), 0);
});

test("countLegacyContractImports ignores rpc-client implementation types", () => {
  assert.equal(
    countLegacyContractImports(`
      import type { RpcClient } from "@gsd-build/rpc-client";
      import type { SdkAgentEvent, RpcCostUpdateEvent } from "@gsd-build/rpc-client";
    `),
    2,
  );
  assert.equal(
    countLegacyContractImports('import type { RpcClientOptions } from "@gsd-build/rpc-client";'),
    0,
  );
});

test("hasProcessDocConflict flags obsolete state-authority language", () => {
  assert.equal(hasProcessDocConflict("DB is authoritative; markdown is a projection."), false);
  assert.equal(hasProcessDocConflict("Markdown files are the authoritative runtime state."), true);
  assert.equal(hasProcessDocConflict("The filesystem-authoritative model owns status."), true);
  assert.equal(hasProcessDocConflict(".gsd/ROADMAP.md is the source of truth."), true);
});

test("renderSummary includes key sections for human inspection", async () => {
  const root = await makeFixtureRoot();
  await writeFile(join(root, "src/resources/extensions/gsd/prompts/system.md"), "System prompt\n");

  const report = await collectBaseline(root);
  const summary = renderSummary(report);

  assert.match(summary, /GSD-2 Refactor Baseline/);
  assert.match(summary, /Schema version: 1/);
  assert.match(summary, /Prompt metrics/);
  assert.match(summary, /dist-test metrics/);
  assert.match(summary, /Test compile metrics/);
  assert.match(summary, /Contracts metrics/);
  assert.match(summary, /Process metrics/);
  assert.match(summary, /Legacy metrics/);
  assert.match(summary, /Largest prompt files/);
});

test("renderSummary includes comparison deltas when present", async () => {
  const root = await makeFixtureRoot();
  await writeFile(join(root, "src/resources/extensions/gsd/prompts/system.md"), "System prompt\n");

  const report = await collectBaseline(root);
  report.comparison = compareReports(
    { generatedAt: "before", metrics: { "prompt.totalChars": report.metrics["prompt.totalChars"] + 10 } },
    report,
  );
  const summary = renderSummary(report);

  assert.match(summary, /Baseline comparison/);
  assert.match(summary, /prompt\.totalChars: 24 -> 14 \(-10, -41\.67%\)/);
});

test("writeJsonFile creates parent directories and writes parseable JSON", async () => {
  const root = await makeFixtureRoot();
  const outputPath = join(root, "nested", "baseline.json");

  await writeJsonFile(outputPath, { ok: true });

  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), { ok: true });
});

async function makeFixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gsd-refactor-baseline-"));
  await mkdir(join(root, "src/resources/extensions/gsd/prompts"), { recursive: true });
  await mkdir(join(root, "src/tests/fixtures"), { recursive: true });
  return root;
}

async function writeProcessMetricFixtures(root: string): Promise<void> {
  await mkdir(join(root, "src/resources/extensions/github-sync"), { recursive: true });
  await mkdir(join(root, "src/resources/extensions/gsd"), { recursive: true });
  await mkdir(join(root, "src/resources/extensions/gsd/docs"), { recursive: true });
  await mkdir(join(root, "docs/dev"), { recursive: true });
  await writeFile(
    join(root, "src/resources/extensions/gsd/pr-evidence.ts"),
    'export function buildPrEvidence() { return "## Linked Issue\\n## Tests Run"; }\n',
  );
  await writeFile(
    join(root, "src/resources/extensions/gsd/commands-ship.ts"),
    'import { buildPrEvidence } from "./pr-evidence.js"; buildPrEvidence(); ghCreatePR();\n',
  );
  await writeFile(
    join(root, "src/resources/extensions/gsd/auto-worktree.ts"),
    'import { buildPrEvidence } from "./pr-evidence.js"; buildPrEvidence(); createDraftPR();\n',
  );
  await writeFile(
    join(root, "src/resources/extensions/github-sync/templates.ts"),
    'import { buildPrEvidence } from "../gsd/pr-evidence.js"; buildPrEvidence(); ghCreatePR();\n',
  );
  await writeFile(
    join(root, "src/resources/extensions/gsd/docs/state.md"),
    "DB is authoritative. Markdown is a projection for humans.\n",
  );
}

async function writeContractsSurfaceFixtures(root: string): Promise<void> {
  const files = [
    "packages/pi-coding-agent/src/modes/rpc/rpc-types.ts",
    "packages/rpc-client/src/rpc-types.ts",
    "packages/mcp-server/src/types.ts",
    "src/web/bridge-service.ts",
    "web/lib/gsd-workspace-store.tsx",
    "vscode-extension/src/gsd-client.ts",
  ];
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), 'import type { RpcCommand } from "@gsd-build/contracts";\n');
  }
}

async function writeTestCompileCache(root: string): Promise<void> {
  await mkdir(join(root, "dist-test"), { recursive: true });
  await writeFile(
    join(root, "dist-test", ".compile-tests-cache.json"),
    JSON.stringify({
      schemaVersion: 1,
      hash: "abc",
      fileCount: 42,
      bytes: 1234,
      metrics: {
        cacheHit: true,
        fileCount: 42,
        bytesCopied: 0,
        inputBytes: 1234,
        wallMs: 150,
      },
    }),
  );
}
