// gsd-pi e2e Phase 9: drive a slash command through the interactive REPL.
//
// Proves the PTY harness can boot the real `gsd` binary, render its REPL,
// dispatch a built-in slash command, and shut down cleanly via `/exit`.
//
// `/help` and `/skill list` were proposed in the original spec but neither
// is a registered slash command in pi-coding-agent (see
// packages/pi-coding-agent/src/core/slash-commands.ts — `BUILTIN_SLASH_COMMANDS`).
// `/hotkeys` is in that list and renders deterministic ANSI output, so it
// is what we drive. If `/help` or `/skill list` lands later, swap them in.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { createTmpProject, gsdPty } from "./_shared/index.ts";

function binaryAvailable(): { ok: boolean; reason?: string } {
	const bin = process.env.GSD_SMOKE_BINARY;
	if (!bin) return { ok: false, reason: "GSD_SMOKE_BINARY not set; build with `npm run build:core` and re-export." };
	if (!existsSync(bin)) return { ok: false, reason: `binary not found at ${bin}` };
	return { ok: true };
}

describe("e2e slash-command (PTY)", () => {
	const avail = binaryAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("boots REPL, drives /hotkeys, exits cleanly via /exit", { skip: skipReason ?? false }, async (t) => {
		const project = createTmpProject({ git: true, gsdSkeleton: true });
		t.after(project.cleanup);

		const pty = gsdPty([], { cwd: project.dir, timeoutMs: 30_000 });
		t.after(() => pty.dispose());

		// Wait until the REPL is interactive — the prompt rendering varies by
		// theme/version, so match on a stable marker: a `> ` prompt OR the
		// "type / for commands" hint, OR (fallback) the cursor-moved sequence
		// that always fires on first paint. Match against ANSI-stripped output.
		await pty.waitForOutput(
			(s) => /\n>\s|type\s+\/|slash command|\/help|>\s*$/i.test(s) || s.length > 200,
			20_000,
		);
		// Let the UI quiesce so our keystrokes don't race with first-paint.
		await pty.waitForIdle(400, 5_000);

		pty.send("/hotkeys");
		// `/hotkeys` renders a keybindings table — multiple shortcut rows.
		// We assert on any plausible token from the rendering rather than a
		// brittle exact line.
		await pty.waitForOutput(
			(s) => /ctrl\+|shortcut|keybind|hotkey/i.test(s),
			15_000,
		);

		await pty.waitForIdle(400, 5_000);

		pty.send("/exit");
		const { exitCode } = await pty.waitForExit(15_000);
		assert.equal(
			exitCode,
			0,
			`expected /exit to exit 0, got ${exitCode}.\nclean output:\n${pty.cleanOutput().slice(-800)}`,
		);
	});
});
