import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

import { resolveProjectCwd } from "../../../../src/web/bridge-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 256 * 1024; // 256KB
const MAX_PROJECT_DEPTH = 6;

/** Directories to skip when listing the project root tree */
const PROJECT_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  ".cache",
  ".output",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".svelte-kit",
  ".nuxt",
  ".parcel-cache",
]);

type RootMode = "gsd" | "project";

interface FileNode {
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
}

function getGsdRoot(projectCwd: string): string {
  return join(projectCwd, ".gsd");
}

function getRootForMode(mode: RootMode, projectCwd: string): string {
  return mode === "project" ? projectCwd : getGsdRoot(projectCwd);
}

/**
 * Validate and resolve a requested path against the given root directory.
 * Returns the resolved absolute path or null if the path is invalid.
 */
function resolveSecurePath(requestedPath: string, root: string): string | null {
  if (requestedPath.startsWith("/") || requestedPath.startsWith("\\")) {
    return null;
  }
  if (requestedPath.includes("..")) {
    return null;
  }

  const resolved = resolve(root, requestedPath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || resolve(root, rel) !== resolved) {
    return null;
  }

  return resolved;
}

function buildTree(dirPath: string, skipDirs?: Set<string>, depth = 0, maxDepth = Infinity): FileNode[] {
  if (!existsSync(dirPath)) return [];
  if (depth >= maxDepth) return [];

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      if (skipDirs?.has(entry.name)) continue;
      const fullPath = join(dirPath, entry.name);
      nodes.push({
        name: entry.name,
        type: "directory",
        children: buildTree(fullPath, skipDirs, depth + 1, maxDepth),
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        type: "file",
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get("path");
  const rootParam = (searchParams.get("root") ?? "gsd") as RootMode;

  if (rootParam !== "gsd" && rootParam !== "project") {
    return Response.json(
      { error: `Invalid root: must be "gsd" or "project"` },
      { status: 400 },
    );
  }

  const projectCwd = resolveProjectCwd(request);
  const root = getRootForMode(rootParam, projectCwd);
  const headers = { "Cache-Control": "no-store" };

  // Mode A: return directory tree
  if (!pathParam) {
    if (!existsSync(root)) {
      return Response.json({ tree: [] }, { headers });
    }
    const skipDirs = rootParam === "project" ? PROJECT_SKIP_DIRS : undefined;
    const maxDepth = rootParam === "project" ? MAX_PROJECT_DEPTH : Infinity;
    return Response.json({ tree: buildTree(root, skipDirs, 0, maxDepth) }, { headers });
  }

  // Mode B: return file content
  const resolvedPath = resolveSecurePath(pathParam, root);
  if (!resolvedPath) {
    const label = rootParam === "project" ? "project root" : ".gsd/";
    return Response.json(
      { error: `Invalid path: path must be relative within ${label} and cannot contain '..' or start with '/'` },
      { status: 400, headers },
    );
  }

  if (!existsSync(resolvedPath)) {
    return Response.json(
      { error: `File not found: ${pathParam}` },
      { status: 404, headers },
    );
  }

  const stat = statSync(resolvedPath);

  if (stat.isDirectory()) {
    return Response.json(
      { error: `Path is a directory, not a file: ${pathParam}` },
      { status: 400, headers },
    );
  }

  if (stat.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File too large: ${pathParam} (${stat.size} bytes, max ${MAX_FILE_SIZE})` },
      { status: 413, headers },
    );
  }

  const content = readFileSync(resolvedPath, "utf-8");
  return Response.json({ content }, { headers });
}
