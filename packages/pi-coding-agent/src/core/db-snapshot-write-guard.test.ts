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

function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "");
}

test("all sql.js db.export() persistence uses atomic snapshot helper", () => {
	const srcRoot = join(process.cwd(), "packages", "pi-coding-agent", "src");
	const files = collectTsFiles(srcRoot);

	for (const file of files) {
		const src = readFileSync(file, "utf-8");
		const code = stripComments(src);
		if (!code.includes("db.export(")) continue;

		const directExportWrite = /writeFileSync\([\s\S]{0,200}?db\.export\(/m;
		assert.doesNotMatch(
			code,
			directExportWrite,
			`${file} writes db.export() directly via writeFileSync(); use atomicWriteDbSnapshotSync()`,
		);

		assert.match(
			code,
			/atomicWriteDbSnapshotSync\(/,
			`${file} uses db.export() but does not call atomicWriteDbSnapshotSync()`,
		);

		const exportAssigned = /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*db\.export\(\s*\)\s*;/m;
		const match = code.match(exportAssigned);
		if (match) {
			const varName = match[1];
			const escape = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const badWrite = new RegExp(`writeFileSync\\([\\s\\S]{0,240}?\\b${escape}\\b`, "m");
			assert.doesNotMatch(
				code,
				badWrite,
				`${file} writes db.export() variable ${varName} via writeFileSync(); use atomicWriteDbSnapshotSync()`,
			);
			const goodWrite = new RegExp(`atomicWriteDbSnapshotSync\\([\\s\\S]{0,120}?\\b${escape}\\b`, "m");
			assert.match(
				code,
				goodWrite,
				`${file} must pass db.export() variable ${varName} to atomicWriteDbSnapshotSync()`,
			);
		}
	}
});
