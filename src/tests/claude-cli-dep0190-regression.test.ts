// GSD2 — Regression test for Issue #5017 (DEP0190 from claude-cli-check.ts and readiness.ts)
//
// Issue #5017: on Windows the binary probe used `execFileSync(cmd, args, { shell: true })`
// which Node 22+ rejects with `[DEP0190] DeprecationWarning: Passing args to a child
// process with shell option true can lead to security vulnerabilities …`. The fix is
// to invoke `cmd /c <command> <args...>` explicitly on Windows so no `shell: true` is
// involved.
//
// The behavioural assertion: when the probe runs in a Node process started with
// `--throw-deprecation`, ANY emitted DeprecationWarning becomes a thrown error and
// the child exits non-zero. A clean (status 0) child proves no DEP0190 was emitted.
//
// On non-Windows the probe never used `shell: true`, so the test is vacuously green
// there — but it still guards against a regression that re-introduces the deprecated
// pattern on POSIX. On Windows CI it is the actual regression check.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "..");
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
const supportsExperimentalStripTypes =
	nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 6);
const stripTypesSkipReason = supportsExperimentalStripTypes
	? undefined
	: "--experimental-strip-types requires Node 22.6+";

function runUnderThrowDeprecation(modulePath: string, exportName: string): { status: number | null; stderr: string } {
	// Inline ESM script: import the module, call the named export. The function
	// internally invokes execFileSync — which is what triggered DEP0190 before
	// the fix.
	const script = [
		`import { ${exportName} } from ${JSON.stringify(modulePath)};`,
		`try { ${exportName}(); } catch { /* binary missing on CI is fine */ }`,
	].join("\n");

	// --experimental-strip-types requires Node 22.6+; tests using this
	// helper are skipped on older Node 22 builds.
	const child = spawnSync(
		process.execPath,
		[
			"--throw-deprecation",
			"--experimental-strip-types",
			"--input-type=module",
			"-e",
			script,
		],
		{ encoding: "utf-8", timeout: 30_000 },
	);
	return { status: child.status, stderr: child.stderr ?? "" };
}

describe("Issue #5017 — DEP0190 must not fire from Claude CLI probes", () => {
	test("claude-cli-check.ts isClaudeBinaryInstalled() emits no DeprecationWarning", { skip: stripTypesSkipReason }, () => {
		const modulePath = pathToFileURL(join(srcRoot, "claude-cli-check.ts")).href;
		const { status, stderr } = runUnderThrowDeprecation(modulePath, "isClaudeBinaryInstalled");
		assert.equal(
			status,
			0,
			`Expected exit 0 (no deprecation) but got ${status}. stderr: ${stderr}`,
		);
	});

	test("readiness.ts isClaudeBinaryPresent() emits no DeprecationWarning", { skip: stripTypesSkipReason }, () => {
		const modulePath = pathToFileURL(
			join(srcRoot, "resources", "extensions", "claude-code-cli", "readiness.ts"),
		).href;
		const { status, stderr } = runUnderThrowDeprecation(modulePath, "isClaudeBinaryPresent");
		assert.equal(
			status,
			0,
			`Expected exit 0 (no deprecation) but got ${status}. stderr: ${stderr}`,
		);
	});
});
