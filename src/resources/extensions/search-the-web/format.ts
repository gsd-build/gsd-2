/**
 * Token-efficient output formatting for search results, page content,
 * and LLM context responses.
 */

import { extractDomain } from "./url-utils.js";

export interface SearchResultFormatted {
  title: string;
  url: string;
  description: string;
  age?: string;
  extra_snippets?: string[];
  [key: string]: unknown;
}

// =============================================================================
// Adaptive Snippet Budget
// =============================================================================

/**
 * Compute how many extra_snippets to show per result based on total count.
 * Fewer results → more snippets each. More results → fewer snippets each.
 *
 * This keeps total output roughly constant regardless of result count.
 */
function snippetsPerResult(resultCount: number): number {
  if (resultCount <= 2) return 5;   // show all available
  if (resultCount <= 4) return 3;
  if (resultCount <= 6) return 2;
  if (resultCount <= 8) return 1;
  return 0; // 9-10 results: descriptions only
}

// =============================================================================
// Search Results Formatting
// =============================================================================

export interface FormatSearchOptions {
  cached?: boolean;
  summary?: string;
  queryCorrected?: boolean;
  originalQuery?: string;
  correctedQuery?: string;
  moreResultsAvailable?: boolean;
}

/**
 * Format search results in a compact, token-efficient format.
 *
 * Produces:
 *   [1] Python Web Frameworks — example.com (2024-11)
 *   Main snippet text...
 *   + "additional excerpt 1"
 *   + "additional excerpt 2"
 *
 * Snippet count per result adapts to total result count.
 */
export function formatSearchResults(
  query: string,
  results: SearchResultFormatted[],
  options: FormatSearchOptions = {}
): string {
  const parts: string[] = [];

  // Header
  const cacheTag = options.cached ? " (cached)" : "";
  parts.push(`Search: "${query}"${cacheTag}`);

  // Spellcheck/query correction notice
  if (options.queryCorrected && options.correctedQuery) {
    parts.push(`Note: Query was corrected to "${options.correctedQuery}" (original: "${options.originalQuery ?? query}")`);
  }

  parts.push(""); // blank line after header

  // AI summary block if available (from Brave Summarizer)
  if (options.summary) {
    parts.push(`Summary: ${options.summary}\n`);
  }

  if (results.length === 0) {
    parts.push("No results found.");
    return parts.join("\n");
  }

  const maxSnippets = snippetsPerResult(results.length);

  // Results
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const domain = extractDomain(r.url);
    const age = r.age ? ` (${r.age})` : "";

    // Compact header line: [N] Title — domain (age)
    parts.push(`[${i + 1}] ${r.title} — ${domain}${age}`);
    parts.push(r.url);

    // Primary description
    if (r.description) {
      parts.push(r.description);
    }

    // Extra snippets — adaptive count based on total results
    if (maxSnippets > 0 && r.extra_snippets && r.extra_snippets.length > 0) {
      for (const snippet of r.extra_snippets.slice(0, maxSnippets)) {
        const clean = snippet.replace(/\n/g, " ").trim();
        if (clean) parts.push(`+ ${clean}`);
      }
    }

    parts.push(""); // blank line between results
  }

  // Pagination hint
  if (options.moreResultsAvailable) {
    parts.push("[More results available — increase count or refine query]");
  }

  return parts.join("\n");
}

// =============================================================================
// Page Content Formatting
// =============================================================================

export interface FormatPageOptions {
  title?: string;
  charCount: number;
  truncated: boolean;
  originalChars?: number;
  hasMore?: boolean;
  nextOffset?: number;
}

/**
 * Format extracted page content with metadata header.
 */
export function formatPageContent(
  url: string,
  content: string,
  options: FormatPageOptions
): string {
  const domain = extractDomain(url);
  const title = options.title ? ` — ${options.title}` : "";
  const truncNote = options.truncated && options.originalChars
    ? ` [truncated from ${options.originalChars.toLocaleString()} chars]`
    : "";
  const moreNote = options.hasMore && options.nextOffset
    ? ` [use offset:${options.nextOffset} to continue reading]`
    : "";

  const header = `Page: ${domain}${title} (${options.charCount.toLocaleString()} chars)${truncNote}${moreNote}\n${url}\n---`;

  return `${header}\n${content}`;
}

// =============================================================================
// LLM Context Formatting
// =============================================================================

export interface LLMContextSnippet {
  url: string;
  title: string;
  snippets: string[];
}

export interface LLMContextSource {
  title: string;
  hostname: string;
  age: string[] | null;
}

/**
 * Format LLM Context API response in a compact, agent-optimized format.
 *
 * Output:
 *   Context: "query" (N sources, ~Mk tokens)
 *
 *   [1] Page Title — domain.com (age)
 *   url
 *   Snippet text...
 *   ---
 *   Another snippet...
 */
export function formatLLMContext(
  query: string,
  grounding: LLMContextSnippet[],
  sources: Record<string, LLMContextSource>,
  options: { cached?: boolean; tokenCount?: number } = {}
): string {
  const parts: string[] = [];

  const cacheTag = options.cached ? " (cached)" : "";
  const tokenTag = options.tokenCount ? ` (~${Math.round(options.tokenCount / 1000)}k tokens)` : "";
  parts.push(`Context: "${query}" (${grounding.length} sources${tokenTag})${cacheTag}`);
  parts.push("");

  if (grounding.length === 0) {
    parts.push("No relevant content found.");
    return parts.join("\n");
  }

  for (let i = 0; i < grounding.length; i++) {
    const g = grounding[i];
    const source = sources[g.url];
    const domain = source?.hostname || extractDomain(g.url);
    const age = source?.age?.[2] ? ` (${source.age[2]})` : ""; // [2] is "N days ago" format

    parts.push(`[${i + 1}] ${g.title || source?.title || "(untitled)"} — ${domain}${age}`);
    parts.push(g.url);

    // Join snippets with separator
    for (const snippet of g.snippets) {
      const clean = snippet.trim();
      if (clean) parts.push(clean);
    }

    parts.push(""); // blank line between sources
  }

  return parts.join("\n");
}

// =============================================================================
// Multi-Page Formatting
// =============================================================================

/**
 * Format multiple page extractions compactly.
 */
export function formatMultiplePages(
  pages: Array<{
    url: string;
    title?: string;
    content: string;
    charCount: number;
    error?: string;
  }>
): string {
  const parts: string[] = [];

  for (const page of pages) {
    const domain = extractDomain(page.url);
    if (page.error) {
      parts.push(`[✗] ${domain}: ${page.error}`);
    } else {
      const title = page.title ? ` — ${page.title}` : "";
      parts.push(`[✓] ${domain}${title} (${page.charCount.toLocaleString()} chars)`);
      parts.push(page.url);
      parts.push("---");
      parts.push(page.content);
    }
    parts.push(""); // separator
  }

  return parts.join("\n");
}
