/**
 * Recent projects persistence for the project browser.
 * Stores last 20 opened projects in ~/.gsd/recent-projects.json.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { RecentProject } from "./fs-types";

const MAX_RECENT = 20;

/** Default path — overridable for testing via _setRecentFilePath */
let recentFilePath = join(homedir(), ".gsd", "recent-projects.json");

/**
 * Override the recent file path (for testing only).
 */
export function _setRecentFilePath(path: string): void {
  recentFilePath = path;
}

/**
 * Read recent projects from disk.
 * Returns [] on any error (file missing, corrupt JSON, etc).
 */
export async function getRecentProjects(): Promise<RecentProject[]> {
  try {
    const content = await readFile(recentFilePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Add or update a recent project.
 * Deduplicates by path, prepends new entry, trims to MAX_RECENT.
 */
export async function addRecentProject(project: RecentProject): Promise<void> {
  const existing = await getRecentProjects();

  // Remove any existing entry with the same path
  const filtered = existing.filter((p) => p.path !== project.path);

  // Prepend the new/updated entry
  filtered.unshift(project);

  // Trim to max
  const trimmed = filtered.slice(0, MAX_RECENT);

  // Ensure directory exists and write
  await mkdir(dirname(recentFilePath), { recursive: true });
  await writeFile(recentFilePath, JSON.stringify(trimmed, null, 2));
}

/**
 * HTTP request handler for /api/projects/* routes.
 * Returns Response or null if route not matched.
 */
export async function handleRecentProjectsRequest(
  req: Request,
  url: URL
): Promise<Response | null> {
  const { pathname } = url;

  // GET /api/projects/recent
  if (pathname === "/api/projects/recent" && req.method === "GET") {
    const projects = await getRecentProjects();
    return Response.json(projects);
  }

  // POST /api/projects/recent
  if (pathname === "/api/projects/recent" && req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.path || !body.name) {
      return Response.json({ error: "path and name fields required" }, { status: 400 });
    }

    const project: RecentProject = {
      path: body.path,
      name: body.name,
      lastOpened: body.lastOpened || Date.now(),
      isGsdProject: body.isGsdProject ?? false,
    };

    await addRecentProject(project);
    return Response.json({ success: true });
  }

  return null;
}
