import type { Api, Model, SimpleStreamOptions, StreamOptions, ThinkingBudgets, ThinkingLevel } from "../types.js";

/**
 * Compute the default maxTokens for a model when no explicit value is provided.
 *
 * The 32 k cap is retained only for native Anthropic models (api === "anthropic-messages")
 * where the Anthropic API historically rejected higher values. Custom and
 * Anthropic-compatible models (e.g. OpenAI-completions, Vertex, etc.) use their
 * declared model.maxTokens directly so that providers with larger output windows
 * (131 072 tokens, etc.) are not silently capped.
 *
 * For all models, output tokens are capped to at most 80% of the context window
 * to leave room for the system prompt and user messages.
 */
export function defaultMaxTokens(model: Model<Api>): number {
	const contextCap = Math.floor(model.contextWindow * 0.8);
	if (model.api === "anthropic-messages") {
		return Math.min(model.maxTokens, 32000, contextCap);
	}
	return Math.min(model.maxTokens, contextCap);
}

export function buildBaseOptions(model: Model<Api>, options?: SimpleStreamOptions, apiKey?: string): StreamOptions {
	return {
		temperature: options?.temperature,
		maxTokens: options?.maxTokens || defaultMaxTokens(model),
		signal: options?.signal,
		apiKey: apiKey || options?.apiKey,
		cacheRetention: options?.cacheRetention,
		sessionId: options?.sessionId,
		headers: options?.headers,
		onPayload: options?.onPayload,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		metadata: options?.metadata,
	};
}

export function clampReasoning(effort: ThinkingLevel | undefined): Exclude<ThinkingLevel, "xhigh"> | undefined {
	return effort === "xhigh" ? "high" : effort;
}

export function adjustMaxTokensForThinking(
	baseMaxTokens: number,
	modelMaxTokens: number,
	reasoningLevel: ThinkingLevel,
	customBudgets?: ThinkingBudgets,
): { maxTokens: number; thinkingBudget: number } {
	const defaultBudgets: ThinkingBudgets = {
		minimal: 1024,
		low: 2048,
		medium: 8192,
		high: 16384,
	};
	const budgets = { ...defaultBudgets, ...customBudgets };

	const minOutputTokens = 1024;
	const level = clampReasoning(reasoningLevel)!;
	let thinkingBudget = budgets[level]!;
	const maxTokens = Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);

	if (maxTokens <= thinkingBudget) {
		thinkingBudget = Math.max(0, maxTokens - minOutputTokens);
	}

	return { maxTokens, thinkingBudget };
}
