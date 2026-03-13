/**
 * @gsd/native — High-performance Rust modules exposed via N-API.
 *
 * Modules:
 * - grep: ripgrep-backed regex search (content + filesystem)
 * - text: ANSI-aware text measurement and slicing
 */

export { searchContent, grep } from "./grep/index.js";
export type {
  ContextLine,
  GrepMatch,
  GrepOptions,
  GrepResult,
  SearchMatch,
  SearchOptions,
  SearchResult,
} from "./grep/index.js";

export {
  wrapTextWithAnsi,
  truncateToWidth,
  sliceWithWidth,
  extractSegments,
  sanitizeText,
  visibleWidth,
  EllipsisKind,
} from "./text/index.js";
export type { SliceResult, ExtractSegmentsResult } from "./text/index.js";
