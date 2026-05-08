/**
 * GSD-2 fake LLM provider — deterministic JSONL replay for e2e tests.
 *
 * Activated only when `GSD_FAKE_LLM_TRANSCRIPT` env var is set. Reads a
 * JSONL transcript file (one turn per line) and replays scripted responses
 * sequentially. Each turn carries structural assertions about the incoming
 * request — if the request shape drifts, the provider fails loudly so tests
 * surface it instead of silently consuming wrong inputs.
 *
 * IMPORTANT: env var must be set BEFORE pi-ai is imported. Tests achieve
 * this by setting it on the subprocess they spawn. In-process tests cannot
 * mix fake and real providers in the same Node process.
 *
 * Transcript format (JSONL, one turn per line):
 *   {
 *     "turn": 1,
 *     "expect": {
 *       "modelId": "gsd-fake-model",
 *       "messageCount": 2,            // optional, exact match
 *       "lastUserText": "do X",       // optional, substring match
 *       "systemContains": ["..."],    // optional, all must be present
 *       "toolNames": ["read_file"],   // optional, exact set
 *       "hasToolResultFor": "read_file" // optional, last message is a toolResult for this name
 *     },
 *     "emit": { "kind": "text", "text": "...", "stopReason": "stop" }
 *       | { "kind": "tool_use", "calls": [...], "stopReason": "toolUse" }
 *       | { "kind": "error_429", "message": "rate limited", "retryAfterMs": 1000 }
 *       | { "kind": "malformed" }
 *       | { "kind": "timeout", "delayMs": 60000 }
 *   }
 */

import { readFileSync } from "node:fs";
import type { ApiProvider } from "../api-registry.js";
import type {
	AssistantMessage,
	Context,
	Model,
	SimpleStreamOptions,
	StreamOptions,
	ToolCall,
	UserMessage,
} from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";

export const FAKE_API = "fake" as const;

interface ExpectFields {
	modelId?: string;
	messageCount?: number;
	lastUserText?: string;
	systemContains?: string[];
	toolNames?: string[];
	hasToolResultFor?: string;
}

type EmitSpec =
	| { kind: "text"; text: string; stopReason?: "stop" | "length" }
	| {
			kind: "tool_use";
			calls: { id?: string; name: string; input: Record<string, unknown> }[];
			stopReason?: "toolUse";
	  }
	| { kind: "error_429"; message?: string; retryAfterMs?: number }
	| { kind: "malformed"; message?: string }
	| { kind: "timeout"; delayMs?: number };

interface TranscriptTurn {
	turn: number;
	expect?: ExpectFields;
	emit: EmitSpec;
}

function parseTranscript(path: string): TranscriptTurn[] {
	const raw = readFileSync(path, "utf8");
	const lines = raw.split("\n").filter((l) => l.trim().length > 0);
	const turns: TranscriptTurn[] = [];
	for (const [i, line] of lines.entries()) {
		try {
			turns.push(JSON.parse(line));
		} catch (err) {
			throw new Error(
				`fake-llm: failed to parse transcript ${path} line ${i + 1}: ${(err as Error).message}\n  line: ${line}`,
			);
		}
	}
	return turns;
}

function lastUserMessage(ctx: Context): UserMessage | undefined {
	for (let i = ctx.messages.length - 1; i >= 0; i--) {
		const m = ctx.messages[i];
		if (m.role === "user") return m;
	}
	return undefined;
}

