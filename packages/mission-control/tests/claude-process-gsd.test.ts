/**
 * COMPAT-05: ClaudeProcessManager spawns "gsd" binary, not "claude"
 *
 * RED state: These tests fail until Plan 12-03 updates ClaudeProcessManager to use
 * the "gsd" binary. Currently it spawns "claude" with --resume flag.
 * After COMPAT-05 it must spawn "gsd" with no --resume flag.
 *
 * Pattern: Uses injectable _spawnFn to capture spawn arguments without
 * starting a real process (same pattern as pipeline-config-bridge.test.ts).
 */
import { describe, it, expect } from "bun:test";
import { ClaudeProcessManager } from "../src/server/claude-process";

interface CapturedSpawn {
  binary: string;
  args: string[];
  options: Record<string, unknown>;
}

function makeMockSpawn(): { captured: CapturedSpawn | null; fn: typeof import("node:child_process").spawn } {
  let captured: CapturedSpawn | null = null;

  const mockFn = (binary: string, args: string[], options: Record<string, unknown>) => {
    captured = { binary, args, options };

    // Return a minimal ChildProcess-compatible stub so ClaudeProcessManager
    // does not crash when setting up event listeners.
    const EventEmitter = require("node:events") as typeof import("node:events");
    const stub = new EventEmitter();
    // stdout and stderr need to be EventEmitter instances too
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    (stub as any).stdout = stdout;
    (stub as any).stderr = stderr;
    (stub as any).kill = () => {};
    return stub as unknown as ReturnType<typeof import("node:child_process").spawn>;
  };

  return {
    get captured() { return captured; },
    fn: mockFn as unknown as typeof import("node:child_process").spawn,
  };
}

describe("COMPAT-05: ClaudeProcessManager spawns gsd binary", () => {
  it("spawns binary 'gsd' (not 'claude')", async () => {
    const mock = makeMockSpawn();
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    manager._spawnFn = mock.fn;

    // Fire and don't await — we just want the spawn call captured
    manager.sendMessage("hello").catch(() => {});

    // Give the synchronous spawn call time to execute
    await new Promise((r) => setTimeout(r, 10));

    // Currently fails: binary is "claude"
    expect(mock.captured).not.toBeNull();
    expect(mock.captured!.binary).toMatch(/^gsd/);
  });

  it("spawn args do NOT contain '--resume' flag", async () => {
    const mock = makeMockSpawn();
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    manager._spawnFn = mock.fn;

    await manager.sendMessage("hello").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    // Currently fails: args contain --resume when sessionId exists
    // Even on first call (no session), the GSD 2 interface should not use --resume
    expect(mock.captured).not.toBeNull();
    expect(mock.captured!.args).not.toContain("--resume");
  });

  it("spawn args include '-p' with the prompt text", async () => {
    const mock = makeMockSpawn();
    const manager = new ClaudeProcessManager("/tmp/test-cwd");
    manager._spawnFn = mock.fn;

    await manager.sendMessage("my test prompt").catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(mock.captured).not.toBeNull();
    expect(mock.captured!.args).toContain("-p");
    expect(mock.captured!.args).toContain("my test prompt");
  });
});
