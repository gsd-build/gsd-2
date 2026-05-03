// GSD-2 + metrics saveLedger fallback: when lock is not acquired, falls back to direct write (safe, no torn write)

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  initMetrics,
  resetMetrics,
  snapshotUnitMetrics,
  type MetricsLedger,
} from "../metrics.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-metrics-lock-na-"));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

function metricsPath(base: string): string {
  return join(base, ".gsd", "metrics.json");
}

function lockPath(base: string): string {
  return metricsPath(base) + ".lock";
}

function assistantCtx(): any {
  const entries = [
    {
      type: "message",
      id: "entry-0",
      parentId: null,
      timestamp: new Date().toISOString(),
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        usage: {
          input: 1000,
          output: 500,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1500,
          cost: 0.01,
        },
      },
    },
  ];
  return { sessionManager: { getEntries: () => entries } };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("saveLedger: fallback behavior when lock is not acquired", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeProjectDir();
  });

  afterEach(() => {
    resetMetrics();
    // Clean up lock file if test left it
    try { rmSync(lockPath(tmpDir), { force: true }); } catch {}
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test(
    "saveLedger falls back to direct write and produces a valid metrics file when lock times out",
    { timeout: 10000 }, // 10s to accommodate the 2s lock acquire timeout
    () => {
      const lp = lockPath(tmpDir);

      // Simulate another process holding the lock: create the lock file with a
      // fresh mtime so acquireLock cannot evict it as stale. acquireLock will
      // retry for its full 2s timeout then return false, triggering the fallback.
      const fd = openSync(lp, "w");
      closeSync(fd);
      writeFileSync(lp, `99999\n${new Date().toISOString()}\n`, "utf-8");

      // Initialize metrics and snapshot — snapshotUnitMetrics calls saveLedger
      // internally, which will timeout on the held lock and fall back to a direct
      // write instead of proceeding unprotected through the read-merge-write path.
      initMetrics(tmpDir);

      const ctx = assistantCtx();
      const unit = snapshotUnitMetrics(
        ctx,
        "execute-task",
        "M001/S01/T01",
        Date.now() - 1000,
        "test-model",
      );
      assert.ok(
        unit !== null,
        "snapshotUnitMetrics must return a unit even when lock is held",
      );

      // The metrics file must exist — fallback direct write succeeded.
      assert.ok(
        existsSync(metricsPath(tmpDir)),
        "metrics.json must exist after saveLedger fallback write",
      );

      // The metrics file must be valid JSON containing the snapshotted unit.
      const raw = readFileSync(metricsPath(tmpDir), "utf-8");
      let ledger: MetricsLedger;
      assert.doesNotThrow(() => {
        ledger = JSON.parse(raw) as MetricsLedger;
      }, "metrics.json must be valid JSON after fallback write");
      assert.ok(Array.isArray(ledger!.units), "metrics.json must have a units array");
      assert.ok(
        ledger!.units.length > 0,
        "metrics.json must contain the snapshotted unit",
      );

      // The lock file must still exist — saveLedger must not release a lock
      // that it did not acquire (no double-free / unlink of another process's lock).
      assert.ok(
        existsSync(lp),
        "lock file must remain untouched (saveLedger must not release a lock it did not acquire)",
      );

      // Release our manually-held lock so afterEach cleanup works cleanly.
      rmSync(lp, { force: true });
    },
  );
});
