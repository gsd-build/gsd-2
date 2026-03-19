/**
 * Tests for state differ (computeDiff) and WebSocket server (createWsServer).
 * Updated for GSD 2: uses GSD2State shape (projectState, roadmap, activePlan, etc.)
 */
import { describe, test, expect, afterEach } from "bun:test";
import { computeDiff } from "../src/server/differ";
import { createWsServer } from "../src/server/ws-server";
import type { GSD2State } from "../src/server/types";

// -- Helper: minimal GSD2State factory --

function makeGSD2State(overrides?: Partial<GSD2State>): GSD2State {
  return {
    projectState: {
      gsd_state_version: "1.0",
      milestone: "v2.0",
      milestone_name: "Native Desktop",
      status: "in_progress",
      active_milestone: "M001",
      active_slice: "S01",
      active_task: "T01",
      auto_mode: false,
      cost: 0,
      tokens: 0,
      last_updated: "2026-03-12T10:00:00Z",
    },
    roadmap: null,
    activePlan: null,
    activeTask: null,
    decisions: null,
    preferences: null,
    project: null,
    milestoneContext: null,
    needsMigration: false,
    ...overrides,
  };
}

// ============================================================
// computeDiff tests
// ============================================================

describe("computeDiff", () => {
  test("returns null when old and new state are identical", () => {
    const state = makeGSD2State();
    const result = computeDiff(state, state);
    expect(result).toBeNull();
  });

  test("returns null for deep-equal but different references", () => {
    const a = makeGSD2State();
    const b = makeGSD2State();
    const result = computeDiff(a, b);
    expect(result).toBeNull();
  });

  test("returns StateDiff with only changed top-level keys", () => {
    const oldState = makeGSD2State();
    const newState = makeGSD2State({
      preferences: {
        budget_ceiling: 100,
        skill_discovery: "auto",
      },
    });

    const result = computeDiff(oldState, newState);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("diff");
    expect(result!.changes.preferences).toBeDefined();
    expect(result!.changes.preferences!.budget_ceiling).toBe(100);
    // Other keys should NOT be in changes
    expect(result!.changes.projectState).toBeUndefined();
    expect(result!.changes.roadmap).toBeUndefined();
    expect(result!.changes.activePlan).toBeUndefined();
    expect(result!.changes.needsMigration).toBeUndefined();
  });

  test("detects changes in nested objects (e.g., projectState.status)", () => {
    const oldState = makeGSD2State();
    const newState = makeGSD2State({
      projectState: {
        ...oldState.projectState,
        status: "complete",
        active_milestone: "M002",
      },
    });

    const result = computeDiff(oldState, newState);
    expect(result).not.toBeNull();
    expect(result!.changes.projectState).toBeDefined();
    expect(result!.changes.projectState!.status).toBe("complete");
    expect(result!.changes.projectState!.active_milestone).toBe("M002");
  });

  test("returns timestamp in diff result", () => {
    const oldState = makeGSD2State();
    const newState = makeGSD2State({
      decisions: "# ADR-001: Use Bun\n",
    });

    const before = Date.now();
    const result = computeDiff(oldState, newState);
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBeGreaterThanOrEqual(before);
    expect(result!.timestamp).toBeLessThanOrEqual(after);
  });

  test("detects needsMigration change", () => {
    const oldState = makeGSD2State({ needsMigration: false });
    const newState = makeGSD2State({ needsMigration: true });

    const result = computeDiff(oldState, newState);
    expect(result).not.toBeNull();
    expect(result!.changes.needsMigration).toBe(true);
  });
});

// ============================================================
// WebSocket server tests
// ============================================================

