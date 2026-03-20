/**
 * Context7 Documentation Extension
 *
 * Replaces the context7 MCP server with a native pi extension.
 * Provides two tools for the LLM:
 *
 *   resolve_library   - Search for a library by name, returns candidates with metadata
 *   get_library_docs  - Fetch docs for a library ID, scoped to an optional query/topic
 *
 * API contract (verified against live API 2026-03-04):
 *   Search:  GET /api/v2/libs/search?libraryName=&query=  → { results: C7Library[] }
 *   Context: GET /api/v2/context?libraryId=&query=&tokens= → text/plain (markdown)
 *
 * Features:
 *   - Bearer auth via CONTEXT7_API_KEY env var (optional, increases rate limits)
 *   - In-session caching of search results and doc pages
 *   - Smart token budgeting (default 5000, configurable per call, max 10000)
 *   - Proper truncation guard so context is never overwhelmed
 *   - Custom TUI rendering for clean display in pi
 *
 * Setup:
 *   export CONTEXT7_API_KEY=your_key   (get one at context7.com/dashboard)
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@gsd/pi-coding-agent";
import { Text } from "@gsd/pi-tui";
import { Type } from "@sinclair/typebox";

// ─── API types ────────────────────────────────────────────────────────────────

/** Shape returned by GET /api/v2/libs/search */
interface C7SearchResponse {
	results: C7Library[];
}

interface C7Library {
	id: string;
	title: string;
	description?: string;
	branch?: string;
	lastUpdateDate?: string;
	state?: string;
	totalTokens?: number;
	totalSnippets?: number;
	stars?: number;
	trustScore?: number;
	benchmarkScore?: number;
	versions?: string[];
}

// ─── In-session cache ─────────────────────────────────────────────────────────

// Keyed by lowercased query string
const searchCache = new Map<string, C7Library[]>();

// Keyed by `${libraryId}::${query ?? ""}::${tokens}`
const docCache = new Map<string, string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = "https://context7.com/api/v2";

function getApiKey(): string | undefined {
	return process.env.CONTEXT7_API_KEY;
}

function buildHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"User-Agent": "pi-coding-agent/context7-extension",
	};
	const key = getApiKey();
	if (key) headers["Authorization"] = `Bearer ${key}`;
	return headers;
}

async function apiFetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
	const res = await fetch(url, { headers: { ...buildHeaders(), Accept: "application/json" }, signal });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Context7 API ${res.status}: ${body.slice(0, 300)}`);
	}
	return res.json();
}

async function apiFetchText(url: string, signal?: AbortSignal): Promise<string> {
	const res = await fetch(url, { headers: { ...buildHeaders(), Accept: "text/plain" }, signal });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Context7 API ${res.status}: ${body.slice(0, 300)}`);
	}
	return res.text();
}

/**
 * Format library search results into a compact, LLM-readable string.
 * Each library gets a block with the key signals for picking the best match.
 */
function formatLibraryList(libs: C7Library[], query: string): string {
	if (libs.length === 0) {
		return `No libraries found for "${query}". Try a different name or spelling.`;
	}

	const lines: string[] = [
		`Found ${libs.length} ${libs.length === 1 ? "library" : "libraries"} matching "${query}":\n`,
	];

	for (const lib of libs) {
		let line = `• ${lib.title}  (ID: ${lib.id})`;
		if (lib.description) line += `\n  ${lib.description}`;

		const meta: string[] = [];
		if (lib.trustScore !== undefined) meta.push(`trust: ${lib.trustScore}/10`);
		if (lib.benchmarkScore !== undefined) meta.push(`benchmark: ${lib.benchmarkScore.toFixed(1)}`);
		if (lib.totalSnippets !== undefined) meta.push(`${lib.totalSnippets.toLocaleString()} snippets`);
		if (lib.totalTokens !== undefined) meta.push(`${(lib.totalTokens / 1000).toFixed(0)}k tokens`);
		if (lib.lastUpdateDate) meta.push(`updated: ${lib.lastUpdateDate.split("T")[0]}`);
		if (meta.length > 0) line += `\n  ${meta.join(" · ")}`;

		lines.push(line);
	}

	lines.push(
		"\nUse the ID (e.g. /websites/react_dev) with get_library_docs to fetch documentation.",
	);

	return lines.join("\n");
}

// ─── Tool details types ───────────────────────────────────────────────────────

interface ResolveDetails {
	query: string;
	resultCount: number;
	cached: boolean;
	error?: string;
}

