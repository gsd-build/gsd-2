/**
 * Tests for state differ (computeDiff) and WebSocket server (createWsServer).
 */
import { describe, test, expect, afterEach } from "bun:test";
import { computeDiff } from "../src/server/differ";
import { createWsServer } from "../src/server/ws-server";
import type { PlanningState } from "../src/server/types";

// -- Helper: minimal PlanningState factory --

function makePlanningState(overrides?: Partial<PlanningState>): PlanningState {
  return {
    roadmap: { phases: [] },
    state: {
      milestone: "v1.0",
      milestone_name: "milestone",
      status: "in_progress",
      stopped_at: "",
      last_updated: "",
      last_activity: "",
      progress: {
        total_phases: 10,
        completed_phases: 1,
        total_plans: 5,
        completed_plans: 3,
        percent: 60,
      },
    },
    config: {
      model_profile: "balanced",
      commit_docs: false,
      search_gitignored: false,
      branching_strategy: "none",
      phase_branch_template: "",
      milestone_branch_template: "",
      workflow: {
        research: true,
        plan_check: true,
        verifier: true,
        nyquist_validation: true,
        _auto_chain_active: false,
      },
      parallelization: false,
      brave_search: false,
      mode: "balanced",
      granularity: "fine",
    },
    phases: [],
    requirements: [],
    ...overrides,
  };
}

// ============================================================
// computeDiff tests
// ============================================================

describe("computeDiff", () => {
  test("returns null when old and new state are identical", () => {
    const state = makePlanningState();
    const result = computeDiff(state, state);
    expect(result).toBeNull();
  });

  test("returns null for deep-equal but different references", () => {
    const a = makePlanningState();
    const b = makePlanningState();
    const result = computeDiff(a, b);
    expect(result).toBeNull();
  });

  test("returns StateDiff with only changed top-level keys", () => {
    const oldState = makePlanningState();
    const newState = makePlanningState({
      config: {
        ...oldState.config,
        mode: "yolo",
      },
    });

    const result = computeDiff(oldState, newState);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("diff");
    expect(result!.changes.config).toBeDefined();
    expect(result!.changes.config!.mode).toBe("yolo");
    // Other keys should NOT be in changes
    expect(result!.changes.roadmap).toBeUndefined();
    expect(result!.changes.state).toBeUndefined();
    expect(result!.changes.phases).toBeUndefined();
    expect(result!.changes.requirements).toBeUndefined();
  });

  test("detects changes in nested objects (e.g., progress.percent)", () => {
    const oldState = makePlanningState();
    const newState = makePlanningState({
      state: {
        ...oldState.state,
        progress: {
          ...oldState.state.progress,
          percent: 80,
        },
      },
    });

    const result = computeDiff(oldState, newState);
    expect(result).not.toBeNull();
    expect(result!.changes.state).toBeDefined();
    expect(result!.changes.state!.progress.percent).toBe(80);
  });

  test("returns timestamp in diff result", () => {
    const oldState = makePlanningState();
    const newState = makePlanningState({
      requirements: [{ id: "X-01", description: "test", completed: true }],
    });

    const before = Date.now();
    const result = computeDiff(oldState, newState);
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBeGreaterThanOrEqual(before);
    expect(result!.timestamp).toBeLessThanOrEqual(after);
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
    const state = makePlanningState();
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
    const state = makePlanningState();
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
    expect(msg.state.state.milestone).toBe("v1.0");
    expect(typeof msg.sequence).toBe("number");
    expect(typeof msg.timestamp).toBe("number");
    ws.close();
  });

  test("broadcasts diff messages to all connected clients", async () => {
    const state = makePlanningState();
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

    // Broadcast a diff
    server.broadcast({
      type: "diff",
      changes: { config: { ...state.config, mode: "yolo" } },
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
    const state = makePlanningState();
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
    const state = makePlanningState();
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
          changes: { config: { ...state.config, mode: "yolo" } },
          timestamp: Date.now(),
          sequence: 0,
        });
        server!.broadcast({
          type: "diff",
          changes: { config: { ...state.config, mode: "fast" } },
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
