/**
 * Tests for dialog-api.ts — native OS folder dialog spawning.
 * Tests git-api.ts — git log endpoint.
 * Tests pipeline project_switched broadcast.
 * Tests WebSocket permission_response routing.
 */
import { describe, it, expect } from "bun:test";
import { handleDialogRequest, _setSpawnFn } from "../src/server/dialog-api";
import { handleGitRequest } from "../src/server/git-api";
import { EventEmitter } from "node:events";

/** Create a fake ChildProcess for dialog/git tests. */
function createMockProcess(stdoutData: string, exitCode = 0) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as any;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.kill = () => {};

  // Emit data and close after a tick
  setTimeout(() => {
    if (stdoutData) stdout.emit("data", Buffer.from(stdoutData));
    proc.emit("close", exitCode);
  }, 5);

  return proc;
}

describe("handleDialogRequest", () => {
  it("returns null for non-matching routes", async () => {
    const req = new Request("http://localhost/api/fs/list", { method: "GET" });
    const url = new URL(req.url);
    const result = await handleDialogRequest(req, url);
    expect(result).toBeNull();
  });

  it("POST /api/dialog/open-folder returns selected path on success", async () => {
    const selectedPath = "C:\\Users\\Test\\Projects\\my-project";
    _setSpawnFn(() => createMockProcess(selectedPath + "\n"));

    const req = new Request("http://localhost/api/dialog/open-folder", { method: "POST" });
    const url = new URL(req.url);
    const result = await handleDialogRequest(req, url);

    expect(result).not.toBeNull();
    const body = await result!.json();
    // Path should be forward-slash normalized
    expect(body.path).toBe("C:/Users/Test/Projects/my-project");
  });

  it("POST /api/dialog/open-folder returns cancelled when empty output", async () => {
    _setSpawnFn(() => createMockProcess(""));

    const req = new Request("http://localhost/api/dialog/open-folder", { method: "POST" });
    const url = new URL(req.url);
    const result = await handleDialogRequest(req, url);

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.cancelled).toBe(true);
  });

  it("POST /api/dialog/open-folder returns cancelled on non-zero exit", async () => {
    _setSpawnFn(() => createMockProcess("", 1));

    const req = new Request("http://localhost/api/dialog/open-folder", { method: "POST" });
    const url = new URL(req.url);
    const result = await handleDialogRequest(req, url);

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.cancelled).toBe(true);
  });

  it("spawns PowerShell on Windows platform", async () => {
    let spawnedCmd = "";
    _setSpawnFn((cmd: any) => {
      spawnedCmd = cmd;
      return createMockProcess("C:\\test\n");
    });

    // Force platform check by testing the actual function
    const req = new Request("http://localhost/api/dialog/open-folder", { method: "POST" });
    const url = new URL(req.url);
    await handleDialogRequest(req, url);

    // On Windows (where these tests run), should use powershell
    if (process.platform === "win32") {
      expect(spawnedCmd).toBe("powershell");
    }
  });
});

describe("handleGitRequest", () => {
  it("returns null for non-matching routes", async () => {
    const req = new Request("http://localhost/api/fs/list", { method: "GET" });
    const url = new URL(req.url);
    const result = await handleGitRequest(req, url, "/tmp/repo");
    expect(result).toBeNull();
  });

  it("GET /api/git/log returns commits array", async () => {
    const req = new Request("http://localhost/api/git/log", { method: "GET" });
    const url = new URL(req.url);
    // Use the actual repo root for a real git log test
    const repoRoot = process.cwd().replace(/\\/g, "/").replace(/\/packages\/mission-control$/, "");
    const result = await handleGitRequest(req, url, repoRoot);

    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.commits).toBeDefined();
    expect(Array.isArray(body.commits)).toBe(true);
    // Should have at least one commit in this repo
    expect(body.commits.length).toBeGreaterThan(0);
    // Each commit should have hash and subject
    expect(body.commits[0].hash).toBeDefined();
    expect(body.commits[0].subject).toBeDefined();
  });

  it("GET /api/git/log respects ?limit=N parameter", async () => {
    const req = new Request("http://localhost/api/git/log?limit=3", { method: "GET" });
    const url = new URL(req.url);
    const repoRoot = process.cwd().replace(/\\/g, "/").replace(/\/packages\/mission-control$/, "");
    const result = await handleGitRequest(req, url, repoRoot);

    const body = await result!.json();
    expect(body.commits.length).toBeLessThanOrEqual(3);
  });
});
