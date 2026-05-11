// GSD2 — Known model capability table for Ollama models

/**
 * Maps well-known Ollama model families to their capabilities.
 * Used to enrich auto-discovered models with accurate context windows,
 * vision support, and reasoning detection.
 *
 * Fallback: estimate from parameter count if model isn't in the table.
 */

import type { OllamaChatOptions } from "./types.js";

export interface ModelCapability {
	contextWindow?: number;
	maxTokens?: number;
	input?: ("text" | "image")[];
	reasoning?: boolean;
	/** Ollama-specific default inference options for this model family. */
	ollamaOptions?: OllamaChatOptions;
}

/**
 * Known model family capabilities.
 * Keys are matched as prefixes against the model name (before the colon/tag).
 * More specific entries should appear first.
 */
// Note: `ollamaOptions.num_ctx` is auto-derived from `contextWindow` by
// `withDefaultNumCtx` at lookup time. Override per-entry only when an entry
// needs num_ctx to differ from its contextWindow (none currently). Unknown
// models stay without num_ctx so the request omits it and ollama uses its
// own safe default — preserves the OOM guard on constrained hosts.
const KNOWN_MODELS: Array<[pattern: string, caps: ModelCapability]> = [
	// ─── Reasoning models without long-variant overrides ───────────────────
	// /api/show capabilities is the authoritative reasoning signal; these
	// fallback entries cover Ollama versions that omit it. Families that have
	// long-variant entries elsewhere (glm-*, kimi-k2*, minimax-m2*, qwen3*)
	// carry reasoning: true on those entries instead, to avoid prefix
	// shadowing (#4991).
	["deepseek-r1",       { contextWindow: 131072, reasoning: true }],
	["deepseek-v3.1",     { contextWindow: 131072, reasoning: true }],
	// DeepSeek V4 family ships at 1M context per ollama /api/show (deepseek4.context_length = 1048576).
	// Long-variants listed before the bare `deepseek-v4` base to avoid prefix shadowing (#4991/#4984).
	["deepseek-v4-pro",   { contextWindow: 1048576, reasoning: true }],
	["deepseek-v4-flash", { contextWindow: 1048576, reasoning: true }],
	["deepseek-v4",       { contextWindow: 1048576, reasoning: true }],
	["qwq",               { contextWindow: 131072, reasoning: true }],
	["gpt-oss",           { contextWindow: 131072, reasoning: true }],
	["nemotron-3",        { contextWindow: 131072, reasoning: true }],
	["gemma4",            { contextWindow: 262144, reasoning: true }],
	["gemini-3-flash",    { contextWindow: 1048576, reasoning: true }],

	// ─── Vision models ──────────────────────────────────────────────────
	["llava", { contextWindow: 4096, input: ["text", "image"] }],
	["bakllava", { contextWindow: 4096, input: ["text", "image"] }],
	["moondream", { contextWindow: 8192, input: ["text", "image"] }],
	["llama3.2-vision", { contextWindow: 131072, input: ["text", "image"] }],
	["minicpm-v", { contextWindow: 4096, input: ["text", "image"] }],

	// ─── Code models ────────────────────────────────────────────────────
	["codestral", { contextWindow: 262144, maxTokens: 32768 }],
	["qwen2.5-coder", { contextWindow: 131072, maxTokens: 32768 }],
	["deepseek-coder-v2", { contextWindow: 131072, maxTokens: 16384 }],
	["starcoder2", { contextWindow: 16384, maxTokens: 8192 }],
	["codegemma", { contextWindow: 8192, maxTokens: 8192 }],
	["codellama", { contextWindow: 16384, maxTokens: 8192 }],
	["devstral", { contextWindow: 131072, maxTokens: 32768 }],

	// ─── Llama family ───────────────────────────────────────────────────
	["llama3.3", { contextWindow: 131072, maxTokens: 16384 }],
	["llama3.2", { contextWindow: 131072, maxTokens: 16384 }],
	["llama3.1", { contextWindow: 131072, maxTokens: 16384 }],
	["llama3", { contextWindow: 8192, maxTokens: 8192 }],
	["llama2", { contextWindow: 4096, maxTokens: 4096 }],

	// ─── Qwen family ────────────────────────────────────────────────────
	// Long-variant entries MUST appear before the bare `qwen3` base —
	// `baseName.startsWith(pattern)` returns true for `qwen3.5`/`qwen3-coder`/
	// `qwen3-next` against `qwen3`, and the first match wins (#4991).
	// All qwen3 variants support hybrid thinking; /api/show capabilities is
	// authoritative — these entries are only consulted when ollama omits it.
	// ref: qwen3-next 1M ctx — https://qwen.ai/blog?id=qwen3-next
	["qwen3-next", { contextWindow: 1048576, maxTokens: 32768, reasoning: true }],
	// ref: qwen3-coder 256K ctx — https://qwenlm.github.io/blog/qwen3-coder/
	["qwen3-coder", { contextWindow: 262144, maxTokens: 32768, reasoning: true }],
	// ref: qwen3.5 / qwen3.6 1M ctx — Ollama Cloud release notes
	["qwen3.6", { contextWindow: 1048576, maxTokens: 32768, reasoning: true }],
	["qwen3.5", { contextWindow: 1048576, maxTokens: 32768, reasoning: true }],
	["qwen3", { contextWindow: 131072, maxTokens: 32768, reasoning: true }],
	["qwen2.5", { contextWindow: 131072, maxTokens: 32768 }],
	["qwen2", { contextWindow: 131072, maxTokens: 32768 }],

	// ─── GLM family (Z.ai, Ollama Cloud) ────────────────────────────────
	// ref: glm 4.6 / 5.x 200K ctx — https://docs.z.ai/devpack/using5.1
	// Long-variant entries before bare `glm-5` / `glm-4` would-be bases to
	// avoid prefix shadowing (#4991).
	["glm-5.1", { contextWindow: 204800, maxTokens: 16384, reasoning: true }],
	["glm-5", { contextWindow: 204800, maxTokens: 16384, reasoning: true }],
	["glm-4.6", { contextWindow: 204800, maxTokens: 16384, reasoning: true }],
	["glm-4", { contextWindow: 131072, maxTokens: 16384, reasoning: true }],

	// ─── Kimi K2 (Moonshot, Ollama Cloud) ──────────────────────────────
	// ref: kimi-k2 256K ctx — https://platform.moonshot.ai/docs
	// Same shadowing concern: kimi-k2-thinking and kimi-k2.{5,6} must
	// match before any future bare `kimi-k2` entry (#4991).
	["kimi-k2-thinking", { contextWindow: 262144, maxTokens: 16384, reasoning: true }],
	["kimi-k2.6", { contextWindow: 262144, maxTokens: 16384, reasoning: true }],
	["kimi-k2.5", { contextWindow: 262144, maxTokens: 16384, reasoning: true }],
	["kimi-k2", { contextWindow: 262144, maxTokens: 16384, reasoning: true }],

	// ─── MiniMax M2 (Ollama Cloud) ─────────────────────────────────────
	// ref: ollama /api/show authoritative — base m2 announced 1M but
	// minimax-m2.7:cloud reports 196608 via /api/show. Per-variant entries
	// retained for prefix-shadow safety (#4984); base kept at 1M pending
	// confirmation from /api/show for older variants.
	["minimax-m2.7", { contextWindow: 196608, maxTokens: 16384, reasoning: true }],
	["minimax-m2.5", { contextWindow: 1048576, maxTokens: 16384, reasoning: true }],
	["minimax-m2", { contextWindow: 1048576, maxTokens: 16384, reasoning: true }],

	// ─── Gemma family ───────────────────────────────────────────────────
	["gemma3", { contextWindow: 131072, maxTokens: 16384 }],
	["gemma2", { contextWindow: 8192, maxTokens: 8192 }],

	// ─── Mistral family ─────────────────────────────────────────────────
	["mistral-large", { contextWindow: 131072, maxTokens: 16384 }],
	["mistral-small", { contextWindow: 131072, maxTokens: 16384 }],
	["mistral-nemo", { contextWindow: 131072, maxTokens: 16384 }],
	["mistral", { contextWindow: 32768, maxTokens: 8192 }],
	["mixtral", { contextWindow: 32768, maxTokens: 8192 }],

	// ─── Phi family ─────────────────────────────────────────────────────
	["phi4", { contextWindow: 16384, maxTokens: 16384 }],
	["phi3.5", { contextWindow: 131072, maxTokens: 16384 }],
	["phi3", { contextWindow: 131072, maxTokens: 4096 }],

	// ─── Command R ──────────────────────────────────────────────────────
	["command-r-plus", { contextWindow: 131072, maxTokens: 16384 }],
	["command-r", { contextWindow: 131072, maxTokens: 16384 }],
];

