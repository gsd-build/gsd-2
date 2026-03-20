/**
 * Shared utilities for OpenAI Completions and Responses providers.
 *
 * This module consolidates code that is identical (or near-identical) across
 * openai-completions.ts and openai-responses.ts to reduce duplication while
 * preserving the subtle behavioural differences of each provider.
 */

import type OpenAI from "openai";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	StopReason,
} from "../types.js";
import type { AssistantMessageEventStream } from "../utils/event-stream.js";
import { buildCopilotDynamicHeaders, hasCopilotVisionInput } from "./github-copilot-headers.js";

// =============================================================================
// Lazy SDK loading
// =============================================================================

let _openAIClass: typeof OpenAI | undefined;

/**
 * Lazy-load the OpenAI SDK default export.
 * Shared between Completions and Responses providers so the module is only
 * imported once regardless of which provider is used first.
 */
export async function getOpenAIClass(): Promise<typeof OpenAI> {
	if (!_openAIClass) {
		const mod = await import("openai");
		_openAIClass = mod.default;
	}
	return _openAIClass;
}

// =============================================================================
// Client creation
// =============================================================================

export interface CreateClientOptions {
	/** Extra headers from the options bag (merged last, can override defaults). */
	optionsHeaders?: Record<string, string>;
	/** Provider-specific client constructor options (e.g. timeout, maxRetries for Z.ai). */
	extraClientOptions?: Record<string, unknown>;
}

/**
 * Create an OpenAI SDK client instance.
 *
 * Handles:
 * - API key resolution (explicit > env)
 * - GitHub Copilot dynamic headers
 * - Options header merging
 * - Lazy SDK loading
 */
export async function createOpenAIClient<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	apiKey: string | undefined,
	options?: CreateClientOptions,
): Promise<OpenAI> {
	if (!apiKey) {
		if (!process.env.OPENAI_API_KEY) {
			throw new Error(
				"OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it as an argument.",
			);
		}
		apiKey = process.env.OPENAI_API_KEY;
	}

	const headers = { ...model.headers };
	if (model.provider === "github-copilot") {
		const hasImages = hasCopilotVisionInput(context.messages);
		const copilotHeaders = buildCopilotDynamicHeaders({
			messages: context.messages,
			hasImages,
		});
		Object.assign(headers, copilotHeaders);
	}

	// Merge options headers last so they can override defaults
	if (options?.optionsHeaders) {
		Object.assign(headers, options.optionsHeaders);
	}

	const OpenAIClass = await getOpenAIClass();
	return new OpenAIClass({
		apiKey,
		baseURL: model.baseUrl,
		dangerouslyAllowBrowser: true,
		defaultHeaders: headers,
		...options?.extraClientOptions,
	});
}

// =============================================================================
// Initial output construction
// =============================================================================

/**
 * Build the initial AssistantMessage output object used by all OpenAI stream
 * handlers.  Every field is initialised to its zero/default value.
 */
export function buildInitialOutput<TApi extends Api>(model: Model<TApi>): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api as Api,
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
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

// =============================================================================
// Stream lifecycle helpers
// =============================================================================

/**
 * Shared post-stream checks.  Call after the provider-specific stream loop
 * finishes successfully (before pushing the "done" event).
 *
 * Throws if the request was aborted or the output indicates an error.
 */
export function assertStreamSuccess(output: AssistantMessage, signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error("Request was aborted");
	}
	if (output.stopReason === "aborted" || output.stopReason === "error") {
		throw new Error("An unknown error occurred");
	}
}

/**
 * Emit the "done" event and close the stream.
 */
export function finalizeStream(
	stream: AssistantMessageEventStream,
	output: AssistantMessage,
): void {
	stream.push({ type: "done", reason: output.stopReason as Extract<StopReason, "stop" | "length" | "toolUse">, message: output });
	stream.end();
}

/**
 * Handle an error during streaming.
 *
 * Cleans up any leftover `index` properties on content blocks, sets the
 * appropriate stop reason and error message, then emits the "error" event.
 */
export function handleStreamError(
	stream: AssistantMessageEventStream,
	output: AssistantMessage,
	error: unknown,
	signal?: AbortSignal,
	/** Extra error metadata to append (e.g. OpenRouter raw metadata). */
	extraMessage?: string,
): void {
	for (const block of output.content) delete (block as { index?: number }).index;
	output.stopReason = signal?.aborted ? "aborted" : "error";
	output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
	if (extraMessage) output.errorMessage += `\n${extraMessage}`;
	stream.push({ type: "error", reason: output.stopReason, error: output });
	stream.end();
}

// =============================================================================
// Reasoning helpers
// =============================================================================

/**
 * Clamp reasoning effort for models that don't support all levels.
 * gpt-5.x models don't support "minimal" -- map to "low".
 *
 * Used by both openai-responses.ts and azure-openai-responses.ts.
 */
export function clampReasoningForModel(modelName: string, effort: string): string {
	const name = modelName.includes("/") ? modelName.split("/").pop()! : modelName;
	if (name.startsWith("gpt-5") && effort === "minimal") return "low";
	return effort;
}
