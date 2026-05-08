/**
 * GSD-2 Docker runtime e2e smoke.
 *
 * Builds the `runtime-local` Dockerfile target from the *current source*
 * (via `npm pack` → COPY into the image) and runs `gsd --version` inside
 * the resulting container. Catches regressions where the published image
 * would refuse to start: missing system deps (git), broken postinstall,
 * platform-specific native binding failures, missing files in the npm
 * tarball.
 *
 * Skipped when `docker` is not on PATH (local dev without Docker).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { stripAnsi } from "../_shared/index.ts";

function dockerAvailable(): boolean {
	const probe = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
		stdio: "pipe",
		encoding: "utf8",
		timeout: 5_000,
	});
	return probe.status === 0;
}

function repoRoot(): string {
	// tests/e2e/docker/runtime.e2e.test.ts → up three
	return resolve(import.meta.dirname, "..", "..", "..");
}

/**
 * Build a tarball with `npm pack`, return its absolute path. Caller is
 * responsible for cleanup. We pack into the repo root because `docker
 * build` needs the tarball inside the build context.
 */
function packToRoot(): { tarball: string; cleanup: () => void } {
	const root = repoRoot();
	const before = new Set(readdirSync(root).filter((f) => f.endsWith(".tgz")));
	execFileSync("npm", ["pack", "--silent"], {
		cwd: root,
		stdio: "pipe",
		encoding: "utf8",
		timeout: 180_000,
	});
	const after = readdirSync(root).filter((f) => f.endsWith(".tgz"));
	const created = after.find((f) => !before.has(f));
	if (!created) throw new Error("npm pack produced no new .tgz file");
	const abs = join(root, created);
	return {
		tarball: created,
		cleanup: () => {
			try {
				if (existsSync(abs)) execFileSync("rm", ["-f", abs], { stdio: "pipe" });
			} catch {
				// best-effort
			}
		},
	};
}

function dockerBuildLocal(tarballName: string, tag: string): void {
	const root = repoRoot();
	execFileSync(
		"docker",
		[
			"build",
			"--target",
			"runtime-local",
			"--build-arg",
			`TARBALL=${tarballName}`,
			"-t",
			tag,
			".",
		],
		{
			cwd: root,
			stdio: "pipe",
			encoding: "utf8",
			timeout: 600_000,
		},
	);
}

function dockerRun(tag: string, args: string[]): { stdout: string; code: number } {
	const result = spawnSync("docker", ["run", "--rm", tag, ...args], {
		stdio: "pipe",
		encoding: "utf8",
		timeout: 60_000,
	});
	return {
		stdout: stripAnsi(result.stdout ?? ""),
		code: result.status ?? 1,
	};
}

function dockerRmImage(tag: string): void {
	try {
		execFileSync("docker", ["image", "rm", "-f", tag], { stdio: "pipe" });
	} catch {
		// best-effort
	}
}

const TAG = `gsd-pi:e2e-${process.pid}`;

describe("docker runtime e2e", () => {
	const skipReason = dockerAvailable()
		? null
		: "docker not available (set up Docker Desktop or run in CI to exercise this suite)";

	test(
		"`gsd --version` inside runtime-local container exits 0 with semver",
		{ skip: skipReason ?? false, timeout: 900_000 },
		(t) => {
			const packed = packToRoot();
			t.after(packed.cleanup);
			t.after(() => dockerRmImage(TAG));

			dockerBuildLocal(packed.tarball, TAG);

			const result = dockerRun(TAG, ["--version"]);
			assert.equal(result.code, 0, `expected exit 0, got ${result.code}. stdout=${result.stdout}`);
			assert.match(
				result.stdout.trim(),
				/\d+\.\d+\.\d+/,
				`expected semver in stdout, got: ${result.stdout.trim()}`,
			);

			// Sanity: assert version matches package.json (catches publish-skew where
			// the tarball install resolved to a different version than this branch).
			const pkg = JSON.parse(readFileSync(join(repoRoot(), "package.json"), "utf8")) as {
				version?: string;
			};
			if (pkg.version) {
				assert.ok(
					result.stdout.includes(pkg.version),
					`container reported version ${result.stdout.trim()} but package.json says ${pkg.version}`,
				);
			}
		},
	);
});
