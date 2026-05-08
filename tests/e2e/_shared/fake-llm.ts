/**
 * GSD-2 e2e fake-LLM helpers.
 *
 * Compose a JSONL transcript and run `gsd --print` against it. The fake
 * provider replays the transcript turn-by-turn (see
 * packages/pi-ai/src/providers/fake.ts).
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalTmpdir, gsdSync, type SpawnSyncResult } from "./spawn.ts";

export interface ExpectFields {
	modelId?: string;
	messageCount?: number;
	lastUserText?: string;
	systemContains?: string[];
	toolNames?: string[];
	hasToolResultFor?: string;
}

export type EmitSpec =
	| { kind: "text"; text: string; stopReason?: "stop" | "length" }
	| {
			kind: "tool_use";
			calls: { id?: string; name: string; input: Record<string, unknown> }[];
			stopReason?: "toolUse";
	  }
	| { kind: "error_429"; message?: string; retryAfterMs?: number }
	| { kind: "malformed"; message?: string }
	| { kind: "timeout"; delayMs?: number };

export interface TranscriptTurn {
	turn: number;
	expect?: ExpectFields;
	emit: EmitSpec;
}

/**
 * Write a JSONL transcript to a tmp file and return the absolute path.
 * Caller does not need to clean it up — it lives under the canonical tmpdir
 * and the OS will reclaim it.
 */
export function writeTranscript(turns: TranscriptTurn[]): string {
	const path = join(canonicalTmpdir(), `gsd-fake-llm-${process.pid}-${Date.now()}.jsonl`);
	const body = turns.map((t) => JSON.stringify(t)).join("\n") + "\n";
	writeFileSync(path, body, "utf8");
	return path;
}

export interface FakeRunOptions {
	cwd: string;
	prompt: string;
	mode?: "text" | "json";
	extraArgs?: string[];
	extraEnv?: Record<string, string>;
	timeoutMs?: number;
}

/**
 * Run `gsd --print` against a fake-LLM transcript. Sets the env var the
 * provider keys off, picks the fake model, and returns the spawn result.
 */
export function runWithFakeLlm(transcriptPath: string, opts: FakeRunOptions): SpawnSyncResult {
	const args = [
		"--print",
		opts.prompt,
		"--model",
		"gsd-fake-model",
		"--mode",
		opts.mode ?? "text",
		...(opts.extraArgs ?? []),
	];
	return gsdSync(args, {
		cwd: opts.cwd,
		timeoutMs: opts.timeoutMs ?? 30_000,
		env: {
			GSD_FAKE_LLM_TRANSCRIPT: transcriptPath,
			...(opts.extraEnv ?? {}),
		},
	});
}

/**
 * Parse JSON-mode stdout into the array of event objects. Skips blank
 * lines and any pre-amble that isn't valid JSON (e.g. startup timing
 * lines emitted to stdout). Throws if no events are found.
 */
export function parseJsonEvents(stdout: string): Array<Record<string, unknown>> {
	const events: Array<Record<string, unknown>> = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object" && "type" in parsed) {
				events.push(parsed as Record<string, unknown>);
			}
		} catch {
			// Not a JSON line — skip silently.
		}
	}
	if (events.length === 0) {
		throw new Error(`no JSON events found in stdout. Raw:\n${stdout}`);
	}
	return events;
}

/** Pull the final assistant message text out of a JSON event stream. */
export function lastAssistantText(events: Array<Record<string, unknown>>): string {
	for (let i = events.length - 1; i >= 0; i--) {
		const ev = events[i];
		if (ev.type === "agent_end") {
			const messages = (ev as { messages?: Array<Record<string, unknown>> }).messages ?? [];
			for (let j = messages.length - 1; j >= 0; j--) {
				const m = messages[j];
				if (m.role === "assistant") {
					const content = (m as { content?: Array<{ type: string; text?: string }> }).content ?? [];
					return content
						.filter((c) => c.type === "text")
						.map((c) => c.text ?? "")
						.join("");
				}
			}
		}
	}
	return "";
}

/** Pull the final assistant stopReason out of a JSON event stream. */
export function lastAssistantStopReason(events: Array<Record<string, unknown>>): string | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const ev = events[i];
		if (ev.type === "agent_end") {
			const messages = (ev as { messages?: Array<Record<string, unknown>> }).messages ?? [];
			for (let j = messages.length - 1; j >= 0; j--) {
				const m = messages[j];
				if (m.role === "assistant") return (m as { stopReason?: string }).stopReason;
			}
		}
	}
	return undefined;
}
