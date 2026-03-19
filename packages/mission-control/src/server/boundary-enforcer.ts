/**
 * boundary-enforcer.ts — detects out-of-project file paths in gsd stdout text.
 *
 * Pure function, no side effects. Easily testable.
 * Used by pipeline.ts to interrupt the active gsd session on a boundary violation (PERM-03).
 */

export interface BoundaryViolationResult {
  violated: boolean;
  path?: string;
}

/**
 * Normalize MSYS/Cygwin/Git-Bash absolute paths to Windows-style.
 * /c/users/foo → C:/users/foo
 * Paths that don't match are returned unchanged.
 */
function normalizeMsysPath(p: string): string {
  const m = p.match(/^\/([a-z])\/(.+)$/i);
  return m ? `${m[1].toUpperCase()}:/${m[2]}` : p;
}

/**
 * Known-safe root prefixes that GSD legitimately accesses and should not trigger violations.
 * - /.gsd/ — GSD's own home-dir extension/config metadata directory
 */
const SAFE_PREFIXES = ["/.gsd/"];

/**
 * Scans a text chunk from gsd stdout for absolute file paths outside projectRoot.
 * This is a heuristic — matches Unix (/...) and Windows (C:\... or C:/...) absolute paths.
 * Returns the first violation found, or { violated: false } if none.
 *
 * Rules:
 * - Unix absolute paths: /word/... (must be non-trivial: >= 4 chars, not just "/")
 * - Windows absolute paths: C:\... or C:/...
 * - Paths must have at least 2 segments (e.g. /foo/bar) — single-segment identifiers like
 *   /gsd or /task are not file paths and are skipped
 * - MSYS/Git-Bash paths (/c/users/...) are normalized to Windows paths before comparison
 * - Known safe system/GSD prefixes are always allowed
 * - Paths that start with projectRoot (normalized to forward slashes) are inside — allowed
 * - Relative paths (./...) are never flagged
 */
export function detectBoundaryViolation(
  text: string,
  projectRoot: string
): BoundaryViolationResult {
  // Normalize project root: forward slashes, no trailing slash
  const normalizedRoot = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");

  // Unix absolute paths: starts with / followed by at least one word char path segment
  // Negative lookbehind prevents matching paths preceded by a letter, digit, dot, or colon
  // This avoids matching the /src/... portion of ./src/foo.ts or C:/...
  const unixPattern = /(?<![a-zA-Z0-9.:/\\])\/[a-zA-Z0-9_.~-]+(?:\/[a-zA-Z0-9_.~-]*)*/g;

  // Windows absolute paths: drive letter + colon + separator + path
  const winPattern = /[A-Za-z]:[\\\/][^\s"'<>|?*\r\n]*/g;

  for (const pattern of [unixPattern, winPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const rawPath = match[0];
      let normalizedPath = rawPath.replace(/\\/g, "/");

      // Must be non-trivial (more than just "/" or a single drive root like "C:/")
      if (normalizedPath.length < 4) continue;

      // Must have at least 2 path segments — single-segment strings like /gsd or /task
      // are command names / identifiers, not file paths
      const segmentCount = normalizedPath.split("/").filter(Boolean).length;
      if (segmentCount < 2) continue;

      // Allow known-safe system and GSD-internal prefixes
      if (SAFE_PREFIXES.some((pfx) => normalizedPath.startsWith(pfx))) continue;

      // Normalize MSYS/Git-Bash paths: /c/users/... → C:/users/...
      normalizedPath = normalizeMsysPath(normalizedPath);

      // Check if it starts with the project root (inside project — OK)
      if (
        normalizedPath.startsWith(normalizedRoot + "/") ||
        normalizedPath === normalizedRoot
      ) {
        continue;
      }

      return { violated: true, path: rawPath };
    }
  }

  return { violated: false };
}