/**
 * Auto-derive `ollamaOptions.num_ctx` from `contextWindow` when not explicitly
 * set on the entry. Avoids the duplication-driven drift that #4984 / #5374
 * follow-ups had to chase: previously each entry had to repeat the same number
 * twice and any mismatch produced silent truncation on the wire.
 *
 * Explicit overrides are preserved when an entry needs `num_ctx` to differ from
 * its `contextWindow` (e.g., a memory-constrained host capping a larger model).
 */
function withDefaultNumCtx(caps: ModelCapability): ModelCapability {
	if (caps.contextWindow === undefined) return caps;
	if (caps.ollamaOptions?.num_ctx !== undefined) return caps;
	return {
		...caps,
		ollamaOptions: { ...caps.ollamaOptions, num_ctx: caps.contextWindow },
	};
}

/**
 * Look up capabilities for a model by name.
 * Matches the longest prefix from the known models table.
 */
export function getModelCapabilities(modelName: string): ModelCapability {
	// Strip tag (everything after the colon) for matching
	const baseName = modelName.split(":")[0].toLowerCase();

	for (const [pattern, caps] of KNOWN_MODELS) {
		if (baseName === pattern || baseName.startsWith(pattern)) {
			return withDefaultNumCtx(caps);
		}
	}

	return {};
}

