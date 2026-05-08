/**
 * GSD-2 e2e sanity tests.
 *
 * Smallest possible vertical slice that exercises the e2e harness through
 * a real spawn of the built `gsd` binary. If this suite passes, the harness
 * + CI wiring + binary build are working. Every later e2e suite builds on
 * the same shared helpers in `_shared/`.
 *
 * Requires GSD_SMOKE_BINARY to point at the built loader (e.g. dist/loader.js)
 * unless `gsd` is on PATH.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { createTmpProject, gsdSync } from "./_shared/index.ts";

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core` and re-export." };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

describe("e2e sanity (real-process)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("gsd --version prints a semver and exits 0", { skip: skipReason ?? false }, (t) => {
		const project = createTmpProject();
		t.after(project.cleanup);

		const result = gsdSync(["--version"], { cwd: project.dir, timeoutMs: 15_000 });

		assert.equal(result.code, 0, `expected exit 0, got ${result.code}. stderr=${result.stderrClean}`);
		assert.ok(!result.timedOut, "spawn timed out");
		assert.match(
			result.stdoutClean.trim(),
			/\d+\.\d+\.\d+/,
			`expected semver in stdout, got: ${result.stdoutClean.trim()}`,
		);
	});

	test("gsd --help mentions usage and exits 0", { skip: skipReason ?? false }, (t) => {
		const project = createTmpProject();
		t.after(project.cleanup);

		const result = gsdSync(["--help"], { cwd: project.dir, timeoutMs: 15_000 });

		assert.equal(result.code, 0, `expected exit 0, got ${result.code}. stderr=${result.stderrClean}`);
		const out = result.stdoutClean.toLowerCase();
		assert.ok(
			out.includes("usage") || out.includes("commands") || out.includes("options"),
			`expected --help output to mention usage/commands/options, got: ${result.stdoutClean.slice(0, 400)}`,
		);
	});

	test("inherited GSD_* env vars do not leak into the child", { skip: skipReason ?? false }, (t) => {
		// Sanity check on the harness itself — buildE2eEnv() should strip GSD_* from the
		// host. We verify by ensuring --version still succeeds even when a noisy GSD_*
		// var is set in the parent that would, if leaked, break the child's startup.
		// This protects against the harness regressing into a "leaks env" footgun.
		const project = createTmpProject();
		t.after(project.cleanup);

		const previous = process.env.GSD_FORCE_BAD_CONFIG;
		process.env.GSD_FORCE_BAD_CONFIG = "/nonexistent/path/that/should/never/be/read";
		t.after(() => {
			if (previous === undefined) delete process.env.GSD_FORCE_BAD_CONFIG;
			else process.env.GSD_FORCE_BAD_CONFIG = previous;
		});

		const result = gsdSync(["--version"], { cwd: project.dir, timeoutMs: 15_000 });
		assert.equal(result.code, 0, `expected child to ignore parent GSD_*; got code=${result.code} stderr=${result.stderrClean}`);
	});
});