describe("createWsServer", () => {
  let server: ReturnType<typeof createWsServer> | null = null;

  afterEach(() => {
    if (server) {
      server.stop();
      server = null;
    }
  });

  test("accepts connections on specified port", async () => {
    const state = makeGSD2State();
    server = createWsServer({ port: 14001, getFullState: () => state });

    const ws = new WebSocket("ws://localhost:14001");
    const connected = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 3000);
    });

    expect(connected).toBe(true);
    ws.close();
  });

  test("sends full state message on client connect", async () => {
    const state = makeGSD2State();
    server = createWsServer({ port: 14002, getFullState: () => state });

    const ws = new WebSocket("ws://localhost:14002");
    const msg = await new Promise<any>((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data as string));
      };
      setTimeout(() => resolve(null), 3000);
    });

    expect(msg).not.toBeNull();
    expect(msg.type).toBe("full");
    expect(msg.state).toBeDefined();
    // GSD2State has projectState not state.milestone
    expect(msg.state.projectState.milestone).toBe("v2.0");
    expect(typeof msg.sequence).toBe("number");
    expect(typeof msg.timestamp).toBe("number");
    ws.close();
  });

  test("broadcasts diff messages to all connected clients", async () => {
    const state = makeGSD2State();
    server = createWsServer({ port: 14003, getFullState: () => state });

    // Connect two clients
    const ws1 = new WebSocket("ws://localhost:14003");
    const ws2 = new WebSocket("ws://localhost:14003");

    // Wait for both to receive initial full state
    await Promise.all([
      new Promise<void>((resolve) => {
        ws1.onmessage = () => resolve();
        setTimeout(resolve, 3000);
      }),
      new Promise<void>((resolve) => {
        ws2.onmessage = () => resolve();
        setTimeout(resolve, 3000);
      }),
    ]);

    // Set up diff message listeners
    const diffPromise1 = new Promise<any>((resolve) => {
      ws1.onmessage = (event) => resolve(JSON.parse(event.data as string));
      setTimeout(() => resolve(null), 3000);
    });
    const diffPromise2 = new Promise<any>((resolve) => {
      ws2.onmessage = (event) => resolve(JSON.parse(event.data as string));
      setTimeout(() => resolve(null), 3000);
    });

    // Broadcast a diff with GSD2State field
    server.broadcast({
      type: "diff",
      changes: { decisions: "# ADR-001: Use GSD 2\n" },
      timestamp: Date.now(),
      sequence: 0,
    });

    const [msg1, msg2] = await Promise.all([diffPromise1, diffPromise2]);

    expect(msg1).not.toBeNull();
    expect(msg1.type).toBe("diff");
    expect(msg2).not.toBeNull();
    expect(msg2.type).toBe("diff");

    ws1.close();
    ws2.close();
  });

  test("responds to refresh message with full state", async () => {
    const state = makeGSD2State();
    server = createWsServer({ port: 14004, getFullState: () => state });

    const ws = new WebSocket("ws://localhost:14004");

    // Consume initial full state message
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
      setTimeout(resolve, 3000);
    });

    // Send refresh and listen for response
    const refreshMsg = new Promise<any>((resolve) => {
      ws.onmessage = (event) => resolve(JSON.parse(event.data as string));
      setTimeout(() => resolve(null), 3000);
    });

    ws.send("refresh");

    const msg = await refreshMsg;
    expect(msg).not.toBeNull();
    expect(msg.type).toBe("full");
    expect(msg.state).toBeDefined();
    ws.close();
  });

  test("messages include monotonic sequence numbers", async () => {
    const state = makeGSD2State();
    server = createWsServer({ port: 14005, getFullState: () => state });

    const ws = new WebSocket("ws://localhost:14005");

    const messages: any[] = [];
    const msgPromise = new Promise<void>((resolve) => {
      ws.onmessage = (event) => {
        messages.push(JSON.parse(event.data as string));
        if (messages.length >= 3) resolve();
      };
      setTimeout(resolve, 5000);
    });

    // Wait for initial message
    await new Promise<void>((resolve) => {
      const origHandler = ws.onmessage;
      ws.onmessage = (event) => {
        messages.push(JSON.parse(event.data as string));
        ws.onmessage = (e) => {
          messages.push(JSON.parse(e.data as string));
          if (messages.length >= 3) resolve();
        };
        // Trigger two broadcasts after initial
        server!.broadcast({
          type: "diff",
          changes: { decisions: "# ADR-001\n" },
          timestamp: Date.now(),
          sequence: 0,
        });
        server!.broadcast({
          type: "diff",
          changes: { project: "# My Project\n" },
          timestamp: Date.now(),
          sequence: 0,
        });
      };
      setTimeout(resolve, 5000);
    });

    // Verify monotonic sequence: each should be greater than the previous
    expect(messages.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].sequence).toBeGreaterThan(messages[i - 1].sequence);
    }

    ws.close();
  });
});
