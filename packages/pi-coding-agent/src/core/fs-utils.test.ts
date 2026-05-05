import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWriteDbSnapshotSync, atomicWriteFileSync } from "./fs-utils.js";

describe("atomicWriteFileSync", () => {
	let dir: string;

	afterEach(() => {
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes file content atomically", () => {
		dir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
		const filePath = join(dir, "test.txt");
		atomicWriteFileSync(filePath, "hello world");
		assert.equal(readFileSync(filePath, "utf-8"), "hello world");
	});

	it("overwrites existing file atomically", () => {
		dir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
		const filePath = join(dir, "test.txt");
		atomicWriteFileSync(filePath, "first");
		atomicWriteFileSync(filePath, "second");
		assert.equal(readFileSync(filePath, "utf-8"), "second");
	});

	it("does not leave .tmp file after successful write", () => {
		dir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
		const filePath = join(dir, "test.txt");
		atomicWriteFileSync(filePath, "content");
		assert.equal(existsSync(filePath + ".tmp"), false);
	});

	it("supports Buffer content", () => {
		dir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
		const filePath = join(dir, "test.bin");
		const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
		atomicWriteFileSync(filePath, buf);
		const result = readFileSync(filePath);
		assert.deepEqual(result, buf);
	});

	it("supports encoding parameter", () => {
		dir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
		const filePath = join(dir, "test.txt");
		atomicWriteFileSync(filePath, "utf8 content", "utf-8");
		assert.equal(readFileSync(filePath, "utf-8"), "utf8 content");
	});

	it("fsyncs temp file before rename (durability guard)", () => {
		const src = readFileSync(join(process.cwd(), "packages", "pi-coding-agent", "src", "core", "fs-utils.ts"), "utf-8");
		assert.match(src, /fsyncSync\(fd\)/);
	});
});

describe("atomicWriteDbSnapshotSync", () => {
	let dir: string;

	afterEach(() => {
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes snapshot bytes via atomic file replacement", () => {
		dir = mkdtempSync(join(tmpdir(), "fs-utils-db-snapshot-test-"));
		const dbPath = join(dir, "agent.db");
		const snapshot = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65]);
		atomicWriteDbSnapshotSync(dbPath, snapshot);
		assert.deepEqual(readFileSync(dbPath), Buffer.from(snapshot));
		assert.equal(existsSync(dbPath + ".tmp"), false);
	});
});
