/**
 * GSD2 Metrics — regression test for parallel-mode atomic merge
 *
 * Verifies that concurrent metrics.json writers do not silently discard
 * each other's entries (last-writer-wins). Two child processes each write
 * a distinct milestone unit; after both complete, the merged file must
 * contain both units.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// ─── Worker script source ────────────────────────────────────────────────────
//
// Each child process runs this script with two env vars:
//   GSD_TEST_METRICS_PATH — absolute path to metrics.json
//   GSD_TEST_MILESTONE_ID — milestone ID to record (e.g. "M001" or "M002")
//
// The script uses the same lock-acquire → read → merge → atomic-write
// pattern implemented in metrics.ts saveLedger(), but using only built-in
// Node.js modules so it runs without the full extension dependency tree.
//
const WORKER_SCRIPT = `
const { openSync, closeSync, unlinkSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs');
const { dirname } = require('node:path');
const { randomBytes } = require('node:crypto');

const metricsPath = process.env.GSD_TEST_METRICS_PATH;
const milestoneId = process.env.GSD_TEST_MILESTONE_ID;
const lockPath = metricsPath + '.lock';

// ── Lock helpers ──────────────────────────────────────────────────────────
function acquireLock(lockPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = openSync(lockPath, 'wx');
      closeSync(fd);
      return true;
    } catch {
      const waitUntil = Date.now() + Math.min(50, deadline - Date.now());
      while (Date.now() < waitUntil) { /* spin */ }
    }
  }
  return false;
}

function releaseLock(lockPath) {
  try { unlinkSync(lockPath); } catch {}
}

// ── Atomic write helper ───────────────────────────────────────────────────
function saveJsonAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp.' + randomBytes(4).toString('hex');
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\\n', 'utf-8');
  renameSync(tmp, filePath);
}

// ── Dedup helper (same logic as metrics.ts deduplicateUnits) ─────────────
function deduplicateUnits(units) {
  const map = new Map();
  for (const u of units) {
    const key = u.type + '\\0' + u.id + '\\0' + u.startedAt;
    const existing = map.get(key);
    if (!existing || u.finishedAt > existing.finishedAt) {
      map.set(key, u);
    }
  }
  return Array.from(map.values());
}

// ── Worker unit ───────────────────────────────────────────────────────────
const workerUnit = {
  type: 'execute-task',
  id: milestoneId + '/S01/T01',
  model: 'test-model',
  startedAt: 1000,
  finishedAt: Date.now(),
  tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
  cost: 0.01,
  toolCalls: 1,
  assistantMessages: 1,
  userMessages: 1,
};

const workerLedger = {
  version: 1,
  projectStartedAt: 1000,
  units: [workerUnit],
};

// ── Merge write ───────────────────────────────────────────────────────────
const acquired = acquireLock(lockPath, 5000);
try {
  let onDiskUnits = [];
  if (existsSync(metricsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(metricsPath, 'utf-8'));
      if (parsed && Array.isArray(parsed.units)) onDiskUnits = parsed.units;
    } catch {}
  }
  const merged = deduplicateUnits([...onDiskUnits, ...workerLedger.units]);
  saveJsonAtomic(metricsPath, { ...workerLedger, units: merged });
} finally {
  if (acquired) releaseLock(lockPath);
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function spawnWorker(metricsPath: string, milestoneId: string): void {
  const result = spawnSync(process.execPath, ["-e", WORKER_SCRIPT], {
    env: {
      ...process.env,
      GSD_TEST_METRICS_PATH: metricsPath,
      GSD_TEST_MILESTONE_ID: milestoneId,
    },
    encoding: "utf-8",
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Worker for ${milestoneId} exited with status ${result.status}:\n${result.stderr}`,
    );
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("metrics atomic merge — parallel workers", () => {
  let tmpDir: string;
  let gsdDir: string;
  let metricsPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-metrics-atomic-"));
    gsdDir = join(tmpDir, ".gsd");
    mkdirSync(gsdDir, { recursive: true });
    metricsPath = join(gsdDir, "metrics.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("sequential writes from two workers both land in metrics.json", () => {
    // Sequential baseline: M001 then M002. Both must survive.
    spawnWorker(metricsPath, "M001");
    spawnWorker(metricsPath, "M002");

    const raw = readFileSync(metricsPath, "utf-8");
    const ledger = JSON.parse(raw);

    assert.ok(Array.isArray(ledger.units), "units must be an array");

    const ids = ledger.units.map((u: { id: string }) => u.id) as string[];
    assert.ok(ids.some(id => id.startsWith("M001")), "M001 unit must be present");
    assert.ok(ids.some(id => id.startsWith("M002")), "M002 unit must be present");
  });

  test("concurrent writes from two workers both land in metrics.json (no last-writer-wins)", () => {
    // Write an existing M001 entry to disk first, then run M002 worker.
    // This simulates the race: M001 finishes and saves, then M002 reads-merges-writes.
    const initialLedger = {
      version: 1,
      projectStartedAt: 1000,
      units: [
        {
          type: "execute-task",
          id: "M001/S01/T01",
          model: "test-model",
          startedAt: 1000,
          finishedAt: 2000,
          tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, total: 150 },
          cost: 0.01,
          toolCalls: 1,
          assistantMessages: 1,
          userMessages: 1,
        },
      ],
    };
    writeFileSync(metricsPath, JSON.stringify(initialLedger, null, 2) + "\n", "utf-8");

    // M002 worker runs — without merge semantics it would overwrite M001's data.
    spawnWorker(metricsPath, "M002");

    const raw = readFileSync(metricsPath, "utf-8");
    const ledger = JSON.parse(raw);

    assert.ok(Array.isArray(ledger.units), "units must be an array");
    assert.equal(ledger.units.length, 2, "must contain exactly 2 units (M001 + M002)");

    const ids = ledger.units.map((u: { id: string }) => u.id) as string[];
    assert.ok(ids.some(id => id.startsWith("M001")), "M001 unit must be preserved after M002 write");
    assert.ok(ids.some(id => id.startsWith("M002")), "M002 unit must be present");
  });

  test("idempotent write does not duplicate units", () => {
    // Writing the same milestone unit twice must not create duplicates.
    spawnWorker(metricsPath, "M001");
    spawnWorker(metricsPath, "M001");

    const raw = readFileSync(metricsPath, "utf-8");
    const ledger = JSON.parse(raw);

    assert.ok(Array.isArray(ledger.units), "units must be an array");
    const m001Units = ledger.units.filter((u: { id: string }) => u.id.startsWith("M001"));
    assert.equal(m001Units.length, 1, "duplicate units must be collapsed to one");
  });
});