interface DocsDetails {
	libraryId: string;
	query?: string;
	tokens: number;
	cached: boolean;
	truncated: boolean;
	charCount: number;
	error?: string;
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ── resolve_library ──────────────────────────────────────────────────────

	pi.registerTool({
		name: "resolve_library",
		label: "Resolve Library",
		description:
			"Search the Context7 library catalogue by name and return matching libraries with metadata. " +
			"Use this to find the correct library ID before fetching documentation. " +
			"Results are ranked by trustScore (0–10) and benchmarkScore — prefer the highest. " +
			"If you already have a library ID (e.g. /vercel/next.js), skip this and call get_library_docs directly.",
		promptSnippet: "Search Context7 for a library by name to get its ID for documentation lookup",
		promptGuidelines: [
			"Call resolve_library first when the user asks about a library, package, or framework you need current docs for.",
			"Choose the result with the highest trustScore and benchmarkScore when multiple matches appear.",
			"Pass the user's question as the query parameter — it improves result ranking.",
		],
		parameters: Type.Object({
			libraryName: Type.String({
				description:
					"Library or framework name to search for, e.g. 'react', 'next.js', 'tailwindcss', 'prisma', 'langchain'",
			}),
			query: Type.Optional(
				Type.String({
					description:
						"Optional: the user's question or topic. Improves search ranking. E.g. 'how do I use server actions?'",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const cacheKey = params.libraryName.toLowerCase().trim();

			if (searchCache.has(cacheKey)) {
				const cached = searchCache.get(cacheKey)!;
				return {
					content: [{ type: "text", text: formatLibraryList(cached, params.libraryName) }],
					details: {
						query: params.libraryName,
						resultCount: cached.length,
						cached: true,
					} as ResolveDetails,
				};
			}

			const url = new URL(`${BASE_URL}/libs/search`);
			url.searchParams.set("libraryName", params.libraryName);
			if (params.query) url.searchParams.set("query", params.query);

			let libs: C7Library[];
			try {
				const data = (await apiFetchJson(url.toString(), signal)) as C7SearchResponse;
				libs = Array.isArray(data?.results) ? data.results : [];
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Context7 search failed: ${msg}` }],
					isError: true,
					details: { query: params.libraryName, resultCount: 0, cached: false, error: msg } as ResolveDetails,
				};
			}

			searchCache.set(cacheKey, libs);

			return {
				content: [{ type: "text", text: formatLibraryList(libs, params.libraryName) }],
				details: { query: params.libraryName, resultCount: libs.length, cached: false } as ResolveDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("resolve_library "));
			text += theme.fg("accent", `"${args.libraryName}"`);
			if (args.query) text += theme.fg("muted", ` — "${args.query}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			const d = result.details as ResolveDetails | undefined;
			if (isPartial) return new Text(theme.fg("warning", "Searching Context7..."), 0, 0);
			if ((result as any).isError || d?.error) {
				return new Text(theme.fg("error", `Error: ${d?.error ?? "unknown"}`), 0, 0);
			}
			let text = theme.fg("success", `${d?.resultCount ?? 0} ${d?.resultCount === 1 ? "library" : "libraries"} found`);
			if (d?.cached) text += theme.fg("dim", " (cached)");
			text += theme.fg("dim", ` for "${d?.query}"`);
			return new Text(text, 0, 0);
		},
	});

	// ── get_library_docs ─────────────────────────────────────────────────────

	pi.registerTool({
		name: "get_library_docs",
		label: "Get Library Docs",
		description:
			"Fetch up-to-date documentation from Context7 for a specific library. " +
			"Pass the library ID from resolve_library (e.g. /websites/react_dev) and a focused topic query " +
			"to get the most relevant snippets. " +
			"The tokens parameter controls how much documentation to retrieve (default 5000, max 10000). " +
			"A specific query (e.g. 'server actions form submission') returns better results than a broad one.",
		promptSnippet: "Fetch up-to-date, version-specific documentation for a library from Context7",
		promptGuidelines: [
			"Use a specific topic query for best results — e.g. 'useEffect cleanup' not just 'hooks'.",
			"Start with tokens=5000. Increase to 10000 only if the first response lacks the detail you need.",
			"Results are cached per-session — repeated calls for the same library+query have no API cost.",
		],
		parameters: Type.Object({
			libraryId: Type.String({
				description:
					"Context7 library ID from resolve_library, e.g. /websites/react_dev or /vercel/next.js",
			}),
			query: Type.Optional(
				Type.String({
					description:
						"Specific topic to focus the docs on, e.g. 'server actions', 'useEffect cleanup', 'authentication middleware'. More specific = better results.",
				}),
			),
			tokens: Type.Optional(
				Type.Number({
					description: "Max tokens of documentation to return (default 5000, max 10000).",
					minimum: 500,
					maximum: 10000,
				}),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const tokens = Math.min(Math.max(params.tokens ?? 5000, 500), 10000);
			// Strip accidental leading @ that some models inject
			const libraryId = params.libraryId.startsWith("@")
				? params.libraryId.slice(1)
				: params.libraryId;
			const query = params.query?.trim() || undefined;

			const cacheKey = `${libraryId}::${query ?? ""}::${tokens}`;

			if (docCache.has(cacheKey)) {
				const cached = docCache.get(cacheKey)!;
				return {
					content: [{ type: "text", text: cached }],
					details: {
						libraryId,
						query,
						tokens,
						cached: true,
						truncated: false,
						charCount: cached.length,
					} as DocsDetails,
				};
			}

			const url = new URL(`${BASE_URL}/context`);
			url.searchParams.set("libraryId", libraryId);
			if (query) url.searchParams.set("query", query);
			url.searchParams.set("tokens", String(tokens));

			let rawText: string;
			try {
				rawText = await apiFetchText(url.toString(), signal);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Context7 doc fetch failed: ${msg}` }],
					isError: true,
					details: {
						libraryId,
						query,
						tokens,
						cached: false,
						truncated: false,
						charCount: 0,
						error: msg,
					} as DocsDetails,
				};
			}

			if (!rawText.trim()) {
				const notFound = query
					? `No documentation found for "${query}" in ${libraryId}. Try a broader query or different library ID.`
					: `No documentation found for ${libraryId}. Try resolve_library to verify the library ID.`;
				return {
					content: [{ type: "text", text: notFound }],
					details: {
						libraryId,
						query,
						tokens,
						cached: false,
						truncated: false,
						charCount: 0,
					} as DocsDetails,
				};
			}

			// Truncation guard — Context7 already respects the token budget, but be defensive
			const truncation = truncateHead(rawText, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let finalText = truncation.content;
			if (truncation.truncated) {
				finalText +=
					`\n\n[Truncated: showing ${truncation.outputLines}/${truncation.totalLines} lines` +
					` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).` +
					` Use a more specific query to reduce output size.]`;
			}

			docCache.set(cacheKey, finalText);

			return {
				content: [{ type: "text", text: finalText }],
				details: {
					libraryId,
					query,
					tokens,
					cached: false,
					truncated: truncation.truncated,
					charCount: finalText.length,
				} as DocsDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("get_library_docs "));
			text += theme.fg("accent", args.libraryId);
			if (args.query) text += theme.fg("muted", ` — "${args.query}"`);
			if (args.tokens && args.tokens !== 5000) text += theme.fg("dim", ` (${args.tokens} tokens)`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial, expanded }, theme) {
			const d = result.details as DocsDetails | undefined;

			if (isPartial) return new Text(theme.fg("warning", "Fetching documentation..."), 0, 0);
			if ((result as any).isError || d?.error) {
				return new Text(theme.fg("error", `Error: ${d?.error ?? "unknown"}`), 0, 0);
			}

			let text = theme.fg("success", `${(d?.charCount ?? 0).toLocaleString()} chars`);
			text += theme.fg("dim", ` · ${d?.tokens ?? 5000} token budget`);
			if (d?.cached) text += theme.fg("dim", " · cached");
			if (d?.truncated) text += theme.fg("warning", " · truncated");
			text += theme.fg("dim", ` · ${d?.libraryId}`);
			if (d?.query) text += theme.fg("dim", ` — "${d.query}"`);

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const preview = content.text.split("\n").slice(0, 12).join("\n");
					text += "\n\n" + theme.fg("dim", preview);
					if (content.text.split("\n").length > 12) {
						text += "\n" + theme.fg("muted", "… (Ctrl+O to collapse)");
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ── Session cleanup ─────────────────────────────────────────────────────

	pi.on("session_shutdown", async () => {
		searchCache.clear();
		docCache.clear();
	});

	// ── Startup notification ─────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		if (!getApiKey()) {
			ctx.ui.notify(
				"Context7: No CONTEXT7_API_KEY set. Using free tier (1000 req/month limit). " +
				"Set CONTEXT7_API_KEY for higher limits.",
				"warning",
			);
		}
	});
}
