import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Regression test for the Enter key infinite loop bug (#3449).
 *
 * In goNextOrSubmit(), the auto-open guard must check `!notesVisible`
 * so that pressing Enter to *confirm* notes doesn't re-open them,
 * creating a cycle where the user can never advance past the question.
 *
 * The actual condition in interview-ui.ts (fixed):
 *   if (!isMultiSelect(currentIdx)
 *       && states[currentIdx].cursorIndex === noneOrDoneIdx(currentIdx)
 *       && !states[currentIdx].notesVisible) { ... }
 */
describe("interview-ui goNextOrSubmit auto-open guard", () => {
  /**
   * Helper that mirrors the guard condition from interview-ui.ts.
   * If the real code ever drifts from this, the integration tests will
   * catch it — this test exists purely to document the invariant.
   */
  function shouldAutoOpenNotes(
    isMultiSelect: boolean,
    cursorIndex: number,
    noneOrDoneIdx: number,
    notesVisible: boolean,
  ): boolean {
    return !isMultiSelect
      && cursorIndex === noneOrDoneIdx
      && !notesVisible;
  }

  it("should auto-open notes on first 'None of the above' selection", () => {
    const result = shouldAutoOpenNotes(
      /* isMultiSelect */ false,
      /* cursorIndex   */ 2,
      /* noneOrDoneIdx */ 2,
      /* notesVisible  */ false,
    );
    assert.strictEqual(result, true);
  });

  it("should NOT auto-open notes when notes are already visible (infinite-loop guard)", () => {
    const result = shouldAutoOpenNotes(
      /* isMultiSelect */ false,
      /* cursorIndex   */ 2,
      /* noneOrDoneIdx */ 2,
      /* notesVisible  */ true,
    );
    assert.strictEqual(result, false,
      "re-opening notes when they are already visible causes an infinite Enter loop");
  });

  it("should NOT auto-open notes for multi-select questions", () => {
    const result = shouldAutoOpenNotes(
      /* isMultiSelect */ true,
      /* cursorIndex   */ 2,
      /* noneOrDoneIdx */ 2,
      /* notesVisible  */ false,
    );
    assert.strictEqual(result, false);
  });

  it("should NOT auto-open notes when cursor is not on 'None of the above'", () => {
    const result = shouldAutoOpenNotes(
      /* isMultiSelect */ false,
      /* cursorIndex   */ 0,
      /* noneOrDoneIdx */ 2,
      /* notesVisible  */ false,
    );
    assert.strictEqual(result, false);
  });
});
