// Project/App: GSD-2
// File Purpose: Tests the Phase 8 legacy cleanup telemetry gate.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const gateModule = await import("../../scripts/legacy-cleanup-gate.mjs");

const {
  LEGACY_COUNTERS,
  evaluateLegacyCleanupGate,
  parseArgs,
  readTelemetryReport,
  renderLegacyCleanupGateSummary,
} = gateModule;

test("parseArgs accepts file path from flag or environment", () => {
  assert.deepEqual(parseArgs(["--file", "/tmp/legacy.json"], {}), {
    file: "/tmp/legacy.json",
    json: false,
  });
  assert.deepEqual(parseArgs(["--json"], { GSD_LEGACY_TELEMETRY_FILE: "/tmp/from-env.json" }), {
    file: "/tmp/from-env.json",
    json: true,
  });
  assert.throws(() => parseArgs([], {}), /No telemetry file/);
});

test("evaluateLegacyCleanupGate passes when every counter is zero", () => {
  const counters = Object.fromEntries(LEGACY_COUNTERS.map((counter: string) => [counter, 0]));

  const result = evaluateLegacyCleanupGate({ ts: "2026-05-04T00:00:00.000Z", counters });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.nonZero, []);
});

test("evaluateLegacyCleanupGate blocks on nonzero or missing counters", () => {
  const counters = Object.fromEntries(LEGACY_COUNTERS.map((counter: string) => [counter, 0]));
  delete counters["legacy.uokFallbackUsed"];
  counters["legacy.mcpAliasUsed"] = 2;

  const result = evaluateLegacyCleanupGate({ ts: "snapshot", counters });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["legacy.uokFallbackUsed"]);
  assert.deepEqual(result.nonZero, [{ counter: "legacy.mcpAliasUsed", value: 2 }]);
});

test("readTelemetryReport parses persisted snapshot files", async () => {
  const root = await mkdtemp(join(tmpdir(), "gsd-legacy-cleanup-gate-"));
  const path = join(root, "nested", "legacy-telemetry.json");
  await mkdir(join(root, "nested"), { recursive: true });
  const counters = Object.fromEntries(LEGACY_COUNTERS.map((counter: string) => [counter, 0]));
  await writeFile(path, JSON.stringify({ ts: "snapshot", counters }), "utf-8");

  const report = await readTelemetryReport(path);

  assert.equal(report.ts, "snapshot");
  assert.equal(report.counters["legacy.providerDefaultUsed"], 0);
});

test("renderLegacyCleanupGateSummary includes blockers", () => {
  const counters = Object.fromEntries(LEGACY_COUNTERS.map((counter: string) => [counter, 0]));
  counters["legacy.componentFormatUsed"] = 1;
  const result = evaluateLegacyCleanupGate({ ts: "snapshot", counters });

  const summary = renderLegacyCleanupGateSummary(result);

  assert.match(summary, /Status: BLOCK/);
  assert.match(summary, /legacy\.componentFormatUsed: 1/);
});
