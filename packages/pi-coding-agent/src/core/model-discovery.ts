/**
 * Provider discovery adapters for runtime model enumeration.
 * Each adapter implements ProviderDiscoveryAdapter to fetch models from provider APIs.
 */

export interface DiscoveredModel {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
	input?: ("text" | "image")[];
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface DiscoveryResult {
	provider: string;
	models: DiscoveredModel[];
	fetchedAt: number;
	error?: string;
}

export interface ProviderDiscoveryAdapter {
	provider: string;
	supportsDiscovery: boolean;
	fetchModels(apiKey: string, baseUrl?: string): Promise<DiscoveredModel[]>;
}

export const OPENAI_COMPAT_DISCOVERY_APIS = new Set([
	"openai",
	"openai-completions",
	"openai-responses",
	"openai-codex-responses",
	"azure-openai-responses",
]);

/** Per-provider TTLs in milliseconds */
export const DISCOVERY_TTLS: Record<string, number> = {
	ollama: 5 * 60 * 1000, // 5 minutes (local, models change often)
	openai: 60 * 60 * 1000, // 1 hour
	google: 60 * 60 * 1000, // 1 hour
	openrouter: 60 * 60 * 1000, // 1 hour
	default: 24 * 60 * 60 * 1000, // 24 hours
};

export function getDefaultTTL(provider: string): number {
	return DISCOVERY_TTLS[provider] ?? DISCOVERY_TTLS.default;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timeout);
	}
}

const DEFAULT_OPENAI_DISCOVERY_BASE = "https://api.openai.com/v1";
const DEFAULT_OPENROUTER_DISCOVERY_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_GOOGLE_DISCOVERY_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_OLLAMA_DISCOVERY_BASE = "http://localhost:11434";

function trimTrailingSlashes(base: string): string {
	return base.replace(/\/+$/, "");
}

function parseUrlOrThrow(raw: string): URL {
	try {
		return new URL(raw);
	} catch {
		throw new Error(`Invalid discovery base URL: ${raw}`);
	}
}

function ensureTrailingSlash(base: string): string {
	const trimmed = trimTrailingSlashes(base);
	return `${trimmed}/`;
}

function joinUnderBase(base: string, resourcePath: string): string {
	try {
		return new URL(resourcePath, ensureTrailingSlash(base)).href;
	} catch {
		throw new Error(`Invalid discovery base URL: ${base}`);
	}
}

/**
 * When `trimmedBase` has no path (origin only), use `${origin}${hostOnlyPathPrefix}` as the API root.
 * `hostOnlyPathPrefix` must start with `/` (e.g. `/v1`, `/api/v1`, `/v1beta`).
 */
function resolveDiscoveryRoot(trimmedBase: string, hostOnlyPathPrefix: string): string {
	const u = parseUrlOrThrow(trimmedBase);
	const pathNoSlash = u.pathname.replace(/\/+$/, "") || "/";
	const isHostOnly = pathNoSlash === "/";
	return isHostOnly ? `${u.origin}${hostOnlyPathPrefix}` : trimmedBase;
}

function openAiStyleModelsListUrl(trimmedRoot: string, hostOnlyPathPrefix: string): string {
	return joinUnderBase(resolveDiscoveryRoot(trimmedRoot, hostOnlyPathPrefix), "models");
}

function googleDiscoveryListUrl(apiKey: string, trimmedRoot: string): string {
	const root = resolveDiscoveryRoot(trimmedRoot, "/v1beta");
	const list = new URL("models", ensureTrailingSlash(root));
	list.searchParams.set("key", apiKey);
	return list.href;
}

// ─── HTTP discovery base ─────────────────────────────────────────────────────

abstract class JsonDiscoveryAdapter implements ProviderDiscoveryAdapter {
	supportsDiscovery = true;
	abstract readonly provider: string;

	abstract defaultBase(): string;
	abstract resolveListUrl(apiKey: string, baseUrl?: string): string;
	abstract requestInit(apiKey: string): RequestInit;
	abstract httpErrorApiName(): string;
	abstract parseBody(data: unknown): DiscoveredModel[];

	async fetchModels(apiKey: string, baseUrl?: string): Promise<DiscoveredModel[]> {
		const url = this.resolveListUrl(apiKey, baseUrl);
		const response = await fetchWithTimeout(url, this.requestInit(apiKey));
		if (!response.ok) {
			throw new Error(`${this.httpErrorApiName()} returned ${response.status}: ${response.statusText}`);
		}
		return this.parseBody(await response.json());
	}
}

