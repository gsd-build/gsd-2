/**
 * SQLite storage for the memory extraction pipeline.
 *
 * Tables:
 * - threads: tracks session files and their processing state
 * - stage1_outputs: stores per-thread extraction results
 * - jobs: lease-based job queue for pipeline phases
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface ThreadRow {
	thread_id: string;
	file_path: string;
	file_size: number;
	file_mtime: number;
	cwd: string;
	status: "pending" | "processing" | "done" | "error";
	error_message: string | null;
	created_at: string;
	updated_at: string;
}

export interface Stage1OutputRow {
	thread_id: string;
	extraction_json: string;
	created_at: string;
}

export interface JobRow {
	id: string;
	phase: "stage1" | "stage2";
	thread_id: string | null;
	status: "pending" | "claimed" | "done" | "error";
	worker_id: string | null;
	ownership_token: string | null;
	lease_expires_at: string | null;
	error_message: string | null;
	created_at: string;
	updated_at: string;
}

export class MemoryStorage {
	private db: Database.Database;

	constructor(dbPath: string) {
		const dir = dirname(dbPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		this.db = new Database(dbPath);
		this.db.pragma("journal_mode = WAL");
		this.db.pragma("synchronous = NORMAL");
		this.db.pragma("busy_timeout = 5000");
		this.initSchema();
	}

	private initSchema(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS threads (
				thread_id TEXT PRIMARY KEY,
				file_path TEXT NOT NULL,
				file_size INTEGER NOT NULL DEFAULT 0,
				file_mtime INTEGER NOT NULL DEFAULT 0,
				cwd TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'pending',
				error_message TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE TABLE IF NOT EXISTS stage1_outputs (
				thread_id TEXT PRIMARY KEY,
				extraction_json TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE
			);

			CREATE TABLE IF NOT EXISTS jobs (
				id TEXT PRIMARY KEY,
				phase TEXT NOT NULL,
				thread_id TEXT,
				status TEXT NOT NULL DEFAULT 'pending',
				worker_id TEXT,
				ownership_token TEXT,
				lease_expires_at TEXT,
				error_message TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			);

			CREATE INDEX IF NOT EXISTS idx_jobs_phase_status ON jobs(phase, status);
			CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
			CREATE INDEX IF NOT EXISTS idx_threads_cwd ON threads(cwd);
		`);
	}

	/**
	 * Insert or update thread records. Skips threads whose file hasn't changed
	 * (same size + mtime = watermark match).
	 */
	upsertThreads(
		threads: Array<{
			threadId: string;
			filePath: string;
			fileSize: number;
			fileMtime: number;
			cwd: string;
		}>,
	): { inserted: number; updated: number; skipped: number } {
		let inserted = 0;
		let updated = 0;
		let skipped = 0;

		const selectStmt = this.db.prepare(
			"SELECT file_size, file_mtime, status FROM threads WHERE thread_id = ?",
		);
		const insertStmt = this.db.prepare(`
			INSERT INTO threads (thread_id, file_path, file_size, file_mtime, cwd, status)
			VALUES (?, ?, ?, ?, ?, 'pending')
		`);
		const updateStmt = this.db.prepare(`
			UPDATE threads SET file_path = ?, file_size = ?, file_mtime = ?, cwd = ?,
				status = 'pending', updated_at = datetime('now')
			WHERE thread_id = ?
		`);
		const insertJobStmt = this.db.prepare(`
			INSERT OR IGNORE INTO jobs (id, phase, thread_id, status)
			VALUES (?, 'stage1', ?, 'pending')
		`);

		const upsertAll = this.db.transaction(() => {
			for (const t of threads) {
				const existing = selectStmt.get(t.threadId) as
					| { file_size: number; file_mtime: number; status: string }
					| undefined;

				if (!existing) {
					insertStmt.run(t.threadId, t.filePath, t.fileSize, t.fileMtime, t.cwd);
					insertJobStmt.run(randomUUID(), t.threadId);
					inserted++;
				} else if (existing.file_size !== t.fileSize || existing.file_mtime !== t.fileMtime) {
					updateStmt.run(t.filePath, t.fileSize, t.fileMtime, t.cwd, t.threadId);
					// Re-enqueue if file changed and previous processing is done
					if (existing.status === "done" || existing.status === "error") {
						insertJobStmt.run(randomUUID(), t.threadId);
					}
					updated++;
				} else {
					skipped++;
				}
			}
		});

		upsertAll();
		return { inserted, updated, skipped };
	}

	/**
	 * Claim up to `limit` stage1 jobs for the given worker.
	 * Uses lease-based ownership with an ownership_token UUID.
	 */
	claimStage1Jobs(
		workerId: string,
		limit: number,
		leaseSeconds: number,
	): Array<{ jobId: string; threadId: string; ownershipToken: string }> {
		const token = randomUUID();
		const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();

		const claimStmt = this.db.prepare(`
			UPDATE jobs SET
				status = 'claimed',
				worker_id = ?,
				ownership_token = ?,
				lease_expires_at = ?,
				updated_at = datetime('now')
			WHERE id IN (
				SELECT id FROM jobs
				WHERE phase = 'stage1'
					AND (status = 'pending' OR (status = 'claimed' AND lease_expires_at < datetime('now')))
				LIMIT ?
			)
		`);

		const selectStmt = this.db.prepare(`
			SELECT id, thread_id FROM jobs
			WHERE ownership_token = ? AND status = 'claimed'
		`);

		claimStmt.run(workerId, token, expiresAt, limit);
		const rows = selectStmt.all(token) as Array<{ id: string; thread_id: string }>;

		return rows.map((r) => ({
			jobId: r.id,
			threadId: r.thread_id,
			ownershipToken: token,
		}));
	}

	/**
	 * Mark a stage1 job as complete and store the extraction output.
	 */
	completeStage1Job(threadId: string, output: string): void {
		const completeAll = this.db.transaction(() => {
			this.db
				.prepare(
					`UPDATE jobs SET status = 'done', updated_at = datetime('now')
				WHERE thread_id = ? AND phase = 'stage1' AND status = 'claimed'`,
				)
				.run(threadId);

			this.db
				.prepare(
					`INSERT OR REPLACE INTO stage1_outputs (thread_id, extraction_json, created_at)
				VALUES (?, ?, datetime('now'))`,
				)
				.run(threadId, output);

			this.db
				.prepare(
					`UPDATE threads SET status = 'done', updated_at = datetime('now')
				WHERE thread_id = ?`,
				)
				.run(threadId);
		});

		completeAll();
	}

	/**
	 * Mark a stage1 job as errored.
	 */
	failStage1Job(threadId: string, errorMessage: string): void {
		const failAll = this.db.transaction(() => {
			this.db
				.prepare(
					`UPDATE jobs SET status = 'error', error_message = ?, updated_at = datetime('now')
				WHERE thread_id = ? AND phase = 'stage1' AND status = 'claimed'`,
				)
				.run(errorMessage, threadId);

			this.db
				.prepare(
					`UPDATE threads SET status = 'error', error_message = ?, updated_at = datetime('now')
				WHERE thread_id = ?`,
				)
				.run(errorMessage, threadId);
		});

		failAll();
	}

	/**
	 * Try to claim the global phase 2 consolidation job.
	 * Only one worker can hold this at a time.
	 */
	tryClaimGlobalPhase2Job(
		workerId: string,
		leaseSeconds: number,
	): { jobId: string; ownershipToken: string } | null {
		const token = randomUUID();
		const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();

		const result = this.db.transaction(() => {
			// Check if all stage1 jobs are done
			const pendingStage1 = this.db
				.prepare(
					`SELECT COUNT(*) as cnt FROM jobs
					WHERE phase = 'stage1' AND status IN ('pending', 'claimed')`,
				)
				.get() as { cnt: number };

			if (pendingStage1.cnt > 0) {
				return null;
			}

			// Check if there's already an active phase2 job
			const existingPhase2 = this.db
				.prepare(
					`SELECT id FROM jobs
					WHERE phase = 'stage2' AND status = 'claimed' AND lease_expires_at > datetime('now')`,
				)
				.get();

			if (existingPhase2) {
				return null;
			}

			// Check if there are any stage1 outputs to consolidate
			const outputCount = this.db
				.prepare("SELECT COUNT(*) as cnt FROM stage1_outputs")
				.get() as { cnt: number };

			if (outputCount.cnt === 0) {
				return null;
			}

			const jobId = randomUUID();
			this.db
				.prepare(
					`INSERT INTO jobs (id, phase, status, worker_id, ownership_token, lease_expires_at)
					VALUES (?, 'stage2', 'claimed', ?, ?, ?)`,
				)
				.run(jobId, workerId, token, expiresAt);

			return { jobId, ownershipToken: token };
		})();

		return result;
	}

	/**
	 * Complete the phase 2 consolidation job.
	 */
	completePhase2Job(jobId: string): void {
		this.db
			.prepare(
				`UPDATE jobs SET status = 'done', updated_at = datetime('now')
			WHERE id = ? AND phase = 'stage2'`,
			)
			.run(jobId);
	}

	/**
	 * Get all stage1 extraction outputs.
	 */
	getStage1Outputs(): Array<{ threadId: string; extractionJson: string }> {
		const rows = this.db
			.prepare("SELECT thread_id, extraction_json FROM stage1_outputs")
			.all() as Array<{ thread_id: string; extraction_json: string }>;

		return rows.map((r) => ({
			threadId: r.thread_id,
			extractionJson: r.extraction_json,
		}));
	}

	/**
	 * Get all stage1 outputs for a specific cwd.
	 */
	getStage1OutputsForCwd(cwd: string): Array<{ threadId: string; extractionJson: string }> {
		const rows = this.db
			.prepare(
				`SELECT s.thread_id, s.extraction_json FROM stage1_outputs s
				INNER JOIN threads t ON t.thread_id = s.thread_id
				WHERE t.cwd = ?`,
			)
			.all(cwd) as Array<{ thread_id: string; extraction_json: string }>;

		return rows.map((r) => ({
			threadId: r.thread_id,
			extractionJson: r.extraction_json,
		}));
	}

	/**
	 * Get thread info by ID.
	 */
	getThread(threadId: string): ThreadRow | undefined {
		return this.db.prepare("SELECT * FROM threads WHERE thread_id = ?").get(threadId) as
			| ThreadRow
			| undefined;
	}

	/**
	 * Get pipeline statistics.
	 */
	getStats(): {
		totalThreads: number;
		pendingThreads: number;
		doneThreads: number;
		errorThreads: number;
		totalStage1Outputs: number;
		pendingStage1Jobs: number;
	} {
		const threads = this.db.prepare(`
			SELECT
				COUNT(*) as total,
				SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
				SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
				SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
			FROM threads
		`).get() as { total: number; pending: number; done: number; errors: number };

		const outputs = this.db.prepare("SELECT COUNT(*) as cnt FROM stage1_outputs").get() as {
			cnt: number;
		};

		const pendingJobs = this.db
			.prepare(
				"SELECT COUNT(*) as cnt FROM jobs WHERE phase = 'stage1' AND status IN ('pending', 'claimed')",
			)
			.get() as { cnt: number };

		return {
			totalThreads: threads.total,
			pendingThreads: threads.pending,
			doneThreads: threads.done,
			errorThreads: threads.errors,
			totalStage1Outputs: outputs.cnt,
			pendingStage1Jobs: pendingJobs.cnt,
		};
	}

	/**
	 * Clear all data (for /memory clear).
	 */
	clearAll(): void {
		this.db.transaction(() => {
			this.db.exec("DELETE FROM stage1_outputs");
			this.db.exec("DELETE FROM jobs");
			this.db.exec("DELETE FROM threads");
		})();
	}

	/**
	 * Clear data for a specific cwd (for /memory clear in project scope).
	 */
	clearForCwd(cwd: string): void {
		this.db.transaction(() => {
			this.db
				.prepare(
					`DELETE FROM stage1_outputs WHERE thread_id IN (
					SELECT thread_id FROM threads WHERE cwd = ?)`,
				)
				.run(cwd);
			this.db
				.prepare(
					`DELETE FROM jobs WHERE thread_id IN (
					SELECT thread_id FROM threads WHERE cwd = ?)`,
				)
				.run(cwd);
			this.db.prepare("DELETE FROM threads WHERE cwd = ?").run(cwd);
		})();
	}

	/**
	 * Reset all threads to pending (for /memory rebuild).
	 */
	resetAllForCwd(cwd: string): void {
		this.db.transaction(() => {
			// Delete existing stage1 outputs
			this.db
				.prepare(
					`DELETE FROM stage1_outputs WHERE thread_id IN (
					SELECT thread_id FROM threads WHERE cwd = ?)`,
				)
				.run(cwd);

			// Delete old jobs
			this.db
				.prepare(
					`DELETE FROM jobs WHERE thread_id IN (
					SELECT thread_id FROM threads WHERE cwd = ?)`,
				)
				.run(cwd);

			// Reset thread status
			this.db
				.prepare(
					`UPDATE threads SET status = 'pending', updated_at = datetime('now')
				WHERE cwd = ?`,
				)
				.run(cwd);

			// Re-create stage1 jobs
			const threads = this.db
				.prepare("SELECT thread_id FROM threads WHERE cwd = ?")
				.all(cwd) as Array<{ thread_id: string }>;

			const insertJobStmt = this.db.prepare(
				"INSERT INTO jobs (id, phase, thread_id, status) VALUES (?, 'stage1', ?, 'pending')",
			);
			for (const t of threads) {
				insertJobStmt.run(randomUUID(), t.thread_id);
			}
		})();
	}

	close(): void {
		this.db.close();
	}
}
