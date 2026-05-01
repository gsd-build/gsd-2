/**
 * Unit tests for project-root resolution.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { resolveProjectRoot } from "./project-root.js";

function makeRepo(): { repo: string; cleanup: () => void } {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), "gsd-projroot-")));
	execFileSync("git", ["init", "-q"], { cwd: repo });
	writeFileSync(join(repo, "README.md"), "# test\n");
	const cleanup = () => {
		try { rmSync(repo, { recursive: true, force: true }); } catch { /* best effort */ }
	};
	return { repo, cleanup };
}

describe("resolveProjectRoot", () => {
	test("resolves to git toplevel when cwd is the repo root", () => {
		const { repo, cleanup } = makeRepo();
		try {
			assert.strictEqual(resolveProjectRoot(repo), repo);
		} finally {
			cleanup();
		}
	});

	test("resolves to git toplevel when cwd is a subdir", () => {
		const { repo, cleanup } = makeRepo();
		try {
			const sub = join(repo, "nested", "deep");
			mkdirSync(sub, { recursive: true });
			assert.strictEqual(resolveProjectRoot(sub), repo);
		} finally {
			cleanup();
		}
	});

	test("returned path uses native separators", () => {
		// `git rev-parse --show-toplevel` always emits forward slashes (even on
		// Windows). `resolveProjectRoot` must normalize so equality and prefix
		// comparisons against values from `fs.realpathSync` / `path.join` work.
		const { repo, cleanup } = makeRepo();
		try {
			const sub = join(repo, "nested", "deep");
			mkdirSync(sub, { recursive: true });
			const root = resolveProjectRoot(sub);
			// On Windows: must not contain forward slashes (raw git output would).
			// On POSIX: separator is "/" and path is unchanged.
			if (sep === "\\") {
				assert.ok(
					!root.includes("/"),
					`expected native separators on Windows, got: ${root}`,
				);
			}
			// Cross-platform invariant: the returned root, when joined with a
			// native-separator subpath, must remain a prefix-match of that path.
			assert.ok(
				sub.startsWith(root),
				`expected ${sub} to start with ${root}`,
			);
		} finally {
			cleanup();
		}
	});

	test("returns cwd unchanged when not inside a git repo", (t) => {
		const tmp = realpathSync(mkdtempSync(join(tmpdir(), "gsd-projroot-nogit-")));
		try {
			// Skip explicitly if tmp dir happens to be inside a parent git repo —
			// otherwise the assertion below would be silently bypassed.
			let parentGit = false;
			try {
				const result = execFileSync("git", ["rev-parse", "--show-toplevel"], {
					cwd: tmp,
					encoding: "utf-8",
					stdio: ["ignore", "pipe", "ignore"],
				}).trim();
				if (result.length > 0) parentGit = true;
			} catch { /* not in a repo, expected */ }
			if (parentGit) {
				t.skip("Temporary directory is inside a parent git repo");
				return;
			}

			assert.strictEqual(resolveProjectRoot(tmp), tmp);
		} finally {
			try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
		}
	});
});
