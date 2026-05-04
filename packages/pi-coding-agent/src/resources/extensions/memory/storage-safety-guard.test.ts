import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

test("sql.js storage does not directly overwrite live DB file", () => {
	const src = readFileSync(join(__dirname, "storage.ts"), "utf-8");
	assert.match(src, /atomicWriteDbSnapshotSync\(/, "storage must use atomic DB snapshot writes");
	assert.doesNotMatch(src, /writeFileSync\(this\.dbPath/, "direct live DB overwrite is forbidden");
});
