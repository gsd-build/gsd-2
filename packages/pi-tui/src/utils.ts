import {
	visibleWidth as nativeVisibleWidth,
	wrapTextWithAnsi as nativeWrapTextWithAnsi,
	truncateToWidth as nativeTruncateToWidth,
	sliceWithWidth as nativeSliceWithWidth,
	extractSegments as nativeExtractSegments,
	EllipsisKind,
} from "@gsd/native/text";

// Grapheme segmenter (shared instance)
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Get the shared grapheme segmenter instance.
 */
export function getSegmenter(): Intl.Segmenter {
	return segmenter;
}

const PUNCTUATION_REGEX = /[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/;

/**
 * Check if a character is whitespace.
 */
export function isWhitespaceChar(char: string): boolean {
	return /\s/.test(char);
}

/**
 * Check if a character is punctuation.
 */
export function isPunctuationChar(char: string): boolean {
	return PUNCTUATION_REGEX.test(char);
}

// ---------------------------------------------------------------------------
// Native text module wrappers
// ---------------------------------------------------------------------------

/**
 * Calculate the visible width of a string in terminal columns.
 * Delegates to the native Rust implementation.
 */
export function visibleWidth(str: string): number {
	return nativeVisibleWidth(str);
}

/**
 * Wrap text with ANSI codes preserved.
 * Delegates to the native Rust implementation.
 *
 * @param text - Text to wrap (may contain ANSI codes and newlines)
 * @param width - Maximum visible width per line
 * @returns Array of wrapped lines (NOT padded to width)
 */
export function wrapTextWithAnsi(text: string, width: number): string[] {
	return nativeWrapTextWithAnsi(text, width);
}

/**
 * Map an ellipsis string to the native EllipsisKind enum value.
 */
function ellipsisStringToKind(ellipsis: string): number {
	if (ellipsis === "\u2026") return EllipsisKind.Unicode;
	if (ellipsis === "..." || ellipsis === undefined) return EllipsisKind.Ascii;
	if (ellipsis === "") return EllipsisKind.None;
	// Default: "..." maps to Ascii
	return EllipsisKind.Ascii;
}

/**
 * Truncate text to fit within a maximum visible width, adding ellipsis if needed.
 * Optionally pad with spaces to reach exactly maxWidth.
 * Delegates to the native Rust implementation.
 *
 * @param text - Text to truncate (may contain ANSI codes)
 * @param maxWidth - Maximum visible width
 * @param ellipsis - Ellipsis string to append when truncating (default: "...")
 * @param pad - If true, pad result with spaces to exactly maxWidth (default: false)
 * @returns Truncated text, optionally padded to exactly maxWidth
 */
export function truncateToWidth(
	text: string,
	maxWidth: number,
	ellipsis: string = "...",
	pad: boolean = false,
): string {
	return nativeTruncateToWidth(text, maxWidth, ellipsisStringToKind(ellipsis), pad);
}

/**
 * Extract a range of visible columns from a line. Handles ANSI codes and wide chars.
 * @param strict - If true, exclude wide chars at boundary that would extend past the range
 */
export function sliceByColumn(line: string, startCol: number, length: number, strict = false): string {
	return sliceWithWidth(line, startCol, length, strict).text;
}

/** Like sliceByColumn but also returns the actual visible width of the result. */
export function sliceWithWidth(
	line: string,
	startCol: number,
	length: number,
	strict = false,
): { text: string; width: number } {
	return nativeSliceWithWidth(line, startCol, length, strict);
}

/**
 * Extract "before" and "after" segments from a line in a single pass.
 * Delegates to the native Rust implementation.
 */
export function extractSegments(
	line: string,
	beforeEnd: number,
	afterStart: number,
	afterLen: number,
	strictAfter = false,
): { before: string; beforeWidth: number; after: string; afterWidth: number } {
	return nativeExtractSegments(line, beforeEnd, afterStart, afterLen, strictAfter);
}

/**
 * Apply background color to a line, padding to full width.
 *
 * @param line - Line of text (may contain ANSI codes)
 * @param width - Total width to pad to
 * @param bgFn - Background color function
 * @returns Line with background applied and padded to width
 */
export function applyBackgroundToLine(line: string, width: number, bgFn: (text: string) => string): string {
	const visibleLen = visibleWidth(line);
	const paddingNeeded = Math.max(0, width - visibleLen);
	const padding = " ".repeat(paddingNeeded);

	const withPadding = line + padding;
	return bgFn(withPadding);
}
