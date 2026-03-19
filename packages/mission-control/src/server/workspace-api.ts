/**
 * Workspace API — project workspace path resolution and project creation.
 * Handles WORKSPACE-01 (getWorkspacePath) and WORKSPACE-03 (createProject).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { saveSettings } from "./settings-api";

const execFileAsync = promisify(execFile);

/** Override for testing — mirrors _setRecentFilePath pattern */
let _workspaceFilePathOverride: string | null = null;

/**
 * Override the workspace file path (for testing only).
 * Accepts null to reset.
 */
export function _setWorkspaceFilePath(path: string | null): void {
  _workspaceFilePathOverride = path;
}

/**
 * Return the workspace root path.
 * - If overridePath is provided, return it directly.
 * - On win32: join(USERPROFILE ?? homedir(), 'GSD Projects')
 * - Otherwise: join(homedir(), 'GSD Projects')
 */
export function getWorkspacePath(overridePath?: string): string {
  if (overridePath) return overridePath;
  const home = homedir();
  return process.platform === "win32"
    ? join(process.env.USERPROFILE ?? home, "GSD Projects")
    : join(home, "GSD Projects");
}

/**
 * Create a new project directory at join(workspacePath, name) and run git init.
 * Returns { projectPath } on success.
 */
export async function createProject(
  name: string,
  workspacePath: string
): Promise<{ projectPath: string }> {
  const projectPath = join(workspacePath, name);
  await mkdir(projectPath, { recursive: true });
  await execFileAsync("git", ["init"], { cwd: projectPath });
  return { projectPath };
}

/**
 * HTTP request handler for /api/workspace/* routes.
 * Returns Response or null if route not matched.
 */
export async function handleWorkspaceRequest(
  req: Request,
  url: URL
): Promise<Response | null> {
  const { pathname } = url;

  // GET /api/workspace/path — return current workspace path
  if (pathname === "/api/workspace/path" && req.method === "GET") {
    return Response.json({ path: getWorkspacePath() });
  }

  // POST /api/workspace/path — save workspace_path setting to global tier
  if (pathname === "/api/workspace/path" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.path) {
      return Response.json({ error: "path field required" }, { status: 400 });
    }

    try {
      await saveSettings("global", { workspace_path: body.path });
      return Response.json({ success: true });
    } catch (err: any) {
      return Response.json(
        { error: err.message || "Failed to save settings" },
        { status: 500 }
      );
    }
  }

  // POST /api/workspace/create — create a new project
  if (pathname === "/api/workspace/create" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.name) {
      return Response.json({ error: "name field required" }, { status: 400 });
    }

    try {
      const wsPath = body.workspacePath ?? getWorkspacePath();
      const result = await createProject(body.name, wsPath);
      return Response.json(result);
    } catch (err: any) {
      return Response.json(
        { error: err.message || "Failed to create project" },
        { status: 500 }
      );
    }
  }

  return null;
}
