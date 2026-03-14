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
 * Scans a text chunk from gsd stdout for absolute file paths outside projectRoot.
 * This is a heuristic — matches Unix (/...) and Windows (C:\... or C:/...) absolute paths.
 * Returns the first violation found, or { violated: false } if none.
 *
 * Rules:
 * - Unix absolute paths: /word/... (must be non-trivial: >= 4 chars, not just "/")
 * - Windows absolute paths: C:\... or C:/...
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
      const normalizedPath = rawPath.replace(/\\/g, "/");

      // Must be non-trivial (more than just "/" or a single drive root like "C:/")
      if (normalizedPath.length < 4) continue;

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
