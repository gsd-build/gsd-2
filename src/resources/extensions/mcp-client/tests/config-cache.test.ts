/**
 * _resetConfigCache() — invalidates the in-memory readConfigs() cache so the
 * next call re-reads from disk. Used by /gsd mcp trust after a successful write.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _resetConfigCache, getServerConfig } from "../index.js";

let cwdDir: string;
let originalCwd: string;
let originalGsdHome: string | undefined;

before(() => {
	originalCwd = process.cwd();
	originalGsdHome = process.env.GSD_HOME;
	cwdDir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-cache-")));
	// Point GSD_HOME at the temp dir so a stray ~/.gsd/mcp.json on the dev
	// machine cannot leak into this test.
	process.env.GSD_HOME = cwdDir;
	process.chdir(cwdDir);
	writeFileSync(
		join(cwdDir, ".mcp.json"),
		JSON.stringify({ mcpServers: { cache: { command: "echo" } } }),
		"utf-8",
	);
	// Seed the cache so the next test's call returns the cached snapshot.
	_resetConfigCache();
	getServerConfig("cache");
});

after(() => {
	process.chdir(originalCwd);
	if (originalGsdHome === undefined) delete process.env.GSD_HOME;
	else process.env.GSD_HOME = originalGsdHome;
	try { rmSync(cwdDir, { recursive: true, force: true }); } catch { /* best-effort */ }
	_resetConfigCache();
});

test("after disk mutation, readConfigs returns stale data until _resetConfigCache is called", () => {
	// Mutate the fixture on disk.
	writeFileSync(
		join(cwdDir, ".mcp.json"),
		JSON.stringify({ mcpServers: { cache: { command: "echo", trust: true } } }),
		"utf-8",
	);

	// Without a reset, the cache still reports trust as undefined.
	const stale = getServerConfig("cache");
	assert.ok(stale);
	assert.equal(stale?.trust, undefined, "cache should return the pre-mutation snapshot");

	// After reset, the re-read picks up trust:true.
	_resetConfigCache();
	const fresh = getServerConfig("cache");
	assert.ok(fresh);
	assert.equal(fresh?.trust, true, "post-reset read must reflect the on-disk change");
});
