// Project/App: GSD-2
// File Purpose: Regression tests for notification overlay wrapping and width-safe rendering.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { visibleWidth } from "@gsd/pi-tui";
import { appendNotification, initNotificationStore, _resetNotificationStore } from "../notification-store.ts";
import { GSDNotificationOverlay, notificationOverlayOptions } from "../notification-overlay.ts";
import { wrapVisibleText } from "../tui/render-kit.ts";

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function assertLinesFit(lines: string[], width: number): void {
  for (const line of lines) {
    assert.ok(
      visibleWidth(line) <= width,
      `line exceeds maxWidth: visibleWidth=${visibleWidth(line)} max=${width}: "${line}"`,
    );
  }
}

describe("notification overlay — wrapText", () => {
  test("short text returns single line", () => {
    const result = wrapVisibleText("hello world", 80);
    assert.deepStrictEqual(result, ["hello world"]);
  });

  test("long text wraps at word boundaries without exceeding maxWidth", () => {
    const text = "This is a long notification message that should wrap across multiple lines";
    const result = wrapVisibleText(text, 40);
    assert.ok(result.length > 1, `expected multiple lines, got ${result.length}`);
    assertLinesFit(result, 40);
  });

  test("single word exceeding maxWidth is broken to fit column budget", () => {
    const result = wrapVisibleText("superlongwordthatexceedsmaxwidth", 10);
    assertLinesFit(result, 10);
  });

  test("preserves all words across wrapped lines", () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const text = words.join(" ");
    const result = wrapVisibleText(text, 15);
    const rejoined = result.join(" ");
    for (const w of words) {
      assert.ok(rejoined.includes(w), `missing word: ${w}`);
    }
  });

  // Regression for #4465 — the previous .length-based wrapper could allow
  // lines to bleed past the panel border when measured in terminal columns.
  // Verify that every wrapped line stays within the column budget, including
  // for the real-world long multi-provider notification payload.
  test("regression #4465: long notification stays within column budget", () => {
    const msg =
      "GSD API Key Manager LLM Providers ✗ anthropic — not configured " +
      "(console.anthropic.com) ✗ openai — not configured " +
      "(platform.openai.com/api-keys) ✓ github-copilot — OAuth (expires in 13m) " +
      "✓ openai-codex — OAuth (expires in 99h 9m) ✓ google-gemini-cli — OAuth " +
      "(expired — will auto-refresh) ✓ google-antigravity — OAuth " +
      "(expired — will auto-refresh) ✗ google — not configured " +
      "(aistudio.google.com/apikey) ✗ groq — not configured";
    const maxWidth = 118;
    const result = wrapVisibleText(msg, maxWidth);
    assertLinesFit(result, maxWidth);
  });

  test("unbreakable long token (URL) is clamped to maxWidth", () => {
    const url = "https://example.com/" + "a".repeat(200);
    const result = wrapVisibleText(url, 40);
    assertLinesFit(result, 40);
  });

  test("real overlay render fits common terminal widths", (t) => {
    const dir = mkdtempSync(join(tmpdir(), "gsd-notification-overlay-"));
    t.after(() => {
      _resetNotificationStore();
      rmSync(dir, { recursive: true, force: true });
    });

    initNotificationStore(dir);
    appendNotification("A long notification with " + "x".repeat(180), "warning");

    const overlay = new GSDNotificationOverlay({ requestRender() {} }, fakeTheme as any, () => {});
    t.after(() => overlay.dispose());

    for (const width of [40, 80, 120]) {
      assertLinesFit(overlay.render(width), width);
      overlay.invalidate();
    }
  });

  test("rendered height stays within the configured overlay max height", (t) => {
    const dir = mkdtempSync(join(tmpdir(), "gsd-notification-overlay-height-"));
    const originalRowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");
    Object.defineProperty(process.stdout, "rows", { value: 40, configurable: true });

    t.after(() => {
      if (originalRowsDescriptor) {
        Object.defineProperty(process.stdout, "rows", originalRowsDescriptor);
      } else {
        delete (process.stdout as { rows?: number }).rows;
      }
      _resetNotificationStore();
      rmSync(dir, { recursive: true, force: true });
    });

    initNotificationStore(dir);
    for (let i = 0; i < 80; i++) {
      appendNotification(`notification-${i + 1} with enough text to exercise clipping`, "warning");
    }

    const overlay = new GSDNotificationOverlay({ requestRender() {} }, fakeTheme as any, () => {});
    t.after(() => overlay.dispose());

    const rendered = overlay.render(100);
    const maxHeight = Math.floor((40 * 52) / 100);
    assert.ok(rendered.length <= maxHeight, `expected ${rendered.length} lines to fit maxHeight ${maxHeight}`);
    assert.ok(rendered.at(-1)?.includes("╯"), "bottom border should remain visible");
    assert.equal(notificationOverlayOptions().maxHeight, "52%");
  });
});
