/**
 * Native BLAKE3 content hashing — Rust implementation via napi-rs.
 *
 * Provides ultra-fast content hashing (~GB/s) using BLAKE3 with automatic
 * SIMD acceleration (AVX2, SSE4.1, NEON). All hashes are lowercase hex,
 * 64 characters (256-bit).
 */

import { native } from "../native.js";

export interface HashDirectoryOptions {
  /** Glob pattern to filter files (e.g. "**\/*.ts"). Defaults to all files. */
  glob?: string;
  /** Whether to respect .gitignore rules. Defaults to true. */
  gitignore?: boolean;
}

/** BLAKE3 hash of a UTF-8 string, returned as lowercase 64-char hex. */
export function hashString(text: string): string {
  return native.hashString(text);
}

/** BLAKE3 hash of a file's contents, returned as lowercase 64-char hex. */
export function hashFile(path: string): string {
  return native.hashFile(path);
}

/**
 * BLAKE3 hash of multiple files in parallel.
 * Returns a map of path -> hex hash. Silently skips unreadable files.
 */
export function hashFiles(paths: string[]): Record<string, string> {
  return native.hashFiles(paths);
}

/**
 * BLAKE3 hash all files in a directory, optionally filtered by glob.
 * Returns a map of relative path -> hex hash.
 */
export function hashDirectory(
  dirPath: string,
  options?: HashDirectoryOptions,
): Record<string, string> {
  return native.hashDirectory(dirPath, options);
}

/**
 * Given previous hashes (path -> hex), re-hash each file and return
 * paths whose content changed or no longer exist.
 */
export function didFilesChange(hashes: Record<string, string>): string[] {
  return native.didFilesChange(hashes);
}
