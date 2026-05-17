// GSD-2 — TUI pin-to-bottom regression test
//
// When the TUI does a full redraw with clear (`\x1b[2J`), the rendered block
// must be anchored so its last line lands at the terminal's bottom row. Before
// this fix the renderer emitted `\x1b[2J\x1b[H`, which homed the cursor to
// row 1 and left every `belowEditor` widget (health widget, editor, dashboard)
// floating at the top of an otherwise empty terminal after a chat clear.
//
// Trigger condition: a terminal height change forces `fullRender(true)` —
// exactly the path that fires on compaction/clear events when the chat
// collapses to a short block.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TUI, CURSOR_MARKER, type Component, type Terminal } from "@gsd/pi-tui";

class ResizableMockTerminal implements Terminal {
  public writtenData: string[] = [];
  private _rows: number;

  readonly isTTY = true;

  constructor(rows = 24) {
    this._rows = rows;
  }

  setRows(rows: number): void {
    this._rows = rows;
  }

  start(_onInput: (data: string) => void, _onResize: () => void): void {}
  stop(): void {}
  async drainInput(_maxMs?: number, _idleMs?: number): Promise<void> {}

  write(data: string): void {
    this.writtenData.push(data);
  }

  get columns(): number {
    return 80;
  }

  get rows(): number {
    return this._rows;
  }

  get kittyProtocolActive(): boolean {
    return false;
  }

  moveBy(_lines: number): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(_title: string): void {}
}

class StaticLinesComponent implements Component {
  public lines: string[];
  constructor(lines: string[]) {
    this.lines = lines;
  }
  render(_width: number): string[] {
    return this.lines;
  }
  invalidate(): void {}
}

