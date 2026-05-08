import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// When run from dist-test/packages/agent-core/dist/, the workspace package root lives at
// packages/agent-core/. The compile-tests harness mirrors packages/ into dist-test/packages/,
// so rewrite the marker to find the real built output.
function resolveBuiltEntryPath(): string {
	const runtimePackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
	const distTestMarker = `${sep}dist-test${sep}packages${sep}`;
	const workspacePackageRoot = runtimePackageRoot.includes(distTestMarker)
		? runtimePackageRoot.replace(distTestMarker, `${sep}packages${sep}`)
		: runtimePackageRoot;
	return join(workspacePackageRoot, "dist", "index.js");
}

test("@gsd/agent-core seam: built dist entrypoint exists and matches package.json main", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const pkgRoot = join(here, "..").replace(`${sep}dist-test${sep}packages${sep}`, `${sep}packages${sep}`);
	const pkgJson = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as { main: string };
	const entry = resolveBuiltEntryPath();
	assert.equal(existsSync(entry), true, `missing built entrypoint: ${entry}`);
	assert.ok(pkgJson.main.endsWith("index.js"), `package.json main should point at built index.js, got ${pkgJson.main}`);
});

test("@gsd/agent-core seam: module loads cleanly with no unintended exports", async () => {
	const mod = await import(pathToFileURL(resolveBuiltEntryPath()).href);
	// Shell carries no runtime content yet — anything beyond the default re-export surface
	// indicates a future extraction PR forgot to wire its public-api.ts properly.
	const exportedNames = Object.keys(mod).filter((k) => k !== "default" && k !== "__esModule");
	assert.deepEqual(exportedNames, [], `unexpected exports from empty shell: ${exportedNames.join(", ")}`);
});
