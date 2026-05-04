// Project/App: GSD-2
// File Purpose: Regression coverage for workspace build ordering around shared contracts.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function findRepoRoot(start: string): string {
	let dir = start;
	for (let i = 0; i < 10; i++) {
		try {
			const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
			if (pkg.name === "gsd-pi" && pkg.workspaces) return dir;
		} catch {
			// Keep walking.
		}
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(`Could not locate repo root from ${start}`);
}

const projectRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const rootPackage = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const contractsPackage = JSON.parse(readFileSync(join(projectRoot, "packages/contracts/package.json"), "utf8")); // allow-source-grep: package manifest contract test validates build script metadata.
const scripts = rootPackage.scripts as Record<string, string>;

function assertContractsBefore(scriptName: string, laterCommand: string): void {
	const script = scripts[scriptName];
	assert.ok(script, `${scriptName} script must exist`);
	const contractsIndex = script.indexOf("npm run build:contracts");
	const laterIndex = script.indexOf(laterCommand);
	assert.ok(contractsIndex >= 0, `${scriptName} must build @gsd-build/contracts`);
	assert.ok(laterIndex >= 0, `${scriptName} must include ${laterCommand}`);
	assert.ok(
		contractsIndex < laterIndex,
		`${scriptName} must build @gsd-build/contracts before ${laterCommand}`,
	);
}

test("pi build scripts compile contracts before pi-coding-agent", () => {
	assertContractsBefore("build:pi", "npm run build:pi-coding-agent");
	assertContractsBefore("build:pi-coding-agent", "npm run build -w @gsd/pi-coding-agent");
	assertContractsBefore("gsd:web", "npm run copy-resources");
});

test("contracts build emits dist even when incremental metadata is stale", () => {
	const buildScript = contractsPackage.scripts?.build;
	assert.equal(
		buildScript,
		"tsc -p tsconfig.json --incremental false",
		"contracts build must not rely on stale tsbuildinfo when dist is missing",
	);
});
