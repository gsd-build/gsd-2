import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { atomicWriteDbSnapshotSync } from "./db-snapshot.js";

describe("atomicWriteDbSnapshotSync", () => {
	let dir: string;

	afterEach(() => {
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes the full snapshot and leaves no temp file after success", () => {
		dir = mkdtempSync(join(tmpdir(), "gsd-db-snapshot-test-"));
		const dbPath = join(dir, "agent.db");
		const snapshot = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65]);

		atomicWriteDbSnapshotSync(dbPath, snapshot);

		assert.deepEqual(readFileSync(dbPath), Buffer.from(snapshot));
		assert.equal(existsSync(`${dbPath}.tmp`), false);
		assert.deepEqual(
			readdirSync(dir).filter((entry) => entry.includes("agent.db") && entry.includes(".tmp")),
			[],
		);
	});
});
