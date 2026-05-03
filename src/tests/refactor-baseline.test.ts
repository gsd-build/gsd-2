// Project/App: GSD-2
// File Purpose: Tests for the long-running refactor baseline metrics harness.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const baselineModule = await import("../../scripts/refactor-baseline.mjs");

const {
  BASELINE_REQUIRED_METRICS,
  buildMetricIndex,
  collectBaseline,
  collectDirectoryMetrics,
  collectPromptMetrics,
  compareReports,
  formatDelta,
  formatDeltaPercent,
  metricSafeLabel,
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
  await mkdir(join(root, "dist-test"), { recursive: true });
  await writeFile(join(root, "dist-test/example.js"), "console.log('ok')\n");

  const report = await collectBaseline(root);

  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.schema.requiredMetrics, BASELINE_REQUIRED_METRICS);
  assert.equal(report.prompt.fileCount, 1);
  assert.equal(report.context.fileCount, 2);
  assert.equal(report.distTest.exists, true);
  assert.equal(report.distTest.fileCount, 1);
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
    workspace: {
      areas: [
        { area: "src", exists: true, fileCount: 11, bytes: 12 },
      ],
    },
    commands: [
      { label: "test compile", wallMs: 13, exitCode: 0, stdoutBytes: 14, stderrBytes: 15 },
    ],
  });

  assert.equal(metrics["distTest.exists"], 1);
  assert.equal(metrics["workspace.src.fileCount"], 11);
  assert.equal(metrics["command.test-compile.wallMs"], 13);
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

test("metricSafeLabel normalizes arbitrary command labels", () => {
  assert.equal(metricSafeLabel(" test compile "), "test-compile");
  assert.equal(metricSafeLabel("build:core"), "build-core");
  assert.equal(metricSafeLabel(""), "command");
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
  return root;
}
