import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("sql.js storage does not directly overwrite live DB file", () => {
	const src = readFileSync(
		join(process.cwd(), "packages", "pi-coding-agent", "src", "resources", "extensions", "memory", "storage.ts"),
		"utf-8",
	);
	assert.match(src, /atomicWriteDbSnapshotSync\(/, "storage must use atomic DB snapshot writes");
	assert.doesNotMatch(src, /writeFileSync\(this\.dbPath/, "direct live DB overwrite is forbidden");
});
