import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 256 * 1024; // 256KB

interface FileNode {
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
}

function getProjectCwd(): string {
  return process.env.GSD_WEB_PROJECT_CWD || process.cwd();
}

function getGsdRoot(): string {
  return join(getProjectCwd(), ".gsd");
}

/**
 * Validate and resolve a requested path against the .gsd/ root.
 * Returns the resolved absolute path or null if the path is invalid.
 */
function resolveSecurePath(requestedPath: string): string | null {
  // Reject absolute paths
  if (requestedPath.startsWith("/") || requestedPath.startsWith("\\")) {
    return null;
  }

  // Reject path traversal attempts
  if (requestedPath.includes("..")) {
    return null;
  }

  const gsdRoot = getGsdRoot();
  const resolved = resolve(gsdRoot, requestedPath);

  // Ensure the resolved path is still within .gsd/
  const rel = relative(gsdRoot, resolved);
  if (rel.startsWith("..") || resolve(gsdRoot, rel) !== resolved) {
    return null;
  }

  return resolved;
}

function buildTree(dirPath: string): FileNode[] {
  if (!existsSync(dirPath)) return [];

  const entries = readdirSync(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // skip hidden files within .gsd

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        type: "directory",
        children: buildTree(fullPath),
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        type: "file",
      });
    }
  }

  // Sort: directories first, then alphabetically
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const pathParam = searchParams.get("path");

  const headers = { "Cache-Control": "no-store" };

  // Mode A: return directory tree
  if (!pathParam) {
    const gsdRoot = getGsdRoot();
    if (!existsSync(gsdRoot)) {
      return Response.json({ tree: [] }, { headers });
    }
    return Response.json({ tree: buildTree(gsdRoot) }, { headers });
  }

  // Mode B: return file content
  const resolvedPath = resolveSecurePath(pathParam);
  if (!resolvedPath) {
    return Response.json(
      { error: `Invalid path: path must be relative within .gsd/ and cannot contain '..' or start with '/'` },
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
