import { getSegmenter, isPunctuationChar, isWhitespaceChar } from "../utils.js";

const segmenter = getSegmenter();

/**
 * Compute the column position after moving one word backwards from the given
 * column on the given line. Returns the new column index.
 *
 * The algorithm skips trailing whitespace, then skips a run of punctuation or
 * a run of word characters (whichever is adjacent to the cursor).
 */
export function wordBoundaryBackward(line: string, cursorCol: number): number {
	if (cursorCol === 0) return 0;

	const textBeforeCursor = line.slice(0, cursorCol);
	const graphemes = [...segmenter.segment(textBeforeCursor)];
	let newCol = cursorCol;

	// Skip trailing whitespace
	while (graphemes.length > 0 && isWhitespaceChar(graphemes[graphemes.length - 1]?.segment || "")) {
		newCol -= graphemes.pop()?.segment.length || 0;
	}

	if (graphemes.length > 0) {
		const lastGrapheme = graphemes[graphemes.length - 1]?.segment || "";
		if (isPunctuationChar(lastGrapheme)) {
			// Skip punctuation run
			while (graphemes.length > 0 && isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "")) {
				newCol -= graphemes.pop()?.segment.length || 0;
			}
		} else {
			// Skip word run
			while (
				graphemes.length > 0 &&
				!isWhitespaceChar(graphemes[graphemes.length - 1]?.segment || "") &&
				!isPunctuationChar(graphemes[graphemes.length - 1]?.segment || "")
			) {
				newCol -= graphemes.pop()?.segment.length || 0;
			}
		}
	}

	return newCol;
}

/**
 * Compute the column position after moving one word forwards from the given
 * column on the given line. Returns the new column index.
 *
 * The algorithm skips leading whitespace, then skips a run of punctuation or
 * a run of word characters (whichever is adjacent to the cursor).
 */
export function wordBoundaryForward(line: string, cursorCol: number): number {
	if (cursorCol >= line.length) return line.length;

	const textAfterCursor = line.slice(cursorCol);
	const segments = segmenter.segment(textAfterCursor);
	const iterator = segments[Symbol.iterator]();
	let next = iterator.next();
	let newCol = cursorCol;

	// Skip leading whitespace
	while (!next.done && isWhitespaceChar(next.value.segment)) {
		newCol += next.value.segment.length;
		next = iterator.next();
	}

	if (!next.done) {
		const firstGrapheme = next.value.segment;
		if (isPunctuationChar(firstGrapheme)) {
			// Skip punctuation run
			while (!next.done && isPunctuationChar(next.value.segment)) {
				newCol += next.value.segment.length;
				next = iterator.next();
			}
		} else {
			// Skip word run
			while (!next.done && !isWhitespaceChar(next.value.segment) && !isPunctuationChar(next.value.segment)) {
				newCol += next.value.segment.length;
				next = iterator.next();
			}
		}
	}

	return newCol;
}

/**
 * Compute the target visual column for vertical cursor movement.
 * Implements the sticky column decision table:
 *
 * | P | S | T | U | Scenario                                             | Set Preferred | Move To     |
 * |---|---|---|---| ---------------------------------------------------- |---------------|-------------|
 * | 0 | * | 0 | - | Start nav, target fits                               | null          | current     |
 * | 0 | * | 1 | - | Start nav, target shorter                            | current       | target end  |
 * | 1 | 0 | 0 | 0 | Clamped, target fits preferred                       | null          | preferred   |
 * | 1 | 0 | 0 | 1 | Clamped, target longer but still can't fit preferred | keep          | target end  |
 * | 1 | 0 | 1 | - | Clamped, target even shorter                         | keep          | target end  |
 * | 1 | 1 | 0 | - | Rewrapped, target fits current                       | null          | current     |
 * | 1 | 1 | 1 | - | Rewrapped, target shorter than current               | current       | target end  |
 *
 * Where:
 * - P = preferred col is set
 * - S = cursor in middle of source line (not clamped to end)
 * - T = target line shorter than current visual col
 * - U = target line shorter than preferred col
 *
 * Returns { column, preferredVisualCol } with the updated preferred column.
 */
export function computeVerticalMoveColumn(
	currentVisualCol: number,
	sourceMaxVisualCol: number,
	targetMaxVisualCol: number,
	preferredVisualCol: number | null,
): { column: number; preferredVisualCol: number | null } {
	const hasPreferred = preferredVisualCol !== null; // P
	const cursorInMiddle = currentVisualCol < sourceMaxVisualCol; // S
	const targetTooShort = targetMaxVisualCol < currentVisualCol; // T

	if (!hasPreferred || cursorInMiddle) {
		if (targetTooShort) {
			// Cases 2 and 7
			return { column: targetMaxVisualCol, preferredVisualCol: currentVisualCol };
		}

		// Cases 1 and 6
		return { column: currentVisualCol, preferredVisualCol: null };
	}

	const targetCantFitPreferred = targetMaxVisualCol < preferredVisualCol!; // U
	if (targetTooShort || targetCantFitPreferred) {
		// Cases 4 and 5
		return { column: targetMaxVisualCol, preferredVisualCol };
	}

	// Case 3
	return { column: preferredVisualCol!, preferredVisualCol: null };
}
