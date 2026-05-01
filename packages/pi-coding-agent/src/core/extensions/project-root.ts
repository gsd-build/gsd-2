/**
 * Project-root resolution for the extension context.
 *
 * Resolves the canonical "current project" path for a given working
 * directory: the git toplevel of `cwd`, or `cwd` itself when `cwd` is
 * not inside a git repository.
 */

import { spawnSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";

/**
 * Resolve the project root for a given cwd.
 *
 * Returns the git toplevel when `cwd` is inside a git repository, otherwise
 * returns `cwd` unchanged. Failures (git not on PATH, permission errors,
 * etc.) fall back to `cwd`.
 *
 * Output is normalized through `path.resolve` so the returned path uses
 * native separators. `git rev-parse --show-toplevel` always emits forward
 * slashes (even on Windows), which would otherwise mismatch values that
 * downstream code obtains from `fs.realpathSync`, `path.join`, `process.cwd`,
 * etc. (all native-separator on Windows). Without normalization, equality
 * checks like `cwd === projectRoot` and `path.startsWith(projectRoot)` fail
 * on Windows.
 *
 * NOTE: This is the runner-level / extension-API flavor. It only knows about
 * `git rev-parse --show-toplevel` and is intentionally extension-agnostic.
 *
 * The GSD extension separately exports a `resolveProjectRoot` from
 * `src/resources/extensions/gsd/worktree.ts` that is worktree-aware (peels a
 * `.../.gsd/worktrees/<name>` path back to the parent project root). The two
 * are *not* duplicates — the runner has no business knowing about GSD's
 * worktree layout, and GSD handlers must keep operating against the parent
 * project root even when invoked from inside a worktree.
 */
export function resolveProjectRoot(cwd: string): string {
	try {
		const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (result.status === 0 && typeof result.stdout === "string") {
			const toplevel = result.stdout.trim();
			if (toplevel.length > 0) return resolvePath(toplevel);
		}
		// Status != 0 most commonly means "not in a git repo" — that's a normal
		// fall-through to cwd, no diagnostic needed. Anything else (process
		// could not be spawned, crash, etc.) is a silent fallback that masks
		// real problems, so surface it when GSD_DEBUG is on.
		if (result.error || (result.status !== 0 && result.status !== 128)) {
			emitDebug(cwd, result.error?.message, result.stderr?.toString());
		}
	} catch (err) {
		// git not available, cwd unreadable, or other spawn failure — fall
		// through. Log only when explicitly debugging, so callers can find out
		// why their projectRoot resolution silently degraded to cwd.
		emitDebug(cwd, err instanceof Error ? err.message : String(err));
	}
	return cwd;
}

function emitDebug(cwd: string, ...details: Array<string | undefined>): void {
	if (process.env.GSD_DEBUG !== "1" && process.env.GSD_DEBUG !== "true") return;
	const tail = details.filter((d): d is string => typeof d === "string" && d.length > 0).join(" | ");
	const suffix = tail.length > 0 ? `: ${tail}` : "";
	process.stderr.write(`[gsd:project-root] git rev-parse failed for cwd=${cwd}${suffix}\n`);
}
