/**
 * Tests for chat router and Claude process manager.
 * Covers: isGsdCommand, routeMessage (performance), ClaudeProcessManager (spawn rejection, kill).
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { isGsdCommand, routeMessage } from "../src/server/chat-router";
import { ClaudeProcessManager } from "../src/server/claude-process";

// -- isGsdCommand tests --

describe("isGsdCommand", () => {
  test('"/gsd:plan-phase" returns true', () => {
    expect(isGsdCommand("/gsd:plan-phase")).toBe(true);
  });

  test('"hello world" returns false', () => {
    expect(isGsdCommand("hello world")).toBe(false);
  });

  test('"/gsd:" (bare prefix) returns true', () => {
    expect(isGsdCommand("/gsd:")).toBe(true);
  });

  test("leading whitespace is trimmed before check", () => {
    expect(isGsdCommand("  /gsd:help")).toBe(true);
  });

  test("non-gsd slash command returns false", () => {
    expect(isGsdCommand("/help")).toBe(false);
  });

  test("empty string returns false", () => {
    expect(isGsdCommand("")).toBe(false);
  });
});

// -- routeMessage tests --

describe("routeMessage", () => {
  test("/gsd: command returns { type: 'command', command, args }", () => {
    const result = routeMessage("/gsd:plan-phase 3 --auto");
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command).toBe("plan-phase");
      expect(result.args).toBe("3 --auto");
    }
  });

  test("bare /gsd: returns command with empty args", () => {
    const result = routeMessage("/gsd:");
    expect(result.type).toBe("command");
    if (result.type === "command") {
      expect(result.command).toBe("");
      expect(result.args).toBe("");
    }
  });

  test("plain text returns { type: 'prompt', prompt }", () => {
    const result = routeMessage("explain this code");
    expect(result.type).toBe("prompt");
    if (result.type === "prompt") {
      expect(result.prompt).toBe("explain this code");
    }
  });

  test("single routing call completes well under 200ms target", () => {
    // Warm up JIT
    routeMessage("/gsd:plan-phase 3");
    routeMessage("explain this code to me");

    const start = performance.now();
    routeMessage("/gsd:execute-phase 6");
    routeMessage("refactor the auth module");
    const elapsed = performance.now() - start;
    // Two routing calls should complete in well under 200ms
    expect(elapsed).toBeLessThan(200);
  });
});

// -- ClaudeProcessManager tests --

describe("ClaudeProcessManager", () => {
  test("rejects concurrent spawn when process is active", async () => {
    const manager = new ClaudeProcessManager();

    // Mock an active process by setting internal state
    // We use a fake spawn that creates a long-running process
    const fakeProc = {
      pid: 12345,
      killed: false,
      stdin: null,
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
      exitCode: null,
      exited: new Promise<number>(() => {}), // never resolves
      kill: () => {},
      ref: () => {},
      unref: () => {},
    };

    // Access internal state to simulate active process
    (manager as any).activeProcess = fakeProc;

    // Second spawn should reject
    expect(() => manager.spawn("test prompt", "/tmp")).toThrow(/already active/i);
  });

  test("isActive returns false when no process is running", () => {
    const manager = new ClaudeProcessManager();
    expect(manager.isActive).toBe(false);
  });

  test("kill() on inactive manager is a no-op", async () => {
    const manager = new ClaudeProcessManager();
    // Should not throw
    await manager.kill();
    expect(manager.isActive).toBe(false);
  });
});
