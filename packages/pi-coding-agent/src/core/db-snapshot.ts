import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type DbSnapshot = Buffer | Uint8Array;

function closeBestEffort(fd: number | null): void {
	if (fd === null) return;
	try {
		closeSync(fd);
	} catch {
		// Preserve the original write/rename failure when cleaning up.
	}
}

function fsyncDirectoryBestEffort(dirPath: string): void {
	let fd: number | null = null;
	try {
		fd = openSync(dirPath, "r");
		fsyncSync(fd);
	} catch {
		// Directory fsync is unsupported on some platforms/filesystems.
	} finally {
		closeBestEffort(fd);
	}
}

/**
 * Persist a sql.js database export without exposing callers to a torn live file.
 *
 * The snapshot is written to a unique temp file in the same directory, flushed,
 * then renamed over the target. A hard kill during the temp write leaves the
 * previous target intact; after rename, readers see the complete new snapshot.
 *
 * The rename replaces the target inode: existing file mode/ownership is not
 * preserved, and a symlink at dbPath is replaced rather than written through.
 * Agent DB snapshots are owned runtime files, so this trade-off favors a
 * private 0600 replacement over retaining prior target metadata.
 */
export function atomicWriteDbSnapshotSync(dbPath: string, snapshot: DbSnapshot): void {
	const dirPath = dirname(dbPath);
	const tmpPath = join(dirPath, `.${basename(dbPath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
	let fd: number | null = null;
	let renamed = false;

	try {
		fd = openSync(tmpPath, "wx", 0o600);
		writeFileSync(fd, Buffer.from(snapshot));
		fsyncSync(fd);
		closeSync(fd);
		fd = null;

		renameSync(tmpPath, dbPath);
		renamed = true;
		fsyncDirectoryBestEffort(dirPath);
	} finally {
		closeBestEffort(fd);
		if (!renamed) {
			try {
				unlinkSync(tmpPath);
			} catch {
				// The temp file may not have been created yet.
			}
		}
	}
}
