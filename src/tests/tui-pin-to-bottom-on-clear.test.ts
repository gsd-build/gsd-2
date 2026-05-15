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
      frame.includes("\x1b[2J\x1b[17;1H"),
      `expected append to redraw the resized bottom-anchored block at row 17, got ${JSON.stringify(frame)}`,
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

  it("re-anchors tall shrinks so the latest turn end remains visible", () => {
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
      frame.includes("\x1b[2J\x1b[1;1H"),
      `expected tall shrink to force a bottom-visible redraw, got ${JSON.stringify(frame.slice(0, 120))}`,
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

  it("skips fullRender when off-screen content above the viewport mutates", () => {
    // Regression: a ticking timer (e.g. `running · Ns`) on a tool-execution
    // card that has scrolled out of view above the viewport must NOT cause
    // a fullRender(true) — that path writes the entire buffer (thousands of
    // lines of transcript) to the terminal every second, producing the
    // top-to-bottom scroll-storm visible during streaming responses.
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    // Build a transcript that vastly exceeds the viewport (20 rows).
    const initial = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const component = new StaticLinesComponent(initial);
    tui.addChild(component);
    (tui as any).doRender();

    terminal.writtenData = [];

    // Simulate an off-screen mutation: line 10 (well above viewport top at
    // index 180) changes its content. previousLines length stays at 200.
    const mutated = initial.slice();
    mutated[10] = "line 11 tick";
    component.lines = mutated;
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    // Must not clear the viewport or reposition to top.
    assert.ok(
      !frame.includes("\x1b[2J"),
      `off-screen mutation must not trigger \\x1b[2J, got ${JSON.stringify(frame.slice(0, 200))}`,
    );
    // Must not emit the mutated line itself (it is off-screen).
    assert.ok(
      !frame.includes("line 11 tick"),
      `off-screen mutated line must not be written, got ${JSON.stringify(frame.slice(0, 200))}`,
    );
    // Bookkeeping must be updated so the next render's diff baseline is the
    // mutated buffer. applyLineResets appends ANSI reset/OSC suffixes, so we
    // assert substring rather than equality.
    assert.ok(
      (tui as any).previousLines[10].includes("line 11 tick"),
      `previousLines should track the mutated buffer even when no write occurs, got ${JSON.stringify((tui as any).previousLines[10])}`,
    );
  });

  it("fullRender only emits the visible window when content exceeds viewport", () => {
    // Regression: when a tool-execution panel (e.g. streaming Write) grows
    // past the terminal height AND its header timer ticks once per second,
    // the diff sees firstChanged above the viewport (header) and lastChanged
    // inside it (new body line). That triggers fullRender(true) — which
    // previously wrote every off-screen line to the terminal, forcing it to
    // physically scroll through the entire buffer each second.
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    // 200-line block on a 20-row viewport. The first ~180 lines are off-screen.
    const initial = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const component = new StaticLinesComponent(initial);
    tui.addChild(component);
    (tui as any).doRender();

    terminal.writtenData = [];

    // Mutate both an off-screen line (10, simulating a header timer tick) and
    // an on-screen line (195, simulating new streaming content) — this forces
    // the fullRender path because the change spans across the viewport edge.
    const mutated = initial.slice();
    mutated[10] = "header tick";
    mutated[195] = "new streamed line";
    component.lines = mutated;
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    assert.ok(
      frame.includes("\x1b[2J"),
      `expected fullRender to clear the viewport, got ${JSON.stringify(frame.slice(0, 200))}`,
    );
    // Off-screen content must NOT be written to the terminal.
    assert.ok(
      !frame.includes("header tick"),
      `off-screen header mutation must not be emitted, got frame of length ${frame.length}`,
    );
    assert.ok(
      !frame.includes("line 1\r\n"),
      `off-screen line 1 must not be emitted, got ${JSON.stringify(frame.slice(0, 200))}`,
    );
    // On-screen content must be present.
    assert.ok(
      frame.includes("new streamed line"),
      `on-screen mutated line must be emitted, got ${JSON.stringify(frame.slice(-200))}`,
    );
    // The total number of newlines emitted in the body should be height-1 (19),
    // not newLines.length-1 (199). Count "\r\n" separators between lines.
    const separatorCount = (frame.match(/\r\n/g) || []).length;
    assert.strictEqual(
      separatorCount,
      19,
      `expected ${20 - 1} line separators (one viewport's worth), got ${separatorCount}`,
    );
  });

  it("still fullRenders when the change extends from above the viewport into it", () => {
    // Guard rail: if a change starts above the viewport but reaches into it,
    // the visible region really did move and we still need a full redraw.
    const terminal = new ResizableMockTerminal(20);
    const tui = new TUI(terminal, false);
    const initial = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const component = new StaticLinesComponent(initial);
    tui.addChild(component);
    (tui as any).doRender();

    terminal.writtenData = [];

    // Mutate a range that spans from above-viewport (line 10) into the
    // visible region (last 20 lines start at index 180).
    const mutated = initial.map((line, i) => (i >= 10 && i <= 190 ? `${line}!` : line));
    component.lines = mutated;
    (tui as any).doRender();

    const frame = terminal.writtenData.join("");
    assert.ok(
      frame.includes("\x1b[2J"),
      `visible change spanning above-viewport must trigger fullRender, got ${JSON.stringify(frame.slice(0, 200))}`,
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
