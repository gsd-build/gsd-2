// gsd-pi e2e harness: PTY spawning for interactive flows.
//
// `gsdSync` / `gsdAsync` use plain pipes — they cannot drive flows that
// only ship through the interactive REPL (slash commands, interactive
// prompts, `gsd undo --force`). For those, we need a real pseudo-terminal
// so the child detects a TTY and enters interactive mode.
//
// Conventions mirror spawn.ts: canonical TMPDIR, GSD_* env stripping,
// isolated HOME, ANSI-stripped accumulated buffer for predicate matching,
// raw buffer kept for debugging.

import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { spawn as ptySpawn, type IPty } from "node-pty";

import { buildE2eEnv, getIsolatedHome, resolveGsdInvocation, stripAnsi, type E2eEnv } from "./spawn.ts";

// node-pty@1.1.0 ships the macOS/linux `spawn-helper` binary in its tarball
// without the executable bit set. Its install scripts don't chmod it either,
// so a fresh `npm install` produces a node-pty that throws `posix_spawnp
// failed` on first .spawn(). Fix it once on first import.
ensureSpawnHelperExecutable();
function ensureSpawnHelperExecutable(): void {
	if (process.platform === "win32") return;
	try {
		const req = createRequire(import.meta.url);
		const pkgPath = req.resolve("node-pty/package.json");
		const helper = join(
			dirname(pkgPath),
			"prebuilds",
			`${process.platform}-${process.arch}`,
			"spawn-helper",
		);
		if (!existsSync(helper)) return;
		const mode = statSync(helper).mode;
		if ((mode & 0o111) === 0) chmodSync(helper, mode | 0o755);
	} catch {
		// Best-effort. If something is off, the actual spawn will surface a
		// clear error and the test will fail loudly with that.
	}
}

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const DEFAULT_WAIT_TIMEOUT_MS = 15_000;

// Raw PTY input: TUIs in raw mode (ink, @clack/prompts, gsd's editor) watch
// for \r as the Enter key. \n is a line-feed and is silently absorbed by
// most editors. This is independent of platform — \r is correct on both
// Unix and Windows for sending Enter through a PTY.
const NEWLINE = "\r";

export interface PtyOptions {
	cols?: number;
	rows?: number;
	/**
	 * Seed `<HOME>/.gsd/agent/onboarding.json` with a completed record before
	 * spawn so the first-run welcome wizard does not block interactive tests.
	 * Default: true. Set to false if a test needs to drive the wizard itself.
	 */
	seedOnboardingComplete?: boolean;
}

export interface PtyChild {
	/** Raw buffer including ANSI escapes. Use for debugging only. */
	output: () => string;
	/** ANSI-stripped buffer. Use for predicate matching and assertions. */
	cleanOutput: () => string;
	/**
	 * Send input to the child. Appends platform EOL unless `{raw: true}`.
	 * Multi-character chords (e.g. Ctrl-D = "\x04") should pass `{raw: true}`.
	 */
	send: (input: string, opts?: { raw?: boolean }) => void;
	/**
	 * Resolve when `cleanOutput()` matches the predicate. Reject on timeout
	 * or premature exit. Predicate receives the full ANSI-stripped buffer
	 * each tick (not the diff) — chunk boundaries can split escape sequences,
	 * so per-chunk stripping is unsafe.
	 */
	waitForOutput: (predicate: (clean: string) => boolean, timeoutMs?: number) => Promise<void>;
	/** Resolve when no new bytes arrive for `quietMs` (default 500). */
	waitForIdle: (quietMs?: number, timeoutMs?: number) => Promise<void>;
	/** Resolve when the child exits, returning exit code + signal. */
	waitForExit: (timeoutMs?: number) => Promise<{ exitCode: number; signal?: number }>;
	/** Send SIGTERM (POSIX) or kill the process (Windows). */
	kill: (signal?: string) => void;
	/** Best-effort cleanup: kills if still alive, then awaits exit. */
	dispose: () => Promise<void>;
}

/**
 * Spawn the gsd CLI inside a pseudo-terminal.
 *
 * The child sees a real TTY on stdin/stdout, so interactive features
 * (REPL prompt, slash commands, ANSI rendering) light up exactly as they
 * would for a human user.
 *
 * @example
 *   const pty = gsdPty([], { cwd: project.dir });
 *   t.after(() => pty.dispose());
 *   await pty.waitForOutput((s) => s.includes("> "));
 *   pty.send("/help");
 *   await pty.waitForOutput((s) => /\/exit/i.test(s));
 *   pty.send("/exit");
 *   const { exitCode } = await pty.waitForExit();
 *   assert.equal(exitCode, 0);
 */