describe("TUI pin-to-bottom on clear", () => {
  it("anchors short first renders to the terminal bottom", () => {
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    const component = new StaticLinesComponent(["line 1", "line 2", "line 3"]);
    tui.addChild(component);

    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    assert.ok(
      frame.includes("\x1b[18;1Hline 1"),
      `expected first render to start at bottom anchor row 18, got ${JSON.stringify(frame.slice(0, 120))}`,
    );
    assert.strictEqual(
      (tui as any).previousViewportTop,
      -17,
      "short rendered blocks should use a bottom-anchored viewport baseline",
    );
  });

  it("appends short auto-mode frames without feeding blank rows downward", () => {
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    const component = new StaticLinesComponent(["line 1", "line 2", "line 3"]);
    tui.addChild(component);
    (tui as any).doRender();

    terminal.writtenData = [];
    component.lines = ["line 1", "line 2", "line 3", "line 4"];
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    assert.ok(
      !frame.includes("\x1b[2J"),
      `expected append to avoid full-screen clear to reduce flicker, got ${JSON.stringify(frame)}`,
    );
    assert.ok(
      frame.includes("line 4"),
      `expected append to render the new line, got ${JSON.stringify(frame)}`,
    );
  });

  it("anchors a short block to the terminal bottom when a height change triggers fullRender(clear)", () => {
    const terminal = new ResizableMockTerminal(24);
    const tui = new TUI(terminal, false);
    // Three-line block; terminal is 24 rows tall after resize.
    const component = new StaticLinesComponent(["line 1", "line 2", "line 3"]);
    tui.addChild(component);

    // First render establishes previousHeight.
    (tui as any).doRender();
    terminal.writtenData = [];

    // Shrink the terminal to force heightChanged → fullRender(true).
    terminal.setRows(20);
    (tui as any).doRender();

    assert.ok(
      terminal.writtenData.length >= 1,
      "height change should trigger a write",
    );
    const frame = terminal.writtenData.join("");
    // Block height = 3, terminal height = 20, so startRow = 20 - 3 + 1 = 18.
    assert.ok(
      frame.includes("\x1b[2J\x1b[18;1H"),
      `expected clear+pin sequence (startRow=18), got ${JSON.stringify(frame.slice(0, 120))}`,
    );
    // Ensure the legacy unpinned sequence is NOT emitted.
    assert.ok(
      !frame.includes("\x1b[2J\x1b[H"),
      "legacy `\\x1b[2J\\x1b[H` should no longer appear after the pin-to-bottom fix",
    );
  });

  it("falls back to row 1 when the block is taller than the viewport", () => {
    const terminal = new ResizableMockTerminal(24);
    const tui = new TUI(terminal, false);
    // 30-line block > 20-row viewport.
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const component = new StaticLinesComponent(lines);
    tui.addChild(component);

    (tui as any).doRender();
    terminal.writtenData = [];

    terminal.setRows(20);
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    // startRow = max(1, 20 - 30 + 1) = 1 → top-anchored, identical to the
    // pre-fix behavior for oversized blocks.
    assert.ok(
      frame.includes("\x1b[2J\x1b[1;1H"),
      `expected clear + row-1 anchor for oversized block, got ${JSON.stringify(frame.slice(0, 120))}`,
    );
  });

  it("re-anchors tall shrinks so the latest turn end remains visible without a full-screen clear", () => {
    // Tall→tall shrink (60 → 40 on a 20-row terminal). The viewport baseline
    // must move from 40 down to 20, repainting visible rows with content
    // indices 20..39 in place. The renderer must NOT emit \x1b[2J — that
    // full-screen clear is what causes the bottom-panel flicker the four-pass
    // fix exists to avoid. The earlier byte-level assertion `\x1b[2J\x1b[1;1H`
    // captured the spirit (new bottom visible, baseline reset) via the only
    // mechanism available at the time; the fix replaces that mechanism with an
    // in-place viewport repaint that preserves both intents.
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
    const component = new StaticLinesComponent(lines);
    tui.addChild(component);

    (tui as any).doRender();
    terminal.writtenData = [];

    component.lines = lines.slice(0, 40);
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    assert.ok(
      !frame.includes("\x1b[2J"),
      `tall→tall shrink must not emit \\x1b[2J (causes bottom-panel flicker), got ${JSON.stringify(frame.slice(0, 160))}`,
    );
    // New viewport content (indices 20..39 → "line 21".."line 40") must be
    // painted into the visible rows. Check the top and bottom of the new
    // viewport are both present.
    assert.ok(
      frame.includes("line 21"),
      `expected new viewport top "line 21" to be repainted, got ${JSON.stringify(frame.slice(0, 200))}`,
    );
    assert.ok(
      frame.includes("line 40"),
      `expected new viewport bottom "line 40" to be repainted, got ${JSON.stringify(frame.slice(0, 200))}`,
    );
    assert.strictEqual(
      (tui as any).previousViewportTop,
      20,
      "tall shrink should reset the viewport baseline to the new rendered bottom",
    );
    assert.strictEqual(
      (tui as any).maxLinesRendered,
      40,
      "tall shrink should reset the working area to the new content height",
    );
  });

  it("re-anchors tall shrinks with a visible-region edit without ghost-line leakage", () => {
    // CodeRabbit follow-up to PR #6131: the existing tall-shrink test only
    // exercises the pure-shrink path (`firstChanged >= newLines.length`).
    // This test covers the mixed case — shrink AND a visible-region rewrite
    // — to confirm the renderer does not emit a full clear and does not leak
    // ghost-line `\r\n\x1b[2K` sequences past the viewport bottom (which is
    // what the `!clampedToViewport` + `ghostLinesVisible` gating at
    // tui.ts:972 protects against). Sizes use the literal CodeRabbit ratio
    // (3:1.5) but scaled up so both buffers stay > height — on a 20-row
    // terminal the 20→10 literal scenario flows through the short-block
    // full-render path instead, which is by design and would emit \x1b[2J.
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
    const component = new StaticLinesComponent(lines);
    tui.addChild(component);
    (tui as any).doRender();
    terminal.writtenData = [];

    // Shrink 60 → 40 AND edit a line inside the new viewport (indices 20..39
    // map to "line 21".."line 40"). Index 25 → screen row 5 of the new
    // viewport.
    const next = lines.slice(0, 40);
    next[25] = "EDITED line 26";
    component.lines = next;
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");

    // 1. No full-screen clear.
    assert.ok(
      !frame.includes("\x1b[2J"),
      `tall shrink + edit must not emit \\x1b[2J, got ${JSON.stringify(frame.slice(0, 160))}`,
    );
    // 2. Edited visible-region line is repainted.
    assert.ok(
      frame.includes("EDITED line 26"),
      `expected visible-region edit "EDITED line 26" to be repainted, got ${JSON.stringify(frame.slice(0, 240))}`,
    );
    // 3. No spurious \r\n past screen-bottom. The realign path emits exactly
    //    (height - 1) row separators inside the viewport repaint. A misfiring
    //    ghost-line cleanup would add (previousLines.length - newLines.length)
    //    extra `\r\n\x1b[2K` sequences (20 here), pushing well past 19.
    const newlineCount = (frame.match(/\r\n/g) ?? []).length;
    const height = 20;
    assert.ok(
      newlineCount <= height - 1,
      `expected at most ${height - 1} \\r\\n sequences (one per inter-row separator), got ${newlineCount} in ${JSON.stringify(frame.slice(0, 240))}`,
    );
    // 4. Baseline invariants — same as the pure-shrink test.
    assert.strictEqual((tui as any).previousViewportTop, 20);
    assert.strictEqual((tui as any).maxLinesRendered, 40);
  });

  it("uses differential render for same-line-count edit on short content", () => {
    // Gap C: verify the negative-viewport coordinate math is correct when a
    // same-length edit reaches the differential path (no line count change →
    // early-exit doesn't fire).
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    const component = new StaticLinesComponent(["line 1", "line 2", "line 3"]);
    tui.addChild(component);
    (tui as any).doRender();

    terminal.writtenData = [];
    component.lines = ["line 1", "updated line 2", "line 3"];
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    // Same line count → must NOT clear the screen.
    assert.ok(
      !frame.includes("\x1b[2J"),
      `expected differential render without full clear, got ${JSON.stringify(frame)}`,
    );
    // hardwareCursorRow=2, prevViewportTop=-17 → screen row=19.
    // Target row=1, screen row=18. lineDiff = 18-19 = -1 → move up 1.
    assert.ok(
      frame.includes("\x1b[1A"),
      `expected cursor to move up 1 row to the changed line, got ${JSON.stringify(frame)}`,
    );
    assert.ok(
      frame.includes("updated line 2"),
      `expected updated content in differential render, got ${JSON.stringify(frame)}`,
    );
  });

  it("positions hardware cursor correctly within a short bottom-anchored block", () => {
    // Gap B: verify positionHardwareCursor emits correct relative moves when
    // content is short (negative previousViewportTop) and a CURSOR_MARKER is
    // embedded in a non-final line.
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    // Marker on middle line; block is 3 lines on a 20-row terminal.
    const component = new StaticLinesComponent([
      "line 1",
      `cursor${CURSOR_MARKER}`,
      "line 3",
    ]);
    tui.addChild(component);
    (tui as any).doRender();

    const allWrites = terminal.writtenData.join("");
    // Render frame must use bottom anchor (startRow = 20 - 3 + 1 = 18).
    assert.ok(
      allWrites.includes("\x1b[18;1H"),
      `expected bottom anchor at row 18, got ${JSON.stringify(allWrites.slice(0, 160))}`,
    );
    // After writing 3 lines hardwareCursorRow=2. CURSOR_MARKER is at content
    // row 1. positionHardwareCursor must move up 1 row (rowDelta = 1 - 2 = -1).
    assert.ok(
      allWrites.includes("\x1b[1A"),
      `expected hardware cursor to move up 1 row to marker at content row 1, got ${JSON.stringify(allWrites)}`,
    );
  });
});
