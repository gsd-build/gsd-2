// Project/App: GSD-2
// File Purpose: Tests representative telemetry evidence collection before Phase 8 legacy cleanup deletions.

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const evidenceModule = await import("../../scripts/legacy-cleanup-evidence.mjs");
const gateModule = await import("../../scripts/legacy-cleanup-gate.mjs");

const {
  collectLegacyCleanupEvidence,
  DEFAULT_EVIDENCE_COMMANDS,
  ensureTelemetryReport,
  parseArgs,
  parseCommandSpec,
} = evidenceModule;
const { LEGACY_COUNTERS } = gateModule;

test("parseArgs uses default evidence command and accepts explicit commands", () => {
  assert.deepEqual(parseArgs(["--file", "/tmp/legacy.json"], {}).commands, DEFAULT_EVIDENCE_COMMANDS);
  assert.deepEqual(parseArgs(["--file=/tmp/legacy.json", "--command", "[\"node\",\"-e\",\"process.exit(0)\"]"], {}).commands, [
    ["node", "-e", "process.exit(0)"],
  ]);
  assert.throws(() => parseArgs([], {}), /No telemetry file/);
});

test("parseCommandSpec rejects invalid command specs", () => {
  assert.deepEqual(parseCommandSpec("[\"npm\",\"run\",\"baseline:refactor:gate\"]"), [
    "npm",
    "run",
    "baseline:refactor:gate",
  ]);
  assert.throws(() => parseCommandSpec("npm run test"), /JSON string array/);
  assert.throws(() => parseCommandSpec("[]"), /non-empty/);
});

test("ensureTelemetryReport creates a zero snapshot when representative commands do not touch legacy paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "gsd-legacy-cleanup-evidence-"));
  const file = join(root, "nested", "legacy-telemetry.json");

  const report = await ensureTelemetryReport(file);

  assert.equal(typeof report.ts, "string");
  assert.deepEqual(report.counters, Object.fromEntries(LEGACY_COUNTERS.map((counter: string) => [counter, 0])));
  assert.deepEqual(JSON.parse(await readFile(file, "utf-8")).counters, report.counters);
});

test("collectLegacyCleanupEvidence reports nonzero counters as blockers", async () => {
  const root = await mkdtemp(join(tmpdir(), "gsd-legacy-cleanup-blocked-"));
  const file = join(root, "legacy-telemetry.json");
  const counters = Object.fromEntries(LEGACY_COUNTERS.map((counter: string) => [counter, 0]));
  counters["legacy.workflowEngineUsed"] = 1;
  await writeFile(file, JSON.stringify({ ts: "snapshot", counters }), "utf-8");

  const result = await collectLegacyCleanupEvidence({
    file,
    json: false,
    commands: [["node", "-e", "process.exit(0)"]],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.nonZero, [{ counter: "legacy.workflowEngineUsed", value: 1 }]);
});
