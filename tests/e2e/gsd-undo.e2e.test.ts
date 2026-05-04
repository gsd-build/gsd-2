// gsd-pi e2e Phase E: drive `/gsd undo --force` through the interactive REPL.
//
// Two regressions the spec calls out:
//   1. Empty state — no `.gsd/activity/` — must surface the
//      "Nothing to undo" notification and not crash.
//   2. Seeded activity log + summary file — `--force` must delete the
//      summary artifact (the git-revert step is best-effort and swallows
//      errors against a fake SHA, so we assert the deterministic FS effect).
//
// Both cases drive the real `gsd` binary through a PTY because `/gsd` is
// only routed through the interactive command dispatcher.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createTmpProject, gsdPty } from "./_shared/index.ts";

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core` and re-export." };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

async function bootRepl(project: { dir: string }, t: import("node:test").TestContext) {
	const pty = gsdPty([], { cwd: project.dir, timeoutMs: 30_000 });
	t.after(() => pty.dispose());
	await pty.waitForOutput(
		(s) => /\n>\s|type\s+\/|slash command|\/help|>\s*$/i.test(s) || s.length > 200,
		20_000,
	);
	await pty.waitForIdle(400, 5_000);
	return pty;
}

describe("e2e /gsd undo --force (PTY)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("empty state surfaces 'Nothing to undo'", { skip: skipReason ?? false }, async (t) => {
		const project = createTmpProject({ git: true, gsdSkeleton: true });
		t.after(project.cleanup);

		const pty = await bootRepl(project, t);

		pty.send("/gsd undo --force");
		await pty.waitForOutput((s) => /nothing to undo/i.test(s), 15_000);

		pty.send("/exit");
		const { exitCode } = await pty.waitForExit(15_000);
		assert.equal(exitCode, 0, `expected /exit to exit 0, got ${exitCode}`);
	});

	test("seeded activity log + summary: --force deletes the summary file", { skip: skipReason ?? false }, async (t) => {
		const project = createTmpProject({ git: true, gsdSkeleton: true });
		t.after(project.cleanup);

		// Seed minimum state for handleUndo:
		//   - .gsd/activity/<seq>-<unitType>-<unitId>.jsonl  (latest one parsed)
		//   - milestones/M001/slices/S01/tasks/T01-SUMMARY.md (the artifact deleted)
		//
		// Activity log filename grammar (per activity-log.ts:87):
		//   `${seq}-${unitType}-${safeUnitId}.jsonl`  with safeUnitId = unitId
		//   with `/` replaced by `-`.
		//
		// undo.ts:47 parses with `/^\d+-(.+?)-(.+)\.jsonl$/` — a *lazy* first
		// group, which (incorrectly, but consistently) treats only the first
		// hyphen-separated token as `unitType`. Real unit types like
		// "execute-task" are misparsed in production, but for this test we
		// want the path through `parseUnitId` to land on milestone="M001",
		// slice="S01", task="T01" so the summary-delete branch fires. We
		// pick a single-word unitType ("task") to do that.
		const activityDir = join(project.dir, ".gsd", "activity");
		mkdirSync(activityDir, { recursive: true });
		writeFileSync(
			join(activityDir, "0001-task-M001-S01-T01.jsonl"),
			JSON.stringify({ kind: "commit", sha: "deadbeef000000000000000000000000deadbeef" }) + "\n",
			"utf8",
		);

		const tasksDir = join(project.dir, ".gsd", "milestones", "M001", "slices", "S01", "tasks");
		mkdirSync(tasksDir, { recursive: true });
		const summaryPath = join(tasksDir, "T01-SUMMARY.md");
		writeFileSync(summaryPath, "# T01 summary (seeded)\n", "utf8");
		assert.ok(existsSync(summaryPath), "precondition: seeded summary file exists");

		const pty = await bootRepl(project, t);

		pty.send("/gsd undo --force");
		// Wait for the undo flow to settle — handleUndo emits a final
		// notification once it's done. Either we see a confirmation token,
		// or the REPL just goes idle.
		await pty.waitForIdle(1500, 20_000);

		// The summary artifact must be gone. This is the deterministic
		// observable effect of /gsd undo --force, independent of the
		// best-effort git-revert step.
		assert.equal(
			existsSync(summaryPath),
			false,
			`expected summary file deleted, still present at ${summaryPath}.\nclean output:\n${pty.cleanOutput().slice(-800)}`,
		);

		pty.send("/exit");
		const { exitCode } = await pty.waitForExit(15_000);
		assert.equal(exitCode, 0, `expected /exit to exit 0, got ${exitCode}`);
	});
});
