import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProjectDetectionKind, ProjectDetectionSignals } from "./bridge-service.ts";
import { detectProjectKind } from "./bridge-service.ts";

// ─── Project Discovery ─────────────────────────────────────────────────────

export interface ProjectMetadata {
  name: string;             // directory name
  path: string;             // absolute path
  kind: ProjectDetectionKind;
  signals: ProjectDetectionSignals;
  lastModified: number;     // mtime epoch ms
}

/** Excluded directory names when scanning a dev root. */
const EXCLUDED_DIRS = new Set(["node_modules", ".git"]);

/**
 * Scan one directory level under `devRootPath` and return metadata for each
 * discovered project directory. Hidden dirs (starting with `.`), `node_modules`,
 * and `.git` are excluded.
 *
 * Returns an empty array if `devRootPath` doesn't exist or isn't readable.
 * Results are sorted alphabetically by name.
 */
export function discoverProjects(devRootPath: string): ProjectMetadata[] {
  try {
    const entries = readdirSync(devRootPath, { withFileTypes: true });
    const projects: ProjectMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;

      const fullPath = join(devRootPath, entry.name);
      const { kind, signals } = detectProjectKind(fullPath);
      const stat = statSync(fullPath);

      projects.push({
        name: entry.name,
        path: fullPath,
        kind,
        signals,
        lastModified: stat.mtimeMs,
      });
    }

    projects.sort((a, b) => a.name.localeCompare(b.name));
    return projects;
  } catch {
    // devRootPath doesn't exist or isn't readable
    return [];
  }
}