export function gsdPty(args: string[], env: E2eEnv, opts: PtyOptions = {}): PtyChild {
	const { command, argv } = resolveGsdInvocation(args, env.binary);
	const childEnv = buildE2eEnv(env.env);
	if (opts.seedOnboardingComplete !== false) {
		seedOnboardingComplete(childEnv.HOME ?? getIsolatedHome());
	}
	// Cast: node-pty types ProcessEnv as Record<string,string>; we drop undefineds.
	const cleanEnv: Record<string, string> = {};
	for (const [k, v] of Object.entries(childEnv)) {
		if (typeof v === "string") cleanEnv[k] = v;
	}

	const term = ptySpawn(command, argv, {
		name: "xterm-256color",
		cols: opts.cols ?? DEFAULT_COLS,
		rows: opts.rows ?? DEFAULT_ROWS,
		cwd: env.cwd,
		env: cleanEnv,
	});

	let buffer = "";
	let lastDataAt = Date.now();
	let exited: { exitCode: number; signal?: number } | undefined;
	const exitWaiters: Array<(v: { exitCode: number; signal?: number }) => void> = [];

	term.onData((data) => {
		buffer += data;
		lastDataAt = Date.now();
	});

	term.onExit((evt) => {
		exited = { exitCode: evt.exitCode, signal: evt.signal };
		for (const w of exitWaiters) w(exited);
		exitWaiters.length = 0;
	});

	const output = () => buffer;
	const cleanOutput = () => stripAnsi(buffer);

	const send: PtyChild["send"] = (input, sendOpts) => {
		if (exited) return;
		term.write(sendOpts?.raw ? input : input + NEWLINE);
	};

	const waitForOutput: PtyChild["waitForOutput"] = async (predicate, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) => {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (predicate(cleanOutput())) return;
			if (exited) {
				throw new Error(
					`pty child exited (code=${exited.exitCode}) before predicate matched.\n` +
						`clean output:\n${cleanOutput()}`,
				);
			}
			await sleep(50);
		}
		throw new Error(
			`gsdPty.waitForOutput timed out after ${timeoutMs}ms.\nclean output:\n${cleanOutput()}`,
		);
	};

	const waitForIdle: PtyChild["waitForIdle"] = async (quietMs = 500, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) => {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (Date.now() - lastDataAt >= quietMs) return;
			if (exited) return;
			await sleep(50);
		}
		throw new Error(`gsdPty.waitForIdle timed out after ${timeoutMs}ms (still receiving data)`);
	};

	const waitForExit: PtyChild["waitForExit"] = (timeoutMs = DEFAULT_WAIT_TIMEOUT_MS) => {
		if (exited) return Promise.resolve(exited);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`gsdPty.waitForExit timed out after ${timeoutMs}ms.\nclean output:\n${cleanOutput()}`));
			}, timeoutMs);
			exitWaiters.push((v) => {
				clearTimeout(timer);
				resolve(v);
			});
		});
	};

	const kill: PtyChild["kill"] = (signal) => {
		if (exited) return;
		try {
			term.kill(signal);
		} catch {
			// node-pty throws if already dead — safe to ignore.
		}
	};

	const dispose: PtyChild["dispose"] = async () => {
		if (exited) return;
		kill();
		await Promise.race([
			waitForExit(2000).catch(() => undefined),
			sleep(2000),
		]);
	};

	return { output, cleanOutput, send, waitForOutput, waitForIdle, waitForExit, kill, dispose };
}

/** Convenience: chord for Ctrl+D (EOF). */
export const CTRL_D = "\x04";
/** Convenience: chord for Ctrl+C (SIGINT to foreground job in PTY). */
export const CTRL_C = "\x03";

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Write a "fully onboarded" record to the isolated HOME so the welcome
 * wizard does not block PTY-driven tests. Schema mirrors
 * `src/resources/extensions/gsd/onboarding-state.ts` — keep in sync if
 * RECORD_VERSION or FLOW_VERSION bumps there.
 */
function seedOnboardingComplete(home: string): void {
	const dir = join(home, ".gsd", "agent");
	const file = join(dir, "onboarding.json");
	mkdirSync(dir, { recursive: true });
	const record = {
		version: 1,
		flowVersion: 1,
		completedAt: new Date().toISOString(),
		completedSteps: ["llm", "search", "remote"],
		skippedSteps: [],
		lastResumePoint: null,
	};
	writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
}

/**
 * Re-export for tests that need to interrogate the underlying pty interface
 * for diagnostics (resize, signal). Most tests should not need this.
 */
export type { IPty };
