/**
 * Web Search Extension v4
 *
 * Provides three tools for grounding the agent in real-world web content:
 *
 *   search-the-web   — Rich web search with extra snippets, freshness filtering,
 *                      domain scoping, AI summarizer, and compact output format.
 *                      Returns links and snippets for selective browsing.
 *
 *   fetch_page       — Extract clean markdown from any URL via Jina Reader.
 *                      Supports offset-based continuation, CSS selector targeting,
 *                      and content-type-aware extraction.
 *
 *   search_and_read  — Single-call search + content extraction via Brave LLM Context API.
 *                      Returns pre-extracted, relevance-scored page content.
 *                      Best when you need content, not just links.
 *
 * v4: Native Anthropic web search
 * - When using an Anthropic provider, injects the native `web_search_20250305`
 *   server-side tool via `before_provider_request`. This eliminates the need for
 *   a BRAVE_API_KEY when using Anthropic models — search is billed through the
 *   existing Anthropic API key ($0.01/search).
 * - Custom Brave-based tools (search-the-web, search_and_read) are disabled when
 *   Anthropic + no BRAVE_API_KEY to avoid confusing the LLM with broken tools.
 * - fetch_page (Jina) remains available — it works without a key at lower rate limits.
 *
 * v3 improvements over v2:
 * - search_and_read: New tool — Brave LLM Context API (search + read in one call)
 * - Structured error taxonomy: auth_error, rate_limited, network_error, etc.
 * - Spellcheck surfacing: query corrections from Brave shown to agent
 * - Latency tracking: API call timing in details for observability
 * - Rate limit info: remaining quota surfaced when available
 * - more_results_available: pagination hints from Brave
 * - Adaptive snippet budget: snippet count adapts to result count
 * - fetch_page offset: continuation reading for long pages
 * - fetch_page selector: CSS selector targeting via Jina X-Target-Selector
 * - fetch_page diagnostics: Jina failure reasons surfaced in details
 * - Content-type awareness: JSON passthrough, PDF detection
 * - Cache timer cleanup: purge timers use unref() to not block process exit
 *
 * Environment variables:
 *   BRAVE_API_KEY  — Optional with Anthropic models (built-in search available).
 *                    Required for non-Anthropic providers. Get one at brave.com/search/api
 *   JINA_API_KEY   — Optional. Higher rate limits for page extraction.
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { registerSearchTool } from "./tool-search.js";
import { registerFetchPageTool } from "./tool-fetch-page.js";
import { registerLLMContextTool } from "./tool-llm-context.js";
import { registerSearchProviderCommand } from "./command-search-provider.js";
import { registerNativeSearchHooks } from "./native-search.js";

export default function (pi: ExtensionAPI) {
  registerSearchTool(pi);
  registerFetchPageTool(pi);
  registerLLMContextTool(pi);


  // Register slash commands
  registerSearchProviderCommand(pi);

  // Register native Anthropic web search hooks
  registerNativeSearchHooks(pi);
}
