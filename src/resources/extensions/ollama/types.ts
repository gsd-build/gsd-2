// GSD2 — Ollama API response types

/**
 * Type definitions for the Ollama REST API.
 * Reference: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

// ─── /api/tags ──────────────────────────────────────────────────────────────

export interface OllamaModelDetails {
	parent_model: string;
	format: string;
	family: string;
	families: string[] | null;
	parameter_size: string;
	quantization_level: string;
}

export interface OllamaModelInfo {
	name: string;
	model: string;
	modified_at: string;
	size: number;
	digest: string;
	details: OllamaModelDetails;
}

export interface OllamaTagsResponse {
	models: OllamaModelInfo[];
}

// ─── /api/show ──────────────────────────────────────────────────────────────

export interface OllamaShowResponse {
	modelfile: string;
	parameters: string;
	template: string;
	details: OllamaModelDetails;
	model_info: Record<string, unknown>;
}

// ─── /api/ps ────────────────────────────────────────────────────────────────

export interface OllamaRunningModel {
	name: string;
	model: string;
	size: number;
	digest: string;
	details: OllamaModelDetails;
	expires_at: string;
	size_vram: number;
}

export interface OllamaPsResponse {
	models: OllamaRunningModel[];
}

// ─── /api/pull ──────────────────────────────────────────────────────────────

export interface OllamaPullProgress {
	status: string;
	digest?: string;
	total?: number;
	completed?: number;
}

// ─── /api/version ───────────────────────────────────────────────────────────

export interface OllamaVersionResponse {
	version: string;
}

// ─── /api/chat ──────────────────────────────────────────────────────────────

export interface OllamaChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	images?: string[];
	tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
	function: {
		name: string;
		arguments: Record<string, unknown>;
	};
}

export interface OllamaTool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			required?: string[];
			properties: Record<string, unknown>;
		};
	};
}

export interface OllamaChatRequest {
	model: string;
	messages: OllamaChatMessage[];
	stream?: boolean;
	tools?: OllamaTool[];
	options?: {
		num_ctx?: number;
		num_predict?: number;
		temperature?: number;
		top_p?: number;
		top_k?: number;
		stop?: string[];
	};
	keep_alive?: string;
}

export interface OllamaChatResponse {
	model: string;
	created_at: string;
	message: OllamaChatMessage;
	done: boolean;
	done_reason?: string;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}
