import { closeSync, fsyncSync, openSync, renameSync, writeSync } from "node:fs";

/**
 * Atomically write a file by writing to a temporary path then renaming.
 * This prevents data loss if the process crashes mid-write — either the
 * old file remains intact or the new content is fully written.
 */
export function atomicWriteFileSync(filePath: string, content: string | Buffer, encoding?: BufferEncoding): void {
	const tmpPath = filePath + ".tmp";
	const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, encoding ?? "utf8");
	const fd = openSync(tmpPath, "w");
	try {
		let offset = 0;
		while (offset < buf.length) {
			offset += writeSync(fd, buf, offset, buf.length - offset);
		}
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	
	renameSync(tmpPath, filePath);
}

/**
 * Persist an in-memory DB snapshot atomically.
 *
 * Use this for sql.js `db.export()` buffers to avoid torn-write corruption
 * on hard process death mid-write.
 */
export function atomicWriteDbSnapshotSync(dbPath: string, snapshot: Uint8Array): void {
	atomicWriteFileSync(dbPath, Buffer.from(snapshot));
}