abstract class BearerJsonDiscoveryAdapter extends JsonDiscoveryAdapter {
	requestInit(apiKey: string): RequestInit {
		return { headers: { Authorization: `Bearer ${apiKey}` } };
	}
}

// ─── OpenAI Adapter ──────────────────────────────────────────────────────────

const OPENAI_EXCLUDED_PREFIXES = ["embedding", "tts", "dall-e", "whisper", "text-embedding", "davinci", "babbage"];

function asPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	if (typeof value === "string") {
		const n = Number.parseFloat(value);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return undefined;
}

function pickFirstPositiveNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = asPositiveNumber(record[key]);
		if (value !== undefined) return value;
	}
	return undefined;
}

function discoverInputModalities(rawModel: Record<string, unknown>, id: string): Array<"text" | "image"> {
	const directModalities = rawModel.input_modalities;
	const capabilitiesModalities = (rawModel.capabilities as Record<string, unknown> | undefined)?.input_modalities;
	const source = Array.isArray(directModalities)
		? directModalities
		: Array.isArray(capabilitiesModalities)
			? capabilitiesModalities
			: [];
	const supportsImage = source.some((m) => typeof m === "string" && /image|vision/i.test(m))
		|| /vision|image|omni|multimodal/i.test(id);
	return supportsImage ? ["text", "image"] : ["text"];
}

function parseOpenAICompatibleModel(rawModel: Record<string, unknown>): DiscoveredModel | undefined {
	const id = typeof rawModel.id === "string" ? rawModel.id : "";
	if (!id) return undefined;
	if (OPENAI_EXCLUDED_PREFIXES.some((prefix) => id.startsWith(prefix))) return undefined;

	const contextWindow = pickFirstPositiveNumber(rawModel, [
		"context_window",
		"context_length",
		"max_context_length",
		"max_input_tokens",
		"input_token_limit",
		"max_model_len",
	]);
	const maxTokens = pickFirstPositiveNumber(rawModel, [
		"max_output_tokens",
		"output_token_limit",
		"max_completion_tokens",
		"max_tokens",
	]);
	const reasoning = rawModel.reasoning === true
		|| rawModel.supports_reasoning === true
		|| ((rawModel.capabilities as Record<string, unknown> | undefined)?.reasoning === true);

	return {
		id,
		name: typeof rawModel.name === "string" && rawModel.name.length > 0 ? rawModel.name : id,
		contextWindow,
		maxTokens,
		reasoning,
		input: discoverInputModalities(rawModel, id),
	};
}

class OpenAIDiscoveryAdapter extends BearerJsonDiscoveryAdapter {
	readonly provider: string;

	constructor(provider: string) {
		super();
		this.provider = provider;
	}

	defaultBase(): string {
		return DEFAULT_OPENAI_DISCOVERY_BASE;
	}

	resolveListUrl(_apiKey: string, baseUrl?: string): string {
		const root = trimTrailingSlashes(baseUrl ?? this.defaultBase());
		return openAiStyleModelsListUrl(root, "/v1");
	}

	httpErrorApiName(): string {
		return "OpenAI models API";
	}

	parseBody(data: unknown): DiscoveredModel[] {
		const payload = data as { data?: Array<Record<string, unknown>> };
		return (payload.data ?? [])
			.map((m) => parseOpenAICompatibleModel(m))
			.filter((m): m is DiscoveredModel => !!m);
	}
}

// ─── Ollama Adapter ──────────────────────────────────────────────────────────

class OllamaDiscoveryAdapter extends JsonDiscoveryAdapter {
	readonly provider = "ollama";

	defaultBase(): string {
		return DEFAULT_OLLAMA_DISCOVERY_BASE;
	}

	resolveListUrl(_apiKey: string, baseUrl?: string): string {
		const root = trimTrailingSlashes(baseUrl ?? this.defaultBase());
		return joinUnderBase(root, "api/tags");
	}

	requestInit(): RequestInit {
		return {};
	}

	httpErrorApiName(): string {
		return "Ollama tags API";
	}

	parseBody(data: unknown): DiscoveredModel[] {
		const payload = data as {
			models: Array<{ name: string; size: number; details?: { parameter_size?: string } }>;
		};
		return (payload.models ?? []).map((m) => ({
			id: m.name,
			name: m.name,
			input: ["text" as const],
		}));
	}
}

// ─── OpenRouter Adapter ──────────────────────────────────────────────────────

class OpenRouterDiscoveryAdapter extends BearerJsonDiscoveryAdapter {
	readonly provider = "openrouter";

