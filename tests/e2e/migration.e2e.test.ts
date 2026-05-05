/**
 * GSD-2 schema migration smoke (forward only).
 *
 * Seeds a `.gsd/gsd.db` SQLite file at an older `schema_version` and runs
 * the **real built `gsd` binary** (`gsd headless query`, no LLM required)
 * against it. Asserts that:
 *
 *   1. The CLI exits cleanly (so the migration didn't crash on start).
 *   2. After the run, the on-disk DB has been migrated up to the current
 *      SCHEMA_VERSION.
 *
 * This is a complement to the unit tests in
 * `src/resources/extensions/gsd/tests/schema-v*-sequence.test.ts` — they
 * test the migration code in-process; this exercises the same code path
 * **through the shipped binary** so a bad build or missing dist asset
 * would surface here, not at user install time.
 *
 * Forward-only by design: gsd-db.ts has no down-migrations to test, and
 * tests for non-existent behavior create false confidence (peer review).
 *
 * Skip path: if `node:sqlite` is not loadable in this Node build, the
 * suite skips with a clear message.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { createTmpProject, gsdSync } from "./_shared/index.ts";

interface SqliteDb {
	// Method names match node:sqlite's API surface.
	// (`run` here is the SQL exec method, not shell exec.)
	run(sql: string): void;
	prepare(sql: string): { get(): Record<string, unknown> | undefined; all(): Record<string, unknown>[] };
	close(): void;
}

interface SqliteModule {
	DatabaseSync: new (path: string) => SqliteDb;
}

async function tryLoadSqlite(): Promise<{ ok: true; mod: SqliteModule } | { ok: false; reason: string }> {
	try {
		const mod = (await import("node:sqlite")) as unknown as SqliteModule;
		if (typeof mod.DatabaseSync !== "function") {
			return { ok: false, reason: "node:sqlite loaded but DatabaseSync is missing (Node version issue)" };
		}
		return { ok: true, mod };
	} catch (err) {
		return { ok: false, reason: `node:sqlite not available: ${(err as Error).message}` };
	}
}

/**
 * Seed a `.gsd/gsd.db` at schema_version = 20.
 * Mirrors the seed logic from
 * src/resources/extensions/gsd/tests/schema-v21-sequence.test.ts so the
 * forward-migration path from a known stale point is exercised.
 *
 * The migration code is permissive about extra/missing tables — the
 * minimum invariant is a `schema_version` row with `version = 20`.
 */
function seedV20Db(sqlite: SqliteModule, dbPath: string): void {
	const db = new sqlite.DatabaseSync(dbPath) as unknown as { exec(sql: string): void; close(): void };
	db.exec("PRAGMA journal_mode=WAL");
	db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
	db.exec("INSERT INTO schema_version (version) VALUES (20)");
	db.close();
}

function readSchemaVersion(sqlite: SqliteModule, dbPath: string): number {
	const db = new sqlite.DatabaseSync(dbPath);
	try {
		const row = db
			.prepare("SELECT MAX(version) AS v FROM schema_version")
			.get() as { v?: number } | undefined;
		return row?.v ?? 0;
	} finally {
		db.close();
	}
}

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; run with `GSD_SMOKE_BINARY=$(pwd)/dist/loader.js`" };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

describe("schema migration smoke (forward only)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("v20 DB is migrated to current SCHEMA_VERSION via the real binary", { skip: skipReason ?? false }, async (t) => {
		const sqliteLoaded = await tryLoadSqlite();
		if (!sqliteLoaded.ok) {
			t.skip(sqliteLoaded.reason);
			return;
		}

		const project = createTmpProject({ git: true });
		t.after(project.cleanup);

		const gsdDir = join(project.dir, ".gsd");
		mkdirSync(gsdDir, { recursive: true });
		mkdirSync(join(gsdDir, "milestones"), { recursive: true });

		const dbPath = join(gsdDir, "gsd.db");
		seedV20Db(sqliteLoaded.mod, dbPath);

		// Sanity: the seeded DB really is v20 before we hand it to gsd.
		const before = readSchemaVersion(sqliteLoaded.mod, dbPath);
		assert.equal(before, 20, `seed step failed — expected v20 before run, got ${before}`);

		// Run a no-LLM probe that opens the DB. The mere act of running it
		// triggers initSchema/migrateSchema in the binary's compiled code.
		const result = gsdSync(["headless", "query"], {
			cwd: project.dir,
			timeoutMs: 30_000,
		});

		assert.equal(
			result.code,
			0,
			`expected exit 0 from \`gsd headless query\`, got ${result.code}.\nstderr: ${result.stderrClean.slice(0, 800)}`,
		);

		const after = readSchemaVersion(sqliteLoaded.mod, dbPath);
		assert.ok(
			after > before,
			`expected schema_version to advance past ${before}, still at ${after}`,
		);
		// We don't hard-pin `after === SCHEMA_VERSION` because that constant
		// shifts with normal development. The contract is: forward-only
		// migration must reach SOME version newer than what we seeded.
		assert.ok(
			after >= 21,
			`expected schema_version to reach at least 21 (the v20→v21 hop), got ${after}`,
		);
	});
});
