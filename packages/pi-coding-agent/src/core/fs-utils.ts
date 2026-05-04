import { renameSync, writeFileSync } from "node:fs";

/**
 * Atomically write a file by writing to a temporary path then renaming.
 * This prevents data loss if the process crashes mid-write — either the
 * old file remains intact or the new content is fully written.
 */
export function atomicWriteFileSync(filePath: string, content: string | Buffer, encoding?: BufferEncoding): void {
	const tmpPath = filePath + ".tmp";
	writeFileSync(tmpPath, content, encoding);
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
