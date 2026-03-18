/**
 * Tests for --dangerously-skip-permissions flag in ClaudeProcessManager.
 * Uses _spawnFn injection to capture CLI args without spawning real processes.
 */
import { describe, it, expect } from "bun:test";
import { EventEmitter } from "node:events";
import { ClaudeProcessManager } from "../src/server/claude-process";

/** Create a fake ChildProcess-like object for testing. */
function createMockProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as any;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = () => {};
  return proc;
}

describe("ClaudeProcessManager --dangerously-skip-permissions", () => {
  it("does not include --dangerously-skip-permissions (gsd binary handles permissions natively)", async () => {
    const calls: string[][] = [];
    const pm = new ClaudeProcessManager("/tmp/test");
    const mockProc = createMockProcess();
    pm._spawnFn = ((_cmd: any, args: any, _opts: any) => {
      calls.push(args);
      setTimeout(() => mockProc.emit("close", 0), 5);
      return mockProc;
    }) as any;

    await pm.sendMessage("hello");
    expect(calls.length).toBe(1);
    expect(calls[0]).not.toContain("--dangerously-skip-permissions");
  });

  it("omits --dangerously-skip-permissions when skipPermissions is false", async () => {
    const calls: string[][] = [];
    const pm = new ClaudeProcessManager("/tmp/test", { skipPermissions: false });
    const mockProc = createMockProcess();
    pm._spawnFn = ((_cmd: any, args: any, _opts: any) => {
      calls.push(args);
      setTimeout(() => mockProc.emit("close", 0), 5);
      return mockProc;
    }) as any;

    await pm.sendMessage("hello");
    expect(calls.length).toBe(1);
    expect(calls[0]).not.toContain("--dangerously-skip-permissions");
  });

  it("does not include --dangerously-skip-permissions even when skipPermissions is true (gsd handles it)", async () => {
    const calls: string[][] = [];
    const pm = new ClaudeProcessManager("/tmp/test", { skipPermissions: true });
    const mockProc = createMockProcess();
    pm._spawnFn = ((_cmd: any, args: any, _opts: any) => {
      calls.push(args);
      setTimeout(() => mockProc.emit("close", 0), 5);
      return mockProc;
    }) as any;

    await pm.sendMessage("hello");
    expect(calls.length).toBe(1);
    expect(calls[0]).not.toContain("--dangerously-skip-permissions");
  });

  it("preserves parent_tool_use_id in forwarded events", async () => {
    const pm = new ClaudeProcessManager("/tmp/test");
    const mockProc = createMockProcess();
    pm._spawnFn = ((_cmd: any, _args: any, _opts: any) => {
      return mockProc;
    }) as any;

    const receivedEvents: any[] = [];
    pm.onEvent((event) => receivedEvents.push(event));

    await pm.sendMessage("test");

    // Simulate NDJSON data with parent_tool_use_id
    const eventJson = JSON.stringify({
      type: "stream_event",
      parent_tool_use_id: "toolu_parent_abc",
      event: { type: "content_block_start" },
    });
    mockProc.stdout.emit("data", Buffer.from(eventJson + "\n"));

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].parent_tool_use_id).toBe("toolu_parent_abc");

    // Clean up
    mockProc.emit("close", 0);
  });
});