function userText(m: UserMessage): string {
	if (typeof m.content === "string") return m.content;
	return m.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

function checkExpectations(model: Model<typeof FAKE_API>, ctx: Context, turn: TranscriptTurn): void {
	const e = turn.expect;
	if (!e) return;
	const fail = (msg: string): never => {
		// Surface mismatch with enough context to debug, then throw.
		const detail = {
			turn: turn.turn,
			modelId: model.id,
			messageCount: ctx.messages.length,
			lastUserText: lastUserMessage(ctx) ? userText(lastUserMessage(ctx)!).slice(0, 200) : null,
			toolNames: ctx.tools?.map((t) => t.name) ?? [],
		};
		throw new Error(`fake-llm: turn ${turn.turn} expectation mismatch: ${msg}\n  actual: ${JSON.stringify(detail)}`);
	};

	if (e.modelId !== undefined && model.id !== e.modelId) {
		fail(`expected modelId=${e.modelId}, got ${model.id}`);
	}
	if (e.messageCount !== undefined && ctx.messages.length !== e.messageCount) {
		fail(`expected messageCount=${e.messageCount}, got ${ctx.messages.length}`);
	}
	if (e.lastUserText !== undefined) {
		const last = lastUserMessage(ctx);
		if (!last) fail(`expected lastUserText to contain "${e.lastUserText}", but no user messages found`);
		const text = userText(last!);
		if (!text.includes(e.lastUserText)) {
			fail(`expected lastUserText to contain "${e.lastUserText}", got "${text.slice(0, 200)}"`);
		}
	}
	if (e.systemContains && e.systemContains.length > 0) {
		const sys = ctx.systemPrompt ?? "";
		for (const needle of e.systemContains) {
			if (!sys.includes(needle)) fail(`expected systemPrompt to contain "${needle}"`);
		}
	}
	if (e.toolNames) {
		const actual = (ctx.tools ?? []).map((t) => t.name).sort();
		const expected = [...e.toolNames].sort();
		if (actual.length !== expected.length || actual.some((n, i) => n !== expected[i])) {
			fail(`expected toolNames=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
		}
	}
	if (e.hasToolResultFor !== undefined) {
		const last = ctx.messages[ctx.messages.length - 1];
		if (!last || last.role !== "toolResult" || last.toolName !== e.hasToolResultFor) {
			fail(`expected last message to be a toolResult for "${e.hasToolResultFor}"`);
		}
	}
}

function buildAssistantMessage(
	model: Model<typeof FAKE_API>,
	emit: EmitSpec,
): AssistantMessage {
	const content: AssistantMessage["content"] = [];
	let stopReason: AssistantMessage["stopReason"] = "stop";

	if (emit.kind === "text") {
		content.push({ type: "text", text: emit.text });
		stopReason = emit.stopReason ?? "stop";
	} else if (emit.kind === "tool_use") {
		for (const [i, call] of emit.calls.entries()) {
			const tc: ToolCall = {
				type: "toolCall",
				id: call.id ?? `fake-tool-${Date.now()}-${i}`,
				name: call.name,
				arguments: call.input,
			};
			content.push(tc);
		}
		stopReason = "toolUse";
	}

	return {
		role: "assistant",
		content,
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

/**
 * Create a fake provider bound to a transcript file. Each call to stream()
 * advances the turn cursor by one. Caller is responsible for ensuring the
 * transcript has enough turns.
 */
export function createFakeProvider(opts: { transcriptPath: string }): ApiProvider<typeof FAKE_API> {
	const transcript = parseTranscript(opts.transcriptPath);
	let cursor = 0;

	function nextTurn(): TranscriptTurn {
		if (cursor >= transcript.length) {
			throw new Error(
				`fake-llm: provider invoked ${cursor + 1} times but transcript only has ${transcript.length} turns. Add another turn to ${opts.transcriptPath}.`,
			);
		}
		return transcript[cursor++];
	}

	function streamTurn(model: Model<typeof FAKE_API>, ctx: Context): AssistantMessageEventStream {
		const stream = new AssistantMessageEventStream();
		const turn = nextTurn();

		// Synchronously validate expectations BEFORE doing any async work — this
		// way drift mismatches are reported with the request that caused them.
		checkExpectations(model, ctx, turn);

		const emit = turn.emit;

		queueMicrotask(async () => {
			try {
				if (emit.kind === "error_429") {
					const errorMsg: AssistantMessage = {
						role: "assistant",
						content: [],
						api: model.api,
						provider: model.provider,
						model: model.id,
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "error",
						errorMessage: emit.message ?? "rate_limit_exceeded",
						retryAfterMs: emit.retryAfterMs,
						timestamp: Date.now(),
					};
					stream.push({ type: "error", reason: "error", error: errorMsg });
					stream.end(errorMsg);
					return;
				}

				if (emit.kind === "malformed") {
					// Simulate a provider that emits a corrupted/incomplete response.
					// The agent loop converts this to stopReason: "error".
					const errorMsg: AssistantMessage = {
						role: "assistant",
						content: [],
						api: model.api,
						provider: model.provider,
						model: model.id,
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "error",
						errorMessage: emit.message ?? "malformed_response",
						timestamp: Date.now(),
					};
					stream.push({ type: "error", reason: "error", error: errorMsg });
					stream.end(errorMsg);
					return;
				}

				if (emit.kind === "timeout") {
					const delay = emit.delayMs ?? 60_000;
					await new Promise((r) => setTimeout(r, delay));
					// If the caller hasn't already aborted, emit a synthetic timeout error.
					const errorMsg: AssistantMessage = {
						role: "assistant",
						content: [],
						api: model.api,
						provider: model.provider,
						model: model.id,
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "error",
						errorMessage: "timeout",
						timestamp: Date.now(),
					};
					stream.push({ type: "error", reason: "error", error: errorMsg });
					stream.end(errorMsg);
					return;
				}

				const message = buildAssistantMessage(model, emit);
				stream.push({ type: "start", partial: { ...message, content: [] } });

				if (emit.kind === "text") {
					stream.push({ type: "text_start", contentIndex: 0, partial: message });
					stream.push({
						type: "text_delta",
						contentIndex: 0,
						delta: emit.text,
						partial: message,
					});
					stream.push({
						type: "text_end",
						contentIndex: 0,
						content: emit.text,
						partial: message,
					});
				} else if (emit.kind === "tool_use") {
					for (const [i, c] of message.content.entries()) {
						if (c.type !== "toolCall") continue;
						stream.push({ type: "toolcall_start", contentIndex: i, partial: message });
						stream.push({
							type: "toolcall_end",
							contentIndex: i,
							toolCall: c,
							partial: message,
						});
					}
				}

				stream.push({
					type: "done",
					reason: message.stopReason as "stop" | "length" | "toolUse" | "pauseTurn",
					message,
				});
				stream.end(message);
			} catch (err) {
				const errorMsg: AssistantMessage = {
					role: "assistant",
					content: [],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "error",
					errorMessage: (err as Error).message,
					timestamp: Date.now(),
				};
				stream.push({ type: "error", reason: "error", error: errorMsg });
				stream.end(errorMsg);
			}
		});

		return stream;
	}

	return {
		api: FAKE_API,
		stream: ((model: Model<typeof FAKE_API>, ctx: Context, _opts?: StreamOptions) =>
			streamTurn(model, ctx)) as ApiProvider<typeof FAKE_API>["stream"],
		streamSimple: ((model: Model<typeof FAKE_API>, ctx: Context, _opts?: SimpleStreamOptions) =>
			streamTurn(model, ctx)) as ApiProvider<typeof FAKE_API>["streamSimple"],
	};
}
