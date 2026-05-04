import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function collectTsFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (entry === "node_modules" || entry === "dist" || entry === "tests") continue;
			collectTsFiles(full, out);
			continue;
		}
		if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
	}
	return out;
}

test("all sql.js db.export() persistence uses atomic snapshot helper", () => {
	const srcRoot = join(process.cwd(), "packages", "pi-coding-agent", "src");
	const files = collectTsFiles(srcRoot);

	for (const file of files) {
		const src = readFileSync(file, "utf-8");
		if (!src.includes("db.export(")) continue;

		assert.match(
			src,
			/atomicWriteDbSnapshotSync\(/,
			`${file} uses db.export() but does not call atomicWriteDbSnapshotSync()`,
		);
		assert.doesNotMatch(
			src,
			/writeFileSync\([^\n]*dbPath/,
			`${file} appears to write DB path directly; use atomicWriteDbSnapshotSync()`,
		);
	}
});
