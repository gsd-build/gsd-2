// GSD-2 + metrics-lock-retry-sleep.test.ts: verify sleep between lock acquire retries (M3 follow-up)
/**
 * Verifies that acquireLock sleeps between non-stale-evicting retries:
 *
 *   1. Under contention: a child process holds the lock for 100ms; the main
 *      process acquireLock attempt should make at most ~30 sleepy retries
 *      (100ms contention / 5ms sleep) — not thousands as would occur without
 *      the sleep.
 *
 *   2. Stale-lock eviction path: when a stale lock is detected and forcibly
 *      removed, the subsequent acquire attempt does NOT sleep — the sleepy
 *      retry counter stays at zero and the acquire succeeds immediately.
 *
 *   3. Regression: M3 lock-hardening tests still pass (invoked separately
 *      as part of the test suite — tested here by exercising the same
 *      stale-lock + PID-stamp code paths through snapshotUnitMetrics).
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";

import {
  initMetrics,
  resetMetrics,
  snapshotUnitMetrics,
  STALE_LOCK_THRESHOLD_MS,
  LOCK_RETRY_INTERVAL_MS,
  getLockSleepyRetries,
  resetLockSleepyRetries,
} from "../metrics.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-metrics-sleep-"));
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
  return {
    sessionManager: {
      getEntries: () => [
        {
          type: "message",
          id: "entry-0",
          parentId: null,
          timestamp: new Date().toISOString(),
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Done" }],
            usage: {
              input: 100,
              output: 50,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 150,
              cost: 0.001,
            },
          },
        },
      ],
    },
  };
}

// Worker that acquires the lock using O_EXCL and holds it for holdMs, then releases.
// Writes its PID to stdout once the lock is acquired so the caller can synchronize.
const LOCK_HOLDER_WORKER = `
const { openSync, closeSync, writeFileSync, unlinkSync } = require('node:fs');
const lockPath = process.env.GSD_TEST_LOCK_PATH;
const holdMs = parseInt(process.env.GSD_TEST_HOLD_MS || '100', 10);

const deadline = Date.now() + 3000;
let acquired = false;
while (Date.now() < deadline) {
  try {
    const fd = openSync(lockPath, 'wx');
    closeSync(fd);
    writeFileSync(lockPath, process.pid + '\\n' + new Date().toISOString() + '\\n', 'utf-8');
    acquired = true;
    break;
  } catch { /* retry */ }
}

if (!acquired) {
  process.stderr.write('Worker failed to acquire lock\\n');
  process.exit(1);
}

// Signal that the lock is held.
process.stdout.write(String(process.pid) + '\\n');

// Hold the lock.
const releaseAt = Date.now() + holdMs;
while (Date.now() < releaseAt) { /* spin for short hold */ }

