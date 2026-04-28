/**
 * Project-root resolution for the extension context.
 *
 * Resolves the canonical "current project" path for a given working
 * directory: the git toplevel of `cwd`, or `cwd` itself when `cwd` is
 * not inside a git repository.
 */

import { spawnSync } from "node:child_process";

/**
 * Resolve the project root for a given cwd.
 *
 * Returns the git toplevel when `cwd` is inside a git repository, otherwise
 * returns `cwd` unchanged. Failures (git not on PATH, permission errors,
 * etc.) fall back to `cwd`.
 */
export function resolveProjectRoot(cwd: string): string {
	try {
		const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		if (result.status === 0 && typeof result.stdout === "string") {
			const toplevel = result.stdout.trim();
			if (toplevel.length > 0) return toplevel;
		}
	} catch {
		// git not available, cwd unreadable, or other spawn failure — fall through.
	}
	return cwd;
}