	defaultBase(): string {
		return DEFAULT_OPENROUTER_DISCOVERY_BASE;
	}

	resolveListUrl(_apiKey: string, baseUrl?: string): string {
		const root = trimTrailingSlashes(baseUrl ?? this.defaultBase());
		return openAiStyleModelsListUrl(root, "/api/v1");
	}

	httpErrorApiName(): string {
		return "OpenRouter models API";
	}

	parseBody(data: unknown): DiscoveredModel[] {
		const payload = data as {
			data: Array<{
				id: string;
				name: string;
				context_length?: number;
				top_provider?: { max_completion_tokens?: number };
				pricing?: { prompt: string; completion: string };
			}>;
		};
		return (payload.data ?? []).map((m) => {
			const cost =
				m.pricing?.prompt !== undefined && m.pricing?.completion !== undefined
					? {
							input: parseFloat(m.pricing.prompt) * 1_000_000,
							output: parseFloat(m.pricing.completion) * 1_000_000,
							cacheRead: 0,
							cacheWrite: 0,
						}
					: undefined;

			return {
				id: m.id,
				name: m.name,
				contextWindow: m.context_length,
				maxTokens: m.top_provider?.max_completion_tokens,
				cost,
				input: ["text" as const, "image" as const],
			};
		});
	}
}

// ─── Google/Gemini Adapter ───────────────────────────────────────────────────

class GoogleDiscoveryAdapter extends JsonDiscoveryAdapter {
	readonly provider = "google";

	defaultBase(): string {
		return DEFAULT_GOOGLE_DISCOVERY_BASE;
	}

	resolveListUrl(apiKey: string, baseUrl?: string): string {
		const root = trimTrailingSlashes(baseUrl ?? this.defaultBase());
		return googleDiscoveryListUrl(apiKey, root);
	}

	requestInit(): RequestInit {
		return {};
	}

	httpErrorApiName(): string {
		return "Google models API";
	}

	parseBody(data: unknown): DiscoveredModel[] {
		const payload = data as {
			models: Array<{
				name: string;
				displayName: string;
				supportedGenerationMethods?: string[];
				inputTokenLimit?: number;
				outputTokenLimit?: number;
			}>;
		};
		return (payload.models ?? [])
			.filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
			.map((m) => ({
				id: m.name.replace("models/", ""),
				name: m.displayName,
				contextWindow: m.inputTokenLimit,
				maxTokens: m.outputTokenLimit,
				input: ["text" as const, "image" as const],
			}));
	}
}

// ─── Static Adapter (no discovery) ───────────────────────────────────────────

class StaticDiscoveryAdapter implements ProviderDiscoveryAdapter {
	provider: string;
	supportsDiscovery = false;

	constructor(provider: string) {
		this.provider = provider;
	}

	async fetchModels(): Promise<DiscoveredModel[]> {
		return [];
	}
}

// ─── Registry ────────────────────────────────────────────────────────────────

const adapters: Record<string, ProviderDiscoveryAdapter> = {
	openai: new OpenAIDiscoveryAdapter("openai"),
	ollama: new OllamaDiscoveryAdapter(),
	openrouter: new OpenRouterDiscoveryAdapter(),
	google: new GoogleDiscoveryAdapter(),
	anthropic: new StaticDiscoveryAdapter("anthropic"),
	bedrock: new StaticDiscoveryAdapter("bedrock"),
	"azure-openai": new StaticDiscoveryAdapter("azure-openai"),
	groq: new StaticDiscoveryAdapter("groq"),
	cerebras: new StaticDiscoveryAdapter("cerebras"),
	xai: new StaticDiscoveryAdapter("xai"),
	mistral: new StaticDiscoveryAdapter("mistral"),
};

export function supportsDiscoveryForApi(api: string | undefined): boolean {
	if (!api) return false;
	return OPENAI_COMPAT_DISCOVERY_APIS.has(api);
}

export function getDiscoveryAdapter(provider: string, providerApis?: Iterable<string>): ProviderDiscoveryAdapter {
	const known = adapters[provider];
	if (known) return known;

	if (providerApis) {
		for (const api of providerApis) {
			if (supportsDiscoveryForApi(api)) {
				return new OpenAIDiscoveryAdapter(provider);
			}
		}
	}

	return new StaticDiscoveryAdapter(provider);
}

export function getDiscoverableProviders(): string[] {
	return Object.entries(adapters)
		.filter(([, adapter]) => adapter.supportsDiscovery)
		.map(([name]) => name);
}
