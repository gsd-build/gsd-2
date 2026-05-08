/**
 * GSD-2 e2e harness: process spawning.
 *
 * Wraps child_process.spawn with the conventions every e2e test needs:
 * - canonical TMPDIR (resolves macOS /var vs /private/var symlink mismatch)
 * - deterministic env (strips inherited GSD_* vars that leak from the host)
 * - ANSI stripping
 * - timeout + orphan kill
 * - ready-signal helper for long-running processes
 *
 * Use this instead of calling spawn / spawnSync directly in e2e tests.
 */

import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/** Strip ANSI escape sequences. Use on stdout/stderr before assertions. */
export function stripAnsi(s: string): string {
	return s.replace(ANSI_REGEX, "");
}

/**
 * Canonical OS tmpdir. macOS reports /var/folders/... but realpath gives
 * /private/var/folders/... — child processes see the canonical form, and
 * mismatched parents cause flaky path comparisons. Always use this.
 */
export function canonicalTmpdir(): string {
	try {
		return realpathSync(tmpdir());
	} catch {
		return tmpdir();
	}
}

export interface E2eEnv {
	/** Override binary path. Defaults to GSD_SMOKE_BINARY or "gsd". */
	binary?: string;
	/** Working directory for the spawned process. */
	cwd: string;
	/** Extra env vars merged on top of the cleaned base env. */
	env?: Record<string, string>;
	/** Timeout in ms. Default 30_000. */
	timeoutMs?: number;
}

/**
 * Allocate a fresh per-process HOME under the canonical tmpdir. Each
 * spawned `gsd` writes to `~/.gsd/agent/extensions/...` for resource
 * setup; sharing the host HOME causes ENOTEMPTY races when multiple
 * spawns interleave on a CI runner. Re-using the same isolated HOME
 * across spawns inside one test process is fine — gsd's own setup
 * is idempotent within a single owner — but we must not share with
 * the runner's actual home.
 */
let _isolatedHome: string | undefined;
function isolatedHome(): string {
	if (_isolatedHome) return _isolatedHome;
	const dir = join(canonicalTmpdir(), `gsd-e2e-home-${process.pid}-${Date.now()}`);
	mkdirSync(dir, { recursive: true });
	_isolatedHome = dir;
	return dir;
}

/**
 * Build the env for an e2e child process. Strips GSD_* vars from the host
 * (so a developer's local config does not leak into a test), points HOME
 * at an isolated tmp dir (so per-user gsd state can't race against the
 * runner's real home), and forces deterministic flags.
 */
export function buildE2eEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
	const base: NodeJS.ProcessEnv = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (k.startsWith("GSD_")) continue;
		base[k] = v;
	}
	// Force non-interactive — every e2e test runs in CI by default.
	base.GSD_NON_INTERACTIVE = "1";
	// Keep TMPDIR canonical for the child too.
	base.TMPDIR = canonicalTmpdir();
	// Per-process isolated HOME so gsd's resource-extension setup
	// (~/.gsd/agent/extensions) cannot race against the runner's real
	// home. Caller can override via `extra.HOME` if needed.
	base.HOME = isolatedHome();
	return { ...base, ...extra };
}

export interface SpawnSyncResult {
	stdout: string;
	stderr: string;
	stdoutClean: string;
	stderrClean: string;
	code: number | null;
	signal: NodeJS.Signals | null;
	timedOut: boolean;
}

/**
 * Resolve the binary + argv for invoking the gsd CLI.
 *
 * GSD_SMOKE_BINARY=path/to/loader.js → spawn `node path/to/loader.js ...`
 * (default "gsd")                    → spawn `gsd ...`
 *
 * Mirrors the convention used by tests/live-regression/run.ts.
 */
export function resolveGsdInvocation(args: string[], binaryOverride?: string): {
	command: string;
	argv: string[];
} {
	const binary = binaryOverride ?? process.env.GSD_SMOKE_BINARY ?? "gsd";
	if (binary === "gsd") {
		return { command: "gsd", argv: args };
	}
	return { command: process.execPath, argv: [binary, ...args] };
}

/** Synchronous spawn. Use for short, deterministic CLI calls (`--version`, etc). */
export function gsdSync(args: string[], env: E2eEnv): SpawnSyncResult {
	const { command, argv } = resolveGsdInvocation(args, env.binary);
	const result = spawnSync(command, argv, {
		cwd: env.cwd,
		encoding: "utf8",
		timeout: env.timeoutMs ?? 30_000,
		stdio: ["pipe", "pipe", "pipe"],
		env: buildE2eEnv(env.env),
	});
	const stdout = result.stdout ?? "";
	const stderr = result.stderr ?? "";
	return {
		stdout,
		stderr,
		stdoutClean: stripAnsi(stdout),
		stderrClean: stripAnsi(stderr),
		code: result.status,
		signal: result.signal,
		timedOut: result.error?.code === "ETIMEDOUT" || (result.signal === "SIGTERM" && result.status === null),
	};
}

export interface AsyncChild {
	child: ChildProcess;
	stdout: () => string;
	stderr: () => string;
	/** Resolves when stdout or stderr matches the predicate. Rejects on timeout. */
	waitFor: (predicate: (out: { stdout: string; stderr: string }) => boolean, timeoutMs?: number) => Promise<void>;
	/** Send SIGTERM, then SIGKILL after grace period. */
	kill: (graceMs?: number) => Promise<void>;
	/** Resolves when the process exits, returning its result. */
	done: () => Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/**
 * Spawn the gsd CLI as a long-running child. Caller is responsible for
 * calling `.kill()` (typically via t.after).
 */
export function gsdAsync(args: string[], env: E2eEnv, opts: SpawnOptions = {}): AsyncChild {
	const { command, argv } = resolveGsdInvocation(args, env.binary);
	const child = spawn(command, argv, {
		cwd: env.cwd,
		stdio: ["pipe", "pipe", "pipe"],
		env: buildE2eEnv(env.env),
		...opts,
	});

	let stdoutBuf = "";
	let stderrBuf = "";
	child.stdout?.setEncoding("utf8");
	child.stderr?.setEncoding("utf8");
	child.stdout?.on("data", (chunk: string) => {
		stdoutBuf += chunk;
	});
	child.stderr?.on("data", (chunk: string) => {
		stderrBuf += chunk;
	});

	const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});

	return {
		child,
		stdout: () => stdoutBuf,
		stderr: () => stderrBuf,
		async waitFor(predicate, timeoutMs = 30_000) {
			const start = Date.now();
			while (Date.now() - start < timeoutMs) {
				if (predicate({ stdout: stdoutBuf, stderr: stderrBuf })) return;
				if (child.exitCode !== null) {
					throw new Error(
						`process exited (code=${child.exitCode}) before predicate matched.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`,
					);
				}
				await new Promise((r) => setTimeout(r, 50));
			}
			throw new Error(
				`waitFor timed out after ${timeoutMs}ms.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`,
			);
		},
		async kill(graceMs = 2000) {
			if (child.exitCode !== null || child.signalCode !== null) return;
			child.kill("SIGTERM");
			const killed = await Promise.race([
				exitPromise.then(() => true),
				new Promise<boolean>((r) => setTimeout(() => r(false), graceMs)),
			]);
			if (!killed && child.exitCode === null) {
				child.kill("SIGKILL");
				await exitPromise;
			}
		},
		done: () => exitPromise,
	};
}
