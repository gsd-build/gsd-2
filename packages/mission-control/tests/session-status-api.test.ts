/**
 * Session status API tests (Phase 07-01 Task 2).
 *
 * Tests GET /api/session/status endpoint for continue-here detection.
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { handleSessionStatusRequest } from "../src/server/session-status-api";

const TEST_DIR = join(tmpdir(), `gsd-session-status-test-${Date.now()}`);
const PLANNING_DIR = join(TEST_DIR, ".planning");
const PHASES_DIR = join(PLANNING_DIR, "phases");

beforeAll(async () => {
  await mkdir(PHASES_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

function makeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost:4000${path}`);
  const req = new Request(url.toString(), { method });
  return { req, url };
}

describe("GET /api/session/status", () => {
  it("returns { continueHere: null } when no continue-here file exists", async () => {
    const { req, url } = makeReq("GET", "/api/session/status");
    const response = await handleSessionStatusRequest(req, url, PLANNING_DIR);
    expect(response).not.toBeNull();
    const body = await response!.json();
    expect(body).toEqual({ continueHere: null });
  });

  it("returns parsed continue-here data when file exists", async () => {
    // Create a phase directory with a continue-here file
    const phaseDir = join(PHASES_DIR, "07-session-flow");
    await mkdir(phaseDir, { recursive: true });

    const continueHereContent = `---
phase: "07"
task: 2
total_tasks: 3
status: "executing"
---

<current_state>
Working on animation components
</current_state>

<next_action>
Complete session status API
</next_action>
`;
    await writeFile(join(phaseDir, "continue-here.md"), continueHereContent);

    const { req, url } = makeReq("GET", "/api/session/status");
    const response = await handleSessionStatusRequest(req, url, PLANNING_DIR);
    expect(response).not.toBeNull();
    const body = await response!.json();

    expect(body.continueHere).not.toBeNull();
    expect(body.continueHere.phase).toBe("07");
    expect(body.continueHere.task).toBe(2);
    expect(body.continueHere.totalTasks).toBe(3);
    expect(body.continueHere.status).toBe("executing");
    expect(body.continueHere.currentState).toContain("Working on animation components");
    expect(body.continueHere.nextAction).toContain("Complete session status API");

    // Cleanup
    await rm(phaseDir, { recursive: true, force: true });
  });

  it("returns null for non-GET methods", async () => {
    const { req, url } = makeReq("POST", "/api/session/status");
    const response = await handleSessionStatusRequest(req, url, PLANNING_DIR);
    expect(response).toBeNull();
  });

  it("returns null for non-matching paths", async () => {
    const { req, url } = makeReq("GET", "/api/other/route");
    const response = await handleSessionStatusRequest(req, url, PLANNING_DIR);
    expect(response).toBeNull();
  });

  it("returns { continueHere: null } when phases directory is missing", async () => {
    const missingDir = join(TEST_DIR, "no-such-planning");
    const { req, url } = makeReq("GET", "/api/session/status");
    const response = await handleSessionStatusRequest(req, url, missingDir);
    expect(response).not.toBeNull();
    const body = await response!.json();
    expect(body).toEqual({ continueHere: null });
  });
});
