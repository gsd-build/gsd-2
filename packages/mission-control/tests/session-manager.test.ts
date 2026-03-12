/**
 * Unit tests for SessionManager class — session lifecycle, limits, and persistence.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "../src/server/session-manager";

// -- Mock ClaudeProcessManager --
// Minimal stub: constructor, kill, isProcessing, start, sessionId
let killCalls: string[] = [];

// We mock ClaudeProcessManager by monkey-patching the module import.
// Instead, SessionManager accepts a factory function for testability.

describe("SessionManager", () => {
  let tempDir: string;
  let mgr: SessionManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "session-mgr-test-"));
    killCalls = [];
    mgr = new SessionManager(tempDir, {
      processFactory: (cwd: string) => createMockPM(cwd),
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // -- Helpers --
  function createMockPM(cwd: string) {
    return {
      cwd,
      _isProcessing: false,
      _sessionId: null as string | null,
      _killed: false,
      _started: false,
      eventHandlers: [] as Array<(event: unknown) => void>,
      get isActive() { return true; },
      get isProcessing() { return this._isProcessing; },
      get sessionId() { return this._sessionId; },
      onEvent(handler: (event: unknown) => void) { this.eventHandlers.push(handler); },
      async start() { this._started = true; },
      async sendMessage(_prompt: string) {},
      async kill() { this._killed = true; killCalls.push(cwd); },
    };
  }

  // -- createSession --

  test("createSession returns SessionState with unique id, default name, slug, and PM", () => {
    const session = mgr.createSession("/repo");
    expect(session.id).toBeTruthy();
    expect(session.name).toBe("Chat 1");
    expect(session.slug).toBe("chat-1");
    expect(session.processManager).toBeTruthy();
    expect(session.createdAt).toBeGreaterThan(0);
  });

  test("createSession assigns sequential names", () => {
    const s1 = mgr.createSession("/repo");
    const s2 = mgr.createSession("/repo");
    const s3 = mgr.createSession("/repo");
    expect(s1.name).toBe("Chat 1");
    expect(s2.name).toBe("Chat 2");
    expect(s3.name).toBe("Chat 3");
  });

  test("createSession reuses gaps from closed sessions", async () => {
    const s1 = mgr.createSession("/repo");
    const s2 = mgr.createSession("/repo");
    mgr.createSession("/repo");
    await mgr.closeSession(s2.id);
    const s4 = mgr.createSession("/repo");
    expect(s4.name).toBe("Chat 2"); // reuses gap
  });

  test("createSession with forkFromSessionId copies Claude session ID", () => {
    const s1 = mgr.createSession("/repo");
    // Simulate Claude assigning a session ID
    (s1.processManager as any)._sessionId = "claude-abc-123";
    const s2 = mgr.createSession("/repo", { forkFromSessionId: s1.id });
    expect(s2.claudeSessionId).toBe("claude-abc-123");
  });

  test("createSession rejects when 4 sessions already exist", () => {
    mgr.createSession("/repo");
    mgr.createSession("/repo");
    mgr.createSession("/repo");
    mgr.createSession("/repo");
    expect(() => mgr.createSession("/repo")).toThrow(/maximum.*4/i);
  });

  // -- getSession --

  test("getSession returns session by id", () => {
    const s1 = mgr.createSession("/repo");
    expect(mgr.getSession(s1.id)).toBe(s1);
  });

  test("getSession returns undefined for unknown id", () => {
    expect(mgr.getSession("nonexistent")).toBeUndefined();
  });

  // -- listSessions --

  test("listSessions returns all sessions ordered by createdAt", () => {
    const s1 = mgr.createSession("/repo");
    const s2 = mgr.createSession("/repo");
    const s3 = mgr.createSession("/repo");
    const list = mgr.listSessions();
    expect(list.length).toBe(3);
    expect(list[0].id).toBe(s1.id);
    expect(list[1].id).toBe(s2.id);
    expect(list[2].id).toBe(s3.id);
  });

  // -- closeSession --

  test("closeSession kills process and removes from registry", async () => {
    const s1 = mgr.createSession("/repo");
    await mgr.closeSession(s1.id);
    expect(mgr.getSession(s1.id)).toBeUndefined();
    expect((s1.processManager as any)._killed).toBe(true);
  });

  test("closeSession on nonexistent id is a no-op", async () => {
    // Should not throw
    await mgr.closeSession("nonexistent-id");
  });

  // -- renameSession --

  test("renameSession updates name and slug", () => {
    const s1 = mgr.createSession("/repo");
    mgr.renameSession(s1.id, "My Custom Chat");
    expect(s1.name).toBe("My Custom Chat");
    expect(s1.slug).toBe("my-custom-chat");
  });

  // -- Persistence --

  test("persistMetadata writes session metadata to .session-metadata.json", async () => {
    mgr.createSession("/repo");
    mgr.createSession("/repo");
    await mgr.persistMetadata();

    const filePath = join(tempDir, ".session-metadata.json");
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    expect(data.sessions.length).toBe(2);
    expect(data.tabOrder.length).toBe(2);
    expect(data.sessions[0].name).toBe("Chat 1");
    expect(data.sessions[1].name).toBe("Chat 2");
  });

  test("restoreMetadata reads .session-metadata.json and re-creates sessions", async () => {
    const s1 = mgr.createSession("/repo");
    const s2 = mgr.createSession("/repo");
    mgr.renameSession(s2.id, "Debug Session");
    await mgr.persistMetadata();

    // Create fresh manager from same dir
    const mgr2 = new SessionManager(tempDir, {
      processFactory: (cwd: string) => createMockPM(cwd),
    });
    await mgr2.restoreMetadata("/repo");

    const list = mgr2.listSessions();
    expect(list.length).toBe(2);
    expect(list[0].name).toBe("Chat 1");
    expect(list[1].name).toBe("Debug Session");
    expect(list[1].slug).toBe("debug-session");
  });

  test("restoreMetadata handles missing file gracefully", async () => {
    await mgr.restoreMetadata("/repo");
    expect(mgr.listSessions().length).toBe(0);
  });

  test("restoreMetadata handles corrupt JSON file gracefully", async () => {
    const filePath = join(tempDir, ".session-metadata.json");
    await Bun.write(filePath, "not valid json {{{");
    await mgr.restoreMetadata("/repo");
    expect(mgr.listSessions().length).toBe(0);
  });

  test("persistMetadata is called after create/close/rename", async () => {
    // We verify by checking the file updates after each operation
    const s1 = mgr.createSession("/repo");
    let raw = await readFile(join(tempDir, ".session-metadata.json"), "utf-8");
    let data = JSON.parse(raw);
    expect(data.sessions.length).toBe(1);

    mgr.createSession("/repo");
    raw = await readFile(join(tempDir, ".session-metadata.json"), "utf-8");
    data = JSON.parse(raw);
    expect(data.sessions.length).toBe(2);

    mgr.renameSession(s1.id, "Renamed");
    raw = await readFile(join(tempDir, ".session-metadata.json"), "utf-8");
    data = JSON.parse(raw);
    expect(data.sessions[0].name).toBe("Renamed");

    await mgr.closeSession(s1.id);
    raw = await readFile(join(tempDir, ".session-metadata.json"), "utf-8");
    data = JSON.parse(raw);
    expect(data.sessions.length).toBe(1);
  });

  // -- getMetadata --

  test("getMetadata returns lightweight session list", () => {
    mgr.createSession("/repo");
    mgr.createSession("/repo");
    const meta = mgr.getMetadata();
    expect(meta.length).toBe(2);
    expect(meta[0]).toHaveProperty("id");
    expect(meta[0]).toHaveProperty("name");
    expect(meta[0]).toHaveProperty("slug");
    expect(meta[0]).toHaveProperty("isProcessing");
    expect(meta[0]).toHaveProperty("createdAt");
  });
});