/**
 * Estimate context window from parameter size string (e.g. "7B", "70B", "1.5B").
 * Used as fallback when model isn't in the known table.
 */
export function estimateContextFromParams(parameterSize: string): number {
	const match = parameterSize.match(/([\d.]+)\s*([BbMm])/);
	if (!match) return 8192;

	const size = parseFloat(match[1]);
	const unit = match[2].toUpperCase();

	// Convert to billions
	const billions = unit === "M" ? size / 1000 : size;

	// Rough heuristics: larger models tend to support larger contexts
	if (billions >= 70) return 131072;
	if (billions >= 30) return 65536;
	if (billions >= 13) return 32768;
	if (billions >= 7) return 16384;
	return 8192;
}

/**
 * Humanize a model name for display (e.g. "llama3.1:8b" → "Llama 3.1 8B").
 */
export function humanizeModelName(modelName: string): string {
	const [base, tag] = modelName.split(":");

	// Capitalize first letter, add spaces around version numbers
	let name = base
		.replace(/([a-z])(\d)/g, "$1 $2")
		.replace(/(\d)([a-z])/g, "$1 $2")
		.replace(/^./, (c) => c.toUpperCase());

	// Clean up common patterns
	name = name.replace(/\s*-\s*/g, " ");

	if (tag && tag !== "latest") {
		name += ` ${tag.toUpperCase()}`;
	}

	return name;
}

/**
 * Format byte size for display (e.g. 4700000000 → "4.7 GB").
 */
export function formatModelSize(bytes: number): string {
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
	return `${(bytes / 1e3).toFixed(0)} KB`;
}
