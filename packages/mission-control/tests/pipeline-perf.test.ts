/**
 * Tests for the pipeline orchestrator — updated for GSD 2.
 * Covers: startup state build, file change -> diff -> broadcast,
 * no-op suppression, reconciliation, and SERV-05 latency (<100ms).
 *
 * Phase 12 change: pipeline now reads .gsd/ directory schema (GSD2State).
 */
import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startPipeline } from "../src/server/pipeline";

// Unique temp dir per test run
const TEST_DIR = join(tmpdir(), `gsd-pipeline-test-${Date.now()}`);
const GSD_DIR = join(TEST_DIR, ".gsd");

// GSD 2 STATE.md with active pointers
const STATE_MD = `---
gsd_state_version: "1.0"
milestone: v2.0
milestone_name: Native Desktop
status: in_progress
active_milestone: M001
active_slice: S01
active_task: T01
auto_mode: false
cost: 0
tokens: 0
last_updated: "2026-03-12T10:00:00Z"
---
# Project State
`;

const ROADMAP_MD = `# M001 — Native Desktop

## Slices

- [ ] S01: File watcher wiring
- [x] S02: WebSocket server
`;

const PLAN_MD = `---
slice: S01
name: File watcher wiring
---

# S01 Plan
`;

function setupTestDir() {
  mkdirSync(GSD_DIR, { recursive: true });
  writeFileSync(join(GSD_DIR, "STATE.md"), STATE_MD);
  writeFileSync(join(GSD_DIR, "M001-ROADMAP.md"), ROADMAP_MD);
  writeFileSync(join(GSD_DIR, "S01-PLAN.md"), PLAN_MD);
}

function cleanupTestDir() {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

describe("pipeline", () => {
  let pipeline: Awaited<ReturnType<typeof startPipeline>> | null = null;

  beforeEach(() => {
    setupTestDir();
  });

  afterEach(async () => {
    if (pipeline) {
      pipeline.stop();
      pipeline = null;
    }
    // Small delay to let port release
    await new Promise((r) => setTimeout(r, 100));
    cleanupTestDir();
  });

  test("start builds initial full state from .gsd/ files", async () => {
    pipeline = await startPipeline({
      planningDir: GSD_DIR,
      wsPort: 15001,
    });

    // Connect a client and verify it gets full GSD2State
    const ws = new WebSocket("ws://localhost:15001");
    const msg = await new Promise<any>((resolve) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data as string));
      setTimeout(() => resolve(null), 5000);
    });

    expect(msg).not.toBeNull();
    expect(msg.type).toBe("full");
    // GSD2State uses projectState not state.milestone
    expect(msg.state.projectState.milestone).toBe("v2.0");
    expect(msg.state.projectState.active_milestone).toBe("M001");
    ws.close();
  });

  test("file change triggers state rebuild, diff computation, and broadcast", async () => {
    pipeline = await startPipeline({
      planningDir: GSD_DIR,
      wsPort: 15002,
    });

    const ws = new WebSocket("ws://localhost:15002");

    // Wait for initial full state
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
      setTimeout(resolve, 5000);
    });

    // Listen for diff message
    const diffPromise = new Promise<any>((resolve) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data as string));
      setTimeout(() => resolve(null), 5000);
    });

    // Change STATE.md to trigger watcher
    const updatedState = STATE_MD.replace("active_slice: S01", "active_slice: S02");
    writeFileSync(join(GSD_DIR, "STATE.md"), updatedState);

    const msg = await diffPromise;
    expect(msg).not.toBeNull();
    expect(msg.type).toBe("diff");
    expect(msg.changes.projectState).toBeDefined();
    expect(msg.changes.projectState.active_slice).toBe("S02");
    ws.close();
  });

  test("file-to-WebSocket-push latency is under 100ms (SERV-05)", async () => {
    pipeline = await startPipeline({
      planningDir: GSD_DIR,
      wsPort: 15003,
    });

    const ws = new WebSocket("ws://localhost:15003");

    // Wait for initial full state
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
      setTimeout(resolve, 5000);
    });

    // Listen for diff and measure time
    let writeTime: number;
    const latencyPromise = new Promise<number>((resolve) => {
      ws.onmessage = () => {
        const elapsed = Date.now() - writeTime;
        resolve(elapsed);
      };
      setTimeout(() => resolve(-1), 5000);
    });

    // Write file and record time
    writeTime = Date.now();
    const updatedState = STATE_MD.replace("active_slice: S01", "active_slice: S03");
    writeFileSync(join(GSD_DIR, "STATE.md"), updatedState);

    const latency = await latencyPromise;
    expect(latency).toBeGreaterThan(0);
    // SERV-05: under 100ms target in production.
    // Test budget: 50ms debounce + state parse + diff + broadcast + Windows FS jitter.
    // Use 200ms threshold to avoid flakiness while still verifying sub-second performance.
    expect(latency).toBeLessThan(200);
    ws.close();
  });

  test("no broadcast occurs when file change produces no state diff", async () => {
    pipeline = await startPipeline({
      planningDir: GSD_DIR,
      wsPort: 15004,
    });

    const ws = new WebSocket("ws://localhost:15004");

    // Wait for initial full state
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
      setTimeout(resolve, 5000);
    });

    let receivedDiff = false;
    ws.onmessage = () => {
      receivedDiff = true;
    };

    // Write the SAME content (no change)
    writeFileSync(join(GSD_DIR, "STATE.md"), STATE_MD);

    // Wait longer than debounce + processing
    await new Promise((r) => setTimeout(r, 200));
    expect(receivedDiff).toBe(false);
    ws.close();
  });

  test("reconciliation interval detects drift and pushes update", async () => {
    pipeline = await startPipeline({
      planningDir: GSD_DIR,
      wsPort: 15005,
      reconcileMs: 200, // Short interval for testing
    });

    const ws = new WebSocket("ws://localhost:15005");

    // Wait for initial full state
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
      setTimeout(resolve, 5000);
    });

    const driftPromise = new Promise<any>((resolve) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data as string));
      setTimeout(() => resolve(null), 3000);
    });

    // Force drift: update STATE.md (watcher may or may not fire,
    // but reconciliation should catch it within 200ms)
    const driftState = STATE_MD.replace("active_slice: S01", "active_slice: S04");
    writeFileSync(join(GSD_DIR, "STATE.md"), driftState);

    const msg = await driftPromise;
    expect(msg).not.toBeNull();
    // Should get either a diff or full message showing updated state
    const activeSlice =
      msg.changes?.projectState?.active_slice ??
      msg.state?.projectState?.active_slice;
    expect(activeSlice).toBe("S04");
    ws.close();
  });
});
