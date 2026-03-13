import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const addonDir = path.resolve(__dirname, "..", "..", "..", "..", "native", "addon");
const platformTag = `${process.platform}-${process.arch}`;
const candidates = [
  path.join(addonDir, `gsd_engine.${platformTag}.node`),
  path.join(addonDir, "gsd_engine.dev.node"),
];

let native;
for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // try next
  }
}

if (!native) {
  console.error("Native addon not found. Build first.");
  process.exit(1);
}

// ── truncateTail ─────────────────────────────────────────────────────────

describe("truncateTail", () => {
  test("no truncation when content fits", () => {
    const r = native.truncateTail("hello\nworld\n", 100);
    assert.equal(r.truncated, false);
    assert.equal(r.text, "hello\nworld\n");
    assert.equal(r.originalLines, 2);
    assert.equal(r.keptLines, 2);
  });

  test("truncates at line boundary (ASCII)", () => {
    const r = native.truncateTail("hello\nworld\n", 7);
    assert.equal(r.truncated, true);
    assert.equal(r.text, "hello\n");
    assert.equal(r.keptLines, 1);
  });

  test("empty input", () => {
    const r = native.truncateTail("", 100);
    assert.equal(r.truncated, false);
    assert.equal(r.originalLines, 0);
  });

  test("exact boundary", () => {
    const r = native.truncateTail("abc\ndef\n", 8);
    assert.equal(r.truncated, false);
    assert.equal(r.text, "abc\ndef\n");
  });

  test("single line exceeding limit", () => {
    const r = native.truncateTail("this_is_very_long", 5);
    assert.equal(r.truncated, true);
    assert.equal(r.text, "");
    assert.equal(r.keptLines, 0);
  });

  test("UTF-8 multibyte characters", () => {
    // "日本\n" = 7 bytes (3+3+1)
    const r = native.truncateTail("日本\nworld\n", 8);
    assert.equal(r.truncated, true);
    assert.equal(r.text, "日本\n");
    assert.equal(r.keptLines, 1);
  });

  test("emoji (4-byte UTF-8)", () => {
    // "😀\n" = 5 bytes
    const r = native.truncateTail("😀\n😂\n🎉\n", 6);
    assert.equal(r.truncated, true);
    assert.equal(r.text, "😀\n");
    assert.equal(r.keptLines, 1);
  });
});

// ── truncateHead ─────────────────────────────────────────────────────────

describe("truncateHead", () => {
  test("no truncation when content fits", () => {
    const r = native.truncateHead("hello\nworld\n", 100);
    assert.equal(r.truncated, false);
    assert.equal(r.text, "hello\nworld\n");
  });

  test("keeps last lines (ASCII)", () => {
    const r = native.truncateHead("hello\nworld\n", 7);
    assert.equal(r.truncated, true);
    assert.equal(r.text, "world\n");
    assert.equal(r.keptLines, 1);
  });

  test("empty input", () => {
    const r = native.truncateHead("", 100);
    assert.equal(r.truncated, false);
  });

  test("single line exceeding limit", () => {
    const r = native.truncateHead("this_is_very_long", 5);
    assert.equal(r.truncated, true);
    assert.equal(r.text, "");
    assert.equal(r.keptLines, 0);
  });
});

// ── truncateOutput ───────────────────────────────────────────────────────

describe("truncateOutput", () => {
  test("no truncation when fits", () => {
    const r = native.truncateOutput("small", 100);
    assert.equal(r.truncated, false);
    assert.equal(r.text, "small");
    assert.equal(r.message, null);
  });

  test("tail mode (default)", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const r = native.truncateOutput(lines, 200);
    assert.equal(r.truncated, true);
    assert.ok(r.message);
  });

  test("head mode", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const r = native.truncateOutput(lines, 200, "head");
    assert.equal(r.truncated, true);
    assert.ok(r.message.includes("start"));
  });

  test("both mode", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const r = native.truncateOutput(lines, 200, "both");
    assert.equal(r.truncated, true);
    assert.ok(r.text.includes("... ["));
  });
});
