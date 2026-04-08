// GSD-2 — Shared shell/exec utilities
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { execSync } from "node:child_process";

/** Default timeout for shell commands (ms). */
const DEFAULT_TIMEOUT = 5_000;

/**
 * Execute a shell command, returning trimmed stdout or null on any failure.
 * Replaces the repeated try/catch + execSync + .trim() pattern.
 *
 * SECURITY NOTE: This uses execSync (shell mode) because callers need shell
 * features like `command -v`, pipes, and built-ins. Only pass trusted,
 * hardcoded command strings — never interpolate user input.
 */
export function tryExec(cmd: string, cwd: string, timeoutMs: number = DEFAULT_TIMEOUT): string | null {
  try {
    return execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check whether a command-line tool is available on the system PATH.
 * Uses `command -v` on Unix and `where` on Windows.
 */
export function commandExists(name: string, cwd: string): boolean {
  const whichCmd = process.platform === "win32" ? `where ${name}` : `command -v ${name}`;
  return tryExec(whichCmd, cwd) !== null;
}
