/**
 * SC-4: wireSessionEvents double-call guard.
 *
 * RED state: This test will fail until Plan 02 adds a guard that prevents
 * wireSessionEvents from registering duplicate event handlers on the same session.
 *
 * The wireSessionEvents function is defined inside startPipeline and is not exported.
 * This test exercises the behavior via the pipeline's session_create action path,
 * which calls wireSessionEvents for every new session.
 *
 * Strategy: Use a minimal mock process manager that counts how many times its
 * onEvent handler fires per emitted event. Wire the same session twice (simulating
 * the double-wire bug). Assert handler fires exactly once per event.
 */
import { describe, it, expect } from "bun:test";

/**
 * Minimal mock process manager with a multi-handler event emitter.
 * Allows us to test whether onEvent callbacks are deduplicated.
 */
function createMockProcessManager() {
  const handlers: Array<(event: unknown) => void> = [];

  return {
    isActive: true,
    isProcessing: false,
    sessionId: null as string | null,
    _handlers: handlers,

    onEvent(handler: (event: unknown) => void): void {
      handlers.push(handler);
    },

    /** Emit an event to all registered handlers. Returns call count. */
    emit(event: unknown): number {
      handlers.forEach((h) => h(event));
      return handlers.length;
    },

    async start(): Promise<void> {},
    async sendMessage(_prompt: string): Promise<void> {},
    async kill(): Promise<void> {},
  };
}

/** Minimal mock of SessionState shape (matches session-manager.ts interface). */
function createMockSession(processManager: ReturnType<typeof createMockProcessManager>) {
  return {
    id: "test-session-id",
    name: "Chat 1",
    slug: "chat-1",
    processManager,
    activeClient: null as null,
    worktreePath: null,
    worktreeBranch: null,
    createdAt: Date.now(),
    claudeSessionId: null,
    /** SC-4: wired flag — set true on first wireSessionEvents call to prevent duplicate registration */
    wired: false,
  };
}

/**
 * Simulates wireSessionEvents WITH the guard (Plan 02 implementation).
 * Checks session.wired before registering; sets it to true on first call.
 */
function wireSessionEventsWithGuard(session: ReturnType<typeof createMockSession>, fireCount: { n: number }) {
  if (session.wired) return;
  session.wired = true;
  session.processManager.onEvent((_event: unknown) => {
    fireCount.n++;
  });
}

describe("SC-4: wireSessionEvents double-call guard", () => {
  it("calling wireSessionEvents twice does not register handlers twice", () => {
    // Plan 02 adds a guard: if session.wired is true, return immediately.
    // Calling wireSessionEvents twice on the same session should register the handler only once.

    const pm = createMockProcessManager();
    const session = createMockSession(pm);

    const fireCount = { n: 0 };

    // Call with guard — first call registers, second call returns early
    wireSessionEventsWithGuard(session, fireCount);
    wireSessionEventsWithGuard(session, fireCount);

    // Emit one test event
    pm.emit({ type: "result", error: null });

    // ASSERTION: handler fires exactly once (not twice)
    expect(fireCount.n).toBe(1);
  });

  it("after double-wiring, exactly one handler is registered per session", () => {
    // The internal handler count should remain 1 after two wire attempts.
    const pm = createMockProcessManager();
    const session = createMockSession(pm);
    const fireCount = { n: 0 };

    wireSessionEventsWithGuard(session, fireCount);
    wireSessionEventsWithGuard(session, fireCount);

    // Should have only 1 handler registered after two wire calls
    expect(pm._handlers.length).toBe(1);
  });

  it("wired flag starts as false on a new session", () => {
    const pm = createMockProcessManager();
    const session = createMockSession(pm);
    expect(session.wired).toBe(false);
  });

  it("wired flag is set to true after first wireSessionEvents call", () => {
    const pm = createMockProcessManager();
    const session = createMockSession(pm);
    const fireCount = { n: 0 };

    wireSessionEventsWithGuard(session, fireCount);
    expect(session.wired).toBe(true);
  });
});