try { unlinkSync(lockPath); } catch {}
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("metrics lock retry sleep (M3 follow-up)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeProjectDir();
    resetLockSleepyRetries();
  });

  afterEach(() => {
    resetMetrics();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Test 1: Under contention, sleep caps sleepy retries ───────────────────

  test("sleepy retry count is bounded under lock contention (5ms sleep, 500ms timeout)", () => {
    const lp = lockPath(tmpDir);

    // Spawn a child that holds the lock for 100ms.
    // We use spawnSync with a timeout > holdMs so it completes before our check.
    // But we need the child to hold first THEN we attempt. Since spawnSync blocks,
    // we pre-create the lock file instead to simulate contention for 100ms.

    // Simulate: lock is held for 100ms from now, then released.
    // We create the lock file manually (as if another process holds it) and
    // schedule its removal after 100ms using a child process that holds then deletes.
    //
    // Strategy: use a background worker via spawnSync with hold=100ms,
    // but we can't overlap with spawnSync. Instead, we directly test with
    // snapshotUnitMetrics + a pre-placed lock + a child that will remove it.
    //
    // Simplest approach: place the lock file, run snapshotUnitMetrics
    // which calls saveLedger → acquireLock. acquireLock will retry for 100ms
    // (lock file just sits there), then we remove it from a thread... but
    // there are no threads in Node main.
    //
    // The correct approach is to spawn a background child that holds the lock
    // for 100ms, and run acquireLock from the main process concurrently via
    // snapshotUnitMetrics (which is synchronous). The child is started as a
    // background process using spawn (not spawnSync), then we call
    // snapshotUnitMetrics synchronously and block until it acquires or times out.

    const child = spawn(process.execPath, ["-e", LOCK_HOLDER_WORKER], {
      env: {
        ...process.env,
        GSD_TEST_LOCK_PATH: lp,
        GSD_TEST_HOLD_MS: "100",
      },
    });

    // Wait until the child has acquired the lock (it writes PID to stdout).
    // Poll until the lock file exists (the child acquired it).
    const waitStart = Date.now();
    while (!existsSync(lp) && Date.now() - waitStart < 2000) {
      // Busy-wait for child to acquire the lock — this is test setup, not
      // production code. Short window (child acquires almost immediately).
      const arr = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(arr, 0, 0, 5);
    }

    assert.ok(existsSync(lp), "child must have acquired the lock before we attempt");

    // Now call snapshotUnitMetrics synchronously. It will call saveLedger →
    // acquireLock, which retries with 5ms sleep until the child releases (~100ms).
    initMetrics(tmpDir);
    const ctx = assistantCtx();
    const start = Date.now();
    const unit = snapshotUnitMetrics(ctx, "execute-task", "M001/S01/T01", Date.now() - 500, "test-model");
    const elapsed = Date.now() - start;

    // Clean up child.
    child.kill();

    // The operation must succeed (either by acquiring after child releases, or
    // by timeout-fallback write in saveLedger).
    assert.ok(unit !== null, "snapshotUnitMetrics must succeed under contention");

    const retries = getLockSleepyRetries();

    // With 5ms sleep and ~100ms contention, expect roughly 20 sleepy retries.
    // Upper bound: 500ms timeout / 5ms = 100. With 2s default timeout, upper
    // bound is 2000ms / 5ms = 400. But we want far fewer than the ~20,000
    // that would occur without any sleep.
    //
    // Conservative assertion: fewer than 200 sleepy retries across the wait
    // (vs ~20,000 without sleep). This is the key regression guard.
    assert.ok(
      retries < 200,
      `Expected < 200 sleepy retries with 5ms sleep, got ${retries}. ` +
      `Elapsed: ${elapsed}ms. LOCK_RETRY_INTERVAL_MS=${LOCK_RETRY_INTERVAL_MS}`,
    );

    // Sanity: at least a few retries happened (lock was actually contested).
    assert.ok(
      retries >= 1,
      `Expected at least 1 sleepy retry (lock was held by child), got ${retries}`,
    );
  });

  // ── Test 2: Stale-lock eviction does NOT sleep ────────────────────────────

  test("stale-lock eviction path retries immediately without incrementing sleepy counter", () => {
    const lp = lockPath(tmpDir);

    // Create a stale lock (mtime older than STALE_LOCK_THRESHOLD_MS).
    writeFileSync(lp, `999999\n${new Date(Date.now() - STALE_LOCK_THRESHOLD_MS - 500).toISOString()}\n`, "utf-8");
    const staleTime = (Date.now() - STALE_LOCK_THRESHOLD_MS - 500) / 1000;
    utimesSync(lp, staleTime, staleTime);

    assert.ok(existsSync(lp), "stale lock file must exist before acquire");

    initMetrics(tmpDir);
    const ctx = assistantCtx();

    const start = Date.now();
    const unit = snapshotUnitMetrics(ctx, "execute-task", "M002/S01/T01", Date.now() - 200, "test-model");
    const elapsed = Date.now() - start;

    assert.ok(unit !== null, "snapshotUnitMetrics must succeed after stale-lock eviction");

    const retries = getLockSleepyRetries();

    // The stale-lock path uses `continue` (no sleep), so the sleepy retry
    // counter must be zero: the lock was evicted and the very next openSync
    // call succeeded — no sleepy retry was needed.
    assert.equal(
      retries,
      0,
      `Expected 0 sleepy retries after stale-lock eviction, got ${retries}. ` +
      `Elapsed: ${elapsed}ms`,
    );

    // Should complete very quickly (no artificial delay).
    assert.ok(
      elapsed < 200,
      `Stale-lock recovery should complete quickly, took ${elapsed}ms`,
    );
  });

  // ── Test 3: M3 regression — stale lock recovers + metrics written ─────────

  test("M3 regression: stale lock from dead process is cleared and metrics are written", () => {
    const lp = lockPath(tmpDir);

    // Backdate the lock file to simulate a crashed process.
    const stalePid = 9999999;
    writeFileSync(
      lp,
      `${stalePid}\n${new Date(Date.now() - STALE_LOCK_THRESHOLD_MS - 1000).toISOString()}\n`,
      "utf-8",
    );
    const staleTime = (Date.now() - STALE_LOCK_THRESHOLD_MS - 1000) / 1000;
    utimesSync(lp, staleTime, staleTime);

    initMetrics(tmpDir);
    const ctx = assistantCtx();
    const unit = snapshotUnitMetrics(ctx, "execute-task", "M003/S01/T01", Date.now() - 300, "test-model");

    assert.ok(unit !== null, "snapshotUnitMetrics must succeed after stale lock from dead process");
    assert.equal(unit!.id, "M003/S01/T01");
    assert.ok(
      existsSync(metricsPath(tmpDir)),
      "metrics.json must exist after recovery",
    );
  });
});
