// Project/App: GSD-2
// File Purpose: Unit tests for shared GSD TUI render helpers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { visibleWidth } from "@gsd/pi-tui";
import {
  padRightVisible,
  renderFrame,
  renderKeyHints,
  renderProgressBar,
  rightAlign,
  safeLine,
  wrapVisibleText,
  type ThemeLike,
} from "../tui/render-kit.ts";

const theme: ThemeLike = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function assertWidth(lines: string[], width: number): void {
  for (const line of lines) {
    assert.ok(
      visibleWidth(line) <= width,
      `line exceeds width ${width}: ${visibleWidth(line)} "${line}"`,
    );
  }
}

describe("tui render kit", () => {
  test("safeLine clamps visible width", () => {
    assert.equal(visibleWidth(safeLine("abcdef", 4)), 4);
    assert.equal(safeLine("abcdef", 0), "");
  });

  test("padRightVisible fills exact visible width", () => {
    const line = padRightVisible("abc", 8);
    assert.equal(visibleWidth(line), 8);
  });

  test("rightAlign keeps output within width", () => {
    for (const width of [10, 40, 80]) {
      assertWidth([rightAlign("left side with overflow", "right side", width)], width);
    }
  });

  test("wrapVisibleText clamps long words and ansi-aware content", () => {
    const lines = wrapVisibleText("https://example.com/" + "a".repeat(120), 24);
    assert.ok(lines.length > 0);
    assertWidth(lines, 24);
  });

  test("renderFrame keeps borders and rows within width", () => {
    for (const width of [3, 40, 80]) {
      assertWidth(renderFrame(theme, ["row", "long ".repeat(40)], width), width);
    }
  });

  test("renderKeyHints and renderProgressBar fit caller budgets", () => {
    assert.ok(visibleWidth(renderKeyHints(theme, ["↑↓ scroll", "esc close"], 12)) <= 12);
    assert.equal(visibleWidth(renderProgressBar(theme, 2, 4, 16)), 16);
  });
});
