/**
 * Regression test for #4757 — readConfigs() must also read the global
 * ~/.gsd/mcp.json (resolved as $GSD_HOME/mcp.json when GSD_HOME is set).
 *
 * Behaviour test against the exported getServerConfig — no source grep.
 * The fixture is anchored via $GSD_HOME so the test never touches the
 * developer's real ~/.gsd directory.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getServerConfig } from "../index.js";

let cwdDir: string;
let gsdHomeDir: string;
let originalCwd: string;
let originalGsdHome: string | undefined;

before(() => {
	originalCwd = process.cwd();
	originalGsdHome = process.env.GSD_HOME;

	// realpathSync resolves any symlink in tmpdir() — on macOS /var → /private/var
	// so process.cwd() after chdir matches what mkdtempSync returned.
	cwdDir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-cwd-")));
	gsdHomeDir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-gsdhome-")));

	// Project-local fixture (also defines `shared-server` for the precedence test).
	// `trusted-project-server` carries the trust flag; `bad-trust-server` has a
	// non-boolean trust value that must be ignored.
	writeFileSync(
		join(cwdDir, ".mcp.json"),
		JSON.stringify({
			mcpServers: {
				"project-server": { command: "echo", args: ["proj"] },
				"shared-server": { command: "echo", args: ["from-project"] },
				"trusted-project-server": { command: "echo", args: ["trusted"], trust: true },
				"bad-trust-server": { command: "echo", args: ["bad"], trust: "yes" },
				"slow-server": { command: "echo", args: ["slow"], timeoutMs: 300000 },
				"bad-timeout-server": { command: "echo", args: ["bad"], timeoutMs: "300s" },
				"zero-timeout-server": { command: "echo", args: ["bad"], timeoutMs: 0 },
			},
		}),
		"utf-8",
	);

	// Global fixture rooted at $GSD_HOME (also defines `shared-server` to test
	// that project-local takes precedence on name collision). Uses the `servers`
	// top-level key to confirm trust is read from that variant too.
	writeFileSync(
		join(gsdHomeDir, "mcp.json"),
		JSON.stringify({
			servers: {
				"global-server": { command: "echo", args: ["glob"] },
				"shared-server": { command: "echo", args: ["from-global"] },
				"trusted-global-server": { command: "echo", args: ["trusted"], trust: true },
			},
		}),
		"utf-8",
	);

	process.chdir(cwdDir);
	process.env.GSD_HOME = gsdHomeDir;
});

after(() => {
	process.chdir(originalCwd);
	if (originalGsdHome === undefined) delete process.env.GSD_HOME;
	else process.env.GSD_HOME = originalGsdHome;
	try { rmSync(cwdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
	try { rmSync(gsdHomeDir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

test("#4757: getServerConfig resolves servers declared in $GSD_HOME/mcp.json", () => {
	const cfg = getServerConfig("global-server");
	assert.ok(cfg, "server defined in $GSD_HOME/mcp.json must resolve");
	assert.equal(cfg?.name, "global-server");
	assert.equal(cfg?.sourcePath, join(gsdHomeDir, "mcp.json"));
});

test("#4757: project-local servers still resolve when global config exists", () => {
	const cfg = getServerConfig("project-server");
	assert.ok(cfg, "project-local server must continue to resolve");
	assert.equal(cfg?.sourcePath, join(cwdDir, ".mcp.json"));
});

test("#4757: project-local config wins on server-name collision", () => {
	const cfg = getServerConfig("shared-server");
	assert.ok(cfg, "shared server must resolve");
	assert.equal(
		cfg?.sourcePath,
		join(cwdDir, ".mcp.json"),
		"project-local config must take precedence over $GSD_HOME on name collision",
	);
	assert.deepEqual(cfg?.args, ["from-project"]);
});

test("readConfigs surfaces trust:true from an mcpServers-keyed file", () => {
	const cfg = getServerConfig("trusted-project-server");
	assert.ok(cfg, "trusted project server must resolve");
	assert.equal(cfg?.trust, true);
});

test("readConfigs surfaces trust:true from a servers-keyed file", () => {
	const cfg = getServerConfig("trusted-global-server");
	assert.ok(cfg, "trusted global server must resolve");
	assert.equal(cfg?.trust, true);
});

test("readConfigs defaults trust to undefined when the flag is absent", () => {
	const cfg = getServerConfig("project-server");
	assert.ok(cfg);
	assert.equal(cfg?.trust, undefined);
});

test("readConfigs ignores a non-boolean trust value", () => {
	const cfg = getServerConfig("bad-trust-server");
	assert.ok(cfg, "server with a bad trust value must still resolve");
	assert.equal(cfg?.trust, undefined, "non-boolean trust must not be coerced to true");
});

test("readConfigs surfaces a valid timeoutMs", () => {
	const cfg = getServerConfig("slow-server");
	assert.ok(cfg);
	assert.equal(cfg?.timeoutMs, 300000);
});

test("readConfigs ignores a non-numeric timeoutMs", () => {
	const cfg = getServerConfig("bad-timeout-server");
	assert.ok(cfg, "server with a bad timeoutMs must still resolve");
	assert.equal(cfg?.timeoutMs, undefined);
});

test("readConfigs ignores a non-positive timeoutMs", () => {
	const cfg = getServerConfig("zero-timeout-server");
	assert.ok(cfg);
	assert.equal(cfg?.timeoutMs, undefined, "timeoutMs <= 0 must be rejected");
});

test("readConfigs defaults timeoutMs to undefined when absent", () => {
	const cfg = getServerConfig("project-server");
	assert.ok(cfg);
	assert.equal(cfg?.timeoutMs, undefined);
});
