import type { Api, AssistantMessage, Model, StopReason, StreamOptions } from "../types.js";
import { AssistantMessageEventStream } from "./event-stream.js";

/**
 * Options for customizing error handling in {@link createProviderStream}.
 */
export interface ProviderStreamErrorHooks {
	/**
	 * Format the error message. Return a string to override the default
	 * `error.message ?? JSON.stringify(error)` formatting.
	 */
	formatError?: (error: unknown) => string;

	/**
	 * Called after the output has been updated with stopReason/errorMessage
	 * but before the error event is pushed to the stream.
	 * Use this for provider-specific enrichment (e.g. retry-after headers,
	 * appending metadata from the error object).
	 */
	onError?: (error: unknown, output: AssistantMessage) => void;
}

/**
 * Create a new AssistantMessage output object with zero-initialized usage.
 */
export function createOutputMessage(model: Model<Api>): AssistantMessage {
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

/**
 * Encapsulates the boilerplate every provider repeats:
 *
 * 1. Create an {@link AssistantMessageEventStream}.
 * 2. Create a zero-initialized {@link AssistantMessage} output.
 * 3. Kick off an async IIFE that calls {@link streamFn} inside try/catch.
 * 4. On success: push `done` event and end the stream.
 * 5. On error: clean up internal block properties, set `stopReason` /
 *    `errorMessage`, push `error` event and end the stream.
 * 6. Synchronously return the stream.
 *
 * The caller (provider) only needs to supply the streaming logic that
 * populates `output` and pushes events to `stream`.
 *
 * @param model   The resolved model descriptor.
 * @param options Provider-level stream options (used for `signal`).
 * @param streamFn  Async function that does the actual streaming work.
 *                  It receives the pre-built `output` and `stream` objects.
 *                  It must **not** push `done`/`error` events or call
 *                  `stream.end()` — that is handled automatically.
 * @param hooks   Optional hooks for provider-specific error handling.
 * @returns       An {@link AssistantMessageEventStream} that the caller
 *                can return directly.
 */
export function createProviderStream(
	model: Model<Api>,
	options: StreamOptions | undefined,
	streamFn: (output: AssistantMessage, stream: AssistantMessageEventStream) => Promise<void>,
	hooks?: ProviderStreamErrorHooks,
): AssistantMessageEventStream {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output = createOutputMessage(model);

		try {
			await streamFn(output, stream);

			if (options?.signal?.aborted) {
				throw new Error("Request was aborted");
			}

			if (output.stopReason === "aborted" || output.stopReason === "error") {
				throw new Error("An unknown error occurred");
			}

			stream.push({
				type: "done",
				reason: output.stopReason as Exclude<StopReason, "aborted" | "error">,
				message: output,
			});
			stream.end();
		} catch (error) {
			// Clean up internal tracking properties that some providers attach
			// to content blocks during streaming (e.g. `index`, `partialJson`).
			for (const block of output.content) {
				if ("index" in block) {
					delete (block as { index?: number }).index;
				}
				if ("partialJson" in block) {
					delete (block as { partialJson?: string }).partialJson;
				}
			}

			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = hooks?.formatError
				? hooks.formatError(error)
				: error instanceof Error
					? error.message
					: JSON.stringify(error);

			hooks?.onError?.(error, output);

			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
}
